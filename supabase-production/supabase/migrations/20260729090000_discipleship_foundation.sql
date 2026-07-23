-- ============================================================================
-- Migration: discipleship_foundation
-- Timestamp: 20260729090000
-- OPERAÇÃO 2 — Discipulado completo sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- CONTRATO (ver docs/architecture/contrato-dominios-institucionais.md e
-- docs/architecture/operacao-2-discipulado.md):
--   1. Pessoa continua sendo exclusivamente public.members. Aluno,
--      discipulador, professor, coordenador e secretário do Discipulado são
--      PAPÉIS/PARTICIPAÇÕES referenciando members.id — nunca uma nova tabela
--      de pessoa.
--   2. Organização continua sendo exclusivamente public.organizations. Uma
--      turma pertence a uma organização (matriz, setor ou congregação) via
--      organization_id — nunca uma hierarquia paralela.
--   3. Autorização por capability (has_org_access_permission), nunca role
--      hardcoded. Capabilities novas: discipleship.read, discipleship.manage,
--      discipleship.teach, discipleship.confidential.
--   4. Histórico institucional continua sendo exclusivamente
--      public.member_history via register_member_history_event() — nenhuma
--      timeline própria do Discipulado (ver migration
--      20260729120000_discipleship_permissions_and_history.sql).
--
-- DECISÕES DE AUDITORIA (ver docs/architecture/operacao-2-discipulado.md §1-2):
--   - "Locais para Discipular" do WinTechi NÃO é compatível com
--     public.organizations (que representa igreja/matriz/setor/congregação,
--     não uma sala/templo/residência específica) nem com nenhuma tabela
--     existente — cria-se discipleship_locations, um catálogo operacional
--     simples, nunca uma nova unidade organizacional.
--   - "Departamentos" do WinTechi (ex.: Infantil, Juvenil, Missões) é
--     semanticamente distinto de public.groups (pequenos grupos com líder,
--     dia/hora de reunião — um conceito de comunhão, não de currículo). Criar
--     discipleship_departments como catálogo simples e OPCIONAL (FK nullable
--     em discipleship_courses), sem forçar groups a representar algo que não
--     representa.
--   - "Tipos de Curso" → discipleship_courses (catálogo moderno, com regras
--     de frequência/avaliação/conclusão configuráveis).
--   - "Lições de Estudo" → discipleship_lessons (currículo ordenado do
--     curso).
--
-- Esta migration NÃO é aplicada. NÃO altera Financeiro, Chat, login por
-- telefone nem nenhum módulo fora do Discipulado.
-- ============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.documents') IS NULL THEN v_missing := array_append(v_missing, 'public.documents'); END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF to_regclass('public.member_history') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_history (Operação 1)');
  END IF;
  IF to_regproc('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission()');
  END IF;
  IF to_regproc('public.update_updated_at_column()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_updated_at_column()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'discipleship_foundation preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── Capabilities novas ───────────────────────────────────────────────────
-- Concedidas automaticamente a church_admin/responsible_pastor (governança,
-- que já detém todas as capabilities), pelo mesmo padrão idempotente usado
-- para members.confidential na Operação 1. NÃO concedidas a secretary geral
-- da Secretaria — Discipulado tem responsabilidades próprias (ver abaixo).
UPDATE public.access_responsibility_definitions
SET permission_keys = (
      SELECT ARRAY(SELECT DISTINCT unnest(
        COALESCE(permission_keys, ARRAY[]::text[])
        || ARRAY['discipleship.read', 'discipleship.manage', 'discipleship.teach', 'discipleship.confidential']
      ))
    ),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT (
    'discipleship.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'discipleship.manage' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'discipleship.teach' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'discipleship.confidential' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
  );

-- ── Responsabilidades operacionais novas do Discipulado ─────────────────
-- Coordenador: gerencia o módulo no escopo recebido (cursos, turmas,
-- matrículas, equipe) e também pode lecionar/acompanhar.
-- Secretário: administra turmas/matrículas, SEM acesso a acompanhamento
-- confidencial (mesmo padrão da Secretaria geral: secretary não tem
-- members.confidential).
-- Discipulador/professor: lança frequência, avaliação e acompanhamento
-- somente nas turmas às quais está atribuído (checado via
-- discipleship_staff_assignments, não por esta capability sozinha).
INSERT INTO public.access_responsibility_definitions (
  responsibility_type, label, description, category, permission_keys,
  inherits_to_descendants, is_governance, sort_order
)
VALUES
  ('discipleship_coordinator', 'Coordenador(a) de Discipulado',
    'Gerencia cursos, turmas, equipe e matrículas do Discipulado no escopo recebido.',
    'ministries', ARRAY['discipleship.read', 'discipleship.manage', 'discipleship.teach'], false, false, 90),
  ('discipleship_secretary', 'Secretário(a) de Discipulado',
    'Administra turmas e matrículas do Discipulado, sem acesso a acompanhamento confidencial.',
    'ministries', ARRAY['discipleship.read', 'discipleship.manage'], false, false, 91),
  ('discipleship_teacher', 'Discipulador(a) / Professor(a)',
    'Leciona e lança frequência, avaliação e acompanhamento somente nas turmas às quais está atribuído.',
    'ministries', ARRAY['discipleship.read', 'discipleship.teach'], false, false, 92)
ON CONFLICT (responsibility_type) DO NOTHING;

-- ── discipleship_locations (locais operacionais da aula) ─────────────────
-- Representa SOMENTE o local físico/virtual do encontro (sala, templo,
-- residência, on-line) — nunca uma igreja/congregação/setor/distrito. Uma
-- turma sempre continua vinculada a organizations.id para hierarquia e
-- escopo; discipleship_locations é apenas metadado operacional da aula.
CREATE TABLE IF NOT EXISTS public.discipleship_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  location_type text NOT NULL DEFAULT 'sala'
    CHECK (location_type IN ('templo', 'sala', 'residencia', 'online', 'outro')),
  address_text text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  is_active boolean NOT NULL DEFAULT true,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discipleship_locations_org
  ON public.discipleship_locations (organization_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_locations_legacy_unique_idx
  ON public.discipleship_locations (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_locations_updated_at ON public.discipleship_locations;
CREATE TRIGGER update_discipleship_locations_updated_at
BEFORE UPDATE ON public.discipleship_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_locations capability select" ON public.discipleship_locations;
CREATE POLICY "discipleship_locations capability select" ON public.discipleship_locations
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.read'));

-- Catálogo simples (sem máquina de estados) — CRUD direto gated por
-- capability, mesmo padrão de public.groups/public.documents.
DROP POLICY IF EXISTS "discipleship_locations capability insert" ON public.discipleship_locations;
CREATE POLICY "discipleship_locations capability insert" ON public.discipleship_locations
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

DROP POLICY IF EXISTS "discipleship_locations capability update" ON public.discipleship_locations;
CREATE POLICY "discipleship_locations capability update" ON public.discipleship_locations
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

-- Local nunca é apagado fisicamente se já usado por alguma turma (protegido
-- pela FK RESTRICT em discipleship_classes.location_id) — apenas desativado.
DROP POLICY IF EXISTS "discipleship_locations capability delete" ON public.discipleship_locations;
CREATE POLICY "discipleship_locations capability delete" ON public.discipleship_locations
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

-- ── discipleship_departments (catálogo curricular opcional) ─────────────
-- Distinto de public.groups (pequenos grupos de comunhão). Representa a
-- categoria/departamento do curso (ex.: Infantil, Juvenil, Adultos,
-- Missões) — referenciado opcionalmente por discipleship_courses.
CREATE TABLE IF NOT EXISTS public.discipleship_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  description text,
  is_active boolean NOT NULL DEFAULT true,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_departments_org_name_idx
  ON public.discipleship_departments (organization_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_departments_legacy_unique_idx
  ON public.discipleship_departments (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_departments_updated_at ON public.discipleship_departments;
CREATE TRIGGER update_discipleship_departments_updated_at
BEFORE UPDATE ON public.discipleship_departments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_departments capability select" ON public.discipleship_departments;
CREATE POLICY "discipleship_departments capability select" ON public.discipleship_departments
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.read'));

DROP POLICY IF EXISTS "discipleship_departments capability insert" ON public.discipleship_departments;
CREATE POLICY "discipleship_departments capability insert" ON public.discipleship_departments
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

DROP POLICY IF EXISTS "discipleship_departments capability update" ON public.discipleship_departments;
CREATE POLICY "discipleship_departments capability update" ON public.discipleship_departments
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

DROP POLICY IF EXISTS "discipleship_departments capability delete" ON public.discipleship_departments;
CREATE POLICY "discipleship_departments capability delete" ON public.discipleship_departments
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

-- ── discipleship_courses (catálogo de cursos/programas) ──────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.discipleship_departments(id) ON DELETE SET NULL,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  description text,
  objectives text,

  workload_hours numeric(6,1) CHECK (workload_hours IS NULL OR workload_hours >= 0),
  expected_lessons_count integer CHECK (expected_lessons_count IS NULL OR expected_lessons_count >= 0),

  requires_attendance boolean NOT NULL DEFAULT true,
  minimum_attendance_percentage numeric(5,2) NOT NULL DEFAULT 75
    CHECK (minimum_attendance_percentage >= 0 AND minimum_attendance_percentage <= 100),
  requires_assessment boolean NOT NULL DEFAULT false,
  minimum_passing_score numeric(5,2) CHECK (minimum_passing_score IS NULL OR minimum_passing_score >= 0),
  completion_criteria text,

  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'arquivado')),

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discipleship_courses_org_status
  ON public.discipleship_courses (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_courses_org_code_idx
  ON public.discipleship_courses (organization_id, lower(btrim(code)))
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_courses_legacy_unique_idx
  ON public.discipleship_courses (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_courses_updated_at ON public.discipleship_courses;
CREATE TRIGGER update_discipleship_courses_updated_at
BEFORE UPDATE ON public.discipleship_courses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discipleship_courses capability select" ON public.discipleship_courses;
CREATE POLICY "discipleship_courses capability select" ON public.discipleship_courses
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.read'));

DROP POLICY IF EXISTS "discipleship_courses capability insert" ON public.discipleship_courses;
CREATE POLICY "discipleship_courses capability insert" ON public.discipleship_courses
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

DROP POLICY IF EXISTS "discipleship_courses capability update" ON public.discipleship_courses;
CREATE POLICY "discipleship_courses capability update" ON public.discipleship_courses
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

-- Curso não é apagado fisicamente se já tiver turmas (FK RESTRICT em
-- discipleship_classes.course_id) — apenas arquivado (status).
DROP POLICY IF EXISTS "discipleship_courses capability delete" ON public.discipleship_courses;
CREATE POLICY "discipleship_courses capability delete" ON public.discipleship_courses
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.manage'));

-- ── discipleship_lessons (currículo ordenado do curso) ───────────────────
CREATE TABLE IF NOT EXISTS public.discipleship_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.discipleship_courses(id) ON DELETE CASCADE,

  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  content text,
  estimated_duration_minutes integer CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
  is_mandatory boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma lição não pode repetir sequência dentro do mesmo curso.
CREATE UNIQUE INDEX IF NOT EXISTS discipleship_lessons_course_sequence_idx
  ON public.discipleship_lessons (course_id, sequence_number);

CREATE UNIQUE INDEX IF NOT EXISTS discipleship_lessons_legacy_unique_idx
  ON public.discipleship_lessons (course_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_discipleship_lessons_updated_at ON public.discipleship_lessons;
CREATE TRIGGER update_discipleship_lessons_updated_at
BEFORE UPDATE ON public.discipleship_lessons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discipleship_lessons ENABLE ROW LEVEL SECURITY;

-- A organização efetiva de uma lição é a do curso — sempre resolvida via
-- JOIN, nunca duplicada como coluna local (evitaria uma segunda fonte de
-- verdade e permitiria inconsistência entre curso e lição).
DROP POLICY IF EXISTS "discipleship_lessons capability select" ON public.discipleship_lessons;
CREATE POLICY "discipleship_lessons capability select" ON public.discipleship_lessons
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_courses c
    WHERE c.id = discipleship_lessons.course_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
  )
);

DROP POLICY IF EXISTS "discipleship_lessons capability insert" ON public.discipleship_lessons;
CREATE POLICY "discipleship_lessons capability insert" ON public.discipleship_lessons
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.discipleship_courses c
    WHERE c.id = discipleship_lessons.course_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.manage')
  )
);

DROP POLICY IF EXISTS "discipleship_lessons capability update" ON public.discipleship_lessons;
CREATE POLICY "discipleship_lessons capability update" ON public.discipleship_lessons
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_courses c
    WHERE c.id = discipleship_lessons.course_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.manage')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.discipleship_courses c
    WHERE c.id = discipleship_lessons.course_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.manage')
  )
);

