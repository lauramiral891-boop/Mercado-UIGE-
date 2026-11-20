-- ==============================================================================
-- MERCADO UÍGE — UNICIDADE DE LOJA POR UTILIZADOR E IDEMPOTÊNCIA (20250111)
-- Impede criação de lojas duplicadas por toques repetidos ou fila offline:
--   1. Coluna e índice único client_mutation_id em public.lojas
--   2. Limpeza segura de eventuais lojas duplicadas por dono_id (reencaminha FKs)
--   3. Índice único em public.lojas(dono_id) -> 1 loja por utilizador
--   4. Trigger BEFORE INSERT/UPDATE com lock transaccional para código LJ-XXXX,
--      verificação idempotente de client_mutation_id e erro 23505 ("já existe")
--   5. Política RLS de INSERT em public.lojas alinhada
-- ==============================================================================

-- 1. Adicionar coluna client_mutation_id na tabela public.lojas
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS client_mutation_id TEXT;

-- 2. Deduplicar quaisquer lojas históricas repetidas pelo mesmo dono_id
--    Mantém a loja canónica (aprovada > VIP > mais antiga) e reencaminha todas as referências.
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  FOR v_dup IN
    WITH ranked AS (
      SELECT
        id,
        dono_id,
        FIRST_VALUE(id) OVER (
          PARTITION BY dono_id
          ORDER BY
            COALESCE(is_aprovada, FALSE) DESC,
            COALESCE(is_vip, FALSE) DESC,
            criado_em ASC,
            id ASC
        ) AS canonical_id,
        ROW_NUMBER() OVER (
          PARTITION BY dono_id
          ORDER BY
            COALESCE(is_aprovada, FALSE) DESC,
            COALESCE(is_vip, FALSE) DESC,
            criado_em ASC,
            id ASC
        ) AS rn
      FROM public.lojas
    )
    SELECT id AS dup_id, canonical_id
    FROM ranked
    WHERE rn > 1
  LOOP
    IF to_regclass('public.produtos') IS NOT NULL THEN
      UPDATE public.produtos SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.encomendas') IS NOT NULL THEN
      UPDATE public.encomendas SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.anuncios') IS NOT NULL THEN
      UPDATE public.anuncios SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.pagamentos_comerciantes') IS NOT NULL THEN
      UPDATE public.pagamentos_comerciantes SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.entregas') IS NOT NULL THEN
      UPDATE public.entregas SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.denuncias') IS NOT NULL THEN
      UPDATE public.denuncias SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.seguidores_loja') IS NOT NULL THEN
      DELETE FROM public.seguidores_loja s
      WHERE s.loja_id = v_dup.dup_id
        AND EXISTS (
          SELECT 1 FROM public.seguidores_loja c
          WHERE c.loja_id = v_dup.canonical_id
            AND c.utilizador_id = s.utilizador_id
        );
      UPDATE public.seguidores_loja SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    IF to_regclass('public.avaliacoes_loja') IS NOT NULL THEN
      DELETE FROM public.avaliacoes_loja a
      WHERE a.loja_id = v_dup.dup_id
        AND EXISTS (
          SELECT 1 FROM public.avaliacoes_loja c
          WHERE c.loja_id = v_dup.canonical_id
            AND c.utilizador_id = a.utilizador_id
        );
      UPDATE public.avaliacoes_loja SET loja_id = v_dup.canonical_id WHERE loja_id = v_dup.dup_id;
    END IF;

    DELETE FROM public.lojas WHERE id = v_dup.dup_id;
  END LOOP;
END;
$$;

-- 3. Limpar possíveis client_mutation_id vazios/duplicados antes do índice único
UPDATE public.lojas
SET client_mutation_id = NULL
WHERE client_mutation_id IS NOT NULL AND trim(client_mutation_id) = '';

WITH ranked_mut AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY client_mutation_id ORDER BY criado_em ASC, id ASC) AS rn
  FROM public.lojas
  WHERE client_mutation_id IS NOT NULL
)
UPDATE public.lojas l
SET client_mutation_id = NULL
FROM ranked_mut r
WHERE l.id = r.id AND r.rn > 1;

-- 4. Índices únicos definitivos na tabela public.lojas
CREATE UNIQUE INDEX IF NOT EXISTS uq_lojas_dono_id
  ON public.lojas (dono_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lojas_client_mutation_id
  ON public.lojas (client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

-- 5. Recalcular contadores das lojas após eventual fusão
DO $$
BEGIN
  IF to_regclass('public.seguidores_loja') IS NOT NULL AND to_regclass('public.avaliacoes_loja') IS NOT NULL THEN
    UPDATE public.lojas l
    SET
      seguidores_count = (SELECT COUNT(*) FROM public.seguidores_loja sl WHERE sl.loja_id = l.id),
      classificacao = COALESCE((SELECT ROUND(AVG(al.estrelas)::NUMERIC, 1) FROM public.avaliacoes_loja al WHERE al.loja_id = l.id), 0),
      total_avaliacoes = (SELECT COUNT(*) FROM public.avaliacoes_loja al WHERE al.loja_id = l.id);
  END IF;
END;
$$;

-- 6. Actualizar trigger de protecção de lojas:
--    - Bloqueio concorrente na geração de código LJ-XXXX
--    - Erro explícito ERRCODE 23505 ("já existe") para client_mutation_id ou dono_id repetido
--    - Preserva todas as regras de segurança existentes (20250105 e 20250110)
CREATE OR REPLACE FUNCTION public.proteger_e_gerar_codigo_loja()
RETURNS TRIGGER AS $$
DECLARE
  v_is_system BOOLEAN;
  v_next_num INT;
BEGIN
  v_is_system := (COALESCE(current_setting('app.system_mutation', true), '') = 'on');

  IF TG_OP = 'INSERT' THEN
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
      IF NEW.dono_id IS DISTINCT FROM OLD.dono_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Operação não autorizada: não é possível transferir a titularidade da loja.';
      END IF;

      IF NEW.client_mutation_id IS DISTINCT FROM OLD.client_mutation_id AND NOT public.is_super_admin() THEN
        NEW.client_mutation_id := OLD.client_mutation_id;
      END IF;

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

DROP TRIGGER IF EXISTS trg_proteger_loja ON public.lojas;
CREATE TRIGGER trg_proteger_loja
BEFORE INSERT OR UPDATE ON public.lojas
FOR EACH ROW EXECUTE FUNCTION public.proteger_e_gerar_codigo_loja();

-- 7. Política RLS de criação de loja: apenas o próprio utilizador autenticado e no máximo 1 loja por conta
DROP POLICY IF EXISTS "Comerciante pode criar a sua loja" ON public.lojas;
DROP POLICY IF EXISTS "Comerciante cria a sua loja" ON public.lojas;

CREATE POLICY "Comerciante cria a sua loja"
ON public.lojas FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth.uid() = dono_id
  AND NOT EXISTS (
    SELECT 1 FROM public.lojas l WHERE l.dono_id = auth.uid()
  )
);
