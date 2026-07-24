-- ============================================================================
-- Migration: missions_missionaries
-- Timestamp: 20260731100000
-- OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia
-- ============================================================================
--
-- WinTechi: "Missionários". Missionário é um PAPEL sobre public.members —
-- vínculo obrigatório, nunca uma segunda identidade humana.
--
-- Separação pública × confidencial: dados operacionais (situação, campo,
-- datas, organização) ficam em missions_missionaries, legíveis por
-- missions.read. Dados sensíveis (documento pessoal, contato de emergência,
-- observações confidenciais) ficam em missions_missionary_confidential_info,
-- legíveis SOMENTE por missions.confidential — mesma separação por TABELA
-- (não por coluna, RLS do Postgres é por linha) já usada por member_history/
-- member_occurrences (visibility) e agora reforçada com tabela própria
-- porque aqui a confidencialidade é constante por missionário, não um evento.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.members') IS NULL THEN v_missing := array_append(v_missing, 'public.members'); END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_missing := array_append(v_missing, 'public.organizations'); END IF;
  IF to_regclass('public.documents') IS NULL THEN v_missing := array_append(v_missing, 'public.documents'); END IF;
  IF to_regclass('public.missions_settings') IS NULL THEN
    v_missing := array_append(v_missing, 'public.missions_settings (migration anterior)');
  END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission()');
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_organization_descendant_or_self()');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'missions_missionaries preflight failed; missing: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ── missions_missionaries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions_missionaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  -- Responsável institucional (coordenador/pastor de referência) — também um
  -- membro, nunca um texto livre. Opcional: nem todo missionário precisa de
  -- um responsável individual nomeado além da organização.
  coordinator_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'candidato'
    CHECK (status IN ('candidato', 'em_preparacao', 'ativo', 'em_licenca', 'retornado', 'encerrado')),

  -- Campo/local de atuação (público — informação institucional, não pessoal).
  field_country text,
  field_state text,
  field_city text,
  field_region text,
  field_description text,

  sent_at date,
  start_at date,
  returned_at date,
  ended_at date,

  public_notes text,

  legacy_source text,
  legacy_module text,
  legacy_code text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (returned_at IS NULL OR start_at IS NULL OR returned_at >= start_at),
  CHECK (ended_at IS NULL OR sent_at IS NULL OR ended_at >= sent_at)
);

