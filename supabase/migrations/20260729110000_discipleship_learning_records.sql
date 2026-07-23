-- ============================================================================
-- Migration: discipleship_learning_records
-- Timestamp: 20260729110000
-- OPERAÇÃO 2 — Discipulado completo sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- Encontros/aulas, frequência, avaliações e acompanhamento individual de uma
-- matrícula. Presenças e notas NÃO viram evento em member_history (poluiria
-- a timeline institucional) — apenas marcos de matrícula (migration
-- seguinte, 20260729120000) chegam lá.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.discipleship_classes') IS NULL THEN
    RAISE EXCEPTION 'discipleship_learning_records preflight failed: discipleship_classes nao existe (aplique 20260729100000 primeiro)';
  END IF;
  IF to_regclass('public.discipleship_enrollments') IS NULL THEN
    RAISE EXCEPTION 'discipleship_learning_records preflight failed: discipleship_enrollments nao existe';
  END IF;
  IF to_regproc('public.can_operate_discipleship_class(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'discipleship_learning_records preflight failed: can_operate_discipleship_class() nao existe';
  END IF;
END;
$$;

-- ── discipleship_sessions (encontros/aulas de uma turma) ─────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.discipleship_classes(id) ON DELETE RESTRICT,
  lesson_id uuid REFERENCES public.discipleship_lessons(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.discipleship_locations(id) ON DELETE SET NULL,
  instructor_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,

  session_date date NOT NULL DEFAULT CURRENT_DATE,
  session_time time,
  modality text CHECK (modality IS NULL OR modality IN ('presencial', 'online', 'hibrida')),
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

CREATE INDEX IF NOT EXISTS idx_discipleship_sessions_class_date
  ON public.discipleship_sessions (class_id, session_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_sessions_legacy_unique_idx
  ON public.discipleship_sessions (class_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_sessions_updated_at ON public.discipleship_sessions;
CREATE TRIGGER update_discipleship_sessions_updated_at
BEFORE UPDATE ON public.discipleship_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_sessions capability select" ON public.discipleship_sessions;
CREATE POLICY "discipleship_sessions capability select" ON public.discipleship_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_sessions.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

-- Quem administra o módulo OU está atribuído à turma (discipulador/
-- professor/auxiliar) pode registrar/editar encontros — mas turma
-- concluída/cancelada/arquivada não aceita NOVOS encontros (lançamento
-- comum). Sem policy de DELETE: encontro é histórico, apenas 'cancelada'.
DROP POLICY IF EXISTS "discipleship_sessions capability insert" ON public.discipleship_sessions;
CREATE POLICY "discipleship_sessions capability insert" ON public.discipleship_sessions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_sessions.class_id
      AND c.status NOT IN ('concluida', 'cancelada', 'arquivada')
      AND public.can_operate_discipleship_class(auth.uid(), c.id, c.organization_id)
  )
);

DROP POLICY IF EXISTS "discipleship_sessions capability update" ON public.discipleship_sessions;
CREATE POLICY "discipleship_sessions capability update" ON public.discipleship_sessions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_sessions.class_id
      AND public.can_operate_discipleship_class(auth.uid(), c.id, c.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_sessions.class_id
      AND public.can_operate_discipleship_class(auth.uid(), c.id, c.organization_id)
  )
);

-- ── discipleship_attendance (frequência por sessão + matrícula) ─────────
CREATE TABLE IF NOT EXISTS public.discipleship_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.discipleship_sessions(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES public.discipleship_enrollments(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'nao_lancado' CHECK (status IN ('presente', 'ausente', 'justificado', 'nao_lancado')),
  observation text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Frequência deve ser única por sessão + matrícula.
CREATE UNIQUE INDEX IF NOT EXISTS discipleship_attendance_session_enrollment_idx
  ON public.discipleship_attendance (session_id, enrollment_id);

CREATE INDEX IF NOT EXISTS idx_discipleship_attendance_enrollment
  ON public.discipleship_attendance (enrollment_id, status);

ALTER TABLE public.discipleship_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_attendance capability select" ON public.discipleship_attendance;
CREATE POLICY "discipleship_attendance capability select" ON public.discipleship_attendance
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_sessions s
    JOIN public.discipleship_classes c ON c.id = s.class_id
    WHERE s.id = discipleship_attendance.session_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

-- Escrita somente por RPC (upsert em lote por sessão) — evita 1 round-trip
-- por aluno e garante autorização/estado da turma em um único lugar.
REVOKE INSERT, UPDATE, DELETE ON public.discipleship_attendance FROM authenticated;
GRANT SELECT ON public.discipleship_attendance TO authenticated;

CREATE OR REPLACE FUNCTION public.record_discipleship_attendance(
  p_session_id uuid,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.discipleship_sessions%ROWTYPE;
  v_class public.discipleship_classes%ROWTYPE;
  v_entry jsonb;
  v_enrollment_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_session FROM public.discipleship_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  SELECT * INTO v_class FROM public.discipleship_classes WHERE id = v_session.class_id;

  IF NOT public.can_operate_discipleship_class(auth.uid(), v_class.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to record attendance for this session';
  END IF;

  IF v_class.status IN ('concluida', 'cancelada', 'arquivada') THEN
    RAISE EXCEPTION 'class is closed and does not accept new attendance records';
  END IF;

  IF jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'p_entries must be a JSON array';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_enrollment_id := (v_entry->>'enrollment_id')::uuid;
    v_status := v_entry->>'status';

    IF v_status NOT IN ('presente', 'ausente', 'justificado', 'nao_lancado') THEN
      RAISE EXCEPTION 'invalid attendance status: %', v_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.discipleship_enrollments
      WHERE id = v_enrollment_id AND class_id = v_class.id
    ) THEN
      RAISE EXCEPTION 'enrollment % does not belong to this class', v_enrollment_id;
    END IF;

    INSERT INTO public.discipleship_attendance (session_id, enrollment_id, status, observation, recorded_by)
    VALUES (p_session_id, v_enrollment_id, v_status, NULLIF(btrim(v_entry->>'observation'), ''), auth.uid())
    ON CONFLICT (session_id, enrollment_id)
    DO UPDATE SET status = EXCLUDED.status, observation = EXCLUDED.observation,
                  recorded_by = EXCLUDED.recorded_by, recorded_at = now();
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_discipleship_attendance(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discipleship_attendance(uuid, jsonb) TO authenticated;

-- ── discipleship_assessments (avaliações da turma) ───────────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.discipleship_classes(id) ON DELETE RESTRICT,

  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  assessment_type text NOT NULL DEFAULT 'prova' CHECK (assessment_type IN ('prova', 'trabalho', 'participacao', 'pratica', 'outro')),
  max_score numeric(6,2) NOT NULL DEFAULT 10 CHECK (max_score > 0),
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  scheduled_at date,
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'aplicada', 'cancelada')),

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discipleship_assessments_class
  ON public.discipleship_assessments (class_id, status);

DROP TRIGGER IF EXISTS update_discipleship_assessments_updated_at ON public.discipleship_assessments;
CREATE TRIGGER update_discipleship_assessments_updated_at
BEFORE UPDATE ON public.discipleship_assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_assessments capability select" ON public.discipleship_assessments;
CREATE POLICY "discipleship_assessments capability select" ON public.discipleship_assessments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_assessments.class_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

DROP POLICY IF EXISTS "discipleship_assessments capability insert" ON public.discipleship_assessments;
CREATE POLICY "discipleship_assessments capability insert" ON public.discipleship_assessments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_assessments.class_id
      AND public.can_operate_discipleship_class(auth.uid(), c.id, c.organization_id)
  )
);

DROP POLICY IF EXISTS "discipleship_assessments capability update" ON public.discipleship_assessments;
CREATE POLICY "discipleship_assessments capability update" ON public.discipleship_assessments
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_assessments.class_id
      AND public.can_operate_discipleship_class(auth.uid(), c.id, c.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.discipleship_classes c
    WHERE c.id = discipleship_assessments.class_id
      AND public.can_operate_discipleship_class(auth.uid(), c.id, c.organization_id)
  )
);

