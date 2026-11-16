-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V4 (FASE 0): SEGURANÇA NO SERVIDOR, PAPÉIS DE EQUIPA,
-- BLOQUEIO DE CAMPOS ADMIN, CÁLCULO DE TOTAIS E TABELAS DO CENTRO DE CONTROLO
-- ==============================================================================
-- 1. Só membros autorizados da equipa admin (com permissões granulares por RLS e
--    triggers) ou rotinas internas (app.system_mutation = 'on') podem alterar:
--      - lojas: is_aprovada, estado_aprovacao, motivo_rejeicao, nota_correcao,
--               is_vip, suspensa, motivo_suspensao, plano_tipo, plano_expira_em,
--               denuncias_count, codigo
--      - produtos: is_aprovado, is_destaque, vendas, classificacao, total_avaliacoes
-- 2. O subtotal, taxa_entrega e total de cada encomenda são SEMPRE calculados no
--    servidor a partir dos itens_encomenda e do preço actual em public.produtos,
--    ignorando quaisquer valores enviados pelo cliente.
-- 3. Papéis de equipa aplicados por RLS e triggers:
--      - super_admin (migra todos os 'admin' actuais)
--      - moderador (aprovações, lojas, produtos, denúncias, anúncios, avisos)
--      - financeiro (pagamentos, planos, mensalidades, comissões e preços)
-- 4. Suporte de base de dados com RLS para Centro de Controlo (só super_admin):
--      - public.eventos_sistema (SOC)
--      - public.erros_app (Observabilidade com limite de taxa e sanitização)
--      - public.get_system_health_metrics() (ITOM / NOC)
-- ==============================================================================

-- 1. MIGRAR PAPEL 'admin' ACTUAL PARA 'super_admin' E ACTUALIZAR CHECK CONSTRAINT
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'perfis'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%papel%'
  LOOP
    EXECUTE format('ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS %I', v_constraint);
  END LOOP;
END $$;

ALTER TABLE public.perfis
  ADD CONSTRAINT perfis_papel_check
  CHECK (papel IN ('cliente', 'comerciante', 'entregador', 'admin', 'super_admin', 'moderador', 'financeiro'));

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS estado_aprovacao TEXT NOT NULL DEFAULT 'aprovado'
    CHECK (estado_aprovacao IN ('pendente', 'aprovado', 'rejeitado', 'correcao')),
  ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
  ADD COLUMN IF NOT EXISTS nota_correcao TEXT;

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS estado_aprovacao TEXT NOT NULL DEFAULT 'pendente'
    CHECK (estado_aprovacao IN ('pendente', 'aprovado', 'rejeitado', 'correcao')),
  ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
  ADD COLUMN IF NOT EXISTS nota_correcao TEXT;

ALTER TABLE public.configuracoes_sistema
  ADD COLUMN IF NOT EXISTS modo_manutencao BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mensagem_manutencao TEXT DEFAULT 'Estamos em manutenção programada para melhorar o Mercado Uíge. Voltamos em breve.';

-- Sincronizar estado_aprovacao inicial em perfis e lojas existentes
UPDATE public.perfis
SET estado_aprovacao = CASE WHEN COALESCE(aprovado, TRUE) THEN 'aprovado' ELSE 'pendente' END
WHERE estado_aprovacao IS NULL OR (aprovado = FALSE AND estado_aprovacao = 'aprovado');

UPDATE public.lojas
SET estado_aprovacao = CASE WHEN COALESCE(is_aprovada, FALSE) THEN 'aprovado' ELSE 'pendente' END
WHERE estado_aprovacao IS NULL OR (is_aprovada = TRUE AND estado_aprovacao = 'pendente');

