-- ============================================================================
-- Migration: theology_foundation
-- Timestamp: 20260730090000
-- OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- CONTRATO (ver docs/architecture/contrato-dominios-institucionais.md e
-- docs/architecture/operacao-3-teologia.md):
--   1. Pessoa continua sendo exclusivamente public.members. Aluno, professor,
--      coordenador e secretário acadêmico de Teologia são PAPÉIS referenciando
--      members.id — nunca uma nova tabela de pessoa.
--   2. Organização continua sendo exclusivamente public.organizations.
--      Instituto/núcleo são pontos operacionais/acadêmicos ligados a uma
--      organização — nunca uma hierarquia eclesiástica paralela.
--   3. Autorização por capability (has_org_access_permission), nunca role
--      hardcoded. Capabilities novas: theology.read, theology.manage,
--      theology.teach, theology.confidential.
--   4. Histórico institucional continua sendo exclusivamente
--      public.member_history via register_member_history_event() — reaproveita
--      os 5 marcos genéricos já criados pela Operação 2 (matricula,
--      inicio_formacao, conclusao_formacao, desligamento_formacao,
--      transferencia_turma) — NENHUMA extensão de catálogo é necessária aqui
--      (ver 20260730130000_theology_results_history_and_documents.sql).
--   5. Financeiro continua sendo exclusivamente public.transactions +
--      finance_*. Teologia nunca duplica saldo, conta ou fechamento (ver
--      20260730140000_theology_finance_links_and_permissions.sql).
--
-- DECISÃO DE DOMÍNIO (Discipulado × Teologia, ver docs/architecture/
-- operacao-3-teologia.md §7): as tabelas discipleship_* NÃO são reutilizadas
-- diretamente — Teologia tem semântica acadêmica mais ampla (matriz
-- curricular com múltiplas matérias por programa, tentativas/repetência por
-- unidade, modelos de avaliação configuráveis). Namespace próprio
-- `theology_*`. Padrões de RLS, máquina de estados, locks de concorrência e
-- helpers de histórico são REPLICADOS (não herdados por FK) do que a revisão
-- Codex da Operação 2 comprovou funcionar.
--
-- Esta migration NÃO é aplicada. NÃO altera Financeiro, Chat, Secretaria,
-- Discipulado nem nenhum módulo fora da Teologia.
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
  IF to_regclass('public.discipleship_courses') IS NULL THEN
    v_missing := array_append(v_missing, 'public.discipleship_courses (Operação 2, referência de padrão)');
  END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission()');
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_organization_descendant_or_self()');
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_updated_at_column()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'theology_foundation preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── Capabilities novas ───────────────────────────────────────────────────
-- Mesmo padrão idempotente de members.confidential/discipleship.*: concedidas
-- automaticamente a church_admin/responsible_pastor (governança).
UPDATE public.access_responsibility_definitions
SET permission_keys = (
      SELECT ARRAY(SELECT DISTINCT unnest(
        COALESCE(permission_keys, ARRAY[]::text[])
        || ARRAY['theology.read', 'theology.manage', 'theology.teach', 'theology.confidential']
      ))
    ),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT (
    'theology.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'theology.manage' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'theology.teach' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'theology.confidential' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
  );

-- ── Responsabilidades operacionais novas da Teologia ────────────────────
-- Coordenador: gerencia o módulo (instituto, núcleos, currículo, períodos,
-- turmas, matrículas, equipe) e também pode lecionar.
-- Secretário acadêmico: administra períodos/turmas/matrículas, SEM acesso a
-- acompanhamento confidencial.
-- Professor: leciona e lança frequência/avaliação somente nas
-- turmas/ofertas às quais está atribuído (checado via
-- theology_staff_assignments, não por esta capability sozinha).
-- theology.teach NUNCA autoriza operação financeira — vínculo de transação
-- exige capability financeira real (ver migration 6).
INSERT INTO public.access_responsibility_definitions (
  responsibility_type, label, description, category, permission_keys,
  inherits_to_descendants, is_governance, sort_order
)
VALUES
  ('theology_coordinator', 'Coordenador(a) de Teologia',
    'Gerencia instituto, núcleos, currículo, períodos, turmas, equipe e matrículas da Teologia no escopo recebido.',
    'ministries', ARRAY['theology.read', 'theology.manage', 'theology.teach'], false, false, 100),
  ('theology_secretary', 'Secretário(a) Acadêmico(a) de Teologia',
    'Administra períodos, turmas e matrículas da Teologia, sem acesso a acompanhamento confidencial.',
    'ministries', ARRAY['theology.read', 'theology.manage'], false, false, 101),
  ('theology_teacher', 'Professor(a) de Teologia',
    'Leciona e lança frequência, avaliação e resultados somente nas turmas/unidades às quais está atribuído.',
    'ministries', ARRAY['theology.read', 'theology.teach'], false, false, 102)
ON CONFLICT (responsibility_type) DO NOTHING;

