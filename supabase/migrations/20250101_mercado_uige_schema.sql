-- ==============================================================================
-- MERCADO UÍGE — SCHEMA DE BASE DE DADOS POSTGRESQL (SUPABASE - CUSTO ZERO)
-- Arquitectura sem Cloud Functions pagas: Apenas Triggers SQL, RLS e Índices.
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. TABELA DE PERFIS (Sincronizada automaticamente com auth.users)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    papel TEXT NOT NULL DEFAULT 'cliente' CHECK (papel IN ('cliente', 'comerciante', 'entregador', 'admin')),
    provincia TEXT DEFAULT 'Uíge',
    municipio TEXT DEFAULT 'Uíge',
    bairro TEXT,
    avatar_url TEXT,
    suspenso BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    actualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 3. TABELA DE LOJAS
CREATE TABLE IF NOT EXISTS public.lojas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dono_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'Geral',
    provincia TEXT DEFAULT 'Uíge',
    municipio TEXT DEFAULT 'Uíge',
    bairro TEXT,
    logo_url TEXT,
    capa_url TEXT,
    is_aprovada BOOLEAN DEFAULT TRUE,
    is_vip BOOLEAN DEFAULT FALSE,
    classificacao NUMERIC(3, 1) DEFAULT 5.0,
    telefone TEXT,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 4. TABELA DE PRODUTOS
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loja_id UUID REFERENCES public.lojas(id) ON DELETE CASCADE,
    vendedor_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL,
    preco NUMERIC(12, 2) NOT NULL CHECK (preco > 0),
    preco_antigo NUMERIC(12, 2),
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    categoria TEXT NOT NULL DEFAULT 'Electrónicos',
    marca TEXT DEFAULT 'Oficial',
    condicao TEXT DEFAULT 'novo' CHECK (condicao IN ('novo', 'usado')),
    imagem_url TEXT NOT NULL,
    imagens TEXT[] DEFAULT ARRAY[]::TEXT[],
    provincia TEXT DEFAULT 'Uíge',
    municipio TEXT DEFAULT 'Uíge',
    bairro TEXT,
    is_aprovado BOOLEAN DEFAULT TRUE,
    is_destaque BOOLEAN DEFAULT FALSE,
    vendas INT DEFAULT 0,
    classificacao NUMERIC(3, 1) DEFAULT 5.0,
    total_avaliacoes INT DEFAULT 0,
    variantes TEXT[] DEFAULT ARRAY[]::TEXT[],
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    actualizado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 5. TABELA DE ENCOMENDAS
CREATE TABLE IF NOT EXISTS public.encomendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo TEXT NOT NULL UNIQUE,
    utilizador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    loja_id UUID REFERENCES public.lojas(id),
    estado TEXT NOT NULL DEFAULT 'Pendente' CHECK (estado IN ('Pendente', 'Confirmada', 'Em preparação', 'Pronta para levantamento', 'Em entrega', 'Entregue', 'Cancelada')),
    subtotal NUMERIC(12, 2) NOT NULL,
    taxa_entrega NUMERIC(12, 2) DEFAULT 1500,
    total NUMERIC(12, 2) NOT NULL,
    endereco_entrega TEXT NOT NULL,
    metodo_pagamento TEXT NOT NULL DEFAULT 'Multicaixa Express',
    notas TEXT,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 6. TABELA DE ITENS DA ENCOMENDA
CREATE TABLE IF NOT EXISTS public.itens_encomenda (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    encomenda_id UUID NOT NULL REFERENCES public.encomendas(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
    nome_produto TEXT NOT NULL,
    imagem_produto TEXT,
    quantidade INT NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(12, 2) NOT NULL,
    variante TEXT
);

-- 7. TABELA DE MENSAGENS (Chat vendedor-comprador)
CREATE TABLE IF NOT EXISTS public.mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remetente_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    destinatario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
    mensagem TEXT NOT NULL,
    lida BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 8. TABELA DE AVALIAÇÕES
CREATE TABLE IF NOT EXISTS public.avaliacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilizador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    estrelas INT NOT NULL CHECK (estrelas >= 1 AND estrelas <= 5),
    comentario TEXT,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(utilizador_id, produto_id)
);

-- 9. TABELA DE DENÚNCIAS (Moderação na Google Play)
CREATE TABLE IF NOT EXISTS public.denuncias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    denunciante_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE,
    motivo TEXT NOT NULL,
    estado TEXT DEFAULT 'pendente' CHECK (estado IN ('pendente', 'resolvido', 'rejeitado')),
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 10. TABELA DE NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS public.notificacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilizador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    tipo TEXT DEFAULT 'info',
    lida BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 11. TABELA DE AVISOS PROVINCIAIS (BROADCAST)
CREATE TABLE IF NOT EXISTS public.avisos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo TEXT NOT NULL,
    corpo TEXT NOT NULL,
    autor_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 12. TABELA DE AUDITORIA (Exclusiva para acções do Painel Admin)
CREATE TABLE IF NOT EXISTS public.auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,
    alvo TEXT,
    detalhes JSONB,
    ip TEXT,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) — ACTIVADO EM TODAS AS TABELAS
-- ==============================================================================

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encomendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_encomenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: PERFIS
CREATE POLICY "Leitura de perfis públicos ou próprios" ON public.perfis
    FOR SELECT USING (true);

CREATE POLICY "Utilizador pode actualizar o seu próprio perfil" ON public.perfis
    FOR UPDATE USING (auth.uid() = id);

