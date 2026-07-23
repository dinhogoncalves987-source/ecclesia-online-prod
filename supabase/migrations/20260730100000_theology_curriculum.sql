-- ============================================================================
-- Migration: theology_curriculum
-- Timestamp: 20260730100000
-- OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Matriz curricular: liga programas (theology_programs) a matérias
-- (theology_subjects) em sequência ordenada, com obrigatoriedade. Uma matéria
-- pode compor a matriz de vários programas — nenhuma duplicação de matéria
-- por programa.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.theology_programs') IS NULL THEN
    RAISE EXCEPTION 'theology_curriculum preflight failed: theology_programs nao existe (aplique 20260730090000 primeiro)';
  END IF;
  IF to_regclass('public.theology_subjects') IS NULL THEN
    RAISE EXCEPTION 'theology_curriculum preflight failed: theology_subjects nao existe';
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'theology_curriculum preflight failed: is_organization_descendant_or_self() nao existe';
  END IF;
END;
$$;

-- ── theology_curriculum_items (matriz curricular) ────────────────────────
CREATE TABLE IF NOT EXISTS public.theology_curriculum_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.theology_programs(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.theology_subjects(id) ON DELETE RESTRICT,

  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  is_mandatory boolean NOT NULL DEFAULT true,
  workload_hours_override numeric(6,1) CHECK (workload_hours_override IS NULL OR workload_hours_override >= 0),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma matéria não repete sequência dentro do mesmo programa, e não compõe
-- a matriz do mesmo programa duas vezes (uma tentativa de "segunda versão"
-- deve inativar a linha antiga e criar uma nova sequência, preservando
-- histórico de quem já cursou a versão anterior via theology_offering_enrollments).
CREATE UNIQUE INDEX IF NOT EXISTS theology_curriculum_items_program_sequence_idx
  ON public.theology_curriculum_items (program_id, sequence_number);

CREATE UNIQUE INDEX IF NOT EXISTS theology_curriculum_items_program_subject_idx
  ON public.theology_curriculum_items (program_id, subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS theology_curriculum_items_legacy_unique_idx
  ON public.theology_curriculum_items (program_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_curriculum_items_updated_at ON public.theology_curriculum_items;
CREATE TRIGGER update_theology_curriculum_items_updated_at
BEFORE UPDATE ON public.theology_curriculum_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A organização efetiva de um item da matriz é a do programa. A matéria
-- referenciada deve pertencer à mesma árvore organizacional do programa —
-- nunca uma matéria de outro tenant/denominação.
CREATE OR REPLACE FUNCTION public._theology_curriculum_items_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_program_org uuid;
  v_subject_org uuid;
BEGIN
  SELECT organization_id INTO v_program_org FROM public.theology_programs WHERE id = NEW.program_id;
  IF v_program_org IS NULL THEN
    RAISE EXCEPTION 'program not found';
  END IF;

  SELECT organization_id INTO v_subject_org FROM public.theology_subjects WHERE id = NEW.subject_id;
  IF v_subject_org IS NULL THEN
    RAISE EXCEPTION 'subject not found';
  END IF;

  IF NOT public.is_organization_descendant_or_self(v_program_org, v_subject_org)
     AND NOT public.is_organization_descendant_or_self(v_subject_org, v_program_org) THEN
    RAISE EXCEPTION 'curriculum item subject must belong to the program organization tree';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_curriculum_items_validate_scope ON public.theology_curriculum_items;
CREATE TRIGGER theology_curriculum_items_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_curriculum_items
FOR EACH ROW EXECUTE FUNCTION public._theology_curriculum_items_validate_scope();

REVOKE ALL ON FUNCTION public._theology_curriculum_items_validate_scope()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_curriculum_items ENABLE ROW LEVEL SECURITY;

-- Organização resolvida via JOIN ao programa — nunca duplicada como coluna
-- local (evita segunda fonte de verdade).
DROP POLICY IF EXISTS "theology_curriculum_items capability select" ON public.theology_curriculum_items;
CREATE POLICY "theology_curriculum_items capability select" ON public.theology_curriculum_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_programs p
    WHERE p.id = theology_curriculum_items.program_id
      AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.read')
  )
);

DROP POLICY IF EXISTS "theology_curriculum_items capability insert" ON public.theology_curriculum_items;
CREATE POLICY "theology_curriculum_items capability insert" ON public.theology_curriculum_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_programs p
    WHERE p.id = theology_curriculum_items.program_id
      AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.manage')
  )
);

