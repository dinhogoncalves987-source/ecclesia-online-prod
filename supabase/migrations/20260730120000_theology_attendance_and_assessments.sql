-- ============================================================================
-- Migration: theology_attendance_and_assessments
-- Timestamp: 20260730120000
-- OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Aulas/sessões, frequência, modelos configuráveis de avaliação (substituem
-- Mod01/Mod02/Mod03 do WinTechi — nenhuma tabela triplicada), avaliações
-- aplicadas e notas por componente, com auditoria obrigatória de alteração
-- após publicação. Presenças e notas NÃO viram evento em member_history
-- (poluiria a timeline institucional) — apenas marcos de matrícula (migration
-- seguinte, 20260730130000) chegam lá.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.theology_class_offerings') IS NULL THEN
    RAISE EXCEPTION 'theology_attendance_and_assessments preflight failed: theology_class_offerings nao existe (aplique 20260730110000 primeiro)';
  END IF;
  IF to_regclass('public.theology_offering_enrollments') IS NULL THEN
    RAISE EXCEPTION 'theology_attendance_and_assessments preflight failed: theology_offering_enrollments nao existe';
  END IF;
  IF to_regprocedure('public.can_operate_theology_offering(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'theology_attendance_and_assessments preflight failed: can_operate_theology_offering() nao existe';
  END IF;
END;
$$;

-- ── theology_sessions (aulas de uma oferta de unidade) ───────────────────
CREATE TABLE IF NOT EXISTS public.theology_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.theology_class_offerings(id) ON DELETE RESTRICT,
  instructor_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,

  session_date date NOT NULL DEFAULT CURRENT_DATE,
  session_time time,
  content_covered text,
  status text NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'realizada', 'cancelada')),
  notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theology_sessions_offering_date
  ON public.theology_sessions (offering_id, session_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS theology_sessions_legacy_unique_idx
  ON public.theology_sessions (offering_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_sessions_updated_at ON public.theology_sessions;
CREATE TRIGGER update_theology_sessions_updated_at
BEFORE UPDATE ON public.theology_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._theology_sessions_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offering public.theology_class_offerings%ROWTYPE;
BEGIN
  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = NEW.offering_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'offering not found'; END IF;
  IF v_offering.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'offering is closed and does not accept session changes';
  END IF;

  IF NEW.instructor_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.theology_staff_assignments tsa
    WHERE tsa.member_id = NEW.instructor_member_id
      AND tsa.status = 'ativo'
      AND (tsa.offering_id = NEW.offering_id OR (tsa.offering_id IS NULL AND tsa.class_id = v_offering.class_id))
      AND tsa.role IN ('coordenador', 'professor', 'auxiliar')
  ) THEN
    RAISE EXCEPTION 'session instructor must be active staff for this offering or class';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_sessions_validate_scope ON public.theology_sessions;
CREATE TRIGGER theology_sessions_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_sessions
FOR EACH ROW EXECUTE FUNCTION public._theology_sessions_validate_scope();

REVOKE ALL ON FUNCTION public._theology_sessions_validate_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_sessions capability select" ON public.theology_sessions;
CREATE POLICY "theology_sessions capability select" ON public.theology_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_sessions.offering_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

DROP POLICY IF EXISTS "theology_sessions capability insert" ON public.theology_sessions;
CREATE POLICY "theology_sessions capability insert" ON public.theology_sessions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_sessions.offering_id
      AND o.status NOT IN ('concluida', 'cancelada')
      AND public.can_operate_theology_offering(auth.uid(), o.id, c.organization_id)
  )
);

DROP POLICY IF EXISTS "theology_sessions capability update" ON public.theology_sessions;
CREATE POLICY "theology_sessions capability update" ON public.theology_sessions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_sessions.offering_id
      AND public.can_operate_theology_offering(auth.uid(), o.id, c.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_sessions.offering_id
      AND public.can_operate_theology_offering(auth.uid(), o.id, c.organization_id)
  )
);

