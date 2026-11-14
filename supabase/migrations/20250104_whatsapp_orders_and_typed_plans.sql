-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V3: WHATSAPP POR LOJA, FALLBACK ADMIN EDITÁVEL,
-- CONFIRMAÇÃO DE PAGAMENTO/ENTREGA PELO COMERCIANTE E PLANOS POR TIPO DE PERFIL
-- ==============================================================================

-- 1. CONFIGURAÇÕES DO SISTEMA: WhatsApp de apoio + preços de planos por tipo
ALTER TABLE public.configuracoes_sistema
  ADD COLUMN IF NOT EXISTS whatsapp_admin TEXT NOT NULL DEFAULT '945379003';

ALTER TABLE public.configuracoes_sistema
  ADD COLUMN IF NOT EXISTS preco_plano_fixa_basico NUMERIC(12, 2) NOT NULL DEFAULT 5000 CHECK (preco_plano_fixa_basico >= 0),
  ADD COLUMN IF NOT EXISTS preco_plano_fixa_vip NUMERIC(12, 2) NOT NULL DEFAULT 15000 CHECK (preco_plano_fixa_vip >= 0),
  ADD COLUMN IF NOT EXISTS preco_plano_ambulante_basico NUMERIC(12, 2) NOT NULL DEFAULT 2500 CHECK (preco_plano_ambulante_basico >= 0),
  ADD COLUMN IF NOT EXISTS preco_plano_ambulante_vip NUMERIC(12, 2) NOT NULL DEFAULT 7500 CHECK (preco_plano_ambulante_vip >= 0),
  ADD COLUMN IF NOT EXISTS preco_plano_entregador_basico NUMERIC(12, 2) NOT NULL DEFAULT 3000 CHECK (preco_plano_entregador_basico >= 0),
  ADD COLUMN IF NOT EXISTS preco_plano_entregador_vip NUMERIC(12, 2) NOT NULL DEFAULT 8000 CHECK (preco_plano_entregador_vip >= 0);

-- 2. ENCOMENDAS: Nome/telefone do cliente e confirmação de pagamento pelo comerciante
ALTER TABLE public.encomendas
  ADD COLUMN IF NOT EXISTS nome_cliente TEXT,
  ADD COLUMN IF NOT EXISTS telefone_cliente TEXT,
  ADD COLUMN IF NOT EXISTS estado_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (estado_pagamento IN ('pendente', 'pago')),
  ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;

-- Permitir que o dono da loja da encomenda actualize o estado (Confirmada, Em preparação, Pronta, Pago, Entregue)
DROP POLICY IF EXISTS "Comerciante actualiza encomendas da sua loja" ON public.encomendas;
CREATE POLICY "Comerciante actualiza encomendas da sua loja"
ON public.encomendas FOR UPDATE
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.lojas l
    WHERE l.id = public.encomendas.loja_id AND l.dono_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.lojas l
    WHERE l.id = public.encomendas.loja_id AND l.dono_id = auth.uid()
  )
);

-- Permitir que o dono da loja ou admin leia as encomendas da sua loja
DROP POLICY IF EXISTS "Leitura de encomendas pelo cliente dono da loja ou admin" ON public.encomendas;
CREATE POLICY "Leitura de encomendas pelo cliente dono da loja ou admin"
ON public.encomendas FOR SELECT
USING (
  utilizador_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.lojas l
    WHERE l.id = public.encomendas.loja_id AND l.dono_id = auth.uid()
  )
);

-- 3. PLANOS TAMBÉM PARA ENTREGADORES NO PERFIL
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS plano_tipo TEXT NOT NULL DEFAULT 'gratis' CHECK (plano_tipo IN ('gratis', 'basico', 'vip')),
  ADD COLUMN IF NOT EXISTS plano_expira_em TIMESTAMPTZ;

ALTER TABLE public.pagamentos_comerciante
  ADD COLUMN IF NOT EXISTS perfil_tipo TEXT CHECK (perfil_tipo IN ('loja_fixa', 'vendedor_ambulante', 'entregador'));

-- Actualizar trigger de activação automática de pagamento (Lojas fixas, Ambulantes e Entregadores)
CREATE OR REPLACE FUNCTION public.activar_plano_ou_anuncio_no_pagamento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmado' AND OLD.estado <> 'confirmado' THEN
    NEW.confirmado_em := TIMEZONE('utc', NOW());

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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Actualizar expiração automática para abranger lojas e entregadores
CREATE OR REPLACE FUNCTION public.expirar_planos_vencidos()
RETURNS INT AS $$
DECLARE
  v_count INT;
  v_profiles INT;
BEGIN
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

  RETURN v_count + v_profiles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
