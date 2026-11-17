-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V9 (FASE 1):
-- AGENDAMENTO DE ANÚNCIOS (UTC / TIMESTAMPTZ), ANÚNCIOS SEM DATAS,
-- ESTADO 'rascunho', MOTIVO VISÍVEL, AUTO-APROVAÇÃO ADMIN E ERROS REAIS NO SERVIDOR
-- ==============================================================================

-- 1. PERMITIR ANÚNCIOS SEM DATAS + ADICIONAR COLUNA motivo_estado + ESTADO 'rascunho'
ALTER TABLE public.anuncios
  ALTER COLUMN data_inicio DROP NOT NULL,
  ALTER COLUMN data_fim DROP NOT NULL,
  ALTER COLUMN data_inicio DROP DEFAULT,
  ALTER COLUMN data_fim DROP DEFAULT;

ALTER TABLE public.anuncios
  ADD COLUMN IF NOT EXISTS motivo_estado TEXT;

DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.anuncios'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.anuncios
  ADD CONSTRAINT anuncios_estado_check
    CHECK (estado IN ('rascunho', 'pendente', 'aprovado', 'rejeitado', 'expirado', 'suspenso'));

-- 2. TRIGGER DE PROTECÇÃO, AUTO-APROVAÇÃO DE ANÚNCIOS DO ADMIN E VALIDAÇÃO DE DATAS/PLANOS
CREATE OR REPLACE FUNCTION public.proteger_anuncio_plano_pago()
RETURNS TRIGGER AS $$
DECLARE
  v_adv_type TEXT := COALESCE(NEW.tipo_anunciante, CASE WHEN NEW.loja_id IS NULL THEN 'plataforma' ELSE 'loja' END);
  v_dest_type TEXT := COALESCE(NEW.tipo_destino, CASE WHEN NEW.produto_id IS NOT NULL THEN 'produto' ELSE 'loja' END);
  v_link TEXT := COALESCE(NULLIF(trim(COALESCE(NEW.destino_valor, '')), ''), NULLIF(trim(COALESCE(NEW.link_destino, '')), ''));
  v_is_mod BOOLEAN := (auth.uid() IS NOT NULL AND public.is_moderator());