-- POLÍTICAS: LOJAS
CREATE POLICY "Lojas aprovadas são visíveis publicamente" ON public.lojas
    FOR SELECT USING (is_aprovada = true OR auth.uid() = dono_id OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

CREATE POLICY "Comerciante pode criar a sua loja" ON public.lojas
    FOR INSERT WITH CHECK (auth.uid() = dono_id);

CREATE POLICY "Dono ou Admin pode actualizar loja" ON public.lojas
    FOR UPDATE USING (auth.uid() = dono_id OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

-- POLÍTICAS: PRODUTOS
CREATE POLICY "Produtos aprovados são visíveis para todos" ON public.produtos
    FOR SELECT USING (is_aprovado = true OR auth.uid() = vendedor_id OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

CREATE POLICY "Comerciante ou Admin pode publicar produtos" ON public.produtos
    FOR INSERT WITH CHECK (auth.uid() = vendedor_id AND EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel IN ('comerciante', 'admin')));

CREATE POLICY "Vendedor ou Admin pode actualizar produtos" ON public.produtos
    FOR UPDATE USING (auth.uid() = vendedor_id OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

CREATE POLICY "Vendedor ou Admin pode eliminar produtos" ON public.produtos
    FOR DELETE USING (auth.uid() = vendedor_id OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

-- POLÍTICAS: ENCOMENDAS
CREATE POLICY "Utilizador ou vendedor vê as suas encomendas" ON public.encomendas
    FOR SELECT USING (auth.uid() = utilizador_id OR EXISTS (SELECT 1 FROM public.lojas WHERE id = public.encomendas.loja_id AND dono_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

CREATE POLICY "Utilizador autenticado pode criar encomenda" ON public.encomendas
    FOR INSERT WITH CHECK (auth.uid() = utilizador_id);

CREATE POLICY "Vendedor ou Admin pode actualizar estado da encomenda" ON public.encomendas
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.lojas WHERE id = public.encomendas.loja_id AND dono_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

-- POLÍTICAS: ITENS DE ENCOMENDA
CREATE POLICY "Leitura de itens de encomendas autorizadas" ON public.itens_encomenda
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.encomendas WHERE id = public.itens_encomenda.encomenda_id AND (utilizador_id = auth.uid() OR EXISTS (SELECT 1 FROM public.lojas WHERE id = public.encomendas.loja_id AND dono_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'))));

CREATE POLICY "Inserção de itens da encomenda na criação" ON public.itens_encomenda
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.encomendas WHERE id = public.itens_encomenda.encomenda_id AND utilizador_id = auth.uid()));

-- POLÍTICAS: MENSAGENS
CREATE POLICY "Leitura de mensagens do remetente ou destinatário" ON public.mensagens
    FOR SELECT USING (auth.uid() = remetente_id OR auth.uid() = destinatario_id);

CREATE POLICY "Envio de mensagem pelo utilizador autenticado" ON public.mensagens
    FOR INSERT WITH CHECK (auth.uid() = remetente_id);

-- POLÍTICAS: DENÚNCIAS
CREATE POLICY "Qualquer utilizador autenticado pode denunciar" ON public.denuncias
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Apenas admin pode ver e gerir denúncias" ON public.denuncias
    FOR ALL USING (EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

-- POLÍTICAS: NOTIFICAÇÕES
CREATE POLICY "Utilizador acede apenas às suas notificações" ON public.notificacoes
    FOR ALL USING (auth.uid() = utilizador_id);

-- POLÍTICAS: AVISOS
CREATE POLICY "Avisos públicos visíveis a todos" ON public.avisos
    FOR SELECT USING (true);

CREATE POLICY "Apenas admin pode publicar avisos" ON public.avisos
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

-- POLÍTICAS: AUDITORIA
CREATE POLICY "Apenas admin pode ler ou escrever no log de auditoria" ON public.auditoria
    FOR ALL USING (EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND papel = 'admin'));

-- ==============================================================================
-- TRIGGERS SQL GRATUITOS (Zero Cloud Functions)
-- ==============================================================================

-- 1. Trigger para criar perfil automaticamente no registo via auth.users
CREATE OR REPLACE FUNCTION public.gerir_novo_utilizador()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfis (id, nome, email, papel, municipio)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'papel', 'cliente'),
        COALESCE(NEW.raw_user_meta_data->>'municipio', 'Uíge')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.gerir_novo_utilizador();

-- 2. Trigger para deduzir stock ao criar itens de encomenda
CREATE OR REPLACE FUNCTION public.deduzir_stock_produto()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.produtos
    SET stock = stock - NEW.quantidade,
        vendas = vendas + NEW.quantidade
    WHERE id = NEW.produto_id AND stock >= NEW.quantidade;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock insuficiente para o artigo solicitado no Mercado Uíge.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_item_created ON public.itens_encomenda;
CREATE TRIGGER on_order_item_created
    AFTER INSERT ON public.itens_encomenda
    FOR EACH ROW EXECUTE FUNCTION public.deduzir_stock_produto();

-- ==============================================================================
-- SCRIPT DE DEFINIÇÃO DO ADMINISTRADOR INICIAL (tvvibeoficial@gmail.com)
-- Correr este comando no SQL Editor do Supabase após o primeiro login:
-- ==============================================================================
-- UPDATE public.perfis 
-- SET papel = 'admin' 
-- WHERE email = 'tvvibeoficial@gmail.com';
