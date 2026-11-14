-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V2: IDENTIFICADORES, LOJAS, ANÚNCIOS, PLANOS,
-- DENÚNCIAS/AVALIAÇÕES POR LOJA, CARRINHO POR LOJA E SISTEMA DE ENTREGAS
-- ==============================================================================

-- 1. SEQUÊNCIAS NO SERVIDOR PARA CÓDIGOS ÚNICOS LEGÍVEIS (CL-XXXX, LJ-XXXX)
CREATE SEQUENCE IF NOT EXISTS public.seq_perfil_codigo START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_loja_codigo START 1;

-- 2. ACTUALIZAR TABELA DE PERFIS (Registo exclusivo Uíge, código único, BI, aprovação)
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS bi_numero TEXT;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS bi_foto_url TEXT;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS reside_uige_confirmado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS aprovado BOOLEAN NOT NULL DEFAULT TRUE;

-- Garantir província fixa no Uíge
UPDATE public.perfis SET provincia = 'Uíge' WHERE provincia IS NULL OR provincia <> 'Uíge';
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS chk_perfis_provincia_uige;
ALTER TABLE public.perfis ADD CONSTRAINT chk_perfis_provincia_uige CHECK (provincia = 'Uíge');

-- Backfill de códigos para perfis existentes
UPDATE public.perfis
SET codigo = 'CL-' || LPAD(nextval('public.seq_perfil_codigo')::TEXT, 4, '0')
WHERE codigo IS NULL;

CREATE OR REPLACE FUNCTION public.gerar_codigo_perfil()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR trim(NEW.codigo) = '' THEN
    NEW.codigo := 'CL-' || LPAD(nextval('public.seq_perfil_codigo')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_gerar_codigo_perfil ON public.perfis;
CREATE TRIGGER trg_gerar_codigo_perfil
BEFORE INSERT ON public.perfis
FOR EACH ROW EXECUTE FUNCTION public.gerar_codigo_perfil();

-- Actualizar trigger de registo via Auth para aplicar aprovação e exclusividade Uíge
CREATE OR REPLACE FUNCTION public.gerir_novo_utilizador()
RETURNS TRIGGER AS $$
DECLARE
  v_requested_role TEXT;
  v_safe_role TEXT;
  v_aprovado BOOLEAN;
  v_reside BOOLEAN;
BEGIN
  v_requested_role := COALESCE(NEW.raw_user_meta_data->>'papel', 'cliente');
  IF v_requested_role IN ('cliente', 'comerciante', 'entregador') THEN
    v_safe_role := v_requested_role;
  ELSE
    v_safe_role := 'cliente';
  END IF;

  -- Contas novas de vendedores e entregadores passam por aprovação do administrador
  v_aprovado := (v_safe_role = 'cliente');
  v_reside := COALESCE((NEW.raw_user_meta_data->>'reside_uige')::BOOLEAN, TRUE);

  IF COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'provincia'), ''), 'Uíge') <> 'Uíge' THEN
    RAISE EXCEPTION 'Registo permitido apenas para residentes na província do Uíge.';
  END IF;

  INSERT INTO public.perfis (
    id, nome, email, telefone, papel, provincia, municipio, bairro, bi_numero, reside_uige_confirmado, aprovado
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'nome'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data->>'telefone'), ''),
    v_safe_role,
    'Uíge',
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'municipio'), ''), 'Uíge'),
    NULLIF(trim(NEW.raw_user_meta_data->>'bairro'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'bi_numero'), ''),
    v_reside,
    v_aprovado
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Endurecer check_role_escalation para impedir auto-aprovação ou alteração de código
CREATE OR REPLACE FUNCTION public.check_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NEW.papel = 'admin' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Operação não autorizada: não é permitido criar utilizadores admin.';
    END IF;
    IF auth.uid() IS NOT NULL AND NEW.papel IN ('comerciante', 'entregador') AND NOT public.is_admin() THEN
      NEW.aprovado := FALSE;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (
      NEW.papel IS DISTINCT FROM OLD.papel
      OR NEW.suspenso IS DISTINCT FROM OLD.suspenso
      OR NEW.aprovado IS DISTINCT FROM OLD.aprovado
      OR NEW.codigo IS DISTINCT FROM OLD.codigo
    ) THEN
      IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada. Apenas administradores confirmados no servidor podem alterar privilégios, código ou aprovação.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. ACTUALIZAR TABELA DE LOJAS (Código único, tipo fixa/ambulante, planos, suspensão, denúncias)
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS tipo_loja TEXT NOT NULL DEFAULT 'loja_fixa' CHECK (tipo_loja IN ('loja_fixa', 'vendedor_ambulante'));
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS morada TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS foto_fachada_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS foto_bi_url TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS suspensa BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS motivo_suspensao TEXT;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS plano_tipo TEXT NOT NULL DEFAULT 'gratis' CHECK (plano_tipo IN ('gratis', 'basico', 'vip'));
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS plano_expira_em TIMESTAMPTZ;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS denuncias_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS total_avaliacoes INT NOT NULL DEFAULT 0;