BEGIN
  NEW.tipo_anunciante := v_adv_type;
  NEW.tipo_destino := v_dest_type;
  NEW.categoria_banner := COALESCE(NEW.categoria_banner, CASE WHEN v_adv_type = 'plataforma' THEN 'publico' ELSE 'patrocinado' END);
  NEW.texto_botao := COALESCE(NULLIF(trim(COALESCE(NEW.texto_botao, '')), ''), 'Ver oferta');
  NEW.descricao := COALESCE(NEW.descricao, NEW.subtitulo);
  NEW.subtitulo := COALESCE(NEW.subtitulo, NEW.descricao, '');

  IF NEW.data_inicio IS NOT NULL AND NEW.data_fim IS NOT NULL AND NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data de fim do anúncio deve ser igual ou posterior à data de início.';
  END IF;

  IF NEW.duracao_segundos IS NOT NULL THEN
    IF NEW.duracao_segundos < 3 OR NEW.duracao_segundos > 60 THEN
      RAISE EXCEPTION 'A duração do banner deve estar entre 3 e 60 segundos.';
    END IF;
  END IF;

  IF COALESCE(NEW.tipo_media, 'imagem') = 'video'
     AND NULLIF(trim(COALESCE(NEW.video_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Anúncio em vídeo exige um ficheiro ou URL de vídeo válido.';
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

  -- Anúncios criados pelo administrador ficam aprovados automaticamente (salvo rascunho explícito)
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

  -- Rascunhos, suspensos, rejeitados ou expirados nunca ficam activos ao público
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
    -- Só moderador/admin pode aprovar, suspender, priorizar ou publicar anúncios de loja
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

DROP TRIGGER IF EXISTS trg_proteger_anuncio_plano_pago ON public.anuncios;
CREATE TRIGGER trg_proteger_anuncio_plano_pago
BEFORE INSERT OR UPDATE ON public.anuncios
FOR EACH ROW EXECUTE FUNCTION public.proteger_anuncio_plano_pago();

-- 3. RLS ACTUALIZADO: COMPARAÇÃO DIRECTA EM TIMESTAMPTZ COM NOW() E SUPORTE A ANÚNCIOS SEM DATAS
DROP POLICY IF EXISTS "Leitura de banners activos não suspensos ou próprios ou admin" ON public.anuncios;
DROP POLICY IF EXISTS "Leitura de anúncios pagos, plataforma, externos ou admin" ON public.anuncios;
CREATE POLICY "Leitura de banners activos não suspensos ou próprios ou admin"
ON public.anuncios FOR SELECT
USING (
  (
    ativo = TRUE
    AND COALESCE(suspenso, FALSE) = FALSE
    AND estado = 'aprovado'
    AND (data_inicio IS NULL OR NOW() >= data_inicio)
    AND (data_fim IS NULL OR NOW() <= data_fim)
    AND (
      tipo_anunciante IN ('plataforma', 'externo')
      OR public.loja_tem_plano_pago_activo(loja_id)
    )
  )
  OR vendedor_id = auth.uid()
  OR public.is_moderator()
);

-- Permitir que comerciante ou moderador crie anúncio (incluindo rascunho de comerciante)
DROP POLICY IF EXISTS "Comerciante ou Moderador cria anúncio" ON public.anuncios;
CREATE POLICY "Comerciante ou Moderador cria anúncio"
ON public.anuncios FOR INSERT
WITH CHECK (
  public.is_moderator()
  OR (
    auth.uid() IS NOT NULL
    AND vendedor_id = auth.uid()
    AND tipo_anunciante = 'loja'
    AND ativo = FALSE
    AND estado IN ('pendente', 'rascunho')
  )
);

-- Expiração automática compara TIMESTAMPTZ com NOW() e ignora anúncios sem data_fim
CREATE OR REPLACE FUNCTION public.expirar_planos_vencidos()
RETURNS INT AS $$
DECLARE
  v_count INT;
  v_profiles INT;
BEGIN
  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.lojas
  SET plano_tipo = 'gratis', is_vip = FALSE
  WHERE plano_tipo <> 'gratis'
    AND plano_expira_em IS NOT NULL
    AND plano_expira_em < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.perfis
  SET plano_tipo = 'gratis'
  WHERE plano_tipo <> 'gratis'
    AND plano_expira_em IS NOT NULL
    AND plano_expira_em < NOW();
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  UPDATE public.anuncios a
  SET
    ativo = FALSE,
    estado = 'expirado',
    motivo_estado = CASE
      WHEN a.data_fim IS NOT NULL AND a.data_fim < NOW() THEN 'Período de exibição terminado.'
      ELSE 'Plano pago da loja expirou ou foi suspenso.'
    END
  WHERE a.ativo = TRUE
    AND (
      (a.data_fim IS NOT NULL AND a.data_fim < NOW())
      OR (
        COALESCE(a.tipo_anunciante, 'loja') = 'loja'
        AND NOT public.loja_tem_plano_pago_activo(a.loja_id)
      )
    );

  PERFORM set_config('app.system_mutation', 'off', true);
  RETURN v_count + v_profiles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Actualizar RPCs de tracking para respeitarem suspensão e janela de datas em UTC
CREATE OR REPLACE FUNCTION public.increment_ad_view(ad_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.anuncios
  SET visualizacoes = visualizacoes + 1
  WHERE id = ad_id
    AND ativo = TRUE
    AND COALESCE(suspenso, FALSE) = FALSE
    AND estado = 'aprovado'
    AND (data_inicio IS NULL OR NOW() >= data_inicio)
    AND (data_fim IS NULL OR NOW() <= data_fim);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_ad_click(ad_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.anuncios
  SET cliques = cliques + 1
  WHERE id = ad_id
    AND ativo = TRUE
    AND COALESCE(suspenso, FALSE) = FALSE
    AND estado = 'aprovado'
    AND (data_inicio IS NULL OR NOW() >= data_inicio)
    AND (data_fim IS NULL OR NOW() <= data_fim);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
