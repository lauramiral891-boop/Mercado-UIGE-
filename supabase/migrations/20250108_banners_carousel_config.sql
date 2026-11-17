-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V8 (FASE A: BANNERS, CARROSSEL E CONFIGURAÇÃO GLOBAL)
-- Reutiliza public.anuncios e public.configuracoes_sistema sem duplicar tabelas.
-- ==============================================================================

-- 1. NOVOS CAMPOS DE BANNER E PUBLICIDADE EM public.anuncios
ALTER TABLE public.anuncios
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS texto_botao TEXT DEFAULT 'Ver oferta',
  ADD COLUMN IF NOT EXISTS link_destino TEXT,
  ADD COLUMN IF NOT EXISTS ordem INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categoria_banner TEXT NOT NULL DEFAULT 'patrocinado',
  ADD COLUMN IF NOT EXISTS prioridade INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duracao_segundos INT,
  ADD COLUMN IF NOT EXISTS pago BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS suspenso BOOLEAN NOT NULL DEFAULT FALSE;

-- Actualizar restrições CHECK em public.anuncios de forma idempotente
DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.anuncios'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%categoria_banner%'
        OR pg_get_constraintdef(oid) ILIKE '%duracao_segundos%'
        OR pg_get_constraintdef(oid) ILIKE '%estado%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.anuncios
  ADD CONSTRAINT anuncios_categoria_banner_check
    CHECK (categoria_banner IN ('publico', 'patrocinado', 'promocional')),
  ADD CONSTRAINT anuncios_duracao_segundos_check
    CHECK (duracao_segundos IS NULL OR (duracao_segundos BETWEEN 3 AND 60)),
  ADD CONSTRAINT anuncios_estado_check
    CHECK (estado IN ('pendente', 'aprovado', 'rejeitado', 'expirado', 'suspenso'));

-- Sincronizar linhas já existentes
UPDATE public.anuncios
SET
  descricao = COALESCE(descricao, subtitulo),
  texto_botao = COALESCE(NULLIF(trim(texto_botao), ''), 'Ver oferta'),
  categoria_banner = COALESCE(
    categoria_banner,
    CASE WHEN COALESCE(tipo_anunciante, 'loja') = 'plataforma' THEN 'publico' ELSE 'patrocinado' END
  ),
  pago = CASE
    WHEN COALESCE(tipo_anunciante, 'loja') = 'plataforma' AND categoria_banner = 'publico' THEN FALSE
    ELSE COALESCE(pago, TRUE)
  END
WHERE descricao IS NULL OR texto_botao IS NULL OR categoria_banner IS NULL;

CREATE INDEX IF NOT EXISTS idx_anuncios_carrossel_ordem
  ON public.anuncios (posicao, ativo, suspenso, prioridade DESC, ordem ASC, criado_em DESC);

-- 2. CONFIGURAÇÃO GLOBAL DO CARROSSEL EM public.configuracoes_sistema
ALTER TABLE public.configuracoes_sistema
  ADD COLUMN IF NOT EXISTS banner_duracao_padrao_seg INT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS banner_autoplay BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.configuracoes_sistema'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%banner_duracao_padrao_seg%'
  LOOP
    EXECUTE format('ALTER TABLE public.configuracoes_sistema DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.configuracoes_sistema
  ADD CONSTRAINT configuracoes_banner_duracao_check
    CHECK (banner_duracao_padrao_seg BETWEEN 3 AND 60);

-- 3. VALIDAÇÃO DE LINK SEGURO + PROTECÇÃO DE BANNERS NO SERVIDOR
CREATE OR REPLACE FUNCTION public.proteger_anuncio_plano_pago()
RETURNS TRIGGER AS $$
DECLARE
  v_adv_type TEXT := COALESCE(NEW.tipo_anunciante, CASE WHEN NEW.loja_id IS NULL THEN 'plataforma' ELSE 'loja' END);
  v_dest_type TEXT := COALESCE(NEW.tipo_destino, CASE WHEN NEW.produto_id IS NOT NULL THEN 'produto' ELSE 'loja' END);
  v_link TEXT := COALESCE(NULLIF(trim(COALESCE(NEW.destino_valor, '')), ''), NULLIF(trim(COALESCE(NEW.link_destino, '')), ''));
BEGIN
  NEW.tipo_anunciante := v_adv_type;
  NEW.tipo_destino := v_dest_type;
  NEW.categoria_banner := COALESCE(NEW.categoria_banner, CASE WHEN v_adv_type = 'plataforma' THEN 'publico' ELSE 'patrocinado' END);
  NEW.texto_botao := COALESCE(NULLIF(trim(COALESCE(NEW.texto_botao, '')), ''), 'Ver oferta');
  NEW.descricao := COALESCE(NEW.descricao, NEW.subtitulo);
  NEW.subtitulo := COALESCE(NEW.subtitulo, NEW.descricao, '');

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

  -- Banners suspensos ou rejeitados nunca ficam activos ao público
  IF COALESCE(NEW.suspenso, FALSE) = TRUE OR NEW.estado IN ('suspenso', 'rejeitado', 'expirado') THEN
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
    -- Só moderador/admin pode aprovar, suspender ou activar anúncios de loja
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() THEN
      IF TG_OP = 'INSERT' THEN
        NEW.ativo := FALSE;
        NEW.estado := 'pendente';
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

-- 4. RLS ACTUALIZADO PARA RESPEITAR ESTADO SUSPENSO EM public.anuncios
DROP POLICY IF EXISTS "Leitura de anúncios pagos, plataforma, externos ou admin" ON public.anuncios;
CREATE POLICY "Leitura de banners activos não suspensos ou próprios ou admin"
ON public.anuncios FOR SELECT
USING (
  (
    ativo = TRUE
    AND COALESCE(suspenso, FALSE) = FALSE
    AND estado = 'aprovado'
    AND TIMEZONE('utc', NOW()) >= data_inicio
    AND TIMEZONE('utc', NOW()) <= data_fim
    AND (
      tipo_anunciante IN ('plataforma', 'externo')
      OR public.loja_tem_plano_pago_activo(loja_id)
    )
  )
  OR vendedor_id = auth.uid()
  OR public.is_moderator()
);

-- Garantir leitura pública das configurações globais do carrossel pela app mobile
DROP POLICY IF EXISTS "Leitura pública das configurações globais" ON public.configuracoes_sistema;
CREATE POLICY "Leitura pública das configurações globais"
ON public.configuracoes_sistema FOR SELECT
USING (TRUE);