-- ── theology_institutes (Instituto Teológico + parâmetros padrão) ───────
-- WinTechi: "Instituto Teológico" + "Parâmetros — Teologia" — combinados
-- aqui num único catálogo por organização (parâmetros padrão que os
-- programas podem sobrescrever individualmente).
CREATE TABLE IF NOT EXISTS public.theology_institutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  description text,
  accreditation_info text,

  default_minimum_attendance_percentage numeric(5,2) NOT NULL DEFAULT 75
    CHECK (default_minimum_attendance_percentage >= 0 AND default_minimum_attendance_percentage <= 100),
  default_minimum_passing_score numeric(5,2) NOT NULL DEFAULT 7
    CHECK (default_minimum_passing_score BETWEEN 0 AND 10),
  is_active boolean NOT NULL DEFAULT true,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS theology_institutes_org_name_idx
  ON public.theology_institutes (organization_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS theology_institutes_legacy_unique_idx
  ON public.theology_institutes (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_institutes_updated_at ON public.theology_institutes;
CREATE TRIGGER update_theology_institutes_updated_at
BEFORE UPDATE ON public.theology_institutes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.theology_institutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_institutes capability select" ON public.theology_institutes;
CREATE POLICY "theology_institutes capability select" ON public.theology_institutes
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_institutes capability insert" ON public.theology_institutes;
CREATE POLICY "theology_institutes capability insert" ON public.theology_institutes
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_institutes capability update" ON public.theology_institutes;
CREATE POLICY "theology_institutes capability update" ON public.theology_institutes
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- Instituto não é apagado fisicamente se já tiver núcleos/programas (FK
-- RESTRICT) — apenas desativado.
DROP POLICY IF EXISTS "theology_institutes capability delete" ON public.theology_institutes;
CREATE POLICY "theology_institutes capability delete" ON public.theology_institutes
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- ── theology_study_centers (Núcleos de Estudos) ──────────────────────────
-- Ponto operacional/acadêmico (sala, polo, sede, on-line) ligado a uma
-- organização — nunca uma nova unidade organizacional. Mesmo papel de
-- discipleship_locations, adaptado ao vocabulário acadêmico ("núcleo").
CREATE TABLE IF NOT EXISTS public.theology_study_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid REFERENCES public.theology_institutes(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  center_type text NOT NULL DEFAULT 'nucleo'
    CHECK (center_type IN ('nucleo', 'polo', 'sede', 'online', 'outro')),
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

CREATE INDEX IF NOT EXISTS idx_theology_study_centers_org
  ON public.theology_study_centers (organization_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS theology_study_centers_legacy_unique_idx
  ON public.theology_study_centers (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_study_centers_updated_at ON public.theology_study_centers;
CREATE TRIGGER update_theology_study_centers_updated_at
BEFORE UPDATE ON public.theology_study_centers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._theology_study_centers_validate_scope()
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

    IF v_institute_org IS NULL THEN
      RAISE EXCEPTION 'theology institute not found';
    END IF;

    IF NOT public.is_organization_descendant_or_self(v_institute_org, NEW.organization_id) THEN
      RAISE EXCEPTION 'study center organization must belong to the institute organization tree';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_study_centers_validate_scope ON public.theology_study_centers;
CREATE TRIGGER theology_study_centers_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_study_centers
FOR EACH ROW EXECUTE FUNCTION public._theology_study_centers_validate_scope();

REVOKE ALL ON FUNCTION public._theology_study_centers_validate_scope()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_study_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_study_centers capability select" ON public.theology_study_centers;
CREATE POLICY "theology_study_centers capability select" ON public.theology_study_centers
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_study_centers capability insert" ON public.theology_study_centers;
CREATE POLICY "theology_study_centers capability insert" ON public.theology_study_centers
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_study_centers capability update" ON public.theology_study_centers;
CREATE POLICY "theology_study_centers capability update" ON public.theology_study_centers
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_study_centers capability delete" ON public.theology_study_centers;
CREATE POLICY "theology_study_centers capability delete" ON public.theology_study_centers
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- ── theology_subjects (Unidades curriculares/matérias/livros/materiais) ──
-- Catálogo reutilizável entre programas (uma matéria pode compor a matriz
-- curricular de mais de um programa) — a ligação com sequência/obrigatorie-
-- dade fica em theology_curriculum_items (migration seguinte).
CREATE TABLE IF NOT EXISTS public.theology_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  description text,
  workload_hours numeric(6,1) CHECK (workload_hours IS NULL OR workload_hours >= 0),
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theology_subjects_org_status
  ON public.theology_subjects (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS theology_subjects_org_code_idx
  ON public.theology_subjects (organization_id, lower(btrim(code)))
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS theology_subjects_legacy_unique_idx
  ON public.theology_subjects (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_subjects_updated_at ON public.theology_subjects;
CREATE TRIGGER update_theology_subjects_updated_at
BEFORE UPDATE ON public.theology_subjects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.theology_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_subjects capability select" ON public.theology_subjects;
CREATE POLICY "theology_subjects capability select" ON public.theology_subjects
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_subjects capability insert" ON public.theology_subjects;
CREATE POLICY "theology_subjects capability insert" ON public.theology_subjects
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_subjects capability update" ON public.theology_subjects;
CREATE POLICY "theology_subjects capability update" ON public.theology_subjects
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- Matéria não é apagada fisicamente se já compuser alguma matriz curricular
-- (FK RESTRICT em theology_curriculum_items.subject_id) — apenas
-- inativada.
DROP POLICY IF EXISTS "theology_subjects capability delete" ON public.theology_subjects;
CREATE POLICY "theology_subjects capability delete" ON public.theology_subjects
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- ── theology_programs (Programas/Tipos de Curso) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.theology_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  institute_id uuid REFERENCES public.theology_institutes(id) ON DELETE SET NULL,

  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  short_name text,
  description text,
  objectives text,

  workload_hours numeric(6,1) CHECK (workload_hours IS NULL OR workload_hours >= 0),

  requires_attendance boolean NOT NULL DEFAULT true,
  minimum_attendance_percentage numeric(5,2) NOT NULL DEFAULT 75
    CHECK (minimum_attendance_percentage >= 0 AND minimum_attendance_percentage <= 100),
  requires_assessment boolean NOT NULL DEFAULT true,
  -- Nota final normalizada para a escala 0–10, mesmo padrão do Discipulado,
  -- mesmo quando cada modelo de avaliação usa uma escala diferente.
  minimum_passing_score numeric(5,2)
    CHECK (minimum_passing_score IS NULL OR minimum_passing_score BETWEEN 0 AND 10),
  completion_criteria text,

  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'arquivado')),

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (NOT requires_assessment OR minimum_passing_score IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_theology_programs_org_status
  ON public.theology_programs (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS theology_programs_org_code_idx
  ON public.theology_programs (organization_id, lower(btrim(code)))
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS theology_programs_legacy_unique_idx
  ON public.theology_programs (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_theology_programs_updated_at ON public.theology_programs;
CREATE TRIGGER update_theology_programs_updated_at
BEFORE UPDATE ON public.theology_programs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Escopo do instituto (quando informado) e transição inicial. A checagem de
-- "ativação exige matriz curricular" fica na próxima migration
-- (_theology_programs_validate_activation, criada depois de
-- theology_curriculum_items existir) — trigger SEPARADO, sem reabrir este.
CREATE OR REPLACE FUNCTION public._theology_programs_validate_scope()
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

    IF v_institute_org IS NULL THEN
      RAISE EXCEPTION 'theology institute not found';
    END IF;

    IF NOT public.is_organization_descendant_or_self(v_institute_org, NEW.organization_id) THEN
      RAISE EXCEPTION 'program organization must belong to the institute organization tree';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status <> 'rascunho' THEN
    RAISE EXCEPTION 'new programs must start as rascunho';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS theology_programs_validate_scope ON public.theology_programs;
CREATE TRIGGER theology_programs_validate_scope
BEFORE INSERT OR UPDATE ON public.theology_programs
FOR EACH ROW EXECUTE FUNCTION public._theology_programs_validate_scope();

REVOKE ALL ON FUNCTION public._theology_programs_validate_scope()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.theology_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theology_programs capability select" ON public.theology_programs;
CREATE POLICY "theology_programs capability select" ON public.theology_programs
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.read'));

DROP POLICY IF EXISTS "theology_programs capability insert" ON public.theology_programs;
CREATE POLICY "theology_programs capability insert" ON public.theology_programs
FOR INSERT TO authenticated
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

DROP POLICY IF EXISTS "theology_programs capability update" ON public.theology_programs;
CREATE POLICY "theology_programs capability update" ON public.theology_programs
FOR UPDATE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'))
WITH CHECK (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- Programa não é apagado fisicamente se já tiver turmas (FK RESTRICT em
-- theology_classes.program_id) — apenas arquivado (status).
DROP POLICY IF EXISTS "theology_programs capability delete" ON public.theology_programs;
CREATE POLICY "theology_programs capability delete" ON public.theology_programs
FOR DELETE TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'theology.manage'));

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_programs') THEN
    RAISE EXCEPTION 'Migration theology_foundation: tabela theology_programs nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'theology_subjects') THEN
    RAISE EXCEPTION 'Migration theology_foundation: tabela theology_subjects nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.access_responsibility_definitions WHERE responsibility_type = 'theology_coordinator'
  ) THEN
    RAISE EXCEPTION 'Migration theology_foundation: responsabilidade theology_coordinator nao foi criada';
  END IF;
  RAISE NOTICE 'Migration theology_foundation: tabelas, policies, capabilities e responsabilidades confirmadas ✓';
END $$;

COMMIT;