UPDATE public.lojas SET provincia = 'Uíge' WHERE provincia IS NULL OR provincia <> 'Uíge';
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS chk_lojas_provincia_uige;
ALTER TABLE public.lojas ADD CONSTRAINT chk_lojas_provincia_uige CHECK (provincia = 'Uíge');

UPDATE public.lojas
SET codigo = 'LJ-' || LPAD(nextval('public.seq_loja_codigo')::TEXT, 4, '0')
WHERE codigo IS NULL;

CREATE OR REPLACE FUNCTION public.proteger_e_gerar_codigo_loja()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.codigo IS NULL OR trim(NEW.codigo) = '' THEN
      NEW.codigo := 'LJ-' || LPAD(nextval('public.seq_loja_codigo')::TEXT, 4, '0');
    END IF;
    NEW.provincia := 'Uíge';

    -- Validação obrigatória por tipo de loja
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
      IF NOT public.is_admin() THEN
        NEW.is_aprovada := FALSE;
      END IF;
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      -- Novas lojas aguardam aprovação do administrador (especialmente vendedores ambulantes e novos vendedores)
      NEW.is_aprovada := FALSE;
      NEW.is_vip := FALSE;
      NEW.plano_tipo := 'gratis';
      NEW.suspensa := FALSE;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      IF (
        NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada
        OR NEW.is_vip IS DISTINCT FROM OLD.is_vip
        OR NEW.suspensa IS DISTINCT FROM OLD.suspensa
        OR NEW.plano_tipo IS DISTINCT FROM OLD.plano_tipo
        OR NEW.plano_expira_em IS DISTINCT FROM OLD.plano_expira_em
        OR NEW.codigo IS DISTINCT FROM OLD.codigo
        OR NEW.denuncias_count IS DISTINCT FROM OLD.denuncias_count
      ) THEN
        RAISE EXCEPTION 'Apenas administradores podem alterar aprovação, suspensão, selos ou plano da loja.';
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

-- Actualizar RLS de leitura pública de lojas (esconder lojas suspensas ou não aprovadas ao público)
DROP POLICY IF EXISTS "Lojas aprovadas visíveis ou dono ou admin" ON public.lojas;
CREATE POLICY "Lojas activas visíveis ou dono ou admin"
ON public.lojas FOR SELECT
USING (
  (is_aprovada = TRUE AND suspensa = FALSE)
  OR auth.uid() = dono_id
  OR public.is_admin()
);

-- 4. CONFIGURAÇÕES GLOBAIS DO SISTEMA (Preços dos planos, limite denúncias, entregas)
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  id TEXT PRIMARY KEY DEFAULT 'global',
  limite_denuncias_suspensao INT NOT NULL DEFAULT 3 CHECK (limite_denuncias_suspensao >= 1),
  taxa_entrega_padrao NUMERIC(12, 2) NOT NULL DEFAULT 1500 CHECK (taxa_entrega_padrao >= 0),
  comissao_entrega_percent NUMERIC(5, 2) NOT NULL DEFAULT 15 CHECK (comissao_entrega_percent >= 0 AND comissao_entrega_percent <= 100),
  mensalidade_entregador NUMERIC(12, 2) NOT NULL DEFAULT 5000 CHECK (mensalidade_entregador >= 0),
  preco_plano_basico NUMERIC(12, 2) NOT NULL DEFAULT 5000 CHECK (preco_plano_basico >= 0),
  preco_plano_vip NUMERIC(12, 2) NOT NULL DEFAULT 15000 CHECK (preco_plano_vip >= 0),
  actualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

INSERT INTO public.configuracoes_sistema (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública das configurações" ON public.configuracoes_sistema;
CREATE POLICY "Leitura pública das configurações"
ON public.configuracoes_sistema FOR SELECT USING (true);

DROP POLICY IF EXISTS "Apenas admin altera configurações" ON public.configuracoes_sistema;
CREATE POLICY "Apenas admin altera configurações"
ON public.configuracoes_sistema FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 5. AVALIAÇÕES POR LOJA
CREATE TABLE IF NOT EXISTS public.avaliacoes_loja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  utilizador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  estrelas INT NOT NULL CHECK (estrelas >= 1 AND estrelas <= 5),
  comentario TEXT,
  criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  UNIQUE(utilizador_id, loja_id)
);

