-- ============================================================================
-- Migration: theology_periods_classes_enrollments
-- Timestamp: 20260730110000
-- OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Períodos letivos, turmas, ofertas de unidade por turma (ligadas à matriz
-- curricular do programa), equipe acadêmica, matrícula do aluno na turma e
-- matrícula do aluno em cada unidade/oferta (com suporte a repetência/nova
-- tentativa via attempt_number). Nenhuma pessoa é criada aqui — member_id
-- sempre referencia public.members.
--
-- NOTA DE DEPENDÊNCIA INTENCIONAL (mesmo padrão documentado na Operação 2):
-- update_theology_class_status()/update_theology_offering_enrollment_status()
-- consultam public.theology_sessions/theology_attendance/
-- theology_assessment_results, criadas na migration seguinte
-- (20260730120000_theology_attendance_and_assessments.sql). Isso é seguro: o
-- corpo de uma função PL/pgSQL só é validado contra a existência de tabelas
-- na primeira execução, e todas as migrations desta operação são aplicadas em
-- sequência antes de qualquer uso real.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.theology_programs') IS NULL THEN
    RAISE EXCEPTION 'theology_periods_classes_enrollments preflight failed: theology_programs nao existe';
  END IF;
  IF to_regclass('public.theology_curriculum_items') IS NULL THEN
    RAISE EXCEPTION 'theology_periods_classes_enrollments preflight failed: theology_curriculum_items nao existe (aplique 20260730100000 primeiro)';
  END IF;
  IF to_regclass('public.theology_study_centers') IS NULL THEN
    RAISE EXCEPTION 'theology_periods_classes_enrollments preflight failed: theology_study_centers nao existe';
  END IF;
END;
$$;