-- status é máquina de estados — alterado só por RPC.
REVOKE UPDATE ON public.theology_sessions FROM authenticated;
GRANT SELECT, INSERT ON public.theology_sessions TO authenticated;
GRANT UPDATE (instructor_member_id, session_date, session_time, content_covered, notes)
  ON public.theology_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_session_status(
  p_session_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.theology_sessions%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_session FROM public.theology_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found'; END IF;

  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = v_session.offering_id;
  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  IF NOT public.can_operate_theology_offering(auth.uid(), v_offering.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to update session status';
  END IF;

  IF NOT (
    (v_session.status = 'agendada' AND p_status IN ('realizada', 'cancelada'))
    OR v_session.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid session status transition: % -> %', v_session.status, p_status;
  END IF;

  UPDATE public.theology_sessions SET status = p_status WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_session_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_session_status(uuid, text) TO authenticated;

-- ── theology_attendance (frequência por sessão + matrícula na oferta) ────
CREATE TABLE IF NOT EXISTS public.theology_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.theology_sessions(id) ON DELETE RESTRICT,
  offering_enrollment_id uuid NOT NULL REFERENCES public.theology_offering_enrollments(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'nao_lancado' CHECK (status IN ('presente', 'ausente', 'justificado', 'nao_lancado')),
  observation text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS theology_attendance_session_enrollment_idx
  ON public.theology_attendance (session_id, offering_enrollment_id);

CREATE INDEX IF NOT EXISTS idx_theology_attendance_offering_enrollment
  ON public.theology_attendance (offering_enrollment_id, status);

ALTER TABLE public.theology_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_attendance capability select" ON public.theology_attendance;
CREATE POLICY "theology_attendance capability select" ON public.theology_attendance
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_sessions s
    JOIN public.theology_class_offerings o ON o.id = s.offering_id
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE s.id = theology_attendance.session_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

-- Escrita somente por RPC (upsert em lote por sessão).
REVOKE INSERT, UPDATE, DELETE ON public.theology_attendance FROM authenticated;
GRANT SELECT ON public.theology_attendance TO authenticated;

CREATE OR REPLACE FUNCTION public.record_theology_attendance(
  p_session_id uuid,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.theology_sessions%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_entry jsonb;
  v_oe_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_session FROM public.theology_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found'; END IF;

  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = v_session.offering_id;
  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  IF NOT public.can_operate_theology_offering(auth.uid(), v_offering.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to record attendance for this session';
  END IF;

  IF v_session.status <> 'realizada' THEN
    RAISE EXCEPTION 'attendance can only be recorded for a completed session';
  END IF;

  IF jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'p_entries must be a JSON array';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_oe_id := (v_entry->>'offering_enrollment_id')::uuid;
    v_status := v_entry->>'status';

    IF v_status NOT IN ('presente', 'ausente', 'justificado', 'nao_lancado') THEN
      RAISE EXCEPTION 'invalid attendance status: %', v_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.theology_offering_enrollments
      WHERE id = v_oe_id AND offering_id = v_offering.id
    ) THEN
      RAISE EXCEPTION 'offering enrollment % does not belong to this offering', v_oe_id;
    END IF;

    INSERT INTO public.theology_attendance (session_id, offering_enrollment_id, status, observation, recorded_by)
    VALUES (p_session_id, v_oe_id, v_status, NULLIF(btrim(v_entry->>'observation'), ''), auth.uid())
    ON CONFLICT (session_id, offering_enrollment_id)
    DO UPDATE SET status = EXCLUDED.status, observation = EXCLUDED.observation,
                  recorded_by = EXCLUDED.recorded_by, recorded_at = now();
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_theology_attendance(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_theology_attendance(uuid, jsonb) TO authenticated;

-- ── theology_assessment_models (substituem Mod01/Mod02/Mod03 do WinTechi) ─
-- Um modelo configurável (escala, nota mínima, arredondamento, regra de
-- recuperação) em vez de três telas/tabelas fixas. Pode ser específico de um
-- programa ou reutilizável por todo o instituto (program_id nulo).
CREATE TABLE IF NOT EXISTS public.theology_assessment_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.theology_programs(id) ON DELETE SET NULL,

  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  scale_max_score numeric(6,2) NOT NULL DEFAULT 10 CHECK (scale_max_score > 0),
  minimum_passing_score numeric(6,2) NOT NULL DEFAULT 7 CHECK (minimum_passing_score >= 0),
  rounding_rule text NOT NULL DEFAULT 'padrao' CHECK (rounding_rule IN ('nenhum', 'padrao', 'para_cima', 'para_baixo')),
  retake_rule text,
  is_active boolean NOT NULL DEFAULT true,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (minimum_passing_score <= scale_max_score)
);

CREATE INDEX IF NOT EXISTS idx_theology_assessment_models_org
  ON public.theology_assessment_models (organization_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS theology_assessment_models_legacy_unique_idx
  ON public.theology_assessment_models (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_assessment_models_updated_at ON public.theology_assessment_models;
CREATE TRIGGER update_theology_assessment_models_updated_at
BEFORE UPDATE ON public.theology_assessment_models
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Protege a integridade da avaliação: uma vez que o modelo já foi usado por
-- alguma avaliação aplicada, seus campos de cálculo (escala, nota mínima,
-- arredondamento) não podem mais ser alterados — evita mudar a régua de
-- correção de provas já lançadas. Um modelo novo (nova versão) deve ser
-- criado em vez de editar o existente.
CREATE OR REPLACE FUNCTION public._theology_assessment_models_validate_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       NEW.scale_max_score IS DISTINCT FROM OLD.scale_max_score
       OR NEW.minimum_passing_score IS DISTINCT FROM OLD.minimum_passing_score
       OR NEW.rounding_rule IS DISTINCT FROM OLD.rounding_rule
     )
     AND EXISTS (
       SELECT 1 FROM public.theology_assessments a
       WHERE a.model_id = NEW.id AND a.status <> 'rascunho'
     ) THEN
    RAISE EXCEPTION 'assessment model calculation fields are locked once used by a scheduled/applied assessment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_assessment_models_validate_lock ON public.theology_assessment_models;
CREATE TRIGGER theology_assessment_models_validate_lock
BEFORE UPDATE ON public.theology_assessment_models
FOR EACH ROW EXECUTE FUNCTION public._theology_assessment_models_validate_lock();

REVOKE ALL ON FUNCTION public._theology_assessment_models_validate_lock() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_assessment_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_assessment_models capability select" ON public.theology_assessment_models;
CREATE POLICY "theology_assessment_models capability select" ON public.theology_assessment_models
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_assessment_models capability insert" ON public.theology_assessment_models;
CREATE POLICY "theology_assessment_models capability insert" ON public.theology_assessment_models
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_assessment_models capability update" ON public.theology_assessment_models;
CREATE POLICY "theology_assessment_models capability update" ON public.theology_assessment_models
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_assessment_models capability delete" ON public.theology_assessment_models;
CREATE POLICY "theology_assessment_models capability delete" ON public.theology_assessment_models
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- ── theology_assessment_model_components (pesos/componentes do modelo) ───
CREATE TABLE IF NOT EXISTS public.theology_assessment_model_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.theology_assessment_models(id) ON DELETE CASCADE,

  name text NOT NULL CHECK (btrim(name) <> ''),
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  max_score numeric(6,2) NOT NULL DEFAULT 10 CHECK (max_score > 0),
  is_mandatory boolean NOT NULL DEFAULT true,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS theology_assessment_model_components_seq_idx
  ON public.theology_assessment_model_components (model_id, sequence_number);

DROP TRIGGER IF EXISTS update_theology_assessment_model_components_updated_at
  ON public.theology_assessment_model_components;
CREATE TRIGGER update_theology_assessment_model_components_updated_at
BEFORE UPDATE ON public.theology_assessment_model_components
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mesma trava do modelo: componentes não podem ser adicionados/alterados/
-- removidos depois que o modelo já foi usado por uma avaliação agendada ou
-- aplicada — a soma dos pesos e a lista de componentes obrigatórios não pode
-- mudar "debaixo" de uma avaliação já em curso.
CREATE OR REPLACE FUNCTION public._theology_assessment_model_components_validate_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_model_id uuid := COALESCE(NEW.model_id, OLD.model_id);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.theology_assessments a
    WHERE a.model_id = v_model_id AND a.status <> 'rascunho'
  ) THEN
    RAISE EXCEPTION 'assessment model components are locked once the model is used by a scheduled/applied assessment';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS theology_assessment_model_components_validate_lock
  ON public.theology_assessment_model_components;
CREATE TRIGGER theology_assessment_model_components_validate_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.theology_assessment_model_components
FOR EACH ROW EXECUTE FUNCTION public._theology_assessment_model_components_validate_lock();

REVOKE ALL ON FUNCTION public._theology_assessment_model_components_validate_lock()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_assessment_model_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_assessment_model_components capability select" ON public.theology_assessment_model_components;
CREATE POLICY "theology_assessment_model_components capability select" ON public.theology_assessment_model_components
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_assessment_models m
    WHERE m.id = theology_assessment_model_components.model_id
      AND public.has_org_access_permission(auth.uid(), m.organization_id, 'theology.read')
  )
);

DROP POLICY IF EXISTS "theology_assessment_model_components capability insert" ON public.theology_assessment_model_components;
CREATE POLICY "theology_assessment_model_components capability insert" ON public.theology_assessment_model_components
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_assessment_models m
    WHERE m.id = theology_assessment_model_components.model_id
      AND public.has_org_access_permission(auth.uid(), m.organization_id, 'theology.manage')
  )
);

DROP POLICY IF EXISTS "theology_assessment_model_components capability update" ON public.theology_assessment_model_components;
CREATE POLICY "theology_assessment_model_components capability update" ON public.theology_assessment_model_components
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_assessment_models m
    WHERE m.id = theology_assessment_model_components.model_id
      AND public.has_org_access_permission(auth.uid(), m.organization_id, 'theology.manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_assessment_models m
    WHERE m.id = theology_assessment_model_components.model_id
      AND public.has_org_access_permission(auth.uid(), m.organization_id, 'theology.manage')
  )
);

