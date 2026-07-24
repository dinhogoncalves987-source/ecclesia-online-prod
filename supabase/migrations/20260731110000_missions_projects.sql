-- ============================================================================
-- Migration: missions_projects
-- Timestamp: 20260731110000
-- OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- WinTechi: "Projetos em Ação". missions_project_assignments cobre tanto os
-- "responsáveis" quanto os "missionários relacionados" ao projeto (role
-- diferencia o papel) — evita duas tabelas quase idênticas.
--
-- campaign_id é a "ligação especializada" com o módulo de Campanhas já
-- existente (public.campaigns, ver 20260608130000/20260608160000): um
-- projeto PODE estar associado a uma campanha de arrecadação já existente
-- (campaigns.type já inclui a categoria "missoes" nos dados de demonstração).
-- Não duplicamos Campanhas — apenas referenciamos.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.documents') IS NULL THEN v_missing := array_append(v_missing, 'public.documents'); END IF;
  IF to_regclass('public.campaigns') IS NULL THEN v_missing := array_append(v_missing, 'public.campaigns'); END IF;
  IF to_regclass('public.missions_missionaries') IS NULL THEN
    v_missing := array_append(v_missing, 'public.missions_missionaries (migration anterior)');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'missions_projects preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── missions_projects ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,

  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  objectives text,

  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'planejado', 'ativo', 'suspenso', 'concluido', 'cancelado', 'arquivado')),

  field_country text,
  field_state text,
  field_city text,
  field_region text,

  start_date date,
  end_date date,

  goals_notes text,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_missions_projects_org_status ON public.missions_projects (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_missions_projects_campaign ON public.missions_projects (campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS missions_projects_legacy_unique_idx
  ON public.missions_projects (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_missions_projects_updated_at ON public.missions_projects;
CREATE TRIGGER update_missions_projects_updated_at
BEFORE UPDATE ON public.missions_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._missions_projects_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = NEW.campaign_id
      AND public.is_organization_descendant_or_self(NEW.organization_id, c.organization_id)
  ) THEN
    RAISE EXCEPTION 'campaign is outside the project organization scope';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._missions_projects_validate_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS missions_projects_validate_scope ON public.missions_projects;
CREATE TRIGGER missions_projects_validate_scope
BEFORE INSERT OR UPDATE ON public.missions_projects
FOR EACH ROW EXECUTE FUNCTION public._missions_projects_validate_scope();

ALTER TABLE public.missions_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_projects capability select" ON public.missions_projects;
CREATE POLICY "missions_projects capability select" ON public.missions_projects
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'missions.read'));

REVOKE INSERT, UPDATE, DELETE ON public.missions_projects FROM authenticated;
GRANT SELECT ON public.missions_projects TO authenticated;

