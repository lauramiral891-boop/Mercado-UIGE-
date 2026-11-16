-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V6 (FASE 4):
-- ARTIGOS COM VÍDEO E APROVAÇÃO PRÉVIA, ANÚNCIOS EM IMAGEM/VÍDEO SÓ PLANO PAGO,
-- LIMITE DE 5 MB NO STORAGE E REFORÇO DE RLS
-- ==============================================================================

-- 1. NOVAS COLUNAS PARA MÍDIA DE ARTIGOS, ANÚNCIOS E MODERAÇÃO DE ARTIGOS
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS tipo_media TEXT NOT NULL DEFAULT 'imagem' CHECK (tipo_media IN ('imagem', 'video'));

ALTER TABLE public.anuncios
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS tipo_media TEXT NOT NULL DEFAULT 'imagem' CHECK (tipo_media IN ('imagem', 'video'));

ALTER TABLE public.configuracoes_sistema
  ADD COLUMN IF NOT EXISTS exigir_aprovacao_produtos BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. TRIGGER DE PRODUTOS: RESPEITA APROVAÇÃO PRÉVIA CONFIGURADA PELO ADMIN E BLOQUEIA DESTAQUE/APROVAÇÃO
CREATE OR REPLACE FUNCTION public.proteger_campos_admin_produto()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_store_approved BOOLEAN;
  v_store_suspended BOOLEAN;
  v_require_approval BOOLEAN;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF COALESCE(NEW.tipo_media, 'imagem') = 'video'
     AND NULLIF(trim(COALESCE(NEW.video_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Artigo em vídeo exige um link ou ficheiro de vídeo válido (máx. 15s e 5 MB).';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() AND NOT v_is_system THEN
      IF COALESCE(NEW.is_destaque, FALSE) = TRUE THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem activar is_destaque em produtos.';
      END IF;

      NEW.is_destaque := FALSE;
      NEW.vendas := 0;
      NEW.classificacao := 0.0;
      NEW.total_avaliacoes := 0;

      SELECT COALESCE(exigir_aprovacao_produtos, FALSE)
      INTO v_require_approval
      FROM public.configuracoes_sistema
      WHERE id = 'global';

      IF COALESCE(v_require_approval, FALSE) = TRUE THEN
        NEW.is_aprovado := FALSE;
      ELSIF NEW.loja_id IS NOT NULL THEN
        SELECT is_aprovada, suspensa INTO v_store_approved, v_store_suspended
        FROM public.lojas WHERE id = NEW.loja_id;
        NEW.is_aprovado := COALESCE(v_store_approved, FALSE) AND NOT COALESCE(v_store_suspended, FALSE);
      ELSE
        NEW.is_aprovado := TRUE;
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

-- Apenas comerciantes aprovados e não suspensos (ou moderadores) podem inserir produtos
DROP POLICY IF EXISTS "Comerciante ou Admin pode publicar produtos" ON public.produtos;
DROP POLICY IF EXISTS "Comerciante aprovado ou Admin publica produtos" ON public.produtos;
CREATE POLICY "Comerciante aprovado ou Admin publica produtos"
ON public.produtos FOR INSERT
WITH CHECK (
  public.is_moderator()
  OR (
    auth.uid() = vendedor_id
    AND EXISTS (
      SELECT 1 FROM public.perfis pf
      WHERE pf.id = auth.uid()
        AND pf.papel = 'comerciante'
        AND pf.aprovado = TRUE
        AND pf.suspenso = FALSE
    )
    AND (
      loja_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.lojas lj
        WHERE lj.id = public.produtos.loja_id
          AND lj.dono_id = auth.uid()
          AND lj.is_aprovada = TRUE
          AND lj.suspensa = FALSE
      )
    )
  )
);

-- 3. FUNÇÃO DE ELEGIBILIDADE PAGA + TRIGGER E RLS PARA ANÚNCIOS PATROCINADOS
CREATE OR REPLACE FUNCTION public.loja_tem_plano_pago_activo(p_loja_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_loja_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.lojas l
    WHERE l.id = p_loja_id
      AND l.is_aprovada = TRUE
      AND l.suspensa = FALSE
      AND l.plano_tipo IN ('basico', 'vip')
      AND (l.plano_expira_em IS NULL OR l.plano_expira_em > TIMEZONE('utc', NOW()))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.proteger_anuncio_plano_pago()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.tipo_media, 'imagem') = 'video'
     AND NULLIF(trim(COALESCE(NEW.video_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Anúncio em vídeo exige um ficheiro ou URL de vídeo válido.';
  END IF;

  IF (COALESCE(NEW.ativo, FALSE) = TRUE OR NEW.estado = 'aprovado') THEN
    IF NEW.loja_id IS NULL OR NOT public.loja_tem_plano_pago_activo(NEW.loja_id) THEN
      RAISE EXCEPTION 'Operação não autorizada: apenas lojas com plano pago activo podem ter anúncios patrocinados.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_anuncio_plano_pago ON public.anuncios;
CREATE TRIGGER trg_proteger_anuncio_plano_pago
BEFORE INSERT OR UPDATE ON public.anuncios
FOR EACH ROW EXECUTE FUNCTION public.proteger_anuncio_plano_pago();

-- RLS SELECT em anuncios: público só vê anúncios activos, aprovados, na janela de datas E de loja com plano pago activo
DROP POLICY IF EXISTS "Leitura de anúncios activos ou próprios ou admin" ON public.anuncios;
CREATE POLICY "Leitura de anúncios pagos ou próprios ou admin"
ON public.anuncios FOR SELECT
USING (
  (
    ativo = TRUE
    AND estado = 'aprovado'
    AND TIMEZONE('utc', NOW()) >= data_inicio
    AND TIMEZONE('utc', NOW()) <= data_fim
    AND public.loja_tem_plano_pago_activo(loja_id)
  )
  OR vendedor_id = auth.uid()
  OR public.is_moderator()
);

-- Expiração automática de planos vencidos desactiva também anúncios da respectiva loja
CREATE OR REPLACE FUNCTION public.expirar_planos_vencidos()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.lojas
  SET plano_tipo = 'gratis', is_vip = FALSE
  WHERE plano_tipo <> 'gratis'
    AND plano_expira_em IS NOT NULL
    AND plano_expira_em < TIMEZONE('utc', NOW());
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.anuncios a
  SET ativo = FALSE, estado = 'expirado'
  WHERE a.ativo = TRUE
    AND (
      a.data_fim < TIMEZONE('utc', NOW())
      OR NOT public.loja_tem_plano_pago_activo(a.loja_id)
    );

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. STORAGE BUCKET 'produtos': IMAGENS E VÍDEOS ATÉ 5 MB COM RLS ACTIVO
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produtos',
  'produtos',
  true,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ];

DROP POLICY IF EXISTS "Remoção das próprias imagens de produtos" ON storage.objects;
CREATE POLICY "Remoção das próprias imagens e vídeos de produtos"
ON storage.objects FOR DELETE
USING (bucket_id = 'produtos' AND (owner = auth.uid() OR public.is_moderator()));