DROP POLICY IF EXISTS "theology_assessment_model_components capability delete" ON public.theology_assessment_model_components;
CREATE POLICY "theology_assessment_model_components capability delete" ON public.theology_assessment_model_components
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_assessment_models m
    WHERE m.id = theology_assessment_model_components.model_id
      AND public.has_org_access_permission(auth.uid(), m.organization_id, 'theology.manage')
  )
);

-- ── theology_assessments (avaliações aplicadas a uma oferta) ─────────────
CREATE TABLE IF NOT EXISTS public.theology_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.theology_class_offerings(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES public.theology_assessment_models(id) ON DELETE RESTRICT,

  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  assessment_type text NOT NULL DEFAULT 'prova' CHECK (assessment_type IN ('prova', 'trabalho', 'participacao', 'pratica', 'outro')),
  -- Peso desta avaliação dentro da nota final da oferta (permite combinar
  -- múltiplas avaliações por unidade — mesmo padrão do Discipulado).
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  scheduled_at date,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'agendada', 'aplicada', 'publicada', 'cancelada')),
  published_at timestamptz,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theology_assessments_offering
  ON public.theology_assessments (offering_id, status);

DROP TRIGGER IF EXISTS update_theology_assessments_updated_at ON public.theology_assessments;
CREATE TRIGGER update_theology_assessments_updated_at
BEFORE UPDATE ON public.theology_assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._theology_assessments_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_model public.theology_assessment_models%ROWTYPE;
BEGIN
  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = NEW.offering_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'offering not found'; END IF;
  IF v_offering.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'offering is closed and does not accept assessment changes';
  END IF;

  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;
  SELECT * INTO v_model FROM public.theology_assessment_models WHERE id = NEW.model_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment model not found'; END IF;

  IF NOT public.is_organization_descendant_or_self(v_model.organization_id, v_class.organization_id)
     AND NOT public.is_organization_descendant_or_self(v_class.organization_id, v_model.organization_id) THEN
    RAISE EXCEPTION 'assessment model must belong to the class organization tree';
  END IF;

  IF v_model.program_id IS NOT NULL AND v_model.program_id <> v_class.program_id THEN
    RAISE EXCEPTION 'assessment model is restricted to a different program';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_assessments_validate_scope ON public.theology_assessments;
