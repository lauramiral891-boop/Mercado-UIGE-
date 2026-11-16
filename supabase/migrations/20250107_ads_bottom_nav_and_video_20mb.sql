-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V7 (FASE 4):
-- ANÚNCIOS DA PLATAFORMA E EXTERNOS (SEM LOJA), DESTINOS SEGUROS (HTTPS/WHATSAPP),
-- PAGAMENTOS DE ANUNCIANTES EXTERNOS, UPGRADE CLIENTE -> COMERCIANTE PENDENTE,
-- E LIMITE DE VÍDEO/STORAGE ATUALIZADO PARA 20 MB
-- ==============================================================================

-- 1. ANÚNCIOS: SUPORTE A 3 TIPOS DE ANUNCIANTE, 4 DESTINOS SEGUROS E POSIÇÃO 'faixa' / 'ecra_inteiro'
ALTER TABLE public.anuncios
  ALTER COLUMN loja_id DROP NOT NULL,
  ALTER COLUMN vendedor_id DROP NOT NULL;

ALTER TABLE public.anuncios
  ADD COLUMN IF NOT EXISTS tipo_anunciante TEXT NOT NULL DEFAULT 'loja',
  ADD COLUMN IF NOT EXISTS nome_anunciante TEXT,
  ADD COLUMN IF NOT EXISTS tipo_destino TEXT NOT NULL DEFAULT 'loja',
  ADD COLUMN IF NOT EXISTS destino_valor TEXT;

-- Remover restrições antigas de posicao / tipo_anunciante / tipo_destino para recriar com os novos valores
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
        pg_get_constraintdef(oid) ILIKE '%posicao%'
        OR pg_get_constraintdef(oid) ILIKE '%tipo_anunciante%'
        OR pg_get_constraintdef(oid) ILIKE '%tipo_destino%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.anuncios DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.anuncios
  ADD CONSTRAINT anuncios_posicao_check
    CHECK (posicao IN ('topo', 'faixa', 'categoria', 'pesquisa', 'ecra_inteiro')),
  ADD CONSTRAINT anuncios_tipo_anunciante_check
    CHECK (tipo_anunciante IN ('plataforma', 'externo', 'loja')),
  ADD CONSTRAINT anuncios_tipo_destino_check
    CHECK (tipo_destino IN ('loja', 'produto', 'link', 'whatsapp'));

-- Sincronizar linhas existentes sem tipo definido
UPDATE public.anuncios
SET
  tipo_anunciante = CASE WHEN loja_id IS NULL THEN 'plataforma' ELSE 'loja' END,
  tipo_destino = CASE WHEN produto_id IS NOT NULL THEN 'produto' ELSE 'loja' END
WHERE tipo_anunciante IS NULL OR tipo_destino IS NULL;

