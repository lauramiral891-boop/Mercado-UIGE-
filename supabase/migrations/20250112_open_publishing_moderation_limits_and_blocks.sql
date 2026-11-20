-- ==============================================================================
-- MERCADO UÍGE — MIGRAÇÃO V12 (20250112):
-- PUBLICAÇÃO LIVRE COM MODERAÇÃO PÓS-PUBLICAÇÃO, LIMITES DIÁRIOS, FILTRO DE
-- CONTEÚDO PROIBIDO, SELO "LOJA VERIFICADA" EXCLUSIVO ADMIN, DENÚNCIAS (3 CONTAS),
-- BLOQUEIO DE VENDEDOR, TERMOS DE UTILIZAÇÃO E ACÇÕES DE MODERAÇÃO ADMIN
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PERFIS: BANIMENTO E ACEITAÇÃO DE TERMOS DE UTILIZAÇÃO
-- ------------------------------------------------------------------------------
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS banido BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_banimento TEXT,
  ADD COLUMN IF NOT EXISTS banido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termos_aceites_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.is_user_banned(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(banido, FALSE) OR COALESCE(suspenso, FALSE)
      FROM public.perfis
      WHERE id = p_user_id
    ),
    FALSE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.gerir_novo_utilizador()
RETURNS TRIGGER AS $$
DECLARE
  v_requested_role TEXT;
  v_safe_role TEXT;
  v_aprovado BOOLEAN;
  v_estado_aprovacao TEXT;
  v_reside BOOLEAN;
  v_termos TIMESTAMPTZ;
BEGIN
  v_requested_role := COALESCE(NEW.raw_user_meta_data->>'papel', 'cliente');
  IF v_requested_role IN ('cliente', 'comerciante', 'entregador') THEN
    v_safe_role := v_requested_role;
  ELSE
    v_safe_role := 'cliente';
  END IF;

  -- Publicação livre: clientes e comerciantes ficam activos de imediato; apenas entregadores aguardam revisão
  v_aprovado := (v_safe_role <> 'entregador');
  v_estado_aprovacao := CASE WHEN v_aprovado THEN 'aprovado' ELSE 'pendente' END;
  v_reside := COALESCE((NEW.raw_user_meta_data->>'reside_uige')::BOOLEAN, TRUE);

  IF COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'provincia'), ''), 'Uíge') <> 'Uíge' THEN
    RAISE EXCEPTION 'Registo permitido apenas para residentes na província do Uíge.';
  END IF;

  BEGIN
    v_termos := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'termos_aceites_em', '')), '')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    v_termos := TIMEZONE('utc', NOW());
  END;

  IF v_termos IS NULL THEN
    v_termos := TIMEZONE('utc', NOW());
  END IF;

  INSERT INTO public.perfis (
    id,
    nome,
    email,
    telefone,
    papel,
    provincia,
    municipio,
    bairro,
    bi_numero,
    reside_uige_confirmado,
    aprovado,
    estado_aprovacao,
    termos_aceites_em
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
    v_aprovado,
    v_estado_aprovacao,
    v_termos
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() AND NOT v_is_system THEN
      NEW.banido := FALSE;
      NEW.motivo_banimento := NULL;
      NEW.banido_em := NULL;
      IF NEW.papel = 'entregador' THEN
        NEW.aprovado := FALSE;
        NEW.estado_aprovacao := 'pendente';
      ELSE
        NEW.aprovado := TRUE;
        NEW.estado_aprovacao := 'aprovado';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT v_is_system THEN
      IF NEW.papel IS DISTINCT FROM OLD.papel AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas super_admin pode alterar o papel de um utilizador.';
      END IF;

      IF (
        NEW.suspenso IS DISTINCT FROM OLD.suspenso
        OR NEW.banido IS DISTINCT FROM OLD.banido
        OR NEW.motivo_banimento IS DISTINCT FROM OLD.motivo_banimento
        OR NEW.banido_em IS DISTINCT FROM OLD.banido_em
        OR NEW.aprovado IS DISTINCT FROM OLD.aprovado
        OR NEW.estado_aprovacao IS DISTINCT FROM OLD.estado_aprovacao
        OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao
        OR NEW.nota_correcao IS DISTINCT FROM OLD.nota_correcao
        OR NEW.codigo IS DISTINCT FROM OLD.codigo
      ) AND NOT public.is_moderator() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas moderador ou super_admin pode alterar aprovação, suspensão ou banimento.';
      END IF;

      IF (
        NEW.plano_tipo IS DISTINCT FROM OLD.plano_tipo
        OR NEW.plano_expira_em IS DISTINCT FROM OLD.plano_expira_em
      ) AND NOT public.is_finance() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas financeiro ou super_admin pode alterar o plano da conta.';
      END IF;
    END IF;

    IF OLD.banido IS DISTINCT FROM NEW.banido THEN
      INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, utilizador_email, detalhe)
      VALUES (
        CASE WHEN NEW.banido THEN 'CONTA_BANIDA' ELSE 'CONTA_DESBANIDA' END,
        CASE WHEN NEW.banido THEN 'critica' ELSE 'info' END,
        NEW.id,
        NEW.email,
        CASE
          WHEN NEW.banido THEN 'Conta banida pela moderação (' || COALESCE(NEW.motivo_banimento, NEW.codigo, NEW.id::TEXT) || ')'
          ELSE 'Banimento removido pela moderação'
        END
      );
    ELSIF OLD.suspenso IS DISTINCT FROM NEW.suspenso THEN
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