DROP POLICY IF EXISTS "theology_curriculum_items capability update" ON public.theology_curriculum_items;
CREATE POLICY "theology_curriculum_items capability update" ON public.theology_curriculum_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_programs p
    WHERE p.id = theology_curriculum_items.program_id
      AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_programs p
    WHERE p.id = theology_curriculum_items.program_id
      AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.manage')
  )
);

DROP POLICY IF EXISTS "theology_curriculum_items capability delete" ON public.theology_curriculum_items;
CREATE POLICY "theology_curriculum_items capability delete" ON public.theology_curriculum_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_programs p
    WHERE p.id = theology_curriculum_items.program_id
      AND public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.manage')
  )
);

-- RPC dedicada para reordenar a matriz sem colisão transitória do índice
-- único de sequência — mesmo padrão de reorder_discipleship_lessons().
CREATE OR REPLACE FUNCTION public.reorder_theology_curriculum_items(
  p_program_id uuid,
  p_item_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_count integer;
  v_unique_count integer;
  v_offset integer;
  v_id uuid;
  v_seq integer := 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.theology_programs WHERE id = p_program_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'program not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to reorder curriculum items';
  END IF;

  IF p_item_ids IS NULL OR array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'curriculum item id list is required and cannot contain null values';
  END IF;

  SELECT count(DISTINCT item_id) INTO v_unique_count
  FROM unnest(p_item_ids) AS ids(item_id);

  IF v_unique_count <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'curriculum item id list cannot contain duplicates';
  END IF;

  -- Serializa reordenações concorrentes da mesma matriz.
  PERFORM 1 FROM public.theology_curriculum_items WHERE program_id = p_program_id FOR UPDATE;

  SELECT count(*), COALESCE(max(sequence_number), 0) + count(*) + 1
    INTO v_count, v_offset
  FROM public.theology_curriculum_items
  WHERE program_id = p_program_id;

  IF v_count <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'curriculum item id list does not match program items (expected %, received %)', v_count, cardinality(p_item_ids);
  END IF;

  UPDATE public.theology_curriculum_items
  SET sequence_number = sequence_number + v_offset
  WHERE program_id = p_program_id;

  FOREACH v_id IN ARRAY p_item_ids LOOP
    UPDATE public.theology_curriculum_items
    SET sequence_number = v_seq
    WHERE id = v_id AND program_id = p_program_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'curriculum item % does not belong to program %', v_id, p_program_id;
    END IF;
    v_seq := v_seq + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_theology_curriculum_items(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_theology_curriculum_items(uuid, uuid[]) TO authenticated;

-- ── Ativação de programa exige matriz curricular ─────────────────────────
-- Trigger SEPARADO do de escopo (criado na migration anterior) — evita
-- reabrir 20260730090000_theology_foundation.sql. Um programa só pode ser
-- ativado depois de possuir ao menos uma matéria ativa na matriz.
CREATE OR REPLACE FUNCTION public._theology_programs_validate_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'ativo'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT EXISTS (
       SELECT 1 FROM public.theology_curriculum_items ci
       WHERE ci.program_id = NEW.id AND ci.status = 'ativo'
     ) THEN
    RAISE EXCEPTION 'program must have at least one active curriculum item before activation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_programs_validate_activation ON public.theology_programs;
CREATE TRIGGER theology_programs_validate_activation
BEFORE UPDATE ON public.theology_programs
FOR EACH ROW EXECUTE FUNCTION public._theology_programs_validate_activation();

REVOKE ALL ON FUNCTION public._theology_programs_validate_activation()
  FROM PUBLIC, anon, authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_curriculum_items') THEN
    RAISE EXCEPTION 'Migration theology_curriculum: tabela theology_curriculum_items nao foi criada';
  END IF;
  IF to_regprocedure('public.reorder_theology_curriculum_items(uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Migration theology_curriculum: RPC reorder_theology_curriculum_items nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'theology_programs_validate_activation') THEN
    RAISE EXCEPTION 'Migration theology_curriculum: trigger de ativacao de programa nao foi criado';
  END IF;
  RAISE NOTICE 'Migration theology_curriculum: tabela, policies, RPC e trigger de ativacao confirmados ✓';
END $$;

COMMIT;