-- 2. VALIDAÇÃO NO SERVIDOR DE DESTINOS SEGUROS (APENAS HTTPS:// PARA LINKS EXTERNOS)
CREATE OR REPLACE FUNCTION public.is_safe_ad_destination(p_tipo TEXT, p_valor TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_val TEXT := trim(COALESCE(p_valor, ''));
  v_digits TEXT;
BEGIN
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

-- 3. ACTUALIZAR TRIGGER DE ANÚNCIOS:
--    - 'plataforma' e 'externo': só moderador/admin, sem exigir loja nem plano pago
--    - 'loja': exige loja aprovada, activa e com plano pago activo
--    - 'link': rejeita javascript:, data:, http:// e aceita apenas https://
CREATE OR REPLACE FUNCTION public.proteger_anuncio_plano_pago()
RETURNS TRIGGER AS $$
DECLARE
  v_adv_type TEXT := COALESCE(NEW.tipo_anunciante, CASE WHEN NEW.loja_id IS NULL THEN 'plataforma' ELSE 'loja' END);
  v_dest_type TEXT := COALESCE(NEW.tipo_destino, CASE WHEN NEW.produto_id IS NOT NULL THEN 'produto' ELSE 'loja' END);
BEGIN
  NEW.tipo_anunciante := v_adv_type;
  NEW.tipo_destino := v_dest_type;

  IF COALESCE(NEW.tipo_media, 'imagem') = 'video'
     AND NULLIF(trim(COALESCE(NEW.video_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Anúncio em vídeo exige um ficheiro ou URL de vídeo válido.';
  END IF;

  IF NOT public.is_safe_ad_destination(v_dest_type, NEW.destino_valor) THEN
    IF v_dest_type = 'link' THEN
      RAISE EXCEPTION 'Destino inválido: apenas links seguros com https:// são permitidos.';
    ELSE
      RAISE EXCEPTION 'Número ou ligação de WhatsApp inválida para destino do anúncio.';
    END IF;
  END IF;

  IF v_adv_type IN ('plataforma', 'externo') THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() THEN
      RAISE EXCEPTION 'Operação não autorizada: apenas administradores podem criar anúncios da plataforma ou externos.';
    END IF;
    IF v_adv_type = 'externo' AND NULLIF(trim(COALESCE(NEW.nome_anunciante, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Indica o nome do anunciante externo.';
    END IF;
    IF v_adv_type = 'plataforma' AND NULLIF(trim(COALESCE(NEW.nome_anunciante, '')), '') IS NULL THEN
      NEW.nome_anunciante := 'Mercado Uíge';
    END IF;
    NEW.loja_id := NULL;
  ELSE
    IF (COALESCE(NEW.ativo, FALSE) = TRUE OR NEW.estado = 'aprovado') THEN
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

-- Políticas RLS de anuncios actualizadas para suportar anúncios plataforma/externos/loja
DROP POLICY IF EXISTS "Leitura de anúncios pagos ou próprios ou admin" ON public.anuncios;
DROP POLICY IF EXISTS "Leitura de anúncios activos ou próprios ou admin" ON public.anuncios;
CREATE POLICY "Leitura de anúncios pagos, plataforma, externos ou admin"
ON public.anuncios FOR SELECT
USING (
  (
    ativo = TRUE
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

DROP POLICY IF EXISTS "Comerciante cria pedido de anúncio" ON public.anuncios;
CREATE POLICY "Comerciante ou Moderador cria anúncio"
ON public.anuncios FOR INSERT
WITH CHECK (
  public.is_moderator()
  OR (
    auth.uid() IS NOT NULL
    AND vendedor_id = auth.uid()
    AND tipo_anunciante = 'loja'
    AND ativo = FALSE
    AND estado = 'pendente'
  )
);

-- Expiração automática de planos só expira anúncios do tipo 'loja' por falta de plano (mantém plataforma/externo até data_fim)
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
      OR (
        COALESCE(a.tipo_anunciante, 'loja') = 'loja'
        AND NOT public.loja_tem_plano_pago_activo(a.loja_id)
      )
    );

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. PAGAMENTOS DE ANUNCIANTES EXTERNOS (pagamentos_comerciante)
ALTER TABLE public.pagamentos_comerciante
  ALTER COLUMN vendedor_id DROP NOT NULL;

ALTER TABLE public.pagamentos_comerciante
  ADD COLUMN IF NOT EXISTS nome_anunciante TEXT;

DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.pagamentos_comerciante'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.pagamentos_comerciante DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.pagamentos_comerciante
  ADD CONSTRAINT pagamentos_comerciante_tipo_check
    CHECK (tipo IN ('plano', 'anuncio', 'anuncio_externo'));

DROP POLICY IF EXISTS "Comerciante envia comprovativo de pagamento" ON public.pagamentos_comerciante;
CREATE POLICY "Comerciante ou Financeiro regista pagamento"
ON public.pagamentos_comerciante FOR INSERT
WITH CHECK (
  public.is_finance()
  OR (
    auth.uid() IS NOT NULL
    AND vendedor_id = auth.uid()
    AND tipo IN ('plano', 'anuncio')
    AND estado = 'pendente'
  )
);

CREATE OR REPLACE FUNCTION public.activar_plano_ou_anuncio_no_pagamento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmado' AND (TG_OP = 'INSERT' OR OLD.estado <> 'confirmado') THEN
    NEW.confirmado_em := COALESCE(NEW.confirmado_em, TIMEZONE('utc', NOW()));

    IF NEW.tipo = 'plano' AND NEW.loja_id IS NOT NULL AND NEW.plano_alvo IS NOT NULL THEN
      UPDATE public.lojas
      SET
        plano_tipo = NEW.plano_alvo,
        is_vip = (NEW.plano_alvo = 'vip'),
        plano_expira_em = TIMEZONE('utc', NOW()) + INTERVAL '30 days'
      WHERE id = NEW.loja_id;
    ELSIF NEW.tipo IN ('anuncio', 'anuncio_externo') AND NEW.anuncio_id IS NOT NULL THEN
      UPDATE public.anuncios
      SET ativo = TRUE, estado = 'aprovado'
      WHERE id = NEW.anuncio_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_activar_plano_ou_anuncio_no_pagamento ON public.pagamentos_comerciante;
CREATE TRIGGER trg_activar_plano_ou_anuncio_no_pagamento
BEFORE INSERT OR UPDATE ON public.pagamentos_comerciante
FOR EACH ROW EXECUTE FUNCTION public.activar_plano_ou_anuncio_no_pagamento();

-- 5. RPC SEGURO PARA CLIENTE PEDIR REGISTO COMO COMERCIANTE ("QUERO VENDER" — SEMPRE PENDENTE)
CREATE OR REPLACE FUNCTION public.request_merchant_upgrade(
  p_telefone TEXT DEFAULT NULL,
  p_municipio TEXT DEFAULT NULL,
  p_bairro TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_current_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sessão para solicitar o perfil de comerciante.';
  END IF;

  SELECT papel INTO v_current_role
  FROM public.perfis
  WHERE id = v_uid;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado.';
  END IF;

  -- Nunca rebaixar contas administrativas
  IF v_current_role IN ('super_admin', 'admin', 'moderador', 'financeiro') THEN
    RETURN;
  END IF;

  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.perfis
  SET
    papel = 'comerciante',
    aprovado = FALSE,
    estado_aprovacao = 'pendente',
    telefone = COALESCE(NULLIF(trim(COALESCE(p_telefone, '')), ''), telefone),
    municipio = COALESCE(NULLIF(trim(COALESCE(p_municipio, '')), ''), municipio),
    bairro = COALESCE(NULLIF(trim(COALESCE(p_bairro, '')), ''), bairro)
  WHERE id = v_uid;

  PERFORM set_config('app.system_mutation', 'off', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.system_mutation', 'off', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.request_merchant_upgrade(TEXT, TEXT, TEXT) TO authenticated;

-- 6. ACTUALIZAR TRIGGER DE PRODUTOS PARA MENSAGEM DE VÍDEO ATÉ 15s E 10 MB
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
    RAISE EXCEPTION 'Artigo em vídeo exige um link ou ficheiro de vídeo válido (máx. 15s e 10 MB).';
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

-- 7. STORAGE BUCKET 'produtos': ACTUALIZAR LIMITE DE FICHEIRO PARA 20 MB (20971520 BYTES)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produtos',
  'produtos',
  true,
  20971520,
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
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ];