CREATE OR REPLACE FUNCTION public.create_missions_project(
  p_organization_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_objectives text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_field_country text DEFAULT NULL,
  p_field_state text DEFAULT NULL,
  p_field_city text DEFAULT NULL,
  p_field_region text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_goals_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to create a missions project';
  END IF;

  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'project name is required';
  END IF;

  INSERT INTO public.missions_projects (
    organization_id, campaign_id, name, description, objectives, field_country,
    field_state, field_city, field_region, start_date, end_date, goals_notes, created_by
  ) VALUES (
    p_organization_id, p_campaign_id, btrim(p_name), NULLIF(btrim(p_description), ''),
    NULLIF(btrim(p_objectives), ''), NULLIF(btrim(p_field_country), ''), NULLIF(btrim(p_field_state), ''),
    NULLIF(btrim(p_field_city), ''), NULLIF(btrim(p_field_region), ''), p_start_date, p_end_date,
    NULLIF(btrim(p_goals_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_missions_project(
  uuid, text, text, text, uuid, text, text, text, text, date, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_missions_project(
  uuid, text, text, text, uuid, text, text, text, text, date, date, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_missions_project_profile(
  p_project_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_objectives text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_field_country text DEFAULT NULL,
  p_field_state text DEFAULT NULL,
  p_field_city text DEFAULT NULL,
  p_field_region text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_goals_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to update this project';
  END IF;

  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'project name is required';
  END IF;

  UPDATE public.missions_projects
  SET name = btrim(p_name),
      description = NULLIF(btrim(p_description), ''),
      objectives = NULLIF(btrim(p_objectives), ''),
      campaign_id = p_campaign_id,
      field_country = NULLIF(btrim(p_field_country), ''),
      field_state = NULLIF(btrim(p_field_state), ''),
      field_city = NULLIF(btrim(p_field_city), ''),
      field_region = NULLIF(btrim(p_field_region), ''),
      start_date = p_start_date,
      end_date = p_end_date,
      goals_notes = NULLIF(btrim(p_goals_notes), '')
  WHERE id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_missions_project_profile(
  uuid, text, text, text, uuid, text, text, text, text, date, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_missions_project_profile(
  uuid, text, text, text, uuid, text, text, text, text, date, date, text
) TO authenticated;

-- ── Máquina de estados do projeto ─────────────────────────────────────────
-- rascunho -> planejado | cancelado
-- planejado -> ativo | cancelado
-- ativo -> suspenso | concluido | cancelado
-- suspenso -> ativo | cancelado
-- concluido -> arquivado
-- cancelado -> arquivado
-- arquivado -> terminal
CREATE OR REPLACE FUNCTION public.update_missions_project_status(
  p_project_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to update project status';
  END IF;

  IF NOT (
    (v_row.status = 'rascunho' AND p_status IN ('planejado', 'cancelado'))
    OR (v_row.status = 'planejado' AND p_status IN ('ativo', 'cancelado'))
    OR (v_row.status = 'ativo' AND p_status IN ('suspenso', 'concluido', 'cancelado'))
    OR (v_row.status = 'suspenso' AND p_status IN ('ativo', 'cancelado'))
    OR (v_row.status = 'concluido' AND p_status = 'arquivado')
    OR (v_row.status = 'cancelado' AND p_status = 'arquivado')
  ) THEN
    RAISE EXCEPTION 'invalid project status transition: % -> %', v_row.status, p_status;
  END IF;

  UPDATE public.missions_projects
  SET status = p_status,
      goals_notes = CASE WHEN NULLIF(btrim(p_notes), '') IS NOT NULL THEN NULLIF(btrim(p_notes), '') ELSE goals_notes END
  WHERE id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_missions_project_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_missions_project_status(uuid, text, text) TO authenticated;

-- ── missions_project_assignments ─────────────────────────────────────────
-- Cobre responsáveis/coordenadores E missionários relacionados a um projeto.
-- member_id referencia SEMPRE public.members — para role='missionario', o
-- membro deve ter registro correspondente em missions_missionaries (checado
-- na RPC, não como FK direta, pois o registro de missionário pode ainda
-- estar em candidatura/preparação quando associado a um projeto futuro).
CREATE TABLE IF NOT EXISTS public.missions_project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.missions_projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,

  role text NOT NULL CHECK (role IN ('responsavel', 'coordenador', 'missionario', 'apoio')),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),

  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  notes text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Evita duplicar o MESMO papel ativo do MESMO membro no MESMO projeto.
CREATE UNIQUE INDEX IF NOT EXISTS missions_project_assignments_active_unique_idx
  ON public.missions_project_assignments (project_id, member_id, role)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_missions_project_assignments_project ON public.missions_project_assignments (project_id, status);
CREATE INDEX IF NOT EXISTS idx_missions_project_assignments_member ON public.missions_project_assignments (member_id);

DROP TRIGGER IF EXISTS update_missions_project_assignments_updated_at ON public.missions_project_assignments;
CREATE TRIGGER update_missions_project_assignments_updated_at
BEFORE UPDATE ON public.missions_project_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missions_project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_project_assignments capability select" ON public.missions_project_assignments;
CREATE POLICY "missions_project_assignments capability select" ON public.missions_project_assignments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.missions_projects p
    WHERE p.id = missions_project_assignments.project_id
      AND public.has_org_access_permission(auth.uid(), p.organization_id, 'missions.read')
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.missions_project_assignments FROM authenticated;
GRANT SELECT ON public.missions_project_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_missions_project_member(
  p_project_id uuid,
  p_member_id uuid,
  p_role text,
  p_start_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.missions_projects%ROWTYPE;
  v_member_org uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_project FROM public.missions_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_project.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to assign members to this project';
  END IF;

  IF p_role NOT IN ('responsavel', 'coordenador', 'missionario', 'apoio') THEN
    RAISE EXCEPTION 'invalid project assignment role: %', p_role;
  END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = p_member_id;

  IF v_member_org IS NULL OR NOT public.is_organization_descendant_or_self(v_project.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'member is outside the project organization scope';
  END IF;

  IF p_role = 'missionario' AND NOT EXISTS (
    SELECT 1 FROM public.missions_missionaries mm WHERE mm.member_id = p_member_id
  ) THEN
    RAISE EXCEPTION 'member must be registered as a missionary before this role can be assigned';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.missions_project_assignments
    WHERE project_id = p_project_id AND member_id = p_member_id AND role = p_role AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'member already has an active assignment with this role in the project';
  END IF;

  INSERT INTO public.missions_project_assignments (
    project_id, member_id, role, start_date, notes, created_by
  ) VALUES (
    p_project_id, p_member_id, p_role, COALESCE(p_start_date, CURRENT_DATE), NULLIF(btrim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_missions_project_member(uuid, uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_missions_project_member(uuid, uuid, text, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_missions_project_assignment(
  p_assignment_id uuid,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_project_assignments%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_project_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;

  SELECT organization_id INTO v_org_id FROM public.missions_projects WHERE id = v_row.project_id;

  IF NOT public.has_org_access_permission(auth.uid(), v_org_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to end this assignment';
  END IF;

  IF v_row.status = 'encerrado' THEN
    RETURN;
  END IF;

  UPDATE public.missions_project_assignments
  SET status = 'encerrado', end_date = COALESCE(p_end_date, CURRENT_DATE)
  WHERE id = p_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.end_missions_project_assignment(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_missions_project_assignment(uuid, date) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_projects') THEN
    RAISE EXCEPTION 'Migration missions_projects: tabela missions_projects nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_project_assignments') THEN
    RAISE EXCEPTION 'Migration missions_projects: tabela missions_project_assignments nao foi criada';
  END IF;
  IF to_regprocedure('public.update_missions_project_status(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_projects: RPC update_missions_project_status nao foi criada';
  END IF;
  RAISE NOTICE 'Migration missions_projects: tabelas, RLS, RPCs e maquina de estados confirmados ✓';
END $$;

COMMIT;
