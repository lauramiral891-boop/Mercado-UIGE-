-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V10:
-- 1) BANNERS COM CAMPOS OPCIONAIS (TÍTULO, DESCRIÇÃO, BOTÃO E LINK OPCIONAIS)
-- 2) SEGUIDORES DE LOJA (seguidores_loja COM UNIQUE POR LOJA E UTILIZADOR + RLS)
-- 3) ESTATÍSTICAS REAIS DA LOJA (produtos, entregas 'Entregue', avaliação real)
-- 4) AVALIAÇÕES VERIFICADAS POR ENCOMENDA ENTREGUE (LOJA E PRODUTO + FOTOS + RLS)
-- ==============================================================================

-- ==============================================================================
-- PARTE A — BANNERS COM CAMPOS OPCIONAIS E tipo_destino = 'nenhum'
-- ==============================================================================

ALTER TABLE public.anuncios
  ALTER COLUMN titulo DROP NOT NULL,
  ALTER COLUMN titulo SET DEFAULT '',
  ALTER COLUMN texto_botao DROP DEFAULT,
  ALTER COLUMN tipo_destino SET DEFAULT 'nenhum';

DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.anuncios'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_destino%'
  LOOP
    EXECUTE format('ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.anuncios
  ADD CONSTRAINT anuncios_tipo_destino_check
    CHECK (tipo_destino IS NULL OR tipo_destino IN ('loja', 'produto', 'link', 'whatsapp', 'nenhum'));

CREATE OR REPLACE FUNCTION public.is_safe_ad_destination(p_tipo TEXT, p_valor TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_val TEXT := trim(COALESCE(p_valor, ''));
  v_digits TEXT;
BEGIN
  IF p_tipo IS NULL OR p_tipo = 'nenhum' THEN
    RETURN TRUE;
  END IF;

  IF v_val ~* '^(javascript|data|vbscript|file|blob):' THEN
    RETURN FALSE;
  END IF;

  IF p_tipo = 'link' THEN
    RETURN v_val ~* '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  ELSIF p_tipo = 'whatsapp' THEN
    IF v_val ~* '^https://wa\.me/[0-9]{9,15}' THEN
      RETURN TRUE;
    END IF;
    v_digits := regexp_replace(v_val, '[^0-9]', '', 'g');
    RETURN length(v_digits) BETWEEN 9 AND 15;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.proteger_anuncio_plano_pago()
RETURNS TRIGGER AS $$
DECLARE
  v_adv_type TEXT := COALESCE(NEW.tipo_anunciante, CASE WHEN NEW.loja_id IS NULL THEN 'plataforma' ELSE 'loja' END);
  v_dest_type TEXT := COALESCE(
    NEW.tipo_destino,
    CASE
      WHEN NEW.produto_id IS NOT NULL THEN 'produto'
      WHEN NEW.loja_id IS NOT NULL THEN 'loja'
      WHEN NULLIF(trim(COALESCE(NEW.link_destino, '')), '') IS NOT NULL THEN 'link'
      ELSE 'nenhum'
    END
  );
  v_link TEXT := COALESCE(NULLIF(trim(COALESCE(NEW.destino_valor, '')), ''), NULLIF(trim(COALESCE(NEW.link_destino, '')), ''));
  v_is_mod BOOLEAN := (auth.uid() IS NOT NULL AND public.is_moderator());
BEGIN
  NEW.tipo_anunciante := v_adv_type;
  NEW.tipo_destino := v_dest_type;
  NEW.categoria_banner := COALESCE(NEW.categoria_banner, CASE WHEN v_adv_type = 'plataforma' THEN 'publico' ELSE 'patrocinado' END);
  NEW.titulo := COALESCE(trim(NEW.titulo), '');
  NEW.texto_botao := NULLIF(trim(COALESCE(NEW.texto_botao, '')), '');
  NEW.descricao := NULLIF(trim(COALESCE(NEW.descricao, NEW.subtitulo, '')), '');
  NEW.subtitulo := COALESCE(NEW.descricao, '');

  IF v_dest_type = 'nenhum' THEN
    NEW.destino_valor := NULL;
    NEW.link_destino := NULL;
  END IF;

  IF NEW.data_inicio IS NOT NULL AND NEW.data_fim IS NOT NULL AND NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data de fim do anúncio deve ser igual ou posterior à data de início.';
  END IF;

  IF NEW.duracao_segundos IS NOT NULL THEN
    IF NEW.duracao_segundos < 3 OR NEW.duracao_segundos > 60 THEN
      RAISE EXCEPTION 'A duração do banner deve estar entre 3 e 60 segundos.';
    END IF;
  END IF;

  IF COALESCE(NEW.tipo_media, 'imagem') = 'video' THEN
    IF NULLIF(trim(COALESCE(NEW.video_url, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Anúncio em vídeo exige um ficheiro ou URL de vídeo válido.';
    END IF;
    IF NULLIF(trim(COALESCE(NEW.imagem_url, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Anúncio em vídeo exige imagem de capa para modos económicos.';
    END IF;
  END IF;

  IF NOT public.is_safe_ad_destination(v_dest_type, v_link) THEN
    IF v_dest_type = 'link' THEN
      RAISE EXCEPTION 'Destino inválido: apenas links seguros com https:// são permitidos.';
    ELSE
      RAISE EXCEPTION 'Número ou ligação de WhatsApp inválida para destino do anúncio.';
    END IF;
  END IF;

  IF NEW.link_destino IS NOT NULL AND trim(NEW.link_destino) <> '' THEN
    IF trim(NEW.link_destino) ~* '^(javascript|data|vbscript|file|blob):' THEN
      RAISE EXCEPTION 'Link de banner inseguro rejeitado pelo servidor.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND v_is_mod THEN
    IF COALESCE(NEW.estado, 'pendente') = 'rascunho' THEN
      NEW.estado := 'rascunho';
      NEW.ativo := FALSE;
      NEW.suspenso := FALSE;
    ELSIF COALESCE(NEW.suspenso, FALSE) = TRUE OR NEW.estado = 'suspenso' THEN
      NEW.estado := 'suspenso';
      NEW.ativo := FALSE;
      NEW.suspenso := TRUE;
    ELSIF NEW.estado = 'rejeitado' THEN
      NEW.ativo := FALSE;
    ELSE
      NEW.estado := 'aprovado';
      NEW.ativo := TRUE;
      NEW.suspenso := FALSE;
    END IF;
  END IF;

  IF COALESCE(NEW.suspenso, FALSE) = TRUE OR NEW.estado IN ('rascunho', 'suspenso', 'rejeitado', 'expirado') THEN
    NEW.ativo := FALSE;
    IF COALESCE(NEW.suspenso, FALSE) = TRUE THEN
      NEW.estado := 'suspenso';
    END IF;
  END IF;

  IF v_adv_type IN ('plataforma', 'externo') THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() THEN
      RAISE EXCEPTION 'Operação não autorizada: apenas administradores podem criar ou gerir banners da plataforma ou externos.';
    END IF;
    IF v_adv_type = 'externo' AND NULLIF(trim(COALESCE(NEW.nome_anunciante, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Indica o nome do anunciante externo.';
    END IF;
    IF v_adv_type = 'plataforma' THEN
      IF NULLIF(trim(COALESCE(NEW.nome_anunciante, '')), '') IS NULL THEN
        NEW.nome_anunciante := 'Mercado Uíge';
      END IF;
      IF NEW.categoria_banner = 'publico' THEN
        NEW.pago := COALESCE(NEW.pago, FALSE);
      END IF;
    END IF;
    NEW.loja_id := NULL;
  ELSE
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() THEN
      IF TG_OP = 'INSERT' THEN
        NEW.ativo := FALSE;
        IF NEW.estado IS DISTINCT FROM 'rascunho' THEN
          NEW.estado := 'pendente';
        END IF;
        NEW.suspenso := FALSE;
      ELSIF TG_OP = 'UPDATE' THEN
        IF (
          NEW.estado IS DISTINCT FROM OLD.estado
          OR NEW.ativo IS DISTINCT FROM OLD.ativo
          OR NEW.suspenso IS DISTINCT FROM OLD.suspenso
          OR NEW.prioridade IS DISTINCT FROM OLD.prioridade
          OR NEW.ordem IS DISTINCT FROM OLD.ordem
        ) THEN
          RAISE EXCEPTION 'Operação não autorizada: só administradores podem aprovar, suspender ou priorizar banners.';
        END IF;
      END IF;
    END IF;

    IF (COALESCE(NEW.ativo, FALSE) = TRUE OR NEW.estado = 'aprovado') AND NOT COALESCE(NEW.suspenso, FALSE) THEN
      IF NEW.loja_id IS NULL OR NOT public.loja_tem_plano_pago_activo(NEW.loja_id) THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas lojas com plano pago activo podem ter anúncios patrocinados.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- PARTE B — SEGUIDORES DA LOJA (public.seguidores_loja) + ESTATÍSTICAS REAIS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.seguidores_loja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loja_id UUID NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  utilizador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE (loja_id, utilizador_id)
);

CREATE INDEX IF NOT EXISTS idx_seguidores_loja_loja_id ON public.seguidores_loja (loja_id);
CREATE INDEX IF NOT EXISTS idx_seguidores_loja_utilizador_id ON public.seguidores_loja (utilizador_id);

ALTER TABLE public.seguidores_loja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública de seguidores da loja" ON public.seguidores_loja;
CREATE POLICY "Leitura pública de seguidores da loja"
ON public.seguidores_loja FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Utilizador segue loja" ON public.seguidores_loja;
CREATE POLICY "Utilizador segue loja"
ON public.seguidores_loja FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND utilizador_id = auth.uid());

DROP POLICY IF EXISTS "Utilizador deixa de seguir loja" ON public.seguidores_loja;
CREATE POLICY "Utilizador deixa de seguir loja"
ON public.seguidores_loja FOR DELETE
USING (utilizador_id = auth.uid() OR public.is_moderator());

-- Colunas de contadores reais em public.lojas (zero números fictícios)
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS seguidores_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS encomendas_entregues_count INT NOT NULL DEFAULT 0,
  ALTER COLUMN classificacao SET DEFAULT 0;

ALTER TABLE public.produtos
  ALTER COLUMN classificacao SET DEFAULT 0;

-- Proteger novos campos de estatísticas na tabela public.lojas
CREATE OR REPLACE FUNCTION public.proteger_e_gerar_codigo_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_next_num INT;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
    IF NEW.codigo IS NULL OR trim(NEW.codigo) = '' THEN
      SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '[^0-9]', '', 'g'), '')::INT), 0) + 1
      INTO v_next_num
      FROM public.lojas;
      NEW.codigo := 'LJ-' || LPAD(v_next_num::TEXT, 4, '0');
    END IF;

    IF COALESCE(NEW.tipo_loja, 'loja_fixa') = 'loja_fixa' THEN
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
      NEW.classificacao := 0;
      NEW.total_avaliacoes := 0;
      NEW.seguidores_count := 0;
      NEW.encomendas_entregues_count := 0;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT v_is_system THEN
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
        OR NEW.classificacao IS DISTINCT FROM OLD.classificacao
        OR NEW.total_avaliacoes IS DISTINCT FROM OLD.total_avaliacoes
        OR NEW.seguidores_count IS DISTINCT FROM OLD.seguidores_count
        OR NEW.encomendas_entregues_count IS DISTINCT FROM OLD.encomendas_entregues_count
      ) THEN
        RAISE EXCEPTION 'Operação não autorizada: só o servidor ou administradores podem alterar campos de estado, selos e métricas da loja.';
      END IF;

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

-- Sincronização automática de seguidores_count
CREATE OR REPLACE FUNCTION public.sync_seguidores_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_loja_id UUID;
BEGIN
  v_loja_id := COALESCE(NEW.loja_id, OLD.loja_id);
  IF v_loja_id IS NOT NULL THEN
    PERFORM set_config('app.system_mutation', 'on', true);
    UPDATE public.lojas
    SET seguidores_count = (SELECT COUNT(*) FROM public.seguidores_loja WHERE loja_id = v_loja_id)
    WHERE id = v_loja_id;
    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_seguidores_loja ON public.seguidores_loja;
CREATE TRIGGER trg_sync_seguidores_loja
AFTER INSERT OR DELETE ON public.seguidores_loja
FOR EACH ROW EXECUTE FUNCTION public.sync_seguidores_loja();

-- Sincronização automática de encomendas_entregues_count
CREATE OR REPLACE FUNCTION public.sync_encomendas_entregues_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_loja_new UUID := CASE WHEN TG_OP <> 'DELETE' THEN NEW.loja_id ELSE NULL END;
  v_loja_old UUID := CASE WHEN TG_OP <> 'INSERT' THEN OLD.loja_id ELSE NULL END;
BEGIN
  PERFORM set_config('app.system_mutation', 'on', true);

  IF v_loja_new IS NOT NULL THEN
    UPDATE public.lojas
    SET encomendas_entregues_count = (
      SELECT COUNT(*) FROM public.encomendas WHERE loja_id = v_loja_new AND estado = 'Entregue'
    )
    WHERE id = v_loja_new;
  END IF;

  IF v_loja_old IS NOT NULL AND v_loja_old IS DISTINCT FROM v_loja_new THEN
    UPDATE public.lojas
    SET encomendas_entregues_count = (
      SELECT COUNT(*) FROM public.encomendas WHERE loja_id = v_loja_old AND estado = 'Entregue'
    )
    WHERE id = v_loja_old;
  END IF;

  PERFORM set_config('app.system_mutation', 'off', true);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_encomendas_entregues_loja ON public.encomendas;
CREATE TRIGGER trg_sync_encomendas_entregues_loja
AFTER INSERT OR UPDATE OF estado, loja_id OR DELETE ON public.encomendas
FOR EACH ROW EXECUTE FUNCTION public.sync_encomendas_entregues_loja();

-- RPC pública para ler estatísticas reais calculadas na BD
CREATE OR REPLACE FUNCTION public.get_store_public_stats(p_loja_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_produtos INT;
  v_entregas INT;
  v_seguidores INT;
  v_rating NUMERIC;
  v_avaliacoes INT;
BEGIN
  SELECT COUNT(*) INTO v_produtos
  FROM public.produtos
  WHERE loja_id = p_loja_id AND COALESCE(is_aprovado, TRUE) = TRUE;

  SELECT COUNT(*) INTO v_entregas
  FROM public.encomendas
  WHERE loja_id = p_loja_id AND estado = 'Entregue';

  SELECT COUNT(*) INTO v_seguidores
  FROM public.seguidores_loja
  WHERE loja_id = p_loja_id;

  SELECT COALESCE(ROUND(AVG(estrelas)::NUMERIC, 1), 0), COUNT(*)
  INTO v_rating, v_avaliacoes
  FROM public.avaliacoes_loja
  WHERE loja_id = p_loja_id;

  RETURN jsonb_build_object(
    'produtos_count', v_produtos,
    'entregas_count', v_entregas,
    'seguidores_count', v_seguidores,
    'classificacao', v_rating,
    'total_avaliacoes', v_avaliacoes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_store_public_stats(UUID) TO anon, authenticated;

-- ==============================================================================
-- PARTE C — AVALIAÇÕES VERIFICADAS POR ENCOMENDA ENTREGUE + FOTOS
-- ==============================================================================

ALTER TABLE public.avaliacoes
  ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS compra_verificada BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.avaliacoes_loja
  ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS compra_verificada BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.utilizador_recebeu_produto(p_user_id UUID, p_produto_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.encomendas e
    JOIN public.itens_encomenda ie ON ie.encomenda_id = e.id
    WHERE e.utilizador_id = p_user_id
      AND e.estado = 'Entregue'
      AND ie.produto_id = p_produto_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.utilizador_recebeu_loja(p_user_id UUID, p_loja_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.encomendas e
    WHERE e.utilizador_id = p_user_id
      AND e.loja_id = p_loja_id
      AND e.estado = 'Entregue'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Trigger BEFORE para validar entrega real e marcar compra_verificada no servidor (produtos)
CREATE OR REPLACE FUNCTION public.validar_avaliacao_produto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estrelas < 1 OR NEW.estrelas > 5 THEN
    RAISE EXCEPTION 'A classificação deve ser entre 1 e 5 estrelas.';
  END IF;

  IF COALESCE(array_length(NEW.fotos, 1), 0) > 5 THEN
    RAISE EXCEPTION 'Máximo de 5 fotografias por avaliação.';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_moderator() THEN
    IF NEW.utilizador_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Operação não autorizada: só pode avaliar com a sua própria conta.';
    END IF;
    IF NOT public.utilizador_recebeu_produto(auth.uid(), NEW.produto_id) THEN
      RAISE EXCEPTION 'Apenas clientes com encomenda entregue deste artigo podem publicar avaliação.';
    END IF;
  END IF;

  NEW.compra_verificada := public.utilizador_recebeu_produto(NEW.utilizador_id, NEW.produto_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validar_avaliacao_produto ON public.avaliacoes;
CREATE TRIGGER trg_validar_avaliacao_produto
BEFORE INSERT OR UPDATE ON public.avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.validar_avaliacao_produto();

-- Trigger AFTER para recalcular média real do produto
CREATE OR REPLACE FUNCTION public.recalcular_media_produto()
RETURNS TRIGGER AS $$
DECLARE
  v_produto_id UUID;
BEGIN
  v_produto_id := COALESCE(NEW.produto_id, OLD.produto_id);
  IF v_produto_id IS NOT NULL THEN
    PERFORM set_config('app.system_mutation', 'on', true);
    UPDATE public.produtos
    SET
      classificacao = COALESCE((SELECT ROUND(AVG(estrelas)::NUMERIC, 1) FROM public.avaliacoes WHERE produto_id = v_produto_id), 0),
      total_avaliacoes = (SELECT COUNT(*) FROM public.avaliacoes WHERE produto_id = v_produto_id)
    WHERE id = v_produto_id;
    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalcular_media_produto ON public.avaliacoes;
CREATE TRIGGER trg_recalcular_media_produto
AFTER INSERT OR UPDATE OR DELETE ON public.avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.recalcular_media_produto();

-- Trigger BEFORE para validar entrega real e marcar compra_verificada no servidor (lojas)
CREATE OR REPLACE FUNCTION public.validar_avaliacao_loja()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estrelas < 1 OR NEW.estrelas > 5 THEN
    RAISE EXCEPTION 'A classificação deve ser entre 1 e 5 estrelas.';
  END IF;

  IF COALESCE(array_length(NEW.fotos, 1), 0) > 5 THEN
    RAISE EXCEPTION 'Máximo de 5 fotografias por avaliação.';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_moderator() THEN
    IF NEW.utilizador_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Operação não autorizada: só pode avaliar com a sua própria conta.';
    END IF;
    IF NOT public.utilizador_recebeu_loja(auth.uid(), NEW.loja_id) THEN
      RAISE EXCEPTION 'Apenas clientes com encomenda entregue desta loja podem publicar avaliação.';
    END IF;
  END IF;

  NEW.compra_verificada := public.utilizador_recebeu_loja(NEW.utilizador_id, NEW.loja_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validar_avaliacao_loja ON public.avaliacoes_loja;
CREATE TRIGGER trg_validar_avaliacao_loja
BEFORE INSERT OR UPDATE ON public.avaliacoes_loja
FOR EACH ROW EXECUTE FUNCTION public.validar_avaliacao_loja();

-- Actualizar trigger AFTER de avaliações da loja com app.system_mutation = 'on'
CREATE OR REPLACE FUNCTION public.recalcular_media_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_loja_id UUID;
BEGIN
  v_loja_id := COALESCE(NEW.loja_id, OLD.loja_id);
  IF v_loja_id IS NOT NULL THEN
    PERFORM set_config('app.system_mutation', 'on', true);
    UPDATE public.lojas
    SET
      classificacao = COALESCE((SELECT ROUND(AVG(estrelas)::NUMERIC, 1) FROM public.avaliacoes_loja WHERE loja_id = v_loja_id), 0),
      total_avaliacoes = (SELECT COUNT(*) FROM public.avaliacoes_loja WHERE loja_id = v_loja_id)
    WHERE id = v_loja_id;
    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalcular_media_loja ON public.avaliacoes_loja;
CREATE TRIGGER trg_recalcular_media_loja
AFTER INSERT OR UPDATE OR DELETE ON public.avaliacoes_loja
FOR EACH ROW EXECUTE FUNCTION public.recalcular_media_loja();

-- Políticas RLS estritas (avaliacoes & avaliacoes_loja)
DROP POLICY IF EXISTS "Utilizador insere a sua avaliação" ON public.avaliacoes;
CREATE POLICY "Cliente com encomenda entregue avalia produto"
ON public.avaliacoes FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND utilizador_id = auth.uid()
  AND public.utilizador_recebeu_produto(auth.uid(), produto_id)
);

DROP POLICY IF EXISTS "Utilizador actualiza ou apaga a sua avaliação" ON public.avaliacoes;
CREATE POLICY "Cliente com encomenda entregue actualiza avaliação de produto"
ON public.avaliacoes FOR UPDATE
USING (utilizador_id = auth.uid())
WITH CHECK (
  utilizador_id = auth.uid()
  AND public.utilizador_recebeu_produto(auth.uid(), produto_id)
);

DROP POLICY IF EXISTS "Utilizador autenticado avalia loja" ON public.avaliacoes_loja;
CREATE POLICY "Cliente com encomenda entregue avalia loja"
ON public.avaliacoes_loja FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND utilizador_id = auth.uid()
  AND public.utilizador_recebeu_loja(auth.uid(), loja_id)
);

DROP POLICY IF EXISTS "Utilizador actualiza própria avaliação de loja" ON public.avaliacoes_loja;
CREATE POLICY "Cliente com encomenda entregue actualiza avaliação de loja"
ON public.avaliacoes_loja FOR UPDATE
USING (utilizador_id = auth.uid())
WITH CHECK (
  utilizador_id = auth.uid()
  AND public.utilizador_recebeu_loja(auth.uid(), loja_id)
);

-- ==============================================================================
-- PARTE D — BACKFILL REAL DE TODOS OS CONTADORES E MÉDIAS (SEM NÚMEROS FICTÍCIOS)
-- ==============================================================================

DO $$
BEGIN
  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.lojas l
  SET
    seguidores_count = (SELECT COUNT(*) FROM public.seguidores_loja sl WHERE sl.loja_id = l.id),
    encomendas_entregues_count = (SELECT COUNT(*) FROM public.encomendas e WHERE e.loja_id = l.id AND e.estado = 'Entregue'),
    classificacao = COALESCE((SELECT ROUND(AVG(al.estrelas)::NUMERIC, 1) FROM public.avaliacoes_loja al WHERE al.loja_id = l.id), 0),
    total_avaliacoes = (SELECT COUNT(*) FROM public.avaliacoes_loja al WHERE al.loja_id = l.id);

  UPDATE public.produtos p
  SET
    classificacao = COALESCE((SELECT ROUND(AVG(av.estrelas)::NUMERIC, 1) FROM public.avaliacoes av WHERE av.produto_id = p.id), 0),
    total_avaliacoes = (SELECT COUNT(*) FROM public.avaliacoes av WHERE av.produto_id = p.id);

  PERFORM set_config('app.system_mutation', 'off', true);
END $$;