-- 2. FUNÇÕES AUXILIARES DE PAPEL E PERMISSÃO NO SERVIDOR (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND papel IN ('super_admin', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND papel IN ('super_admin', 'admin', 'moderador')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_finance()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND papel IN ('super_admin', 'admin', 'financeiro')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND papel IN ('super_admin', 'admin', 'moderador', 'financeiro')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Promover o administrador actual a super_admin (com GUC de sistema)
DO $$
BEGIN
  PERFORM set_config('app.system_mutation', 'on', true);
  UPDATE public.perfis
  SET papel = 'super_admin'
  WHERE papel = 'admin';
  PERFORM set_config('app.system_mutation', 'off', true);
END $$;

-- 3. TABELAS DO CENTRO DE CONTROLO (SOC & OBSERVABILIDADE) — RLS SÓ PARA SUPER_ADMIN
CREATE TABLE IF NOT EXISTS public.eventos_sistema (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL,
  gravidade TEXT NOT NULL DEFAULT 'info' CHECK (gravidade IN ('info', 'aviso', 'alta', 'critica')),
  utilizador_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  utilizador_email TEXT,
  detalhe TEXT NOT NULL,
  resolvido BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_eventos_sistema_criado_em ON public.eventos_sistema(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_sistema_gravidade ON public.eventos_sistema(gravidade);

ALTER TABLE public.eventos_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas super_admin lê eventos do sistema" ON public.eventos_sistema;
CREATE POLICY "Apenas super_admin lê eventos do sistema"
ON public.eventos_sistema FOR SELECT
USING (public.is_super_admin());

DROP POLICY IF EXISTS "Apenas super_admin insere eventos do sistema" ON public.eventos_sistema;
CREATE POLICY "Apenas super_admin insere eventos do sistema"
ON public.eventos_sistema FOR INSERT
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Apenas super_admin gere eventos do sistema" ON public.eventos_sistema;
CREATE POLICY "Apenas super_admin gere eventos do sistema"
ON public.eventos_sistema FOR UPDATE
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Apenas super_admin apaga eventos do sistema" ON public.eventos_sistema;
CREATE POLICY "Apenas super_admin apaga eventos do sistema"
ON public.eventos_sistema FOR DELETE
USING (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.erros_app (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ecra TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'runtime',
  contagem INT NOT NULL DEFAULT 1 CHECK (contagem >= 1),
  duracao_ms INT,
  ultima_ocorrencia TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE (ecra, mensagem, origem)
);

CREATE INDEX IF NOT EXISTS idx_erros_app_ultima_ocorrencia ON public.erros_app(ultima_ocorrencia DESC);

ALTER TABLE public.erros_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas super_admin lê erros da app" ON public.erros_app;
CREATE POLICY "Apenas super_admin lê erros da app"
ON public.erros_app FOR SELECT
USING (public.is_super_admin());

DROP POLICY IF EXISTS "Apenas super_admin gere erros da app" ON public.erros_app;
CREATE POLICY "Apenas super_admin gere erros da app"
ON public.erros_app FOR UPDATE
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Apenas super_admin apaga erros da app" ON public.erros_app;
CREATE POLICY "Apenas super_admin apaga erros da app"
ON public.erros_app FOR DELETE
USING (public.is_super_admin());

-- Sanitização de texto sensível no servidor (nunca guardar chaves, tokens ou palavras-passe)
CREATE OR REPLACE FUNCTION public.sanitizar_texto_seguro(p_texto TEXT, p_max_len INT DEFAULT 240)
RETURNS TEXT AS $$
DECLARE
  v_clean TEXT;
BEGIN
  v_clean := COALESCE(p_texto, '');
  v_clean := regexp_replace(v_clean, 'sb_(secret|publishable)_[A-Za-z0-9_\-]+', '[chave-removida]', 'gi');
  v_clean := regexp_replace(v_clean, 'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+', '[token-removido]', 'g');
  v_clean := regexp_replace(v_clean, '(password|senha|palavra[- ]?passe|api[_-]?key|service_role|authorization)\s*[:=]\s*[^\s,;]+', '\1=[oculto]', 'gi');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  RETURN LEFT(trim(v_clean), p_max_len);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- RPC seguro com limite de taxa para registar eventos SOC (logins falhados, pedidos excessivos de código, etc.)
CREATE OR REPLACE FUNCTION public.registrar_evento_sistema(
  p_tipo TEXT,
  p_gravidade TEXT DEFAULT 'info',
  p_utilizador_email TEXT DEFAULT NULL,
  p_detalhe TEXT DEFAULT ''
)
RETURNS VOID AS $$
DECLARE
  v_recent INT;
  v_sev TEXT;
  v_email TEXT;
BEGIN
  v_sev := CASE
    WHEN p_gravidade IN ('info', 'aviso', 'alta', 'critica') THEN p_gravidade
    ELSE 'info'
  END;

  SELECT COUNT(*) INTO v_recent
  FROM public.eventos_sistema
  WHERE tipo = LEFT(COALESCE(p_tipo, 'EVENTO'), 60)
    AND criado_em > TIMEZONE('utc', NOW()) - INTERVAL '1 minute';

  -- Limite de taxa para evitar spam na tabela SOC
  IF v_recent >= 15 THEN
    RETURN;
  END IF;

  IF p_utilizador_email IS NOT NULL AND trim(p_utilizador_email) <> '' THEN
    v_email := LEFT(lower(trim(p_utilizador_email)), 120);
  ELSE
    SELECT email INTO v_email FROM public.perfis WHERE id = auth.uid();
  END IF;

  INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, utilizador_email, detalhe)
  VALUES (
    LEFT(COALESCE(NULLIF(trim(p_tipo), ''), 'EVENTO_SISTEMA'), 60),
    v_sev,
    auth.uid(),
    v_email,
    public.sanitizar_texto_seguro(p_detalhe, 260)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.registrar_evento_sistema(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- RPC seguro com limite de taxa e agrupamento por ecrã para Observabilidade
CREATE OR REPLACE FUNCTION public.reportar_erro_app(
  p_ecra TEXT,
  p_mensagem TEXT,
  p_origem TEXT DEFAULT 'runtime',
  p_duracao_ms INT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_recent INT;
  v_ecra TEXT;
  v_msg TEXT;
  v_orig TEXT;
BEGIN
  SELECT COUNT(*) INTO v_recent
  FROM public.erros_app
  WHERE ultima_ocorrencia > TIMEZONE('utc', NOW()) - INTERVAL '1 minute';

  IF v_recent >= 20 THEN
    RETURN;
  END IF;

  v_ecra := LEFT(COALESCE(NULLIF(trim(p_ecra), ''), 'geral'), 60);
  v_msg := COALESCE(NULLIF(public.sanitizar_texto_seguro(p_mensagem, 160), ''), 'Erro operacional');
  v_orig := LEFT(COALESCE(NULLIF(trim(p_origem), ''), 'runtime'), 40);

  INSERT INTO public.erros_app (ecra, mensagem, origem, contagem, duracao_ms, ultima_ocorrencia)
  VALUES (v_ecra, v_msg, v_orig, 1, CASE WHEN p_duracao_ms IS NOT NULL AND p_duracao_ms >= 0 THEN p_duracao_ms ELSE NULL END, TIMEZONE('utc', NOW()))
  ON CONFLICT (ecra, mensagem, origem)
  DO UPDATE SET
    contagem = public.erros_app.contagem + 1,
    duracao_ms = COALESCE(EXCLUDED.duracao_ms, public.erros_app.duracao_ms),
    ultima_ocorrencia = TIMEZONE('utc', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.reportar_erro_app(TEXT, TEXT, TEXT, INT) TO anon, authenticated;

-- RPC de métricas NOC / ITOM exclusivo para super_admin
CREATE OR REPLACE FUNCTION public.get_system_health_metrics()
RETURNS jsonb AS $$
DECLARE
  v_db_bytes BIGINT := 0;
  v_storage_bytes BIGINT := 0;
  v_storage_files INT := 0;
  v_total_users INT := 0;
  v_pending_payments INT := 0;
  v_open_events INT := 0;
  v_error_groups INT := 0;
  v_orders_count INT := 0;
  v_products_count INT := 0;
  v_stores_count INT := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Operação não autorizada: apenas super_admin pode consultar métricas do sistema.';
  END IF;

  SELECT
    COALESCE(pg_total_relation_size('public.perfis'), 0) +
    COALESCE(pg_total_relation_size('public.lojas'), 0) +
    COALESCE(pg_total_relation_size('public.produtos'), 0) +
    COALESCE(pg_total_relation_size('public.encomendas'), 0) +
    COALESCE(pg_total_relation_size('public.itens_encomenda'), 0) +
    COALESCE(pg_total_relation_size('public.pagamentos_comerciante'), 0) +
    COALESCE(pg_total_relation_size('public.entregas'), 0) +
    COALESCE(pg_total_relation_size('public.eventos_sistema'), 0) +
    COALESCE(pg_total_relation_size('public.erros_app'), 0)
  INTO v_db_bytes;

  SELECT COUNT(*), COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0)
  INTO v_storage_files, v_storage_bytes
  FROM storage.objects
  WHERE bucket_id = 'produtos';

  SELECT COUNT(*) INTO v_total_users FROM public.perfis;
  SELECT COUNT(*) INTO v_stores_count FROM public.lojas;
  SELECT COUNT(*) INTO v_products_count FROM public.produtos;
  SELECT COUNT(*) INTO v_orders_count FROM public.encomendas;
  SELECT COUNT(*) INTO v_pending_payments FROM public.pagamentos_comerciante WHERE estado = 'pendente';
  SELECT COUNT(*) INTO v_open_events FROM public.eventos_sistema WHERE resolvido = FALSE AND gravidade IN ('alta', 'critica');
  SELECT COUNT(*) INTO v_error_groups FROM public.erros_app;

  RETURN jsonb_build_object(
    'dbBytes', v_db_bytes,
    'storageBytes', v_storage_bytes,
    'storageFiles', v_storage_files,
    'totalUsers', v_total_users,
    'storesCount', v_stores_count,
    'productsCount', v_products_count,
    'ordersCount', v_orders_count,
    'pendingPayments', v_pending_payments,
    'openSecurityAlerts', v_open_events,
    'errorGroups', v_error_groups,
    'collectedAt', TIMEZONE('utc', NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

GRANT EXECUTE ON FUNCTION public.get_system_health_metrics() TO authenticated;

-- 4. CONTROLO DE PAPÉIS E APROVAÇÕES EM PUBLIC.PERFIS (TRIGGERS + RLS)
CREATE OR REPLACE FUNCTION public.check_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL
       AND NEW.papel IN ('admin', 'super_admin', 'moderador', 'financeiro')
       AND NOT public.is_super_admin()
       AND NOT v_is_system THEN
      RAISE EXCEPTION 'Operação não autorizada: apenas super_admin pode atribuir papéis administrativos.';
    END IF;

    IF auth.uid() IS NOT NULL AND NEW.papel IN ('comerciante', 'entregador') AND NOT public.is_moderator() AND NOT v_is_system THEN
      NEW.aprovado := FALSE;
      NEW.estado_aprovacao := 'pendente';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT v_is_system THEN
      -- Só super_admin pode alterar o papel de equipa/utilizador
      IF NEW.papel IS DISTINCT FROM OLD.papel AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas super_admin pode alterar o papel de um utilizador.';
      END IF;

      -- Só moderador ou super_admin pode aprovar, suspender, rejeitar ou pedir correcção
      IF (
        NEW.suspenso IS DISTINCT FROM OLD.suspenso
        OR NEW.aprovado IS DISTINCT FROM OLD.aprovado
        OR NEW.estado_aprovacao IS DISTINCT FROM OLD.estado_aprovacao
        OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao
        OR NEW.nota_correcao IS DISTINCT FROM OLD.nota_correcao
        OR NEW.codigo IS DISTINCT FROM OLD.codigo
      ) AND NOT public.is_moderator() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas moderador ou super_admin pode alterar aprovação ou suspensão.';
      END IF;

      -- Só financeiro ou super_admin pode alterar plano directamente no perfil
      IF (
        NEW.plano_tipo IS DISTINCT FROM OLD.plano_tipo
        OR NEW.plano_expira_em IS DISTINCT FROM OLD.plano_expira_em
      ) AND NOT public.is_finance() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas financeiro ou super_admin pode alterar o plano da conta.';
      END IF;
    END IF;

    -- Registar suspensão/aprovação na tabela SOC automaticamente
    IF OLD.suspenso IS DISTINCT FROM NEW.suspenso THEN
      INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, utilizador_email, detalhe)
      VALUES (
        CASE WHEN NEW.suspenso THEN 'CONTA_SUSPENSA' ELSE 'CONTA_REACTIVADA' END,
        CASE WHEN NEW.suspenso THEN 'alta' ELSE 'info' END,
        NEW.id,
        NEW.email,
        CASE WHEN NEW.suspenso THEN 'Conta suspensa pela moderação (' || COALESCE(NEW.codigo, NEW.id::TEXT) || ')' ELSE 'Conta reactivada' END
      );
    ELSIF OLD.aprovado IS DISTINCT FROM NEW.aprovado OR OLD.estado_aprovacao IS DISTINCT FROM NEW.estado_aprovacao THEN
      INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, utilizador_email, detalhe)
      VALUES (
        'APROVACAO_CONTA',
        'info',
        NEW.id,
        NEW.email,
        'Estado da conta alterado para ' || COALESCE(NEW.estado_aprovacao, CASE WHEN NEW.aprovado THEN 'aprovado' ELSE 'pendente' END)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.perfis;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE INSERT OR UPDATE ON public.perfis
FOR EACH ROW EXECUTE FUNCTION public.check_role_escalation();

DROP POLICY IF EXISTS "Utilizador lê o próprio perfil ou admin lê todos" ON public.perfis;
CREATE POLICY "Utilizador lê o próprio perfil ou admin lê todos"
ON public.perfis FOR SELECT
USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Utilizador actualiza o próprio perfil ou admin actualiza todos" ON public.perfis;
CREATE POLICY "Utilizador actualiza perfil ou equipa autorizada"
ON public.perfis FOR UPDATE
USING (auth.uid() = id OR public.is_moderator() OR public.is_finance())
WITH CHECK (auth.uid() = id OR public.is_moderator() OR public.is_finance());

-- 5. FUNÇÕES INTERNAS ACTUALIZADAS COM CONTEXTO DE SISTEMA CONTROLADO
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

-- 6. BLOQUEIO ESTRITO DE CAMPOS ADMINISTRATIVOS EM PUBLIC.LOJAS (COM PERMISSÕES POR PAPEL)
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
      NEW.is_aprovada := FALSE;
      NEW.estado_aprovacao := 'pendente';
      NEW.motivo_rejeicao := NULL;
      NEW.nota_correcao := NULL;
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
    IF auth.uid() IS NOT NULL AND NOT v_is_system THEN
      -- Campos protegidos para qualquer utilizador comum
      IF NOT public.is_admin() AND (
        NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada
        OR NEW.estado_aprovacao IS DISTINCT FROM OLD.estado_aprovacao
        OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao
        OR NEW.nota_correcao IS DISTINCT FROM OLD.nota_correcao
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

      -- Separação dentro da equipa: moderação vs financeiro
      IF (
        NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada
        OR NEW.estado_aprovacao IS DISTINCT FROM OLD.estado_aprovacao
        OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao
        OR NEW.nota_correcao IS DISTINCT FROM OLD.nota_correcao
        OR NEW.suspensa IS DISTINCT FROM OLD.suspensa
        OR NEW.motivo_suspensao IS DISTINCT FROM OLD.motivo_suspensao
      ) AND NOT public.is_moderator() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas moderador ou super_admin pode aprovar ou suspender lojas.';
      END IF;

      IF (
        NEW.is_vip IS DISTINCT FROM OLD.is_vip
        OR NEW.plano_tipo IS DISTINCT FROM OLD.plano_tipo
        OR NEW.plano_expira_em IS DISTINCT FROM OLD.plano_expira_em
      ) AND NOT public.is_finance() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas financeiro ou super_admin pode alterar o plano ou selo VIP da loja.';
      END IF;

      IF (NEW.codigo IS DISTINCT FROM OLD.codigo) AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada: código da loja não pode ser alterado.';
      END IF;
    END IF;

    -- Registar eventos SOC de aprovação/suspensão da loja
    IF OLD.suspensa IS DISTINCT FROM NEW.suspensa THEN
      INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, detalhe)
      VALUES (
        CASE WHEN NEW.suspensa THEN 'LOJA_SUSPENSA' ELSE 'LOJA_REACTIVADA' END,
        CASE WHEN NEW.suspensa THEN 'alta' ELSE 'info' END,
        NEW.dono_id,
        'Loja ' || COALESCE(NEW.codigo, NEW.nome) || ': ' || COALESCE(NEW.motivo_suspensao, CASE WHEN NEW.suspensa THEN 'Suspensa' ELSE 'Reactivada' END)
      );
    ELSIF OLD.is_aprovada IS DISTINCT FROM NEW.is_aprovada OR OLD.estado_aprovacao IS DISTINCT FROM NEW.estado_aprovacao THEN
      INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, detalhe)
      VALUES (
        'APROVACAO_LOJA',
        'info',
        NEW.dono_id,
        'Loja ' || COALESCE(NEW.codigo, NEW.nome) || ' alterada para ' || COALESCE(NEW.estado_aprovacao, CASE WHEN NEW.is_aprovada THEN 'aprovado' ELSE 'pendente' END)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_loja ON public.lojas;
CREATE TRIGGER trg_proteger_loja
BEFORE INSERT OR UPDATE ON public.lojas
FOR EACH ROW EXECUTE FUNCTION public.proteger_e_gerar_codigo_loja();

DROP POLICY IF EXISTS "Dono ou Admin actualiza loja" ON public.lojas;
CREATE POLICY "Dono ou Equipa Admin actualiza loja"
ON public.lojas FOR UPDATE
USING (auth.uid() = dono_id OR public.is_moderator() OR public.is_finance())
WITH CHECK (auth.uid() = dono_id OR public.is_moderator() OR public.is_finance());

-- 7. BLOQUEIO ESTRITO DE CAMPOS ADMINISTRATIVOS EM PUBLIC.PRODUTOS
CREATE OR REPLACE FUNCTION public.proteger_campos_admin_produto()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_store_approved BOOLEAN;
  v_store_suspended BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() AND NOT v_is_system THEN
      IF COALESCE(NEW.is_destaque, FALSE) = TRUE THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem activar is_destaque em produtos.';
      END IF;

      NEW.is_destaque := FALSE;
      NEW.vendas := 0;
      NEW.classificacao := 0.0;
      NEW.total_avaliacoes := 0;

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
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() AND NOT v_is_system THEN
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

DROP POLICY IF EXISTS "Vendedor actualiza os seus produtos" ON public.produtos;
CREATE POLICY "Vendedor ou Moderador actualiza produtos"
ON public.produtos FOR UPDATE
USING (vendedor_id = auth.uid() OR public.is_moderator())
WITH CHECK (vendedor_id = auth.uid() OR public.is_moderator());

DROP POLICY IF EXISTS "Vendedor apaga os seus produtos" ON public.produtos;
CREATE POLICY "Vendedor ou Moderador apaga produtos"
ON public.produtos FOR DELETE
USING (vendedor_id = auth.uid() OR public.is_moderator());

-- 8. RLS POR PAPEL PARA DENÚNCIAS, ANÚNCIOS, PAGAMENTOS, MENSALIDADES, AVISOS E CONFIGURAÇÕES
DROP POLICY IF EXISTS "Apenas admin actualiza denúncias" ON public.denuncias;
CREATE POLICY "Moderador actualiza denúncias"
ON public.denuncias FOR UPDATE
USING (public.is_moderator())
WITH CHECK (public.is_moderator());

DROP POLICY IF EXISTS "Admin gere anúncios" ON public.anuncios;
CREATE POLICY "Moderador gere anúncios"
ON public.anuncios FOR UPDATE
USING (public.is_moderator())
WITH CHECK (public.is_moderator());

DROP POLICY IF EXISTS "Dono ou admin apaga anúncio" ON public.anuncios;
CREATE POLICY "Dono ou Moderador apaga anúncio"
ON public.anuncios FOR DELETE
USING (vendedor_id = auth.uid() OR public.is_moderator());

DROP POLICY IF EXISTS "Apenas admin publica avisos" ON public.avisos;
CREATE POLICY "Moderador publica avisos"
ON public.avisos FOR INSERT
WITH CHECK (public.is_moderator());

DROP POLICY IF EXISTS "Apenas admin confirma ou rejeita pagamento" ON public.pagamentos_comerciante;
CREATE POLICY "Financeiro confirma ou rejeita pagamento"
ON public.pagamentos_comerciante FOR UPDATE
USING (public.is_finance())
WITH CHECK (public.is_finance());

DROP POLICY IF EXISTS "Apenas admin confirma mensalidade" ON public.mensalidades_entregador;
CREATE POLICY "Financeiro confirma mensalidade"
ON public.mensalidades_entregador FOR UPDATE
USING (public.is_finance())
WITH CHECK (public.is_finance());

-- Protecção de modo de manutenção na tabela configuracoes_sistema (só super_admin)
CREATE OR REPLACE FUNCTION public.proteger_configuracoes_sistema()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    IF (
      NEW.modo_manutencao IS DISTINCT FROM OLD.modo_manutencao
      OR NEW.mensagem_manutencao IS DISTINCT FROM OLD.mensagem_manutencao
      OR NEW.whatsapp_admin IS DISTINCT FROM OLD.whatsapp_admin
      OR NEW.limite_denuncias_suspensao IS DISTINCT FROM OLD.limite_denuncias_suspensao
    ) AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Operação não autorizada: apenas super_admin pode alterar o modo de manutenção ou limites críticos.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_configuracoes_sistema ON public.configuracoes_sistema;
CREATE TRIGGER trg_proteger_configuracoes_sistema
BEFORE UPDATE ON public.configuracoes_sistema
FOR EACH ROW EXECUTE FUNCTION public.proteger_configuracoes_sistema();

DROP POLICY IF EXISTS "Apenas admin altera configurações" ON public.configuracoes_sistema;
CREATE POLICY "Financeiro ou Super Admin altera configurações"
ON public.configuracoes_sistema FOR ALL
USING (public.is_finance())
WITH CHECK (public.is_finance());

-- 9. CÁLCULO AUTORITATIVO NO SERVIDOR DE SUBTOTAL E TOTAL DA ENCOMENDA + DETECÇÃO DE ENCOMENDA ANORMAL
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

CREATE OR REPLACE FUNCTION public.proteger_totais_encomenda()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND NOT v_is_system THEN
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

  NEW.preco_unitario := v_preco_actual;
  NEW.nome_produto := COALESCE(NULLIF(trim(v_nome_produto), ''), NEW.nome_produto);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validar_preco_item_encomenda ON public.itens_encomenda;
CREATE TRIGGER trg_validar_preco_item_encomenda
BEFORE INSERT OR UPDATE ON public.itens_encomenda
FOR EACH ROW EXECUTE FUNCTION public.validar_preco_item_encomenda();

CREATE OR REPLACE FUNCTION public.recalcular_totais_encomenda()
RETURNS TRIGGER AS $$
DECLARE
  v_encomenda_id UUID;
  v_subtotal NUMERIC(12, 2);
  v_total_qty INT;
  v_taxa NUMERIC(12, 2);
  v_tipo_entrega TEXT;
  v_user_id UUID;
  v_codigo TEXT;
BEGIN
  v_encomenda_id := COALESCE(NEW.encomenda_id, OLD.encomenda_id);

  IF v_encomenda_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(quantidade * preco_unitario), 0), COALESCE(SUM(quantidade), 0)
  INTO v_subtotal, v_total_qty
  FROM public.itens_encomenda
  WHERE encomenda_id = v_encomenda_id;

  SELECT taxa_entrega, tipo_entrega, utilizador_id, codigo
  INTO v_taxa, v_tipo_entrega, v_user_id, v_codigo
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

  -- Registo SOC automático para encomendas de valor ou quantidade anormais
  IF (v_subtotal + v_taxa) >= 500000 OR v_total_qty >= 25 THEN
    INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, detalhe)
    VALUES (
      'ENCOMENDA_ANORMAL',
      'alta',
      v_user_id,
      'Encomenda ' || COALESCE(v_codigo, v_encomenda_id::TEXT) || ' com volume atípico: ' || v_total_qty || ' un. / ' || (v_subtotal + v_taxa) || ' Kz'
    );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalcular_totais_encomenda ON public.itens_encomenda;
CREATE TRIGGER trg_recalcular_totais_encomenda
AFTER INSERT OR UPDATE OR DELETE ON public.itens_encomenda
FOR EACH ROW EXECUTE FUNCTION public.recalcular_totais_encomenda();