ALTER TABLE public.avaliacoes_loja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública de avaliações de loja" ON public.avaliacoes_loja;
CREATE POLICY "Leitura pública de avaliações de loja"
ON public.avaliacoes_loja FOR SELECT USING (true);

DROP POLICY IF EXISTS "Utilizador autenticado avalia loja" ON public.avaliacoes_loja;
CREATE POLICY "Utilizador autenticado avalia loja"
ON public.avaliacoes_loja FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND utilizador_id = auth.uid());

DROP POLICY IF EXISTS "Utilizador actualiza própria avaliação de loja" ON public.avaliacoes_loja;
CREATE POLICY "Utilizador actualiza própria avaliação de loja"
ON public.avaliacoes_loja FOR UPDATE
USING (utilizador_id = auth.uid())
WITH CHECK (utilizador_id = auth.uid());

DROP POLICY IF EXISTS "Autor ou admin apaga avaliação de loja" ON public.avaliacoes_loja;
CREATE POLICY "Autor ou admin apaga avaliação de loja"
ON public.avaliacoes_loja FOR DELETE
USING (utilizador_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.recalcular_media_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_loja_id UUID;
BEGIN
  v_loja_id := COALESCE(NEW.loja_id, OLD.loja_id);
  UPDATE public.lojas
  SET
    classificacao = COALESCE((SELECT ROUND(AVG(estrelas)::NUMERIC, 1) FROM public.avaliacoes_loja WHERE loja_id = v_loja_id), 0),
    total_avaliacoes = (SELECT COUNT(*) FROM public.avaliacoes_loja WHERE loja_id = v_loja_id)
  WHERE id = v_loja_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalcular_media_loja ON public.avaliacoes_loja;
CREATE TRIGGER trg_recalcular_media_loja
AFTER INSERT OR UPDATE OR DELETE ON public.avaliacoes_loja
FOR EACH ROW EXECUTE FUNCTION public.recalcular_media_loja();

-- 6. DENÚNCIAS POR LOJA E SUSPENSÃO AUTOMÁTICA
ALTER TABLE public.denuncias ALTER COLUMN produto_id DROP NOT NULL;
ALTER TABLE public.denuncias ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE;

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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_suspensao_automatica_loja ON public.denuncias;
CREATE TRIGGER trg_suspensao_automatica_loja
AFTER INSERT OR UPDATE ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.verificar_suspensao_automatica_loja();

-- 7. ANÚNCIOS PATROCINADOS (Carrossel Home, Categoria e Pesquisa)
CREATE TABLE IF NOT EXISTS public.anuncios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  vendedor_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  imagem_url TEXT,
  posicao TEXT NOT NULL DEFAULT 'topo' CHECK (posicao IN ('topo', 'categoria', 'pesquisa')),
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  data_fim TIMESTAMPTZ NOT NULL DEFAULT (TIMEZONE('utc', NOW()) + INTERVAL '30 days'),
  visualizacoes INT NOT NULL DEFAULT 0,
  cliques INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aprovado', 'rejeitado', 'expirado')),
  criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de anúncios activos ou próprios ou admin" ON public.anuncios;
CREATE POLICY "Leitura de anúncios activos ou próprios ou admin"
ON public.anuncios FOR SELECT
USING (
  (ativo = TRUE AND estado = 'aprovado' AND NOW() >= data_inicio AND NOW() <= data_fim)
  OR vendedor_id = auth.uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "Comerciante cria pedido de anúncio" ON public.anuncios;
CREATE POLICY "Comerciante cria pedido de anúncio"
ON public.anuncios FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    (vendedor_id = auth.uid() AND ativo = FALSE AND estado = 'pendente')
    OR public.is_admin()
  )
);

DROP POLICY IF EXISTS "Admin gere anúncios" ON public.anuncios;
CREATE POLICY "Admin gere anúncios"
ON public.anuncios FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Dono ou admin apaga anúncio" ON public.anuncios;
CREATE POLICY "Dono ou admin apaga anúncio"
ON public.anuncios FOR DELETE
USING (vendedor_id = auth.uid() OR public.is_admin());

