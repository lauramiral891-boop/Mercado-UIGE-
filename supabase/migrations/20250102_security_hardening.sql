-- =========================================================================
-- MIGRAÇÃO DE ENDURECIMENTO DE SEGURANÇA E RLS: MERCADO UÍGE
-- =========================================================================

-- 1. Colunas de controlo e idempotência
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;
ALTER TABLE public.encomendas ADD COLUMN IF NOT EXISTS client_mutation_id TEXT UNIQUE;
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS client_mutation_id TEXT UNIQUE;

-- Classificação padrão 0 (sem avaliações fictícias em novos registos)
ALTER TABLE public.lojas ALTER COLUMN classificacao SET DEFAULT 0.0;
ALTER TABLE public.produtos ALTER COLUMN classificacao SET DEFAULT 0.0;

-- 2. FUNÇÃO AUXILIAR DE ADMIN NO SERVIDOR (SECURITY DEFINER sem recursão RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND papel = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3. IMPEDIR REGISTO DIRECTO COM PAPEL ADMIN E AUTO-PROMOÇÃO A ADMIN
CREATE OR REPLACE FUNCTION public.gerir_novo_utilizador()
RETURNS TRIGGER AS $$
DECLARE
  v_requested_role TEXT;
  v_safe_role TEXT;
BEGIN
  v_requested_role := COALESCE(NEW.raw_user_meta_data->>'papel', 'cliente');
  -- Nunca permitir criar papel 'admin' via registo de cliente
  IF v_requested_role IN ('cliente', 'comerciante', 'entregador') THEN
    v_safe_role := v_requested_role;
  ELSE
    v_safe_role := 'cliente';
  END IF;

  INSERT INTO public.perfis (id, nome, email, papel, municipio)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'nome'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    v_safe_role,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'municipio'), ''), 'Uíge')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Bloqueia inserção directa de papel admin por utilizadores autenticados da API
    IF auth.uid() IS NOT NULL AND NEW.papel = 'admin' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Operação não autorizada: não é permitido criar utilizadores admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Impede que utilizadores alterem o próprio papel ou estado de suspensão
    IF (NEW.papel IS DISTINCT FROM OLD.papel OR NEW.suspenso IS DISTINCT FROM OLD.suspenso) THEN
      IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada. Apenas administradores confirmados no servidor podem alterar privilégios ou estado da conta.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.perfis;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE INSERT OR UPDATE ON public.perfis
FOR EACH ROW
EXECUTE FUNCTION public.check_role_escalation();

-- 4. POLÍTICAS RLS ESTRITAS EM PERFIS (Cada utilizador lê/edita apenas o seu; Admin lê/gere tudo)
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de perfis públicos ou próprios" ON public.perfis;
DROP POLICY IF EXISTS "Utilizador pode actualizar o seu próprio perfil" ON public.perfis;

CREATE POLICY "Utilizador lê o próprio perfil ou admin lê todos"
ON public.perfis FOR SELECT
USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Utilizador actualiza o próprio perfil ou admin actualiza todos"
ON public.perfis FOR UPDATE
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

-- 5. POLÍTICAS RLS ESTRITAS EM LOJAS
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lojas aprovadas são visíveis publicamente" ON public.lojas;
DROP POLICY IF EXISTS "Comerciante pode criar a sua loja" ON public.lojas;
DROP POLICY IF EXISTS "Dono ou Admin pode actualizar loja" ON public.lojas;

CREATE POLICY "Lojas aprovadas visíveis ou dono ou admin"
ON public.lojas FOR SELECT
USING (is_aprovada = TRUE OR auth.uid() = dono_id OR public.is_admin());

CREATE POLICY "Comerciante cria a sua loja"
ON public.lojas FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = dono_id);

CREATE POLICY "Dono ou Admin actualiza loja"
ON public.lojas FOR UPDATE
USING (auth.uid() = dono_id OR public.is_admin())
WITH CHECK (auth.uid() = dono_id OR public.is_admin());