DROP POLICY IF EXISTS "discipleship_lessons capability delete" ON public.discipleship_lessons;
CREATE POLICY "discipleship_lessons capability delete" ON public.discipleship_lessons
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.discipleship_courses c
    WHERE c.id = discipleship_lessons.course_id
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.manage')
  )
);

-- RPC dedicada para reordenar lições sem gerar colisão transitória do índice
-- único de sequência (ex.: trocar 1↔2 exigiria um estado intermediário
-- inválido com UPDATE direto por linha). Recebe a ordem final completa.
CREATE OR REPLACE FUNCTION public.reorder_discipleship_lessons(
  p_course_id uuid,
  p_lesson_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_count integer;
  v_id uuid;
  v_seq integer := 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.discipleship_courses WHERE id = p_course_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'course not found';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'discipleship.manage') THEN
    RAISE EXCEPTION 'access denied to reorder lessons';
  END IF;

  SELECT count(*) INTO v_count FROM public.discipleship_lessons WHERE course_id = p_course_id;
  IF v_count <> cardinality(p_lesson_ids) THEN
    RAISE EXCEPTION 'lesson id list does not match course lessons (expected %, received %)', v_count, cardinality(p_lesson_ids);
  END IF;

  -- Estado intermediário temporário (sequência negativa) evita colisão do
  -- índice único enquanto a nova ordem é aplicada.
  UPDATE public.discipleship_lessons
  SET sequence_number = -sequence_number
  WHERE course_id = p_course_id;

  FOREACH v_id IN ARRAY p_lesson_ids LOOP
    UPDATE public.discipleship_lessons
    SET sequence_number = v_seq
    WHERE id = v_id AND course_id = p_course_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'lesson % does not belong to course %', v_id, p_course_id;
    END IF;
    v_seq := v_seq + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_discipleship_lessons(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_discipleship_lessons(uuid, uuid[]) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_courses') THEN
    RAISE EXCEPTION 'Migration discipleship_foundation: tabela discipleship_courses nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discipleship_lessons') THEN
    RAISE EXCEPTION 'Migration discipleship_foundation: tabela discipleship_lessons nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'discipleship_coordinator'
  ) THEN
    RAISE EXCEPTION 'Migration discipleship_foundation: responsabilidade discipleship_coordinator nao foi criada';
  END IF;
  RAISE NOTICE 'Migration discipleship_foundation: tabelas, policies, capabilities e responsabilidades confirmadas ✓';
END $$;

COMMIT;