-- RPCs seguros para contar visualizações e cliques sem dar UPDATE aberto
CREATE OR REPLACE FUNCTION public.increment_ad_view(ad_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.anuncios
  SET visualizacoes = visualizacoes + 1
  WHERE id = ad_id AND ativo = TRUE AND estado = 'aprovado';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_ad_click(ad_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.anuncios
  SET cliques = cliques + 1
  WHERE id = ad_id AND ativo = TRUE AND estado = 'aprovado';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.increment_ad_view(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID) TO anon, authenticated;

-- 8. PAGAMENTOS DE PLANOS E ANÚNCIOS COM COMPROVATIVO
CREATE TABLE IF NOT EXISTS public.pagamentos_comerciante (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendedor_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('plano', 'anuncio')),
  plano_alvo TEXT CHECK (plano_alvo IN ('gratis', 'basico', 'vip')),
  anuncio_id UUID REFERENCES public.anuncios(id) ON DELETE SET NULL,
  valor_kz NUMERIC(12, 2) NOT NULL CHECK (valor_kz >= 0),
  metodo TEXT NOT NULL CHECK (metodo IN ('Multicaixa Express', 'Referência', 'Transferência')),
  referencia TEXT,
  comprovativo_url TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'confirmado', 'rejeitado')),
  criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  confirmado_em TIMESTAMPTZ
);

ALTER TABLE public.pagamentos_comerciante ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comerciante vê os seus pagamentos ou admin vê todos" ON public.pagamentos_comerciante;
CREATE POLICY "Comerciante vê os seus pagamentos ou admin vê todos"
ON public.pagamentos_comerciante FOR SELECT
USING (vendedor_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Comerciante envia comprovativo de pagamento" ON public.pagamentos_comerciante;
CREATE POLICY "Comerciante envia comprovativo de pagamento"
ON public.pagamentos_comerciante FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND vendedor_id = auth.uid() AND estado = 'pendente');

DROP POLICY IF EXISTS "Apenas admin confirma ou rejeita pagamento" ON public.pagamentos_comerciante;
CREATE POLICY "Apenas admin confirma ou rejeita pagamento"
ON public.pagamentos_comerciante FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Trigger: ao confirmar pagamento, activa plano ou anúncio automaticamente
CREATE OR REPLACE FUNCTION public.activar_plano_ou_anuncio_no_pagamento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmado' AND OLD.estado <> 'confirmado' THEN
    NEW.confirmado_em := TIMEZONE('utc', NOW());

    IF NEW.tipo = 'plano' AND NEW.loja_id IS NOT NULL AND NEW.plano_alvo IS NOT NULL THEN
      UPDATE public.lojas
      SET
        plano_tipo = NEW.plano_alvo,
        is_vip = (NEW.plano_alvo = 'vip'),
        plano_expira_em = TIMEZONE('utc', NOW()) + INTERVAL '30 days'
      WHERE id = NEW.loja_id;
    ELSIF NEW.tipo = 'anuncio' AND NEW.anuncio_id IS NOT NULL THEN
      UPDATE public.anuncios
      SET ativo = TRUE, estado = 'aprovado'
      WHERE id = NEW.anuncio_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_activar_pagamento_comerciante ON public.pagamentos_comerciante;
CREATE TRIGGER trg_activar_pagamento_comerciante
BEFORE UPDATE ON public.pagamentos_comerciante
FOR EACH ROW EXECUTE FUNCTION public.activar_plano_ou_anuncio_no_pagamento();

-- Expiração automática de planos vencidos -> volta ao Grátis
CREATE OR REPLACE FUNCTION public.expirar_planos_vencidos()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.lojas
  SET plano_tipo = 'gratis', is_vip = FALSE
  WHERE plano_tipo <> 'gratis' AND plano_expira_em IS NOT NULL AND plano_expira_em < TIMEZONE('utc', NOW());
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.anuncios
  SET ativo = FALSE, estado = 'expirado'
  WHERE ativo = TRUE AND data_fim < TIMEZONE('utc', NOW());

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.expirar_planos_vencidos() TO authenticated;

-- 9. ENTREGAS, ENTREGADORES E MENSALIDADES DA EQUIPA
ALTER TABLE public.encomendas ADD COLUMN IF NOT EXISTS tipo_entrega TEXT NOT NULL DEFAULT 'entrega' CHECK (tipo_entrega IN ('entrega', 'levantamento'));