-- 6. POLÍTICAS RLS ESTRITAS EM PRODUTOS (Vendedor só nos seus produtos; Admin em todos)
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Produtos aprovados são visíveis para todos" ON public.produtos;
DROP POLICY IF EXISTS "Comerciante ou Admin pode publicar produtos" ON public.produtos;
DROP POLICY IF EXISTS "Vendedor ou Admin pode actualizar produtos" ON public.produtos;
DROP POLICY IF EXISTS "Vendedor ou Admin pode eliminar produtos" ON public.produtos;
DROP POLICY IF EXISTS "Qualquer pessoa pode ver produtos aprovados" ON public.produtos;
DROP POLICY IF EXISTS "Vendedores gerem os seus produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins gerem todos os produtos" ON public.produtos;
DROP POLICY IF EXISTS "Leitura de produtos disponíveis" ON public.produtos;
DROP POLICY IF EXISTS "Vendedor insere os seus produtos" ON public.produtos;
DROP POLICY IF EXISTS "Vendedor actualiza os seus produtos" ON public.produtos;
DROP POLICY IF EXISTS "Vendedor apaga os seus produtos" ON public.produtos;

CREATE POLICY "Leitura de produtos disponíveis"
ON public.produtos FOR SELECT
USING (is_aprovado = TRUE OR vendedor_id = auth.uid() OR public.is_admin());

CREATE POLICY "Vendedor insere os seus produtos"
ON public.produtos FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    (vendedor_id = auth.uid() AND NOT is_destaque)
    OR public.is_admin()
  )
);

CREATE POLICY "Vendedor actualiza os seus produtos"
ON public.produtos FOR UPDATE
USING (vendedor_id = auth.uid() OR public.is_admin())
WITH CHECK (vendedor_id = auth.uid() OR public.is_admin());

CREATE POLICY "Vendedor apaga os seus produtos"
ON public.produtos FOR DELETE
USING (vendedor_id = auth.uid() OR public.is_admin());

-- 7. POLÍTICAS RLS ESTRITAS EM ENCOMENDAS E ITENS
ALTER TABLE public.encomendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_encomenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Utilizador ou vendedor vê as suas encomendas" ON public.encomendas;
DROP POLICY IF EXISTS "Utilizador autenticado pode criar encomenda" ON public.encomendas;
DROP POLICY IF EXISTS "Vendedor ou Admin pode actualizar estado da encomenda" ON public.encomendas;
DROP POLICY IF EXISTS "Utilizador gere as suas encomendas" ON public.encomendas;
DROP POLICY IF EXISTS "Utilizador lê as suas encomendas ou da sua loja" ON public.encomendas;
DROP POLICY IF EXISTS "Utilizador cria a sua encomenda" ON public.encomendas;

CREATE POLICY "Utilizador lê as suas encomendas ou da sua loja"
ON public.encomendas FOR SELECT
USING (
  utilizador_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.lojas WHERE id = public.encomendas.loja_id AND dono_id = auth.uid())
  OR public.is_admin()
);

CREATE POLICY "Utilizador cria a sua encomenda"
ON public.encomendas FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND utilizador_id = auth.uid());

CREATE POLICY "Vendedor ou Admin actualiza encomenda"
ON public.encomendas FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.lojas WHERE id = public.encomendas.loja_id AND dono_id = auth.uid())
  OR public.is_admin()
);

-- 8. POLÍTICAS RLS EM MENSAGENS, AVALIAÇÕES, DENÚNCIAS, NOTIFICAÇÕES, AVISOS E AUDITORIA
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de mensagens do remetente ou destinatário" ON public.mensagens;
DROP POLICY IF EXISTS "Envio de mensagem pelo utilizador autenticado" ON public.mensagens;
DROP POLICY IF EXISTS "Participantes lêem mensagens" ON public.mensagens;
DROP POLICY IF EXISTS "Utilizador envia mensagem" ON public.mensagens;
DROP POLICY IF EXISTS "Participantes lêem as suas mensagens" ON public.mensagens;
DROP POLICY IF EXISTS "Utilizador envia mensagem autenticado" ON public.mensagens;

CREATE POLICY "Participantes lêem as suas mensagens"
ON public.mensagens FOR SELECT
USING (remetente_id = auth.uid() OR destinatario_id = auth.uid());

CREATE POLICY "Utilizador envia mensagem autenticado"
ON public.mensagens FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND remetente_id = auth.uid());

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de avaliações" ON public.avaliacoes;
DROP POLICY IF EXISTS "Utilizador gere a sua avaliação" ON public.avaliacoes;

CREATE POLICY "Leitura pública de avaliações"
ON public.avaliacoes FOR SELECT
USING (true);

CREATE POLICY "Utilizador insere a sua avaliação"
ON public.avaliacoes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND utilizador_id = auth.uid());