-- Qualquer utilizador registado (não banido/suspenso) torna-se comerciante activo imediatamente
CREATE OR REPLACE FUNCTION public.request_merchant_upgrade(
  p_telefone TEXT DEFAULT NULL,
  p_municipio TEXT DEFAULT NULL,
  p_bairro TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_current_role TEXT;
  v_banned BOOLEAN;
  v_suspended BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sessão para activar a tua loja e vender no Mercado Uíge.';
  END IF;

  SELECT papel, COALESCE(banido, FALSE), COALESCE(suspenso, FALSE)
  INTO v_current_role, v_banned, v_suspended
  FROM public.perfis
  WHERE id = v_uid;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado.';
  END IF;

  IF v_banned OR v_suspended THEN
    RAISE EXCEPTION 'Esta conta está banida ou suspensa e não pode activar perfil de vendedor.';
  END IF;

  -- Nunca rebaixar contas administrativas
  IF v_current_role IN ('super_admin', 'admin', 'moderador', 'financeiro') THEN
    RETURN;
  END IF;

  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.perfis
  SET
    papel = 'comerciante',
    aprovado = TRUE,
    estado_aprovacao = 'aprovado',
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

-- ------------------------------------------------------------------------------
-- 2. BLOQUEIOS DE VENDEDOR / UTILIZADOR (public.bloqueios_utilizador)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bloqueios_utilizador (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bloqueador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  bloqueado_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  motivo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE (bloqueador_id, bloqueado_id),
  CHECK (bloqueador_id <> bloqueado_id)
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_bloqueador ON public.bloqueios_utilizador (bloqueador_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_bloqueado ON public.bloqueios_utilizador (bloqueado_id);

ALTER TABLE public.bloqueios_utilizador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Utilizador vê os seus bloqueios ou moderador vê todos" ON public.bloqueios_utilizador;
CREATE POLICY "Utilizador vê os seus bloqueios ou moderador vê todos"
ON public.bloqueios_utilizador FOR SELECT
USING (auth.uid() = bloqueador_id OR public.is_moderator());

DROP POLICY IF EXISTS "Utilizador bloqueia outro utilizador" ON public.bloqueios_utilizador;
CREATE POLICY "Utilizador bloqueia outro utilizador"
ON public.bloqueios_utilizador FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = bloqueador_id
  AND bloqueador_id <> bloqueado_id
);

DROP POLICY IF EXISTS "Utilizador remove bloqueio próprio" ON public.bloqueios_utilizador;
CREATE POLICY "Utilizador remove bloqueio próprio"
ON public.bloqueios_utilizador FOR DELETE
USING (auth.uid() = bloqueador_id OR public.is_moderator());

CREATE OR REPLACE FUNCTION public.is_seller_blocked_for_viewer(p_seller_id UUID)
RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_seller_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bloqueios_utilizador b
      WHERE b.bloqueador_id = auth.uid()
        AND b.bloqueado_id = p_seller_id
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 3. LOJAS: PUBLICAÇÃO LIVRE + CAMPO SEPARADO verificada (SÓ ADMIN)
-- ------------------------------------------------------------------------------
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS verificada BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.lojas
  ALTER COLUMN is_aprovada SET DEFAULT TRUE,
  ALTER COLUMN estado_aprovacao SET DEFAULT 'aprovado';

CREATE OR REPLACE FUNCTION public.proteger_e_gerar_codigo_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_next_num INT;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT v_is_system AND public.is_user_banned(NEW.dono_id) THEN
      RAISE EXCEPTION 'Conta banida ou suspensa não pode criar loja.';
    END IF;

    NEW.client_mutation_id := NULLIF(trim(COALESCE(NEW.client_mutation_id, '')), '');

    IF NEW.client_mutation_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.lojas WHERE client_mutation_id = NEW.client_mutation_id
    ) THEN
      RAISE EXCEPTION 'Esta loja já existe (pedido repetido).'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (SELECT 1 FROM public.lojas WHERE dono_id = NEW.dono_id) THEN
      RAISE EXCEPTION 'Já existe uma loja registada para esta conta.'
        USING ERRCODE = '23505';
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

    IF NEW.codigo IS NULL OR trim(NEW.codigo) = '' THEN
      PERFORM pg_advisory_xact_lock(hashtext('lojas_codigo_seq'));
      SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '[^0-9]', '', 'g'), '')::INT), 0) + 1
      INTO v_next_num
      FROM public.lojas;
      NEW.codigo := 'LJ-' || LPAD(v_next_num::TEXT, 4, '0');
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT v_is_system THEN
      -- Publicação livre: a loja nasce activa e visível; verificação oficial continua exclusiva do admin
      NEW.is_aprovada := TRUE;
      NEW.estado_aprovacao := 'aprovado';
      NEW.verificada := FALSE;
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
      IF NEW.dono_id IS DISTINCT FROM OLD.dono_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada: não é possível transferir a titularidade da loja.';
      END IF;

      IF NEW.client_mutation_id IS DISTINCT FROM OLD.client_mutation_id AND NOT public.is_super_admin() THEN
        NEW.client_mutation_id := OLD.client_mutation_id;
      END IF;

      IF NOT public.is_admin() AND (
        NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada
        OR NEW.verificada IS DISTINCT FROM OLD.verificada
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
        RAISE EXCEPTION 'Operação não autorizada: só o servidor ou administradores podem alterar estado, selo verificado e métricas da loja.';
      END IF;

      IF (
        NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada
        OR NEW.verificada IS DISTINCT FROM OLD.verificada
        OR NEW.estado_aprovacao IS DISTINCT FROM OLD.estado_aprovacao
        OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao
        OR NEW.nota_correcao IS DISTINCT FROM OLD.nota_correcao
        OR NEW.suspensa IS DISTINCT FROM OLD.suspensa
        OR NEW.motivo_suspensao IS DISTINCT FROM OLD.motivo_suspensao
      ) AND NOT public.is_moderator() THEN
        RAISE EXCEPTION 'Operação não autorizada: apenas moderador ou super_admin pode verificar, aprovar ou suspender lojas.';
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
    ELSIF OLD.verificada IS DISTINCT FROM NEW.verificada THEN
      INSERT INTO public.eventos_sistema (tipo, gravidade, utilizador_id, detalhe)
      VALUES (
        CASE WHEN NEW.verificada THEN 'LOJA_VERIFICADA' ELSE 'LOJA_DESVERIFICADA' END,
        'info',
        NEW.dono_id,
        'Selo verificado da loja ' || COALESCE(NEW.codigo, NEW.nome) || ' alterado para ' || NEW.verificada::TEXT
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

DROP POLICY IF EXISTS "Lojas aprovadas são visíveis publicamente" ON public.lojas;
CREATE POLICY "Lojas aprovadas são visíveis publicamente"
ON public.lojas FOR SELECT
USING (
  public.is_admin()
  OR dono_id = auth.uid()
  OR (
    COALESCE(is_aprovada, TRUE) = TRUE
    AND COALESCE(suspensa, FALSE) = FALSE
    AND NOT public.is_user_banned(dono_id)
    AND NOT public.is_seller_blocked_for_viewer(dono_id)
  )
);

DROP POLICY IF EXISTS "Comerciante cria a sua loja" ON public.lojas;
CREATE POLICY "Comerciante cria a sua loja"
ON public.lojas FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = dono_id
  AND NOT public.is_user_banned(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.lojas l WHERE l.dono_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- 4. CONFIGURAÇÕES DO SISTEMA: LIMITES DIÁRIOS + PALAVRAS PROIBIDAS + PADRÃO ABERTO
-- ------------------------------------------------------------------------------
ALTER TABLE public.configuracoes_sistema
  ALTER COLUMN exigir_aprovacao_produtos SET DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS limite_diario_conta_nova INT NOT NULL DEFAULT 5
    CHECK (limite_diario_conta_nova BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS limite_diario_conta_estabelecida INT NOT NULL DEFAULT 30
    CHECK (limite_diario_conta_estabelecida BETWEEN 1 AND 1000),
  ADD COLUMN IF NOT EXISTS palavras_proibidas TEXT[] NOT NULL DEFAULT ARRAY[
    'arma', 'armas', 'pistola', 'revolver', 'espingarda', 'fuzil', 'municao', 'municoes', 'granada', 'explosivo',
    'droga', 'drogas', 'cocaina', 'liamba', 'cannabis', 'maconha', 'heroina', 'metanfetamina', 'ecstasy', 'estupefaciente',
    'pornografia', 'porno', 'sexo explicito', 'conteudo adulto', 'prostituicao', 'acompanhante sexual',
    'documento falso', 'documentos falsos', 'bi falso', 'bilhete falso', 'passaporte falso', 'carta falsa', 'diploma falso', 'certificado falso', 'falsificacao',
    'medicamento com receita', 'medicamentos com receita', 'receita medica', 'antibiotico', 'psicotropico', 'morfina', 'tramadol', 'diazepam', 'abortivo',
    'cambio', 'troca de divisas', 'kwanza por dolar', 'vender dolares', 'vender euros', 'notas falsas', 'dinheiro falso', 'lavagem de dinheiro'
  ];

UPDATE public.configuracoes_sistema
SET exigir_aprovacao_produtos = FALSE
WHERE id = 'global';

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

DROP POLICY IF EXISTS "Financeiro ou Super Admin altera configurações" ON public.configuracoes_sistema;
CREATE POLICY "Equipa autorizada gere configurações"
ON public.configuracoes_sistema FOR ALL
USING (public.is_finance() OR public.is_moderator())
WITH CHECK (public.is_finance() OR public.is_moderator());

-- ------------------------------------------------------------------------------
-- 5. PRODUTOS: CAMPOS OBRIGATÓRIOS, QUOTA DIÁRIA, FILTRO DE CONTEÚDO E RLS ABERTO
-- ------------------------------------------------------------------------------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS estado_moderacao TEXT NOT NULL DEFAULT 'publicado'
    CHECK (estado_moderacao IN ('publicado', 'em_revisao', 'removido')),
  ADD COLUMN IF NOT EXISTS motivo_moderacao TEXT,
  ADD COLUMN IF NOT EXISTS total_denuncias INT NOT NULL DEFAULT 0;

UPDATE public.produtos
SET estado_moderacao = CASE
  WHEN COALESCE(is_aprovado, TRUE) = TRUE THEN 'publicado'
  ELSE 'em_revisao'
END
WHERE estado_moderacao IS NULL OR (is_aprovado = FALSE AND estado_moderacao = 'publicado');

CREATE OR REPLACE FUNCTION public.normalizar_texto_moderacao(p_texto TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
    translate(
      lower(COALESCE(p_texto, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñýÿ',
      'aaaaaeeeeiiiiooooouuuucnyy'
    ),
    '\s+',
    ' ',
    'g'
  );
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.encontrar_palavra_proibida(p_texto TEXT, p_lista TEXT[])
RETURNS TEXT AS $$
DECLARE
  v_norm_text TEXT := public.normalizar_texto_moderacao(p_texto);
  v_raw_word TEXT;
  v_norm_word TEXT;
  v_escaped TEXT;
BEGIN
  IF v_norm_text = '' OR p_lista IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_raw_word IN ARRAY p_lista
  LOOP
    v_norm_word := trim(public.normalizar_texto_moderacao(v_raw_word));
    IF v_norm_word = '' THEN
      CONTINUE;
    END IF;
    v_escaped := regexp_replace(v_norm_word, '([.^$+*?(){}\[\]\\|])', '\\\1', 'g');
    IF v_norm_text ~ ('(^|[^a-z0-9])' || v_escaped || '($|[^a-z0-9])') THEN
      RETURN v_raw_word;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.proteger_campos_admin_produto()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_store_approved BOOLEAN;
  v_store_suspended BOOLEAN;
  v_require_approval BOOLEAN;
  v_limit_new INT;
  v_limit_est INT;
  v_keywords TEXT[];
  v_profile_created TIMESTAMPTZ;
  v_daily_limit INT;
  v_today_count INT;
  v_has_photo BOOLEAN;
  v_matched_word TEXT;
  v_scan_text TEXT;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF COALESCE(NEW.tipo_media, 'imagem') = 'video'
     AND NULLIF(trim(COALESCE(NEW.video_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Artigo em vídeo exige um link ou ficheiro de vídeo válido (máx. 15s e 10 MB).';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() AND NOT v_is_system THEN
      IF public.is_user_banned(NEW.vendedor_id) THEN
        RAISE EXCEPTION 'Esta conta está banida ou suspensa e não pode publicar artigos.';
      END IF;

      IF COALESCE(NEW.is_destaque, FALSE) = TRUE THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem activar is_destaque em produtos.';
      END IF;

      -- Validar campos obrigatórios para publicar
      IF NULLIF(trim(COALESCE(NEW.nome, '')), '') IS NULL THEN
        RAISE EXCEPTION 'O nome do artigo é obrigatório.';
      END IF;
      IF COALESCE(NEW.preco, 0) <= 0 THEN
        RAISE EXCEPTION 'O preço do artigo deve ser superior a 0 Kz.';
      END IF;
      IF NULLIF(trim(COALESCE(NEW.whatsapp, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Indica um contacto WhatsApp válido para publicar.';
      END IF;
      IF NULLIF(trim(COALESCE(NEW.bairro, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Indica o bairro no Uíge onde o artigo está disponível.';
      END IF;

      v_has_photo := (
        NULLIF(trim(COALESCE(NEW.imagem_url, '')), '') IS NOT NULL
        OR COALESCE(array_length(NEW.imagens, 1), 0) > 0
      );
      IF NOT v_has_photo THEN
        RAISE EXCEPTION 'É obrigatório adicionar pelo menos 1 fotografia do artigo.';
      END IF;

      NEW.is_destaque := FALSE;
      NEW.vendas := 0;
      NEW.classificacao := 0.0;
      NEW.total_avaliacoes := 0;
      NEW.total_denuncias := 0;

      SELECT
        COALESCE(exigir_aprovacao_produtos, FALSE),
        COALESCE(limite_diario_conta_nova, 5),
        COALESCE(limite_diario_conta_estabelecida, 30),
        palavras_proibidas
      INTO v_require_approval, v_limit_new, v_limit_est, v_keywords
      FROM public.configuracoes_sistema
      WHERE id = 'global';

      -- Limites diários por idade da conta (< 24h até 5/dia; >= 24h até 30/dia)
      SELECT criado_em INTO v_profile_created
      FROM public.perfis
      WHERE id = NEW.vendedor_id;

      IF v_profile_created IS NOT NULL
         AND v_profile_created > TIMEZONE('utc', NOW()) - INTERVAL '24 hours' THEN
        v_daily_limit := COALESCE(v_limit_new, 5);
      ELSE
        v_daily_limit := COALESCE(v_limit_est, 30);
      END IF;

      SELECT COUNT(*) INTO v_today_count
      FROM public.produtos
      WHERE vendedor_id = NEW.vendedor_id
        AND TIMEZONE('Africa/Luanda', criado_em)::date = TIMEZONE('Africa/Luanda', NOW())::date;

      IF v_today_count >= v_daily_limit THEN
        RAISE EXCEPTION 'Limite diário de publicação atingido (% artigos por dia para esta conta).', v_daily_limit;
      END IF;

      -- Filtro automático de conteúdo proibido
      v_scan_text := COALESCE(NEW.nome, '') || ' ' || COALESCE(NEW.descricao, '') || ' ' || COALESCE(NEW.categoria, '') || ' ' || COALESCE(NEW.marca, '');
      v_matched_word := public.encontrar_palavra_proibida(v_scan_text, v_keywords);

      IF v_matched_word IS NOT NULL THEN
        NEW.is_aprovado := FALSE;
        NEW.estado_moderacao := 'em_revisao';
        NEW.motivo_moderacao := 'Artigo retido pelo filtro de conteúdo proibido (' || v_matched_word || ')';
      ELSIF COALESCE(v_require_approval, FALSE) = TRUE THEN
        NEW.is_aprovado := FALSE;
        NEW.estado_moderacao := 'em_revisao';
        NEW.motivo_moderacao := 'Aguarda aprovação prévia da moderação';
      ELSIF NEW.loja_id IS NOT NULL THEN
        SELECT is_aprovada, suspensa INTO v_store_approved, v_store_suspended
        FROM public.lojas WHERE id = NEW.loja_id;
        IF COALESCE(v_store_suspended, FALSE) = TRUE THEN
          RAISE EXCEPTION 'A tua loja encontra-se suspensa e não pode publicar artigos.';
        END IF;
        NEW.is_aprovado := COALESCE(v_store_approved, TRUE);
        NEW.estado_moderacao := CASE WHEN NEW.is_aprovado THEN 'publicado' ELSE 'em_revisao' END;
        NEW.motivo_moderacao := NULL;
      ELSE
        NEW.is_aprovado := TRUE;
        NEW.estado_moderacao := 'publicado';
        NEW.motivo_moderacao := NULL;
      END IF;
    ELSIF COALESCE(NEW.estado_moderacao, '') = '' THEN
      NEW.estado_moderacao := CASE WHEN COALESCE(NEW.is_aprovado, TRUE) THEN 'publicado' ELSE 'em_revisao' END;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_moderator() AND NOT v_is_system THEN
      IF (
        NEW.is_aprovado IS DISTINCT FROM OLD.is_aprovado
        OR NEW.estado_moderacao IS DISTINCT FROM OLD.estado_moderacao
        OR NEW.motivo_moderacao IS DISTINCT FROM OLD.motivo_moderacao
        OR NEW.total_denuncias IS DISTINCT FROM OLD.total_denuncias
        OR NEW.is_destaque IS DISTINCT FROM OLD.is_destaque
        OR NEW.vendas IS DISTINCT FROM OLD.vendas
        OR NEW.classificacao IS DISTINCT FROM OLD.classificacao
        OR NEW.total_avaliacoes IS DISTINCT FROM OLD.total_avaliacoes
      ) THEN
        RAISE EXCEPTION 'Operação não autorizada: só administradores podem alterar moderação ou destaque de produtos.';
      END IF;
    ELSIF public.is_moderator() OR v_is_system THEN
      IF NEW.is_aprovado IS DISTINCT FROM OLD.is_aprovado AND NEW.estado_moderacao IS NOT DISTINCT FROM OLD.estado_moderacao THEN
        NEW.estado_moderacao := CASE WHEN NEW.is_aprovado THEN 'publicado' ELSE 'em_revisao' END;
      ELSIF NEW.estado_moderacao IS DISTINCT FROM OLD.estado_moderacao AND NEW.is_aprovado IS NOT DISTINCT FROM OLD.is_aprovado THEN
        NEW.is_aprovado := (NEW.estado_moderacao = 'publicado');
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

-- Políticas RLS de public.produtos: publicação livre + ocultação de bloqueados/banidos/retidos
DROP POLICY IF EXISTS "Leitura de produtos disponíveis" ON public.produtos;
CREATE POLICY "Leitura de produtos disponíveis"
ON public.produtos FOR SELECT
USING (
  public.is_moderator()
  OR vendedor_id = auth.uid()
  OR (
    COALESCE(is_aprovado, TRUE) = TRUE
    AND COALESCE(estado_moderacao, 'publicado') = 'publicado'
    AND NOT public.is_user_banned(vendedor_id)
    AND NOT public.is_seller_blocked_for_viewer(vendedor_id)
    AND (
      loja_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.lojas lj
        WHERE lj.id = public.produtos.loja_id
          AND COALESCE(lj.is_aprovada, TRUE) = TRUE
          AND COALESCE(lj.suspensa, FALSE) = FALSE
      )
    )
  )
);

DROP POLICY IF EXISTS "Comerciante aprovado ou Admin publica produtos" ON public.produtos;
DROP POLICY IF EXISTS "Utilizador autenticado com loja activa publica produtos" ON public.produtos;
CREATE POLICY "Utilizador autenticado com loja activa publica produtos"
ON public.produtos FOR INSERT
WITH CHECK (
  public.is_moderator()
  OR (
    auth.uid() IS NOT NULL
    AND auth.uid() = vendedor_id
    AND NOT public.is_user_banned(auth.uid())
    AND (
      loja_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.lojas lj
        WHERE lj.id = public.produtos.loja_id
          AND lj.dono_id = auth.uid()
          AND COALESCE(lj.is_aprovada, TRUE) = TRUE
          AND COALESCE(lj.suspensa, FALSE) = FALSE
      )
    )
  )
);

DROP POLICY IF EXISTS "Vendedor ou Moderador actualiza produtos" ON public.produtos;
CREATE POLICY "Vendedor ou Moderador actualiza produtos"
ON public.produtos FOR UPDATE
USING (
  (vendedor_id = auth.uid() AND NOT public.is_user_banned(auth.uid()))
  OR public.is_moderator()
)
WITH CHECK (
  (vendedor_id = auth.uid() AND NOT public.is_user_banned(auth.uid()))
  OR public.is_moderator()
);

DROP POLICY IF EXISTS "Vendedor ou Moderador apaga produtos" ON public.produtos;
CREATE POLICY "Vendedor ou Moderador apaga produtos"
ON public.produtos FOR DELETE
USING (
  (vendedor_id = auth.uid() AND NOT public.is_user_banned(auth.uid()))
  OR public.is_moderator()
);

-- ------------------------------------------------------------------------------
-- 6. DENÚNCIAS (PRODUTOS, LOJAS E AVALIAÇÕES) + OCULTAÇÃO AUTOMÁTICA COM 3 CONTAS
-- ------------------------------------------------------------------------------
ALTER TABLE public.denuncias
  ADD COLUMN IF NOT EXISTS avaliacao_id UUID,
  ADD COLUMN IF NOT EXISTS avaliacao_tipo TEXT CHECK (avaliacao_tipo IS NULL OR avaliacao_tipo IN ('loja', 'produto'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_denuncias_reporter_produto
  ON public.denuncias (denunciante_id, produto_id)
  WHERE produto_id IS NOT NULL AND denunciante_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_denuncias_reporter_loja
  ON public.denuncias (denunciante_id, loja_id)
  WHERE loja_id IS NOT NULL AND produto_id IS NULL AND avaliacao_id IS NULL AND denunciante_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_denuncias_reporter_avaliacao
  ON public.denuncias (denunciante_id, avaliacao_tipo, avaliacao_id)
  WHERE avaliacao_id IS NOT NULL AND denunciante_id IS NOT NULL;

DROP POLICY IF EXISTS "Qualquer utilizador autenticado pode denunciar" ON public.denuncias;
CREATE POLICY "Qualquer utilizador autenticado pode denunciar"
ON public.denuncias FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND denunciante_id = auth.uid()
  AND NOT public.is_user_banned(auth.uid())
);

CREATE OR REPLACE FUNCTION public.verificar_suspensao_automatica_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_prod_id UUID := COALESCE(NEW.produto_id, OLD.produto_id);
  v_loja_id UUID := COALESCE(NEW.loja_id, OLD.loja_id);
  v_prod_distinct INT := 0;
  v_store_total INT := 0;
  v_limite INT := 3;
BEGIN
  -- 1) Produto: ocultar automaticamente a partir de 3 denúncias de contas distintas
  IF v_prod_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT COALESCE(denunciante_id::TEXT, id::TEXT))
    INTO v_prod_distinct
    FROM public.denuncias
    WHERE produto_id = v_prod_id
      AND estado <> 'rejeitado';

    PERFORM set_config('app.system_mutation', 'on', true);
    UPDATE public.produtos
    SET
      total_denuncias = v_prod_distinct,
      is_aprovado = CASE WHEN v_prod_distinct >= 3 THEN FALSE ELSE is_aprovado END,
      estado_moderacao = CASE
        WHEN v_prod_distinct >= 3 AND estado_moderacao = 'publicado' THEN 'em_revisao'
        ELSE estado_moderacao
      END,
      motivo_moderacao = CASE
        WHEN v_prod_distinct >= 3 AND (motivo_moderacao IS NULL OR motivo_moderacao = '')
        THEN 'Ocultado automaticamente após 3 denúncias de contas diferentes'
        ELSE motivo_moderacao
      END
    WHERE id = v_prod_id;
    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;

  -- 2) Loja: contabilizar denúncias directas contra a loja (não confundir com produto ou avaliação individual)
  IF v_loja_id IS NOT NULL AND COALESCE(NEW.produto_id, OLD.produto_id) IS NULL AND COALESCE(NEW.avaliacao_id, OLD.avaliacao_id) IS NULL THEN
    SELECT COUNT(DISTINCT COALESCE(denunciante_id::TEXT, id::TEXT))
    INTO v_store_total
    FROM public.denuncias d
    WHERE d.loja_id = v_loja_id
      AND d.produto_id IS NULL
      AND d.avaliacao_id IS NULL
      AND d.estado <> 'rejeitado';

    SELECT COALESCE(limite_denuncias_suspensao, 3) INTO v_limite
    FROM public.configuracoes_sistema WHERE id = 'global';

    PERFORM set_config('app.system_mutation', 'on', true);
    UPDATE public.lojas
    SET
      denuncias_count = v_store_total,
      suspensa = CASE WHEN v_store_total >= COALESCE(v_limite, 3) THEN TRUE ELSE suspensa END,
      motivo_suspensao = CASE
        WHEN v_store_total >= COALESCE(v_limite, 3) AND (motivo_suspensao IS NULL OR motivo_suspensao = '')
        THEN 'Suspensão automática por excesso de denúncias'
        ELSE motivo_suspensao
      END
    WHERE id = v_loja_id;
    PERFORM set_config('app.system_mutation', 'off', true);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_suspensao_automatica_loja ON public.denuncias;
CREATE TRIGGER trg_suspensao_automatica_loja
AFTER INSERT OR UPDATE OF estado ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.verificar_suspensao_automatica_loja();

-- Avaliações: ocultar avaliações de utilizadores bloqueados pelo utilizador actual
DROP POLICY IF EXISTS "Leitura pública de avaliações" ON public.avaliacoes;
CREATE POLICY "Leitura pública de avaliações"
ON public.avaliacoes FOR SELECT
USING (
  public.is_moderator()
  OR NOT public.is_seller_blocked_for_viewer(utilizador_id)
);

DROP POLICY IF EXISTS "Leitura pública de avaliações de loja" ON public.avaliacoes_loja;
CREATE POLICY "Leitura pública de avaliações de loja"
ON public.avaliacoes_loja FOR SELECT
USING (
  public.is_moderator()
  OR NOT public.is_seller_blocked_for_viewer(utilizador_id)
);

-- ------------------------------------------------------------------------------
-- 7. FUNÇÕES RPC DE MODERAÇÃO ADMIN (COM AUDITORIA OBRIGATÓRIA NO SERVIDOR)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_moderar_produto(
  p_produto_id UUID,
  p_acao TEXT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_clean_reason TEXT := NULLIF(trim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Operação não autorizada: apenas moderadores podem moderar artigos.';
  END IF;

  IF p_acao NOT IN ('restaurar', 'remover', 'suspender') THEN
    RAISE EXCEPTION 'Acção de moderação inválida.';
  END IF;

  IF p_acao IN ('remover', 'suspender') AND v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'Indica um motivo para remover ou ocultar o artigo.';
  END IF;

  PERFORM set_config('app.system_mutation', 'on', true);

  IF p_acao = 'restaurar' THEN
    UPDATE public.produtos
    SET is_aprovado = TRUE,
        estado_moderacao = 'publicado',
        motivo_moderacao = NULL
    WHERE id = p_produto_id;
  ELSIF p_acao = 'remover' THEN
    UPDATE public.produtos
    SET is_aprovado = FALSE,
        estado_moderacao = 'removido',
        motivo_moderacao = v_clean_reason
    WHERE id = p_produto_id;
  ELSE
    UPDATE public.produtos
    SET is_aprovado = FALSE,
        estado_moderacao = 'em_revisao',
        motivo_moderacao = v_clean_reason
    WHERE id = p_produto_id;
  END IF;

  INSERT INTO public.auditoria (admin_id, acao, alvo, detalhes)
  VALUES (
    v_admin_id,
    CASE WHEN p_acao = 'restaurar' THEN 'RESTORE_PRODUCT' ELSE 'DELETE_PRODUCT' END,
    p_produto_id::TEXT,
    jsonb_build_object('acao', p_acao, 'motivo', COALESCE(v_clean_reason, 'Restaurado pela moderação'))
  );

  PERFORM set_config('app.system_mutation', 'off', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.system_mutation', 'off', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_moderar_produto(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_verificar_loja(
  p_loja_id UUID,
  p_verificada BOOLEAN,
  p_motivo TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Operação não autorizada: apenas moderadores podem atribuir o selo Loja verificada.';
  END IF;

  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.lojas
  SET verificada = COALESCE(p_verificada, FALSE)
  WHERE id = p_loja_id;

  INSERT INTO public.auditoria (admin_id, acao, alvo, detalhes)
  VALUES (
    v_admin_id,
    CASE WHEN p_verificada THEN 'VERIFY_STORE' ELSE 'UNVERIFY_STORE' END,
    p_loja_id::TEXT,
    jsonb_build_object('verificada', p_verificada, 'motivo', NULLIF(trim(COALESCE(p_motivo, '')), ''))
  );

  PERFORM set_config('app.system_mutation', 'off', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.system_mutation', 'off', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_verificar_loja(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_banir_utilizador(
  p_user_id UUID,
  p_banir BOOLEAN,
  p_motivo TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_clean_reason TEXT := NULLIF(trim(COALESCE(p_motivo, '')), '');
  v_target_role TEXT;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Operação não autorizada: apenas moderadores podem banir utilizadores.';
  END IF;

  IF p_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Não é possível banir a tua própria conta.';
  END IF;

  SELECT papel INTO v_target_role FROM public.perfis WHERE id = p_user_id;
  IF v_target_role IN ('super_admin', 'admin') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Operação não autorizada sobre conta administrativa.';
  END IF;

  IF p_banir AND v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'Indica o motivo do banimento.';
  END IF;

  PERFORM set_config('app.system_mutation', 'on', true);

  UPDATE public.perfis
  SET
    banido = COALESCE(p_banir, FALSE),
    suspenso = CASE WHEN p_banir THEN TRUE ELSE FALSE END,
    motivo_banimento = CASE WHEN p_banir THEN v_clean_reason ELSE NULL END,
    banido_em = CASE WHEN p_banir THEN TIMEZONE('utc', NOW()) ELSE NULL END
  WHERE id = p_user_id;

  IF p_banir THEN
    UPDATE public.lojas
    SET suspensa = TRUE,
        motivo_suspensao = 'Proprietário banido: ' || v_clean_reason
    WHERE dono_id = p_user_id;
  END IF;

  INSERT INTO public.auditoria (admin_id, acao, alvo, detalhes)
  VALUES (
    v_admin_id,
    CASE WHEN p_banir THEN 'BAN_USER' ELSE 'UNBAN_USER' END,
    p_user_id::TEXT,
    jsonb_build_object('banido', p_banir, 'motivo', COALESCE(v_clean_reason, 'Banimento removido'))
  );

  PERFORM set_config('app.system_mutation', 'off', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.system_mutation', 'off', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_banir_utilizador(UUID, BOOLEAN, TEXT) TO authenticated;