CREATE TABLE IF NOT EXISTS public.entregas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encomenda_id UUID NOT NULL UNIQUE REFERENCES public.encomendas(id) ON DELETE CASCADE,
  loja_id UUID REFERENCES public.lojas(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  entregador_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'Pedido' CHECK (estado IN ('Pedido', 'Aceite pelo entregador', 'Recolhido', 'A caminho', 'Entregue', 'Com problema')),
  codigo_confirmacao TEXT NOT NULL,
  taxa_entrega NUMERIC(12, 2) NOT NULL DEFAULT 1500,
  comissao_percent NUMERIC(5, 2) NOT NULL DEFAULT 15,
  comissao_valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ganho_entregador NUMERIC(12, 2) NOT NULL DEFAULT 0,
  comissao_cobrada BOOLEAN NOT NULL DEFAULT FALSE,
  endereco_recolha TEXT,
  endereco_entrega TEXT NOT NULL,
  tem_atraso BOOLEAN NOT NULL DEFAULT FALSE,
  problema_descricao TEXT,
  aceite_em TIMESTAMPTZ,
  recolhido_em TIMESTAMPTZ,
  entregue_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de entregas autorizadas" ON public.entregas;
CREATE POLICY "Leitura de entregas autorizadas"
ON public.entregas FOR SELECT
USING (
  cliente_id = auth.uid()
  OR entregador_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.lojas WHERE id = public.entregas.loja_id AND dono_id = auth.uid())
  OR (
    estado = 'Pedido'
    AND entregador_id IS NULL
    AND EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'entregador' AND aprovado = TRUE AND suspenso = FALSE)
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "Cliente cria pedido de entrega" ON public.entregas;
CREATE POLICY "Cliente cria pedido de entrega"
ON public.entregas FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND cliente_id = auth.uid());

DROP POLICY IF EXISTS "Entregador aprovado ou admin actualiza entrega" ON public.entregas;
CREATE POLICY "Entregador aprovado ou admin actualiza entrega"
ON public.entregas FOR UPDATE
USING (
  public.is_admin()
  OR entregador_id = auth.uid()
  OR cliente_id = auth.uid()
  OR (
    estado = 'Pedido'
    AND entregador_id IS NULL
    AND EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'entregador' AND aprovado = TRUE AND suspenso = FALSE)
  )
);

-- Trigger: calcula comissão APENAS quando entrega é confirmada como 'Entregue'
CREATE OR REPLACE FUNCTION public.finalizar_entrega_e_comissao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'Aceite pelo entregador' AND OLD.estado = 'Pedido' THEN
    NEW.aceite_em := COALESCE(NEW.aceite_em, TIMEZONE('utc', NOW()));
  END IF;

  IF NEW.estado = 'Recolhido' AND OLD.estado <> 'Recolhido' THEN
    NEW.recolhido_em := COALESCE(NEW.recolhido_em, TIMEZONE('utc', NOW()));
  END IF;

  IF NEW.estado = 'Entregue' AND OLD.estado <> 'Entregue' THEN
    NEW.entregue_em := TIMEZONE('utc', NOW());
    NEW.comissao_valor := ROUND((NEW.taxa_entrega * (NEW.comissao_percent / 100.0))::NUMERIC, 2);
    NEW.ganho_entregador := GREATEST(0, NEW.taxa_entrega - NEW.comissao_valor);
    NEW.comissao_cobrada := TRUE;

    UPDATE public.encomendas
    SET estado = 'Entregue'
    WHERE id = NEW.encomenda_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_finalizar_entrega_comissao ON public.entregas;
CREATE TRIGGER trg_finalizar_entrega_comissao
BEFORE UPDATE ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.finalizar_entrega_e_comissao();

-- Mensalidade da equipa de entregadores
CREATE TABLE IF NOT EXISTS public.mensalidades_entregador (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entregador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  mes_referencia TEXT NOT NULL,
  valor_kz NUMERIC(12, 2) NOT NULL CHECK (valor_kz >= 0),
  comprovativo_url TEXT,
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'pago', 'atrasado')),
  criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  pago_em TIMESTAMPTZ
);

ALTER TABLE public.mensalidades_entregador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Entregador lê as próprias mensalidades ou admin lê todas" ON public.mensalidades_entregador;
CREATE POLICY "Entregador lê as próprias mensalidades ou admin lê todas"
ON public.mensalidades_entregador FOR SELECT
USING (entregador_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Entregador regista pagamento de mensalidade" ON public.mensalidades_entregador;
CREATE POLICY "Entregador regista pagamento de mensalidade"
ON public.mensalidades_entregador FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND entregador_id = auth.uid() AND estado = 'pendente');

DROP POLICY IF EXISTS "Apenas admin confirma mensalidade" ON public.mensalidades_entregador;
CREATE POLICY "Apenas admin confirma mensalidade"
ON public.mensalidades_entregador FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());