-- ── discipleship_assessment_results (nota por matrícula) ─────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.discipleship_assessments(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES public.discipleship_enrollments(id) ON DELETE RESTRICT,

  score numeric(6,2) NOT NULL CHECK (score >= 0),
  observation text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Avaliação deve respeitar nota mínima/máxima (validado na RPC, contra
-- max_score da avaliação) e ser única por avaliação + matrícula.
CREATE UNIQUE INDEX IF NOT EXISTS discipleship_assessment_results_unique_idx
  ON public.discipleship_assessment_results (assessment_id, enrollment_id);

CREATE INDEX IF NOT EXISTS idx_discipleship_assessment_results_enrollment
  ON public.discipleship_assessment_results (enrollment_id);

ALTER TABLE public.discipleship_assessment_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_assessment_results capability select" ON public.discipleship_assessment_results;
CREATE POLICY "discipleship_assessment_results capability select" ON public.discipleship_assessment_results
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_assessments a
    JOIN public.discipleship_classes c ON c.id = a.class_id
    WHERE a.id = discipleship_assessment_results.assessment_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.discipleship_assessment_results FROM authenticated;
GRANT SELECT ON public.discipleship_assessment_results TO authenticated;

CREATE OR REPLACE FUNCTION public.record_discipleship_assessment_result(
  p_assessment_id uuid,
  p_enrollment_id uuid,
  p_score numeric,
  p_observation text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assessment public.discipleship_assessments%ROWTYPE;
  v_class public.discipleship_classes%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_assessment FROM public.discipleship_assessments WHERE id = p_assessment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assessment not found';
  END IF;

  SELECT * INTO v_class FROM public.discipleship_classes WHERE id = v_assessment.class_id;

  IF NOT public.can_operate_discipleship_class(auth.uid(), v_class.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to record assessment result';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.discipleship_enrollments WHERE id = p_enrollment_id AND class_id = v_class.id
  ) THEN
    RAISE EXCEPTION 'enrollment does not belong to this class';
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > v_assessment.max_score THEN
    RAISE EXCEPTION 'score must be between 0 and % (assessment max_score)', v_assessment.max_score;
  END IF;

  INSERT INTO public.discipleship_assessment_results (assessment_id, enrollment_id, score, observation, recorded_by)
  VALUES (p_assessment_id, p_enrollment_id, p_score, NULLIF(btrim(p_observation), ''), auth.uid())
  ON CONFLICT (assessment_id, enrollment_id)
  DO UPDATE SET score = EXCLUDED.score, observation = EXCLUDED.observation,
                recorded_by = EXCLUDED.recorded_by, recorded_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_discipleship_assessment_result(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discipleship_assessment_result(uuid, uuid, numeric, text) TO authenticated;

-- ── discipleship_followups (acompanhamento individual da matrícula) ─────
CREATE TABLE IF NOT EXISTS public.discipleship_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.discipleship_enrollments(id) ON DELETE RESTRICT,

  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  observation text NOT NULL CHECK (btrim(observation) <> ''),
  visibility text NOT NULL DEFAULT 'normal' CHECK (visibility IN ('normal', 'confidential')),

  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discipleship_followups_enrollment
  ON public.discipleship_followups (enrollment_id, occurred_at DESC);

ALTER TABLE public.discipleship_followups ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de member_occurrences (Operação 1): confidencial exige
-- discipleship.confidential ADICIONALMENTE a discipleship.read.
DROP POLICY IF EXISTS "discipleship_followups capability select" ON public.discipleship_followups;
CREATE POLICY "discipleship_followups capability select" ON public.discipleship_followups
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_enrollments e
    JOIN public.discipleship_classes c ON c.id = e.class_id
    WHERE e.id = discipleship_followups.enrollment_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
      AND (
        discipleship_followups.visibility <> 'confidential'
        OR public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.confidential')
      )
  )
);

-- Sem policy de DELETE: acompanhamento é histórico, nunca apagado.
REVOKE INSERT, UPDATE, DELETE ON public.discipleship_followups FROM authenticated;
GRANT SELECT ON public.discipleship_followups TO authenticated;

CREATE OR REPLACE FUNCTION public.create_discipleship_followup(
  p_enrollment_id uuid,
  p_observation text,
  p_occurred_at date DEFAULT CURRENT_DATE,
  p_visibility text DEFAULT 'normal',
  p_document_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.discipleship_classes%ROWTYPE;
  v_member_id uuid;
  v_base_org_id uuid;
  v_visibility text := COALESCE(p_visibility, 'normal');
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT c.* , e.member_id INTO v_class, v_member_id
  FROM public.discipleship_enrollments e
  JOIN public.discipleship_classes c ON c.id = e.class_id
  WHERE e.id = p_enrollment_id;

  IF v_class.id IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;

  IF NOT public.can_operate_discipleship_class(auth.uid(), v_class.id, v_class.organization_id) THEN
    RAISE EXCEPTION 'access denied to register followup';
  END IF;

  IF v_visibility NOT IN ('normal', 'confidential') THEN
    RAISE EXCEPTION 'invalid followup visibility';
  END IF;

  IF v_visibility = 'confidential'
     AND NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'discipleship.confidential') THEN
    RAISE EXCEPTION 'access denied to register confidential followup';
  END IF;

  IF NULLIF(btrim(p_observation), '') IS NULL THEN
    RAISE EXCEPTION 'followup observation is required';
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    SELECT organization_id INTO v_base_org_id FROM public.members WHERE id = v_member_id;
    IF p_attachment_path NOT LIKE (v_base_org_id::text || '/' || v_member_id::text || '/%') THEN
      RAISE EXCEPTION 'invalid member attachment path';
    END IF;
  END IF;

  INSERT INTO public.discipleship_followups (
    enrollment_id, occurred_at, observation, visibility, document_id, attachment_path, created_by
  ) VALUES (
    p_enrollment_id, COALESCE(p_occurred_at, CURRENT_DATE), btrim(p_observation), v_visibility,
    p_document_id, p_attachment_path, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_discipleship_followup(uuid, text, date, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_discipleship_followup(uuid, text, date, text, uuid, text) TO authenticated;

-- ── Progresso da matrícula (leitura) ──────────────────────────────────────
-- Usado pela UI para "Acompanhar progresso e pendências" sem expor cálculo
-- duplicado no frontend. Sempre reconfirma a mesma capability de leitura.
CREATE OR REPLACE FUNCTION public.get_discipleship_enrollment_progress(p_enrollment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class public.discipleship_classes%ROWTYPE;
  v_total_sessions integer;
  v_present_sessions integer;
  v_avg_score numeric;
  v_total_weight numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT c.* INTO v_class
  FROM public.discipleship_enrollments e
  JOIN public.discipleship_classes c ON c.id = e.class_id
  WHERE e.id = p_enrollment_id;

  IF v_class.id IS NULL THEN
    RAISE EXCEPTION 'enrollment not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_class.organization_id, 'discipleship.read') THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT count(*) INTO v_total_sessions
  FROM public.discipleship_attendance WHERE enrollment_id = p_enrollment_id AND status IN ('presente', 'ausente', 'justificado');

  SELECT count(*) INTO v_present_sessions
  FROM public.discipleship_attendance WHERE enrollment_id = p_enrollment_id AND status IN ('presente', 'justificado');

  SELECT sum(r.score * a.weight) / NULLIF(sum(a.weight), 0), sum(a.weight)
    INTO v_avg_score, v_total_weight
  FROM public.discipleship_assessment_results r
  JOIN public.discipleship_assessments a ON a.id = r.assessment_id
  WHERE r.enrollment_id = p_enrollment_id;

  RETURN jsonb_build_object(
    'total_sessions_launched', v_total_sessions,
    'present_sessions', v_present_sessions,
    'attendance_percentage', CASE WHEN v_total_sessions > 0 THEN round((v_present_sessions::numeric / v_total_sessions) * 100, 2) ELSE NULL END,
    'average_score', round(v_avg_score, 2),
    'assessments_weighted', v_total_weight
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_discipleship_enrollment_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discipleship_enrollment_progress(uuid) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_attendance') THEN
    RAISE EXCEPTION 'Migration discipleship_learning_records: tabela discipleship_attendance nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_assessment_results') THEN
    RAISE EXCEPTION 'Migration discipleship_learning_records: tabela discipleship_assessment_results nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_followups') THEN
    RAISE EXCEPTION 'Migration discipleship_learning_records: tabela discipleship_followups nao foi criada';
  END IF;
  RAISE NOTICE 'Migration discipleship_learning_records: tabelas, policies e RPCs confirmadas ✓';
END $$;

COMMIT;
