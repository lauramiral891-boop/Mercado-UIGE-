-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V4: BLOQUEIO DE CAMPOS ADMIN E CÁLCULO DE TOTAIS NO SERVIDOR
-- ==============================================================================
-- 1. Só administradores confirmados no servidor (public.is_admin()) ou rotinas
--    internas autorizadas (app.system_mutation = 'on') podem alterar:
--      - lojas: is_aprovada, is_vip, suspensa, motivo_suspensao, plano_tipo, plano_expira_em, denuncias_count, codigo
--      - produtos: is_aprovado, is_destaque, vendas, classificacao, total_avaliacoes
-- 2. O subtotal, taxa_entrega e total de cada encomenda são SEMPRE calculados no
--    servidor a partir dos itens_encomenda e do preço actual em public.produtos,
--    ignorando quaisquer valores enviados pelo cliente.
-- ==============================================================================

-- 1. FUNÇÕES INTERNAS ACTUALIZADAS COM CONTEXTO DE SISTEMA CONTROLADO
CREATE OR REPLACE FUNCTION public.deduzir_stock_produto()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.produtos
  SET stock = stock - NEW.quantidade,
      vendas = vendas + NEW.quantidade
  WHERE id = NEW.produto_id AND stock >= NEW.quantidade;

  IF NOT FOUND THEN
    PERFORM set_config('app.system_mutation', 'off', true);
    RAISE EXCEPTION 'Stock insuficiente para o artigo solicitado no Mercado Uíge.';
  END IF;

  PERFORM set_config('app.system_mutation', 'off', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.verificar_suspensao_automatica_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_loja_id UUID;
  v_total INT;
  v_limite INT;
BEGIN
  v_loja_id := NEW.loja_id;
  IF v_loja_id IS NULL AND NEW.produto_id IS NOT NULL THEN
    SELECT loja_id INTO v_loja_id FROM public.produtos WHERE id = NEW.produto_id;
  END IF;

  IF v_loja_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total
    FROM public.denuncias d
    LEFT JOIN public.produtos p ON p.id = d.produto_id
    WHERE (d.loja_id = v_loja_id OR p.loja_id = v_loja_id)
      AND d.estado <> 'rejeitado';

    SELECT COALESCE(limite_denuncias_suspensao, 3) INTO v_limite
    FROM public.configuracoes_sistema WHERE id = 'global';

    PERFORM set_config('app.system_mutation', 'on', true);
    UPDATE public.lojas
    SET
      denuncias_count = v_total,
      suspensa = CASE WHEN v_total >= COALESCE(v_limite, 3) THEN TRUE ELSE suspensa END,
      motivo_suspensao = CASE
        WHEN v_total >= COALESCE(v_limite, 3) AND (motivo_suspensao IS NULL OR motivo_suspensao = '')
        THEN 'Suspensão automática por excesso de denúncias'
        ELSE motivo_suspensao
      END
    WHERE id = v_loja_id;
    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.activar_plano_ou_anuncio_no_pagamento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmado' AND OLD.estado <> 'confirmado' THEN
    NEW.confirmado_em := TIMEZONE('utc', NOW());
    PERFORM set_config('app.system_mutation', 'on', true);

    IF NEW.tipo = 'plano' AND NEW.plano_alvo IS NOT NULL THEN
      IF NEW.loja_id IS NOT NULL THEN
        UPDATE public.lojas
        SET
          plano_tipo = NEW.plano_alvo,
          is_vip = (NEW.plano_alvo = 'vip'),
          plano_expira_em = TIMEZONE('utc', NOW()) + INTERVAL '30 days'
        WHERE id = NEW.loja_id;
      END IF;

      IF NEW.perfil_tipo = 'entregador' OR NEW.loja_id IS NULL THEN
        UPDATE public.perfis
        SET
          plano_tipo = NEW.plano_alvo,
          plano_expira_em = TIMEZONE('utc', NOW()) + INTERVAL '30 days'
        WHERE id = NEW.vendedor_id;
      END IF;
    ELSIF NEW.tipo = 'anuncio' AND NEW.anuncio_id IS NOT NULL THEN
      UPDATE public.anuncios
      SET ativo = TRUE, estado = 'aprovado'
      WHERE id = NEW.anuncio_id;
    END IF;

    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.expirar_planos_vencidos()
RETURNS INT AS $$
DECLARE
  v_count INT;
  v_profiles INT;
BEGIN
  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.lojas
  SET plano_tipo = 'gratis', is_vip = FALSE
  WHERE plano_tipo <> 'gratis' AND plano_expira_em IS NOT NULL AND plano_expira_em < TIMEZONE('utc', NOW());
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.perfis
  SET plano_tipo = 'gratis'
  WHERE plano_tipo <> 'gratis' AND plano_expira_em IS NOT NULL AND plano_expira_em < TIMEZONE('utc', NOW());
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  UPDATE public.anuncios
  SET ativo = FALSE, estado = 'expirado'
  WHERE ativo = TRUE AND data_fim < TIMEZONE('utc', NOW());

  PERFORM set_config('app.system_mutation', 'off', true);
  RETURN v_count + v_profiles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. BLOQUEIO ESTRITO DE CAMPOS ADMINISTRATIVOS EM PUBLIC.LOJAS
CREATE OR REPLACE FUNCTION public.proteger_e_gerar_codigo_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
    IF NEW.codigo IS NULL OR trim(NEW.codigo) = '' THEN
      NEW.codigo := 'LJ-' || LPAD(nextval('public.seq_loja_codigo')::TEXT, 4, '0');
    END IF;
    NEW.provincia := 'Uíge';

    IF NEW.tipo_loja = 'loja_fixa' THEN
      IF NULLIF(trim(COALESCE(NEW.morada, '')), '') IS NULL
         OR NULLIF(trim(COALESCE(NEW.bairro, '')), '') IS NULL
         OR NULLIF(trim(COALESCE(NEW.foto_fachada_url, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Loja fixa exige morada, bairro e fotografia da fachada.';
      END IF;
    ELSIF NEW.tipo_loja = 'vendedor_ambulante' THEN
      IF NULLIF(trim(COALESCE(NEW.foto_bi_url, '')), '') IS NULL
         OR NULLIF(trim(COALESCE(NEW.telefone, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Vendedor ambulante exige fotografia do BI e contacto telefónico.';
      END IF;
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT v_is_system THEN
      -- Impede criação de loja já aprovada, VIP, suspensa ou com plano pago pelo cliente
      NEW.is_aprovada := FALSE;
      NEW.is_vip := FALSE;
      NEW.suspensa := FALSE;
      NEW.motivo_suspensao := NULL;
      NEW.plano_tipo := 'gratis';
      NEW.plano_expira_em := NULL;
      NEW.denuncias_count := 0;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT v_is_system THEN
      IF (
        NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada
        OR NEW.is_vip IS DISTINCT FROM OLD.is_vip
        OR NEW.suspensa IS DISTINCT FROM OLD.suspensa
        OR NEW.motivo_suspensao IS DISTINCT FROM OLD.motivo_suspensao
        OR NEW.plano_tipo IS DISTINCT FROM OLD.plano_tipo
        OR NEW.plano_expira_em IS DISTINCT FROM OLD.plano_expira_em
        OR NEW.codigo IS DISTINCT FROM OLD.codigo
        OR NEW.denuncias_count IS DISTINCT FROM OLD.denuncias_count
      ) THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem alterar is_aprovada, is_vip, suspensa ou plano_tipo da loja.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_loja ON public.lojas;
CREATE TRIGGER trg_proteger_loja
BEFORE INSERT OR UPDATE ON public.lojas
FOR EACH ROW EXECUTE FUNCTION public.proteger_e_gerar_codigo_loja();

-- 3. BLOQUEIO ESTRITO DE CAMPOS ADMINISTRATIVOS EM PUBLIC.PRODUTOS
CREATE OR REPLACE FUNCTION public.proteger_campos_admin_produto()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_store_approved BOOLEAN;
  v_store_suspended BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT v_is_system THEN
      IF COALESCE(NEW.is_destaque, FALSE) = TRUE THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem activar is_destaque em produtos.';
      END IF;

      -- Novo artigo nunca pode forçar destaque, vendas ou avaliações fictícias
      NEW.is_destaque := FALSE;
      NEW.vendas := 0;
      NEW.classificacao := 0.0;
      NEW.total_avaliacoes := 0;

      -- Se associado a uma loja, só fica aprovado se a loja já estiver aprovada e activa
      IF NEW.loja_id IS NOT NULL THEN
        SELECT is_aprovada, suspensa INTO v_store_approved, v_store_suspended
        FROM public.lojas WHERE id = NEW.loja_id;
        NEW.is_aprovado := COALESCE(v_store_approved, FALSE) AND NOT COALESCE(v_store_suspended, FALSE);
      ELSE
        NEW.is_aprovado := FALSE;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT v_is_system THEN
      IF (
        NEW.is_aprovado IS DISTINCT FROM OLD.is_aprovado
        OR NEW.is_destaque IS DISTINCT FROM OLD.is_destaque
        OR NEW.vendas IS DISTINCT FROM OLD.vendas
        OR NEW.classificacao IS DISTINCT FROM OLD.classificacao
        OR NEW.total_avaliacoes IS DISTINCT FROM OLD.total_avaliacoes
      ) THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem alterar aprovação ou destaque de produtos.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_campos_admin_produto ON public.produtos;
CREATE TRIGGER trg_proteger_campos_admin_produto
BEFORE INSERT OR UPDATE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_admin_produto();

-- 4. CÁLCULO AUTORITATIVO NO SERVIDOR DE SUBTOTAL E TOTAL DA ENCOMENDA
-- 4A. Inicializar encomenda ignorando subtotal/total/taxa enviados pelo cliente
CREATE OR REPLACE FUNCTION public.inicializar_encomenda_servidor()
RETURNS TRIGGER AS $$
DECLARE
  v_taxa_padrao NUMERIC(12, 2);
BEGIN
  SELECT COALESCE(taxa_entrega_padrao, 1500)
  INTO v_taxa_padrao
  FROM public.configuracoes_sistema
  WHERE id = 'global';

  IF NEW.tipo_entrega = 'levantamento' THEN
    NEW.taxa_entrega := 0;
  ELSE
    NEW.taxa_entrega := COALESCE(v_taxa_padrao, 1500);
  END IF;

  -- Ignora qualquer subtotal/total enviado pelo cliente; será somado a partir de itens_encomenda
  NEW.subtotal := 0;
  NEW.total := NEW.taxa_entrega;

  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.estado := 'Pendente';
    NEW.estado_pagamento := 'pendente';
    NEW.pago_em := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_inicializar_encomenda_servidor ON public.encomendas;
CREATE TRIGGER trg_inicializar_encomenda_servidor
BEFORE INSERT ON public.encomendas
FOR EACH ROW EXECUTE FUNCTION public.inicializar_encomenda_servidor();

-- 4B. Bloquear alteração directa de subtotal/total/taxa na tabela encomendas pelo cliente
CREATE OR REPLACE FUNCTION public.proteger_totais_encomenda()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT v_is_system THEN
    IF (
      NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
      OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
      OR NEW.utilizador_id IS DISTINCT FROM OLD.utilizador_id
    ) THEN
      RAISE EXCEPTION 'Operação não autorizada: subtotal e total da encomenda são calculados exclusivamente no servidor.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_totais_encomenda ON public.encomendas;
CREATE TRIGGER trg_proteger_totais_encomenda
BEFORE UPDATE ON public.encomendas
FOR EACH ROW EXECUTE FUNCTION public.proteger_totais_encomenda();

-- 4C. Validar preço unitário do item a partir de public.produtos (ignora preço enviado pelo cliente)
CREATE OR REPLACE FUNCTION public.validar_preco_item_encomenda()
RETURNS TRIGGER AS $$
DECLARE
  v_preco_actual NUMERIC(12, 2);
  v_nome_produto TEXT;
  v_prod_loja_id UUID;
  v_order_loja_id UUID;
BEGIN
  IF NEW.produto_id IS NULL THEN
    RAISE EXCEPTION 'Cada item da encomenda tem de estar associado a um produto válido.';
  END IF;

  IF NEW.quantidade IS NULL OR NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade do item deve ser superior a zero.';
  END IF;

  SELECT preco, nome, loja_id
  INTO v_preco_actual, v_nome_produto, v_prod_loja_id
  FROM public.produtos
  WHERE id = NEW.produto_id;

  IF NOT FOUND OR v_preco_actual IS NULL THEN
    RAISE EXCEPTION 'Produto inexistente ou indisponível.';
  END IF;

  SELECT loja_id INTO v_order_loja_id
  FROM public.encomendas
  WHERE id = NEW.encomenda_id;

  IF v_order_loja_id IS NOT NULL AND v_prod_loja_id IS NOT NULL AND v_order_loja_id IS DISTINCT FROM v_prod_loja_id THEN
    RAISE EXCEPTION 'Todos os itens da encomenda devem pertencer à loja da encomenda.';
  END IF;

  -- Força o preço actual do servidor e ignora qualquer preco_unitario enviado pelo cliente
  NEW.preco_unitario := v_preco_actual;
  NEW.nome_produto := COALESCE(NULLIF(trim(v_nome_produto), ''), NEW.nome_produto);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validar_preco_item_encomenda ON public.itens_encomenda;
CREATE TRIGGER trg_validar_preco_item_encomenda
BEFORE INSERT OR UPDATE ON public.itens_encomenda
FOR EACH ROW EXECUTE FUNCTION public.validar_preco_item_encomenda();

-- 4D. Recalcular subtotal e total da encomenda após inserção/actualização/remoção de itens
CREATE OR REPLACE FUNCTION public.recalcular_totais_encomenda()
RETURNS TRIGGER AS $$
DECLARE
  v_encomenda_id UUID;
  v_subtotal NUMERIC(12, 2);
  v_taxa NUMERIC(12, 2);
  v_tipo_entrega TEXT;
BEGIN
  v_encomenda_id := COALESCE(NEW.encomenda_id, OLD.encomenda_id);

  IF v_encomenda_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(quantidade * preco_unitario), 0)
  INTO v_subtotal
  FROM public.itens_encomenda
  WHERE encomenda_id = v_encomenda_id;

  SELECT taxa_entrega, tipo_entrega
  INTO v_taxa, v_tipo_entrega
  FROM public.encomendas
  WHERE id = v_encomenda_id;

  IF v_tipo_entrega = 'levantamento' THEN
    v_taxa := 0;
  ELSE
    v_taxa := COALESCE(v_taxa, 0);
  END IF;

  PERFORM set_config('app.system_mutation', 'on', true);
  UPDATE public.encomendas
  SET
    subtotal = v_subtotal,
    taxa_entrega = v_taxa,
    total = v_subtotal + v_taxa
  WHERE id = v_encomenda_id;
  PERFORM set_config('app.system_mutation', 'off', true);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalcular_totais_encomenda ON public.itens_encomenda;
CREATE TRIGGER trg_recalcular_totais_encomenda
AFTER INSERT OR UPDATE OR DELETE ON public.itens_encomenda
FOR EACH ROW EXECUTE FUNCTION public.recalcular_totais_encomenda();