CREATE INDEX IF NOT EXISTS idx_missions_missionaries_org_status
  ON public.missions_missionaries (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_missions_missionaries_field
  ON public.missions_missionaries (field_country, field_state, field_region);

CREATE UNIQUE INDEX IF NOT EXISTS missions_missionaries_legacy_unique_idx
  ON public.missions_missionaries (organization_id, legacy_source, COALESCE(legacy_module, ''), legacy_code)
  WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL;

DROP TRIGGER IF EXISTS update_missions_missionaries_updated_at ON public.missions_missionaries;
CREATE TRIGGER update_missions_missionaries_updated_at
BEFORE UPDATE ON public.missions_missionaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Escopo organizacional real: sempre revalidado por is_organization_descendant_or_self
-- entre a organização do membro e a organização informada da missão, nunca
-- confiando apenas no organization_id enviado pelo frontend.
CREATE OR REPLACE FUNCTION public._missions_missionaries_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_org uuid;
BEGIN
  SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_member_org
  FROM public.members WHERE id = NEW.member_id;

  IF v_member_org IS NULL THEN
    RAISE EXCEPTION 'missionary member not found or has no organization';
  END IF;

  IF NOT public.is_organization_descendant_or_self(NEW.organization_id, v_member_org) THEN
    RAISE EXCEPTION 'missionary member is outside the informed organization scope';
  END IF;

  IF NEW.coordinator_member_id IS NOT NULL THEN
    DECLARE
      v_coordinator_org uuid;
    BEGIN
      SELECT COALESCE(congregation_id, sector_id, organization_id) INTO v_coordinator_org
      FROM public.members WHERE id = NEW.coordinator_member_id;

      IF v_coordinator_org IS NULL
         OR NOT public.is_organization_descendant_or_self(NEW.organization_id, v_coordinator_org) THEN
        RAISE EXCEPTION 'coordinator member is outside the informed organization scope';
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._missions_missionaries_validate_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS missions_missionaries_validate_scope ON public.missions_missionaries;
CREATE TRIGGER missions_missionaries_validate_scope
BEFORE INSERT OR UPDATE ON public.missions_missionaries
FOR EACH ROW EXECUTE FUNCTION public._missions_missionaries_validate_scope();

ALTER TABLE public.missions_missionaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_missionaries capability select" ON public.missions_missionaries;
CREATE POLICY "missions_missionaries capability select" ON public.missions_missionaries
FOR SELECT TO authenticated
USING (public.has_org_access_permission(auth.uid(), organization_id, 'missions.read'));

-- Escrita somente por RPC (garante papel único por membro, escopo real e
-- transições de estado válidas).
REVOKE INSERT, UPDATE, DELETE ON public.missions_missionaries FROM authenticated;
GRANT SELECT ON public.missions_missionaries TO authenticated;

CREATE OR REPLACE FUNCTION public.create_missions_missionary(
  p_member_id uuid,
  p_organization_id uuid,
  p_coordinator_member_id uuid DEFAULT NULL,
  p_field_country text DEFAULT NULL,
  p_field_state text DEFAULT NULL,
  p_field_city text DEFAULT NULL,
  p_field_region text DEFAULT NULL,
  p_field_description text DEFAULT NULL,
  p_public_notes text DEFAULT NULL
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
    RAISE EXCEPTION 'access denied to register a missionary';
  END IF;

  IF EXISTS (SELECT 1 FROM public.missions_missionaries WHERE member_id = p_member_id) THEN
    RAISE EXCEPTION 'this member is already registered as a missionary';
  END IF;

  INSERT INTO public.missions_missionaries (
    member_id, organization_id, coordinator_member_id, field_country, field_state,
    field_city, field_region, field_description, public_notes, created_by
  ) VALUES (
    p_member_id, p_organization_id, p_coordinator_member_id, NULLIF(btrim(p_field_country), ''),
    NULLIF(btrim(p_field_state), ''), NULLIF(btrim(p_field_city), ''), NULLIF(btrim(p_field_region), ''),
    NULLIF(btrim(p_field_description), ''), NULLIF(btrim(p_public_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_missions_missionary(
  uuid, uuid, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_missions_missionary(
  uuid, uuid, uuid, text, text, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_missions_missionary_profile(
  p_missionary_id uuid,
  p_coordinator_member_id uuid DEFAULT NULL,
  p_field_country text DEFAULT NULL,
  p_field_state text DEFAULT NULL,
  p_field_city text DEFAULT NULL,
  p_field_region text DEFAULT NULL,
  p_field_description text DEFAULT NULL,
  p_public_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_missionaries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_missionaries WHERE id = p_missionary_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'missionary not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to update this missionary';
  END IF;

  UPDATE public.missions_missionaries
  SET coordinator_member_id = p_coordinator_member_id,
      field_country = NULLIF(btrim(p_field_country), ''),
      field_state = NULLIF(btrim(p_field_state), ''),
      field_city = NULLIF(btrim(p_field_city), ''),
      field_region = NULLIF(btrim(p_field_region), ''),
      field_description = NULLIF(btrim(p_field_description), ''),
      public_notes = NULLIF(btrim(p_public_notes), '')
  WHERE id = p_missionary_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_missions_missionary_profile(
  uuid, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_missions_missionary_profile(
  uuid, uuid, text, text, text, text, text, text
) TO authenticated;

-- ── Máquina de estados do missionário ────────────────────────────────────
-- candidato -> em_preparacao | encerrado
-- em_preparacao -> ativo | encerrado
-- ativo -> em_licenca | retornado | encerrado
-- em_licenca -> ativo | encerrado
-- retornado -> em_preparacao (nova fase de envio) | encerrado
-- encerrado -> terminal (sem transição)
CREATE OR REPLACE FUNCTION public.update_missions_missionary_status(
  p_missionary_id uuid,
  p_status text,
  p_effective_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.missions_missionaries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row FROM public.missions_missionaries WHERE id = p_missionary_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'missionary not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.manage') THEN
    RAISE EXCEPTION 'access denied to update missionary status';
  END IF;

  IF NOT (
    (v_row.status = 'candidato' AND p_status IN ('em_preparacao', 'encerrado'))
    OR (v_row.status = 'em_preparacao' AND p_status IN ('ativo', 'encerrado'))
    OR (v_row.status = 'ativo' AND p_status IN ('em_licenca', 'retornado', 'encerrado'))
    OR (v_row.status = 'em_licenca' AND p_status IN ('ativo', 'encerrado'))
    OR (v_row.status = 'retornado' AND p_status IN ('em_preparacao', 'encerrado'))
  ) THEN
    RAISE EXCEPTION 'invalid missionary status transition: % -> %', v_row.status, p_status;
  END IF;

  UPDATE public.missions_missionaries
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'ativo' AND v_row.status = 'em_preparacao' THEN COALESCE(p_effective_date, CURRENT_DATE) ELSE sent_at END,
      start_at = CASE WHEN p_status = 'ativo' AND v_row.status = 'em_preparacao' THEN COALESCE(p_effective_date, CURRENT_DATE) ELSE start_at END,
      returned_at = CASE WHEN p_status = 'retornado' THEN COALESCE(p_effective_date, CURRENT_DATE) ELSE returned_at END,
      ended_at = CASE WHEN p_status = 'encerrado' THEN COALESCE(p_effective_date, CURRENT_DATE) ELSE ended_at END,
      public_notes = CASE WHEN NULLIF(btrim(p_notes), '') IS NOT NULL THEN NULLIF(btrim(p_notes), '') ELSE public_notes END
  WHERE id = p_missionary_id;

  -- O registro na timeline institucional compartilhada (public.member_history)
  -- acontece via trigger AFTER UPDATE OF status em missions_missionaries,
  -- definido em 20260731140000_missions_history_and_reports.sql — mesmo
  -- padrão de theology_enrollments/discipleship_enrollments (trigger na
  -- tabela, não chamada direta de uma migration anterior a outra posterior).
END;
$$;

REVOKE ALL ON FUNCTION public.update_missions_missionary_status(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_missions_missionary_status(uuid, text, date, text) TO authenticated;

-- ── missions_missionary_confidential_info ────────────────────────────────
-- 1:1 com missions_missionaries. Informação pessoal sensível — documento,
-- contato de emergência, observações confidenciais. Legível SOMENTE por
-- missions.confidential (nunca por missions.read/missions.manage isolados).
CREATE TABLE IF NOT EXISTS public.missions_missionary_confidential_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missionary_id uuid NOT NULL UNIQUE REFERENCES public.missions_missionaries(id) ON DELETE CASCADE,

  personal_document text,
  emergency_contact_name text,
  emergency_contact_phone text,
  health_notes text,
  confidential_notes text,

  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  attachment_path text,

  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_missions_missionary_confidential_updated_at ON public.missions_missionary_confidential_info;
CREATE TRIGGER update_missions_missionary_confidential_updated_at
BEFORE UPDATE ON public.missions_missionary_confidential_info
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missions_missionary_confidential_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_missionary_confidential capability select" ON public.missions_missionary_confidential_info;
CREATE POLICY "missions_missionary_confidential capability select" ON public.missions_missionary_confidential_info
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.missions_missionaries mm
    WHERE mm.id = missions_missionary_confidential_info.missionary_id
      AND public.has_org_access_permission(auth.uid(), mm.organization_id, 'missions.confidential')
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.missions_missionary_confidential_info FROM authenticated;
GRANT SELECT ON public.missions_missionary_confidential_info TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_missions_missionary_confidential_info(
  p_missionary_id uuid,
  p_personal_document text DEFAULT NULL,
  p_emergency_contact_name text DEFAULT NULL,
  p_emergency_contact_phone text DEFAULT NULL,
  p_health_notes text DEFAULT NULL,
  p_confidential_notes text DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missionary public.missions_missionaries%ROWTYPE;
  v_base_org_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_missionary FROM public.missions_missionaries WHERE id = p_missionary_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'missionary not found'; END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_missionary.organization_id, 'missions.confidential') THEN
    RAISE EXCEPTION 'access denied to manage confidential missionary information';
  END IF;

  SELECT organization_id INTO v_base_org_id FROM public.members WHERE id = v_missionary.member_id;

  IF p_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents d WHERE d.id = p_document_id AND d.organization_id = v_base_org_id
  ) THEN
    RAISE EXCEPTION 'document not found for this organization';
  END IF;

  INSERT INTO public.missions_missionary_confidential_info (
    missionary_id, personal_document, emergency_contact_name, emergency_contact_phone,
    health_notes, confidential_notes, document_id, attachment_path, updated_by
  ) VALUES (
    p_missionary_id, NULLIF(btrim(p_personal_document), ''), NULLIF(btrim(p_emergency_contact_name), ''),
    NULLIF(btrim(p_emergency_contact_phone), ''), NULLIF(btrim(p_health_notes), ''),
    NULLIF(btrim(p_confidential_notes), ''), p_document_id, p_attachment_path, auth.uid()
  )
  ON CONFLICT (missionary_id) DO UPDATE SET
    personal_document = EXCLUDED.personal_document,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    health_notes = EXCLUDED.health_notes,
    confidential_notes = EXCLUDED.confidential_notes,
    document_id = EXCLUDED.document_id,
    attachment_path = EXCLUDED.attachment_path,
    updated_by = EXCLUDED.updated_by
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_missions_missionary_confidential_info(
  uuid, text, text, text, text, text, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_missions_missionary_confidential_info(
  uuid, text, text, text, text, text, uuid, text
) TO authenticated;

-- ── Verificação final ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_missionaries') THEN
    RAISE EXCEPTION 'Migration missions_missionaries: tabela missions_missionaries nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missions_missionary_confidential_info') THEN
    RAISE EXCEPTION 'Migration missions_missionaries: tabela confidencial nao foi criada';
  END IF;
  IF to_regprocedure('public.update_missions_missionary_status(uuid,text,date,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration missions_missionaries: RPC update_missions_missionary_status nao foi criada';
  END IF;
  RAISE NOTICE 'Migration missions_missionaries: tabelas, RLS, RPCs e maquina de estados confirmados ✓ (historico registrado na migration 6)';
END $$;

COMMIT;