CREATE TRIGGER theology_assessments_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_assessments
FOR EACH ROW EXECUTE FUNCTION public._theology_assessments_validate_scope();

REVOKE ALL ON FUNCTION public._theology_assessments_validate_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_assessments capability select" ON public.theology_assessments;
CREATE POLICY "theology_assessments capability select" ON public.theology_assessments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_assessments.offering_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

DROP POLICY IF EXISTS "theology_assessments capability insert" ON public.theology_assessments;
CREATE POLICY "theology_assessments capability insert" ON public.theology_assessments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_assessments.offering_id
      AND public.can_operate_theology_offering(auth.uid(), o.id, c.organization_id)
  )
);

DROP POLICY IF EXISTS "theology_assessments capability update" ON public.theology_assessments;
CREATE POLICY "theology_assessments capability update" ON public.theology_assessments
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_assessments.offering_id
      AND public.can_operate_theology_offering(auth.uid(), o.id, c.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.theology_class_offerings o
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE o.id = theology_assessments.offering_id
      AND public.can_operate_theology_offering(auth.uid(), o.id, c.organization_id)
  )
);

REVOKE UPDATE ON public.theology_assessments FROM authenticated;
GRANT SELECT, INSERT ON public.theology_assessments TO authenticated;
GRANT UPDATE (title, description, assessment_type, weight, scheduled_at) ON public.theology_assessments TO authenticated;