-- ── theology_periods (Períodos letivos) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.theology_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  institute_id uuid REFERENCES public.theology_institutes(id) ON DELETE SET NULL,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'planejamento' CHECK (status IN (
    'planejamento', 'inscricoes_abertas', 'em_andamento', 'encerrado', 'cancelado', 'arquivado'
  )),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_theology_periods_org_status
  ON public.theology_periods (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS theology_periods_org_code_idx
  ON public.theology_periods (organization_id, lower(btrim(code)))
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS theology_periods_legacy_unique_idx
  ON public.theology_periods (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_periods_updated_at ON public.theology_periods;
CREATE TRIGGER update_theology_periods_updated_at
BEFORE UPDATE ON public.theology_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._theology_periods_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_institute_org uuid;
BEGIN
  IF NEW.institute_id IS NOT NULL THEN
    SELECT organization_id INTO v_institute_org
    FROM public.theology_institutes
    WHERE id = NEW.institute_id;

    IF v_institute_org IS NULL
       OR NOT public.is_organization_descendant_or_self(v_institute_org, NEW.organization_id) THEN
      RAISE EXCEPTION 'period institute must belong to the period organization tree';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_periods_validate_scope ON public.theology_periods;
CREATE TRIGGER theology_periods_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_periods
FOR EACH ROW EXECUTE FUNCTION public._theology_periods_validate_scope();

REVOKE ALL ON FUNCTION public._theology_periods_validate_scope()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_periods capability select" ON public.theology_periods;
CREATE POLICY "theology_periods capability select" ON public.theology_periods
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_periods capability insert" ON public.theology_periods;
CREATE POLICY "theology_periods capability insert" ON public.theology_periods
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- status é máquina de estados — alterado só por RPC. Sem policy de DELETE:
-- período é histórico institucional.
DROP POLICY IF EXISTS "theology_periods capability update" ON public.theology_periods;
CREATE POLICY "theology_periods capability update" ON public.theology_periods
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

REVOKE UPDATE ON public.theology_periods FROM authenticated;
GRANT UPDATE (institute_id, code, name, start_date, end_date, notes) ON public.theology_periods TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_period_status(
  p_period_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_periods%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to update period status';
  END IF;

  IF NOT (
    (v_row.status = 'planejamento' AND p_status IN ('inscricoes_abertas', 'cancelado'))
    OR (v_row.status = 'inscricoes_abertas' AND p_status IN ('em_andamento', 'cancelado'))
    OR (v_row.status = 'em_andamento' AND p_status IN ('encerrado', 'cancelado'))
    OR (v_row.status IN ('encerrado', 'cancelado') AND p_status = 'arquivado')
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid period status transition: % -> %', v_row.status, p_status;
  END IF;

  IF p_status = 'encerrado' AND EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.period_id = p_period_id AND c.status IN ('planejamento', 'inscricoes_abertas', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'period cannot be closed while classes are still open or in progress';
  END IF;

  UPDATE public.theology_periods SET status = p_status WHERE id = p_period_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_period_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_period_status(uuid, text) TO authenticated;

-- ── theology_classes (turmas/coortes de um programa dentro de um período) ─
CREATE TABLE IF NOT EXISTS public.theology_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.theology_periods(id) ON DELETE RESTRICT,
  program_id uuid NOT NULL REFERENCES public.theology_programs(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  study_center_id uuid REFERENCES public.theology_study_centers(id) ON DELETE RESTRICT,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  modality text NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial', 'online', 'hibrida')),

  status text NOT NULL DEFAULT 'planejamento' CHECK (status IN (
    'planejamento', 'inscricoes_abertas', 'em_andamento', 'concluida', 'cancelada', 'arquivada'
  )),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theology_classes_org_status
  ON public.theology_classes (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_theology_classes_period
  ON public.theology_classes (period_id, status);
CREATE INDEX IF NOT EXISTS idx_theology_classes_program
  ON public.theology_classes (program_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS theology_classes_org_code_idx
  ON public.theology_classes (organization_id, lower(btrim(code)))
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS theology_classes_legacy_unique_idx
  ON public.theology_classes (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_classes_updated_at ON public.theology_classes;
CREATE TRIGGER update_theology_classes_updated_at
BEFORE UPDATE ON public.theology_classes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A turma deve pertencer à MESMA árvore organizacional do programa e do
-- período (pode ser a própria organização do programa ou uma descendente) —
-- nunca uma organização de outra denominação/convenção.
CREATE OR REPLACE FUNCTION public._theology_classes_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_program_org uuid;
  v_program_status text;
  v_period_org uuid;
  v_period_status text;
  v_center_org uuid;
BEGIN
  SELECT organization_id, status INTO v_program_org, v_program_status
  FROM public.theology_programs
  WHERE id = NEW.program_id;
  IF v_program_org IS NULL THEN RAISE EXCEPTION 'program not found'; END IF;
  IF v_program_status <> 'ativo' THEN
    RAISE EXCEPTION 'classes can only use an active program';
  END IF;

  SELECT organization_id, status INTO v_period_org, v_period_status
  FROM public.theology_periods WHERE id = NEW.period_id;
  IF v_period_org IS NULL THEN RAISE EXCEPTION 'period not found'; END IF;

  IF NOT public.is_organization_descendant_or_self(v_program_org, NEW.organization_id) THEN
    RAISE EXCEPTION 'class organization must be the program organization or one of its descendants';
  END IF;

  IF NOT public.is_organization_descendant_or_self(v_period_org, NEW.organization_id) THEN
    RAISE EXCEPTION 'class organization must be inside the period organization scope';
  END IF;

  IF TG_OP = 'INSERT' AND v_period_status IN ('encerrado', 'cancelado', 'arquivado') THEN
    RAISE EXCEPTION 'cannot create a class in a closed period';
  END IF;

  IF NEW.study_center_id IS NOT NULL THEN
    SELECT organization_id INTO v_center_org FROM public.theology_study_centers WHERE id = NEW.study_center_id;
    IF v_center_org IS NULL OR NOT public.is_organization_descendant_or_self(v_center_org, NEW.organization_id) THEN
      RAISE EXCEPTION 'class study center must belong to the class organization tree';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_classes_validate_scope ON public.theology_classes;
CREATE TRIGGER theology_classes_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_classes
FOR EACH ROW EXECUTE FUNCTION public._theology_classes_validate_scope();

REVOKE ALL ON FUNCTION public._theology_classes_validate_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_classes capability select" ON public.theology_classes;
CREATE POLICY "theology_classes capability select" ON public.theology_classes
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_classes capability insert" ON public.theology_classes;
CREATE POLICY "theology_classes capability insert" ON public.theology_classes
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- status é máquina de estados alterada só por RPC. Sem policy de DELETE:
-- turma é histórico institucional (cancelada/arquivada via status).
DROP POLICY IF EXISTS "theology_classes capability update" ON public.theology_classes;
CREATE POLICY "theology_classes capability update" ON public.theology_classes
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

REVOKE UPDATE ON public.theology_classes FROM authenticated;
GRANT UPDATE (
  study_center_id, code, name, short_name, capacity, modality, notes
) ON public.theology_classes TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_class_status(
  p_class_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_classes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to update class status';
  END IF;

  IF NOT (
    (v_row.status = 'planejamento' AND p_status IN ('inscricoes_abertas', 'cancelada'))
    OR (v_row.status = 'inscricoes_abertas' AND p_status IN ('em_andamento', 'cancelada'))
    OR (v_row.status = 'em_andamento' AND p_status IN ('concluida', 'cancelada'))
    OR (v_row.status IN ('concluida', 'cancelada') AND p_status = 'em_andamento') -- reabertura controlada
    OR (v_row.status IN ('concluida', 'cancelada') AND p_status = 'arquivada')
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid class status transition: % -> %', v_row.status, p_status;
  END IF;

  IF p_status = 'concluida' THEN
    IF EXISTS (
      SELECT 1 FROM public.theology_enrollments e
      WHERE e.class_id = p_class_id AND e.status IN ('pendente', 'matriculado', 'ativo')
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while enrollments are still open';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.theology_class_offerings o
      WHERE o.class_id = p_class_id AND o.status IN ('planejada', 'em_andamento')
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while unit offerings are still open';
    END IF;

    -- Aulas agendadas/avaliações planejadas pendentes (tabelas criadas na
    -- migration seguinte) também bloqueiam a conclusão — ver nota de
    -- dependência intencional no cabeçalho.
    IF to_regclass('public.theology_sessions') IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.theology_sessions s
      JOIN public.theology_class_offerings o ON o.id = s.offering_id
      WHERE o.class_id = p_class_id AND s.status = 'agendada'
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while sessions are still scheduled';
    END IF;

    IF to_regclass('public.theology_assessments') IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.theology_assessments a
      JOIN public.theology_class_offerings o ON o.id = a.offering_id
      WHERE o.class_id = p_class_id
        AND a.status IN ('rascunho', 'agendada', 'aplicada')
    ) THEN
      RAISE EXCEPTION 'class cannot be concluded while assessments are still pending';
    END IF;
  END IF;

  UPDATE public.theology_classes SET status = p_status WHERE id = p_class_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_class_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_class_status(uuid, text) TO authenticated;

-- ── theology_class_offerings (oferta de uma unidade curricular na turma) ──
CREATE TABLE IF NOT EXISTS public.theology_class_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.theology_classes(id) ON DELETE RESTRICT,
  curriculum_item_id uuid NOT NULL REFERENCES public.theology_curriculum_items(id) ON DELETE RESTRICT,

  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS theology_class_offerings_class_item_idx
  ON public.theology_class_offerings (class_id, curriculum_item_id);

CREATE INDEX IF NOT EXISTS idx_theology_class_offerings_class
  ON public.theology_class_offerings (class_id, status);

DROP TRIGGER IF EXISTS update_theology_class_offerings_updated_at ON public.theology_class_offerings;
CREATE TRIGGER update_theology_class_offerings_updated_at
BEFORE UPDATE ON public.theology_class_offerings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A matéria ofertada deve pertencer à matriz curricular do PROGRAMA da
-- turma — nunca uma matéria de outro programa.
CREATE OR REPLACE FUNCTION public._theology_class_offerings_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_program uuid;
  v_class_status text;
  v_item_program uuid;
BEGIN
  SELECT program_id, status INTO v_class_program, v_class_status
  FROM public.theology_classes WHERE id = NEW.class_id;
  IF v_class_program IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF v_class_status IN ('concluida', 'cancelada', 'arquivada') THEN
    RAISE EXCEPTION 'class is closed and does not accept offering changes';
  END IF;

  SELECT program_id INTO v_item_program FROM public.theology_curriculum_items WHERE id = NEW.curriculum_item_id;
  IF v_item_program IS DISTINCT FROM v_class_program THEN
    RAISE EXCEPTION 'offering curriculum item must belong to the class program';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_class_offerings_validate_scope ON public.theology_class_offerings;
CREATE TRIGGER theology_class_offerings_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_class_offerings
FOR EACH ROW EXECUTE FUNCTION public._theology_class_offerings_validate_scope();

REVOKE ALL ON FUNCTION public._theology_class_offerings_validate_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_class_offerings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_class_offerings capability select" ON public.theology_class_offerings;
CREATE POLICY "theology_class_offerings capability select" ON public.theology_class_offerings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.id = theology_class_offerings.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

DROP POLICY IF EXISTS "theology_class_offerings capability insert" ON public.theology_class_offerings;
CREATE POLICY "theology_class_offerings capability insert" ON public.theology_class_offerings
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.id = theology_class_offerings.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.manage')
  )
);

DROP POLICY IF EXISTS "theology_class_offerings capability update" ON public.theology_class_offerings;
CREATE POLICY "theology_class_offerings capability update" ON public.theology_class_offerings
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.id = theology_class_offerings.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.id = theology_class_offerings.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.manage')
  )
);

REVOKE UPDATE ON public.theology_class_offerings FROM authenticated;
GRANT UPDATE (capacity, notes) ON public.theology_class_offerings TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_class_offering_status(
  p_offering_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_class_offerings%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_class_offerings WHERE id = p_offering_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offering not found'; END IF;

  SELECT organization_id INTO v_org_id FROM public.theology_classes WHERE id = v_row.class_id;
  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to update offering status';
  END IF;

  IF NOT (
    (v_row.status = 'planejada' AND p_status IN ('em_andamento', 'cancelada'))
    OR (v_row.status = 'em_andamento' AND p_status IN ('concluida', 'cancelada'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid offering status transition: % -> %', v_row.status, p_status;
  END IF;

  IF p_status = 'concluida' AND EXISTS (
    SELECT 1 FROM public.theology_offering_enrollments oe
    WHERE oe.offering_id = p_offering_id AND oe.status IN ('planejada', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'offering cannot be concluded while student attempts are still open';
  END IF;

  IF p_status = 'concluida'
     AND to_regclass('public.theology_sessions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.theology_sessions
       WHERE offering_id = p_offering_id AND status = 'agendada'
     ) THEN
    RAISE EXCEPTION 'offering cannot be concluded while sessions are still scheduled';
  END IF;

  IF p_status = 'concluida'
     AND to_regclass('public.theology_assessments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.theology_assessments
       WHERE offering_id = p_offering_id
         AND status IN ('rascunho', 'agendada', 'aplicada')
     ) THEN
    RAISE EXCEPTION 'offering cannot be concluded while assessments are still pending';
  END IF;

  UPDATE public.theology_class_offerings SET status = p_status WHERE id = p_offering_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_class_offering_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_class_offering_status(uuid, text) TO authenticated;

-- ── theology_staff_assignments (equipe acadêmica) ────────────────────────
-- offering_id NULL = atribuição no nível da turma (coordenador/secretário);
-- offering_id preenchido = professor atribuído a uma unidade específica.
CREATE TABLE IF NOT EXISTS public.theology_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.theology_classes(id) ON DELETE RESTRICT,
  offering_id uuid REFERENCES public.theology_class_offerings(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,

  role text NOT NULL CHECK (role IN ('coordenador', 'secretario', 'professor', 'auxiliar')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Sem duplicidade de atribuição ativa idêntica (mesma turma/oferta/papel).
CREATE UNIQUE INDEX IF NOT EXISTS theology_staff_unique_active_idx
  ON public.theology_staff_assignments (
    class_id, COALESCE(offering_id, '00000000-0000-0000-0000-000000000000'::uuid), member_id, role
  )
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_theology_staff_member
  ON public.theology_staff_assignments (member_id, status);
CREATE INDEX IF NOT EXISTS idx_theology_staff_offering
  ON public.theology_staff_assignments (offering_id, status);

DROP TRIGGER IF EXISTS update_theology_staff_assignments_updated_at ON public.theology_staff_assignments;
CREATE TRIGGER update_theology_staff_assignments_updated_at
BEFORE UPDATE ON public.theology_staff_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.theology_staff_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_staff capability select" ON public.theology_staff_assignments;
CREATE POLICY "theology_staff capability select" ON public.theology_staff_assignments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.id = theology_staff_assignments.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

-- Escrita somente por RPC — mesmo padrão de discipleship_staff_assignments.
REVOKE INSERT, UPDATE, DELETE ON public.theology_staff_assignments FROM authenticated;
GRANT SELECT ON public.theology_staff_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_theology_staff(
  p_class_id uuid,
  p_member_id uuid,
  p_role text,
  p_offering_id uuid DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_offering_class uuid;
  v_member_org uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT organization_id INTO v_org_id FROM public.theology_classes WHERE id = p_class_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to assign staff';
  END IF;

  IF p_offering_id IS NOT NULL THEN
    SELECT class_id INTO v_offering_class FROM public.theology_class_offerings WHERE id = p_offering_id;
    IF v_offering_class IS DISTINCT FROM p_class_id THEN
      RAISE EXCEPTION 'offering does not belong to this class';
    END IF;
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = p_member_id;
  IF v_member_org IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  IF NOT public.is_organization_descendant_or_self(v_org_id, v_member_org) THEN
    RAISE EXCEPTION 'staff member is outside the class organization scope';
  END IF;

  IF p_role NOT IN ('coordenador', 'secretario', 'professor', 'auxiliar') THEN
    RAISE EXCEPTION 'invalid staff role: %', p_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.theology_staff_assignments
    WHERE class_id = p_class_id
      AND COALESCE(offering_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_offering_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND member_id = p_member_id AND role = p_role AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'member already has an active assignment with this role here';
  END IF;

  INSERT INTO public.theology_staff_assignments (class_id, offering_id, member_id, role, start_date, notes, created_by)
  VALUES (p_class_id, p_offering_id, p_member_id, p_role, COALESCE(p_start_date, CURRENT_DATE), NULLIF(btrim(p_notes), ''), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_theology_staff(uuid, uuid, text, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_theology_staff(uuid, uuid, text, uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_theology_staff_assignment(
  p_assignment_id uuid,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_staff_assignments%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_staff_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;

  SELECT organization_id INTO v_org_id FROM public.theology_classes WHERE id = v_row.class_id;
  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to end assignment';
  END IF;

  IF v_row.status <> 'ativo' THEN RAISE EXCEPTION 'assignment is not active'; END IF;

  UPDATE public.theology_staff_assignments
  SET status = 'encerrado', end_date = COALESCE(p_end_date, CURRENT_DATE)
  WHERE id = p_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.end_theology_staff_assignment(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_theology_staff_assignment(uuid, date) TO authenticated;

-- Helpers de autorização reutilizados pelas RPCs de frequência/avaliação
-- (migration seguinte) e pelo frontend.
CREATE OR REPLACE FUNCTION public._is_theology_class_staff(
  _user_id uuid,
  _class_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.theology_staff_assignments tsa
    JOIN public.members m ON m.id = tsa.member_id
    WHERE tsa.class_id = _class_id
      AND tsa.status = 'ativo'
      AND m.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public._is_theology_class_staff(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._is_theology_offering_staff(
  _user_id uuid,
  _offering_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.theology_staff_assignments tsa
    JOIN public.members m ON m.id = tsa.member_id
    WHERE tsa.status = 'ativo'
      AND m.user_id = _user_id
      AND (
        tsa.offering_id = _offering_id
        OR (
          tsa.offering_id IS NULL
          AND tsa.class_id = (SELECT class_id FROM public.theology_class_offerings WHERE id = _offering_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public._is_theology_offering_staff(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- theology.manage sempre pode operar; theology.teach só opera turmas/ofertas
-- às quais a pessoa está efetivamente atribuída.
CREATE OR REPLACE FUNCTION public.can_operate_theology_class(
  _user_id uuid,
  _class_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_org_access_permission(_user_id, _organization_id, 'theology.manage')
    OR (
      public.has_org_access_permission(_user_id, _organization_id, 'theology.teach')
      AND public._is_theology_class_staff(_user_id, _class_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_operate_theology_class(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_operate_theology_offering(
  _user_id uuid,
  _offering_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_org_access_permission(_user_id, _organization_id, 'theology.manage')
    OR (
      public.has_org_access_permission(_user_id, _organization_id, 'theology.teach')
      AND public._is_theology_offering_staff(_user_id, _offering_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_operate_theology_offering(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── theology_enrollments (matrícula do aluno na turma) ───────────────────
CREATE TABLE IF NOT EXISTS public.theology_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.theology_classes(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  -- Snapshot da organização efetiva do membro no momento da matrícula (para
  -- indexação/relatórios) — a AUTORIZAÇÃO real sempre resolve pela
  -- organização da turma (ver policies abaixo).
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  enrolled_at timestamptz NOT NULL DEFAULT now(),
  started_at date,
  completed_at date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'matriculado', 'ativo', 'concluido', 'reprovado', 'desistente', 'transferido', 'cancelado'
  )),
  final_result text CHECK (final_result IS NULL OR final_result IN ('aprovado', 'reprovado', 'sem_avaliacao')),
  administrative_notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sem matrícula ativa duplicada na mesma turma.
CREATE UNIQUE INDEX IF NOT EXISTS theology_enrollments_unique_active_idx
  ON public.theology_enrollments (class_id, member_id)
  WHERE status IN ('pendente', 'matriculado', 'ativo');

CREATE INDEX IF NOT EXISTS idx_theology_enrollments_member ON public.theology_enrollments (member_id, status);
CREATE INDEX IF NOT EXISTS idx_theology_enrollments_class ON public.theology_enrollments (class_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS theology_enrollments_legacy_unique_idx
  ON public.theology_enrollments (class_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_enrollments_updated_at ON public.theology_enrollments;
CREATE TRIGGER update_theology_enrollments_updated_at
BEFORE UPDATE ON public.theology_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.theology_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_enrollments capability select" ON public.theology_enrollments;
CREATE POLICY "theology_enrollments capability select" ON public.theology_enrollments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_classes c
    WHERE c.id = theology_enrollments.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

-- Escrita somente por RPC — precisa validar capacidade/duplicidade/estado da
-- turma e, na conclusão, as regras acadêmicas reais.
REVOKE INSERT, UPDATE, DELETE ON public.theology_enrollments FROM authenticated;
GRANT SELECT ON public.theology_enrollments TO authenticated;

CREATE OR REPLACE FUNCTION public.enroll_member_in_theology_class(
  p_class_id uuid,
  p_member_id uuid,
  p_status text DEFAULT 'matriculado'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.theology_classes%ROWTYPE;
  v_member_org uuid;
  v_current_count integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  -- Lock serializa a verificação de capacidade com outras matrículas
  -- concorrentes da mesma turma.
  SELECT * INTO v_class FROM public.theology_classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'class not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to enroll members';
  END IF;

  IF v_class.status IN ('concluida', 'cancelada', 'arquivada') THEN
    RAISE EXCEPTION 'class is closed and does not accept new enrollments';
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = p_member_id;
  IF v_member_org IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  IF NOT public.is_organization_descendant_or_self(v_class.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'member is outside the class organization scope';
  END IF;

  IF p_status NOT IN ('pendente', 'matriculado') THEN
    RAISE EXCEPTION 'new enrollments must start as pendente or matriculado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.theology_enrollments
    WHERE class_id = p_class_id AND member_id = p_member_id
      AND status IN ('pendente', 'matriculado', 'ativo')
  ) THEN
    RAISE EXCEPTION 'member already has an active enrollment in this class';
  END IF;

  IF v_class.capacity IS NOT NULL AND p_status = 'matriculado' THEN
    SELECT count(*) INTO v_current_count
    FROM public.theology_enrollments
    WHERE class_id = p_class_id AND status IN ('matriculado', 'ativo');
    IF v_current_count >= v_class.capacity THEN
      RAISE EXCEPTION 'class has reached its capacity (%)', v_class.capacity;
    END IF;
  END IF;

  INSERT INTO public.theology_enrollments (class_id, member_id, organization_id, status, created_by)
  VALUES (p_class_id, p_member_id, v_member_org, p_status, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_member_in_theology_class(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_member_in_theology_class(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_enrollment_status(
  p_enrollment_id uuid,
  p_status text,
  p_final_result text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_override_eligibility boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_enrollments%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_pending_mandatory integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_row.class_id FOR UPDATE;

  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to update enrollment status';
  END IF;

  IF p_override_eligibility THEN
    IF p_status NOT IN ('concluido', 'reprovado') THEN
      RAISE EXCEPTION 'eligibility override is only valid for conclusion or failure';
    END IF;
    IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
      RAISE EXCEPTION 'only theology managers can override completion eligibility';
    END IF;
    IF NULLIF(btrim(p_notes), '') IS NULL THEN
      RAISE EXCEPTION 'override justification is required';
    END IF;
  END IF;

  IF NOT (
    (v_row.status = 'pendente' AND p_status IN ('matriculado', 'cancelado'))
    OR (v_row.status = 'matriculado' AND p_status IN ('ativo', 'desistente', 'transferido', 'cancelado'))
    OR (v_row.status = 'ativo' AND p_status IN ('concluido', 'reprovado', 'desistente', 'transferido', 'cancelado'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid enrollment status transition: % -> %', v_row.status, p_status;
  END IF;

  -- Conclusão exige que todas as unidades obrigatórias do currículo do
  -- programa estejam concluídas com aprovação para este aluno (nenhuma
  -- pendência acadêmica real) — a menos que theology.manage registre uma
  -- exceção explícita e justificada.
  IF p_status = 'concluido' AND NOT p_override_eligibility THEN
    SELECT count(*) INTO v_pending_mandatory
    FROM public.theology_curriculum_items ci
    WHERE ci.program_id = v_class.program_id
      AND ci.is_mandatory
      AND ci.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1
        FROM public.theology_offering_enrollments oe
        JOIN public.theology_class_offerings o ON o.id = oe.offering_id
        WHERE oe.enrollment_id = p_enrollment_id
          AND o.curriculum_item_id = ci.id
          AND oe.status = 'concluida'
          AND oe.final_result = 'aprovado'
      );

    IF v_pending_mandatory > 0 THEN
      RAISE EXCEPTION 'enrollment has % mandatory curriculum unit(s) not yet approved', v_pending_mandatory;
    END IF;
  END IF;

  IF p_final_result IS NOT NULL AND p_final_result NOT IN ('aprovado', 'reprovado', 'sem_avaliacao') THEN
    RAISE EXCEPTION 'invalid final_result: %', p_final_result;
  END IF;

  IF p_final_result IS NOT NULL AND NOT p_override_eligibility THEN
    RAISE EXCEPTION 'final_result is derived from completed curriculum units';
  END IF;

  UPDATE public.theology_enrollments
  SET status = p_status,
      final_result = COALESCE(
        p_final_result,
        CASE WHEN p_status = 'concluido' THEN 'aprovado' WHEN p_status = 'reprovado' THEN 'reprovado' ELSE final_result END
      ),
      administrative_notes = COALESCE(NULLIF(btrim(p_notes), ''), administrative_notes),
      started_at = CASE WHEN p_status = 'ativo' AND started_at IS NULL THEN CURRENT_DATE ELSE started_at END,
      completed_at = CASE WHEN p_status IN ('concluido', 'reprovado', 'desistente', 'cancelado') AND completed_at IS NULL THEN CURRENT_DATE ELSE completed_at END
  WHERE id = p_enrollment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_enrollment_status(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_enrollment_status(uuid, text, text, text, boolean) TO authenticated;

-- ── theology_offering_enrollments (matrícula do aluno numa unidade/oferta) ─
-- Suporta repetência/nova tentativa via attempt_number: quando uma tentativa
-- é encerrada (concluida/cancelada), uma nova linha com attempt_number+1
-- pode ser criada para a mesma oferta/matrícula.
CREATE TABLE IF NOT EXISTS public.theology_offering_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.theology_enrollments(id) ON DELETE RESTRICT,
  offering_id uuid NOT NULL REFERENCES public.theology_class_offerings(id) ON DELETE RESTRICT,

  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  final_grade numeric(5,2) CHECK (final_grade IS NULL OR final_grade BETWEEN 0 AND 10),
  final_result text CHECK (final_result IS NULL OR final_result IN ('aprovado', 'reprovado', 'dispensado')),
  completed_at date,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Só uma tentativa aberta por vez para a mesma oferta/matrícula.
CREATE UNIQUE INDEX IF NOT EXISTS theology_offering_enrollments_open_idx
  ON public.theology_offering_enrollments (offering_id, enrollment_id)
  WHERE status IN ('planejada', 'em_andamento');

CREATE UNIQUE INDEX IF NOT EXISTS theology_offering_enrollments_attempt_idx
  ON public.theology_offering_enrollments (offering_id, enrollment_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_theology_offering_enrollments_enrollment
  ON public.theology_offering_enrollments (enrollment_id, status);
CREATE INDEX IF NOT EXISTS idx_theology_offering_enrollments_offering
  ON public.theology_offering_enrollments (offering_id, status);

DROP TRIGGER IF EXISTS update_theology_offering_enrollments_updated_at ON public.theology_offering_enrollments;
CREATE TRIGGER update_theology_offering_enrollments_updated_at
BEFORE UPDATE ON public.theology_offering_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.theology_offering_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_offering_enrollments capability select" ON public.theology_offering_enrollments;
CREATE POLICY "theology_offering_enrollments capability select" ON public.theology_offering_enrollments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_offering_enrollments.offering_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.theology_offering_enrollments FROM authenticated;
GRANT SELECT ON public.theology_offering_enrollments TO authenticated;

CREATE OR REPLACE FUNCTION public.enroll_member_in_theology_offering(
  p_enrollment_id uuid,
  p_offering_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enrollment public.theology_enrollments%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_next_attempt integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_enrollment
  FROM public.theology_enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found'; END IF;

  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = p_offering_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offering not found'; END IF;

  IF v_offering.class_id <> v_enrollment.class_id THEN
    RAISE EXCEPTION 'offering does not belong to the enrollment class';
  END IF;

  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to enroll in this offering';
  END IF;

  IF v_enrollment.status NOT IN ('matriculado', 'ativo') THEN
    RAISE EXCEPTION 'theology enrollment must be matriculado or ativo before opening a unit attempt';
  END IF;

  IF v_class.status NOT IN ('inscricoes_abertas', 'em_andamento') THEN
    RAISE EXCEPTION 'class must be open or in progress before opening a unit attempt';
  END IF;

  IF v_offering.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'offering is closed and does not accept new attempts';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.theology_offering_enrollments
    WHERE offering_id = p_offering_id AND enrollment_id = p_enrollment_id
      AND status IN ('planejada', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'this enrollment already has an open attempt for this offering';
  END IF;

  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_next_attempt
  FROM public.theology_offering_enrollments
  WHERE offering_id = p_offering_id AND enrollment_id = p_enrollment_id;

  IF v_offering.capacity IS NOT NULL THEN
    IF (
      SELECT count(*) FROM public.theology_offering_enrollments
      WHERE offering_id = p_offering_id AND status IN ('planejada', 'em_andamento')
    ) >= v_offering.capacity THEN
      RAISE EXCEPTION 'offering has reached its capacity (%)', v_offering.capacity;
    END IF;
  END IF;

  INSERT INTO public.theology_offering_enrollments (enrollment_id, offering_id, attempt_number, created_by)
  VALUES (p_enrollment_id, p_offering_id, v_next_attempt, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_member_in_theology_offering(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_member_in_theology_offering(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_offering_enrollment_status(
  p_offering_enrollment_id uuid,
  p_status text,
  p_final_grade numeric DEFAULT NULL,
  p_final_result text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.theology_offering_enrollments%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_derived_grade numeric;
  v_derived_result text;
  v_attendance_percentage numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.theology_offering_enrollments WHERE id = p_offering_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offering enrollment not found'; END IF;

  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = v_row.offering_id;
  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  IF NOT public.can_operate_theology_offering(auth.uid(), v_row.offering_id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to update this offering enrollment';
  END IF;

  IF NOT (
    (v_row.status = 'planejada' AND p_status IN ('em_andamento', 'cancelada'))
    OR (v_row.status = 'em_andamento' AND p_status IN ('concluida', 'cancelada'))
    OR v_row.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid offering enrollment status transition: % -> %', v_row.status, p_status;
  END IF;

  IF v_row.status = p_status THEN
    IF p_final_grade IS NOT NULL OR p_final_result IS NOT NULL THEN
      RAISE EXCEPTION 'a closed academic result cannot be changed through a repeated status transition';
    END IF;
    RETURN;
  END IF;

  IF p_status = 'em_andamento' THEN
    IF v_offering.status <> 'em_andamento' OR v_class.status <> 'em_andamento' THEN
      RAISE EXCEPTION 'class and offering must be in progress before starting a student attempt';
    END IF;
    IF p_final_grade IS NOT NULL OR p_final_result IS NOT NULL THEN
      RAISE EXCEPTION 'final academic result is only defined when the attempt is concluded';
    END IF;
  ELSIF p_status = 'concluida' AND p_final_result = 'dispensado' THEN
    IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
      RAISE EXCEPTION 'only theology managers can waive a curriculum unit';
    END IF;
    IF NULLIF(btrim(p_notes), '') IS NULL THEN
      RAISE EXCEPTION 'waiver justification is required';
    END IF;
    IF p_final_grade IS NOT NULL THEN
      RAISE EXCEPTION 'a waived unit cannot receive a final grade';
    END IF;
    v_derived_grade := NULL;
    v_derived_result := 'dispensado';
  ELSIF p_status = 'concluida' THEN
    IF p_final_grade IS NOT NULL OR p_final_result IS NOT NULL THEN
      RAISE EXCEPTION 'final grade and result are calculated from published assessments and attendance';
    END IF;

    SELECT outcome.final_grade, outcome.final_result, outcome.attendance_percentage
      INTO v_derived_grade, v_derived_result, v_attendance_percentage
    FROM public._calculate_theology_offering_enrollment_outcome(p_offering_enrollment_id) outcome;
  ELSIF p_status = 'cancelada' THEN
    IF p_final_grade IS NOT NULL OR p_final_result IS NOT NULL THEN
      RAISE EXCEPTION 'a cancelled attempt cannot receive a final academic result';
    END IF;
  END IF;

  UPDATE public.theology_offering_enrollments
  SET status = p_status,
      final_grade = CASE WHEN p_status = 'concluida' THEN v_derived_grade ELSE final_grade END,
      final_result = CASE WHEN p_status = 'concluida' THEN v_derived_result ELSE final_result END,
      notes = COALESCE(NULLIF(btrim(p_notes), ''), notes),
      completed_at = CASE WHEN p_status IN ('concluida', 'cancelada') AND completed_at IS NULL THEN CURRENT_DATE ELSE completed_at END,
      closed_by = CASE WHEN p_status IN ('concluida', 'cancelada') AND closed_at IS NULL THEN auth.uid() ELSE closed_by END,
      closed_at = CASE WHEN p_status IN ('concluida', 'cancelada') AND closed_at IS NULL THEN now() ELSE closed_at END
  WHERE id = p_offering_enrollment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_offering_enrollment_status(uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_offering_enrollment_status(uuid, text, numeric, text, text) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_classes') THEN
    RAISE EXCEPTION 'Migration theology_periods_classes_enrollments: tabela theology_classes nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_offering_enrollments') THEN
    RAISE EXCEPTION 'Migration theology_periods_classes_enrollments: tabela theology_offering_enrollments nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'theology_classes_validate_scope') THEN
    RAISE EXCEPTION 'Migration theology_periods_classes_enrollments: trigger de escopo de turma nao foi criado';
  END IF;
  RAISE NOTICE 'Migration theology_periods_classes_enrollments: tabelas, policies, RPCs e triggers confirmados ✓';
END $$;

COMMIT;