CREATE POLICY "Utilizador actualiza ou apaga a sua avaliação"
ON public.avaliacoes FOR UPDATE
USING (utilizador_id = auth.uid())
WITH CHECK (utilizador_id = auth.uid());

CREATE POLICY "Utilizador apaga a sua avaliação"
ON public.avaliacoes FOR DELETE
USING (utilizador_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Qualquer utilizador autenticado pode denunciar" ON public.denuncias;
DROP POLICY IF EXISTS "Apenas admin pode ver e gerir denúncias" ON public.denuncias;
CREATE POLICY "Utilizador autenticado pode denunciar"
ON public.denuncias FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND (denunciante_id IS NULL OR denunciante_id = auth.uid()));

CREATE POLICY "Apenas admin vê e gere denúncias"
ON public.denuncias FOR SELECT
USING (public.is_admin() OR denunciante_id = auth.uid());

CREATE POLICY "Apenas admin actualiza denúncias"
ON public.denuncias FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Apenas admin pode ler ou escrever no log de auditoria" ON public.auditoria;
CREATE POLICY "Apenas admin acede à auditoria"
ON public.auditoria FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Apenas admin pode publicar avisos" ON public.avisos;
CREATE POLICY "Apenas admin publica avisos"
ON public.avisos FOR INSERT
WITH CHECK (public.is_admin());

-- 9. BUCKET DE FOTOS (SUPABASE STORAGE) E POLÍTICAS
INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos', 'produtos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Leitura pública de imagens de produtos" ON storage.objects;
DROP POLICY IF EXISTS "Upload autenticado de imagens de produtos" ON storage.objects;
DROP POLICY IF EXISTS "Remoção das próprias imagens de produtos" ON storage.objects;

CREATE POLICY "Leitura pública de imagens de produtos"
ON storage.objects FOR SELECT
USING (bucket_id = 'produtos');

CREATE POLICY "Upload autenticado de imagens de produtos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'produtos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Remoção das próprias imagens de produtos"
ON storage.objects FOR DELETE
USING (bucket_id = 'produtos' AND (owner = auth.uid() OR public.is_admin()));

-- 10. RPC TRANSACIONAL: APAGAR CONTA COMPLETA (DADOS, ENCOMENDAS, FOTOS E REGISTOS)
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado.';
  END IF;

  -- A. Remover avaliações feitas pelo utilizador ou dos seus produtos
  DELETE FROM public.avaliacoes
  WHERE utilizador_id = v_user_id
     OR produto_id IN (SELECT id FROM public.produtos WHERE vendedor_id = v_user_id);

  -- B. Remover itens de encomendas do utilizador ou das suas lojas
  DELETE FROM public.itens_encomenda
  WHERE encomenda_id IN (
    SELECT id FROM public.encomendas
    WHERE utilizador_id = v_user_id
       OR loja_id IN (SELECT id FROM public.lojas WHERE dono_id = v_user_id)
  );

  -- C. Remover encomendas do utilizador ou associadas às suas lojas
  DELETE FROM public.encomendas
  WHERE utilizador_id = v_user_id
     OR loja_id IN (SELECT id FROM public.lojas WHERE dono_id = v_user_id);

  -- D. Remover mensagens enviadas e recebidas
  DELETE FROM public.mensagens WHERE remetente_id = v_user_id OR destinatario_id = v_user_id;

  -- E. Remover denúncias associadas
  DELETE FROM public.denuncias
  WHERE denunciante_id = v_user_id
     OR produto_id IN (SELECT id FROM public.produtos WHERE vendedor_id = v_user_id);

  -- F. Remover notificações do utilizador
  DELETE FROM public.notificacoes WHERE utilizador_id = v_user_id;

  -- G. Remover fotos no Supabase Storage pertencentes ao utilizador
  DELETE FROM storage.objects
  WHERE bucket_id = 'produtos' AND owner = v_user_id;

  -- H. Remover produtos vendidos pelo utilizador
  DELETE FROM public.produtos WHERE vendedor_id = v_user_id;

  -- I. Remover lojas pertencentes ao utilizador
  DELETE FROM public.lojas WHERE dono_id = v_user_id;

  -- J. Remover perfil público
  DELETE FROM public.perfis WHERE id = v_user_id;

  -- K. Remover conta de autenticação
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Conta, dados e ficheiros eliminados definitivamente.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage, auth;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