CREATE OR REPLACE FUNCTION public.update_theology_assessment_status(
  p_assessment_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assessment public.theology_assessments%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_pending integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_assessment FROM public.theology_assessments WHERE id = p_assessment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment not found'; END IF;

  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = v_assessment.offering_id;
  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  IF NOT public.can_operate_theology_offering(auth.uid(), v_offering.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to update assessment status';
  END IF;

  IF NOT (
    (v_assessment.status = 'rascunho' AND p_status IN ('agendada', 'cancelada'))
    OR (v_assessment.status = 'agendada' AND p_status IN ('aplicada', 'cancelada'))
    OR (v_assessment.status = 'aplicada' AND p_status IN ('publicada', 'cancelada'))
    OR v_assessment.status = p_status
  ) THEN
    RAISE EXCEPTION 'invalid assessment status transition: % -> %', v_assessment.status, p_status;
  END IF;

  -- Publicar exige que todos os componentes obrigatórios tenham nota
  -- lançada para toda tentativa aberta desta oferta — "nota obrigatória"
  -- antes do fechamento (§9.1/§9.3 do prompt da operação).
  IF p_status = 'publicada' THEN
    SELECT count(*) INTO v_pending
    FROM public.theology_offering_enrollments oe
    CROSS JOIN public.theology_assessment_model_components comp
    WHERE oe.offering_id = v_offering.id
      AND oe.status IN ('planejada', 'em_andamento')
      AND comp.model_id = v_assessment.model_id
      AND comp.is_mandatory
      AND NOT EXISTS (
        SELECT 1 FROM public.theology_assessment_results r
        WHERE r.assessment_id = p_assessment_id
          AND r.component_id = comp.id
          AND r.offering_enrollment_id = oe.id
      );

    IF v_pending > 0 THEN
      RAISE EXCEPTION 'cannot publish: % mandatory component result(s) missing for active students', v_pending;
    END IF;
  END IF;

  UPDATE public.theology_assessments
  SET status = p_status,
      published_at = CASE WHEN p_status = 'publicada' AND published_at IS NULL THEN now() ELSE published_at END
  WHERE id = p_assessment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_theology_assessment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_theology_assessment_status(uuid, text) TO authenticated;

-- ── theology_assessment_results (nota por componente + tentativa) ────────
CREATE TABLE IF NOT EXISTS public.theology_assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.theology_assessments(id) ON DELETE RESTRICT,
  component_id uuid NOT NULL REFERENCES public.theology_assessment_model_components(id) ON DELETE RESTRICT,
  offering_enrollment_id uuid NOT NULL REFERENCES public.theology_offering_enrollments(id) ON DELETE RESTRICT,

  score numeric(6,2) NOT NULL CHECK (score >= 0),
  observation text,

  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS theology_assessment_results_unique_idx
  ON public.theology_assessment_results (assessment_id, component_id, offering_enrollment_id);

CREATE INDEX IF NOT EXISTS idx_theology_assessment_results_oe
  ON public.theology_assessment_results (offering_enrollment_id);

ALTER TABLE public.theology_assessment_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_assessment_results capability select" ON public.theology_assessment_results;
CREATE POLICY "theology_assessment_results capability select" ON public.theology_assessment_results
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_assessments a
    JOIN public.theology_class_offerings o ON o.id = a.offering_id
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE a.id = theology_assessment_results.assessment_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.theology_assessment_results FROM authenticated;
GRANT SELECT ON public.theology_assessment_results TO authenticated;

CREATE OR REPLACE FUNCTION public.record_theology_assessment_result(
  p_assessment_id uuid,
  p_component_id uuid,
  p_offering_enrollment_id uuid,
  p_score numeric,
  p_observation text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assessment public.theology_assessments%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
  v_component public.theology_assessment_model_components%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_assessment FROM public.theology_assessments WHERE id = p_assessment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment not found'; END IF;

  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = v_assessment.offering_id;
  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  IF NOT public.can_operate_theology_offering(auth.uid(), v_offering.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to record assessment result';
  END IF;

  -- Lançamento comum só antes da publicação. Depois de publicada, qualquer
  -- alteração precisa passar por amend_theology_assessment_result() com
  -- capability e justificativa (nunca UPDATE silencioso).
  IF v_assessment.status <> 'aplicada' THEN
    RAISE EXCEPTION 'results can only be recorded for an applied (not yet published) assessment';
  END IF;

  SELECT * INTO v_component FROM public.theology_assessment_model_components WHERE id = p_component_id;
  IF NOT FOUND OR v_component.model_id <> v_assessment.model_id THEN
    RAISE EXCEPTION 'component does not belong to this assessment model';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.theology_offering_enrollments
    WHERE id = p_offering_enrollment_id AND offering_id = v_offering.id
      AND status IN ('planejada', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'offering enrollment is not open in this offering';
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > v_component.max_score THEN
    RAISE EXCEPTION 'score must be between 0 and % (component max_score)', v_component.max_score;
  END IF;

  INSERT INTO public.theology_assessment_results (
    assessment_id, component_id, offering_enrollment_id, score, observation, recorded_by
  ) VALUES (
    p_assessment_id, p_component_id, p_offering_enrollment_id, p_score, NULLIF(btrim(p_observation), ''), auth.uid()
  )
  ON CONFLICT (assessment_id, component_id, offering_enrollment_id)
  DO UPDATE SET score = EXCLUDED.score, observation = EXCLUDED.observation,
                recorded_by = EXCLUDED.recorded_by, recorded_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_theology_assessment_result(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_theology_assessment_result(uuid, uuid, uuid, numeric, text) TO authenticated;

-- ── theology_grade_audit_log (auditoria de alteração de nota publicada) ──
CREATE TABLE IF NOT EXISTS public.theology_grade_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.theology_assessment_results(id) ON DELETE CASCADE,
  previous_score numeric(6,2) NOT NULL,
  new_score numeric(6,2) NOT NULL,
  justification text NOT NULL CHECK (btrim(justification) <> ''),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theology_grade_audit_log_result
  ON public.theology_grade_audit_log (result_id, changed_at DESC);

ALTER TABLE public.theology_grade_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_grade_audit_log capability select" ON public.theology_grade_audit_log;
CREATE POLICY "theology_grade_audit_log capability select" ON public.theology_grade_audit_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.theology_assessment_results r
    JOIN public.theology_assessments a ON a.id = r.assessment_id
    JOIN public.theology_class_offerings o ON o.id = a.offering_id
    JOIN public.theology_classes c ON c.id = o.class_id
    WHERE r.id = theology_grade_audit_log.result_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.manage')
  )
);

-- Sem policy de escrita: só a RPC amend_theology_assessment_result() grava
-- aqui (SECURITY DEFINER), nunca INSERT/UPDATE/DELETE direto do navegador.
REVOKE INSERT, UPDATE, DELETE ON public.theology_grade_audit_log FROM authenticated;
GRANT SELECT ON public.theology_grade_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.amend_theology_assessment_result(
  p_result_id uuid,
  p_new_score numeric,
  p_justification text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result public.theology_assessment_results%ROWTYPE;
  v_component public.theology_assessment_model_components%ROWTYPE;
  v_assessment public.theology_assessments%ROWTYPE;
  v_offering public.theology_class_offerings%ROWTYPE;
  v_class public.theology_classes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_result FROM public.theology_assessment_results WHERE id = p_result_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'result not found'; END IF;

  SELECT * INTO v_assessment FROM public.theology_assessments WHERE id = v_result.assessment_id;
  SELECT * INTO v_offering FROM public.theology_class_offerings WHERE id = v_assessment.offering_id;
  SELECT * INTO v_class FROM public.theology_classes WHERE id = v_offering.class_id;

  -- Alterar nota já publicada exige capability de gestão (nunca apenas
  -- theology.teach) e justificativa obrigatória — nunca um UPDATE silencioso.
  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage') THEN
    RAISE EXCEPTION 'access denied to amend a published grade';
  END IF;

  IF NULLIF(btrim(p_justification), '') IS NULL THEN
    RAISE EXCEPTION 'justification is required to amend a grade';
  END IF;

  SELECT * INTO v_component FROM public.theology_assessment_model_components WHERE id = v_result.component_id;

  IF p_new_score IS NULL OR p_new_score < 0 OR p_new_score > v_component.max_score THEN
    RAISE EXCEPTION 'new score must be between 0 and % (component max_score)', v_component.max_score;
  END IF;

  INSERT INTO public.theology_grade_audit_log (result_id, previous_score, new_score, justification, changed_by)
  VALUES (p_result_id, v_result.score, p_new_score, btrim(p_justification), auth.uid());

  UPDATE public.theology_assessment_results SET score = p_new_score WHERE id = p_result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.amend_theology_assessment_result(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_theology_assessment_result(uuid, numeric, text) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_assessment_results') THEN
    RAISE EXCEPTION 'Migration theology_attendance_and_assessments: tabela theology_assessment_results nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_grade_audit_log') THEN
    RAISE EXCEPTION 'Migration theology_attendance_and_assessments: tabela theology_grade_audit_log nao foi criada';
  END IF;
  IF to_regprocedure('public.amend_theology_assessment_result(uuid,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration theology_attendance_and_assessments: RPC amend_theology_assessment_result nao foi criada';
  END IF;
  RAISE NOTICE 'Migration theology_attendance_and_assessments: tabelas, policies e RPCs confirmadas ✓';
END $$;

COMMIT;
