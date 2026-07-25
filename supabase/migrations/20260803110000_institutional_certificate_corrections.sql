-- ============================================================================
-- Correções auditáveis de certificados institucionais
-- ============================================================================
-- Certificados em rascunho podem ser ajustados livremente. Certificados já
-- emitidos preservam número, token público e documento, mas cada correção
-- guarda o estado anterior, exige motivo e incrementa a revisão.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.institutional_certificates') IS NULL THEN
    RAISE EXCEPTION 'certificate corrections preflight failed: institutional_certificates missing';
  END IF;
END;
$$;

ALTER TABLE public.institutional_certificates
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_correction_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.institutional_certificates'::regclass
      AND conname = 'institutional_certificates_revision_check'
  ) THEN
    ALTER TABLE public.institutional_certificates
      ADD CONSTRAINT institutional_certificates_revision_check
      CHECK (revision >= 1);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.institutional_certificate_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL
    REFERENCES public.institutional_certificates(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  certificate_status text NOT NULL
    CHECK (certificate_status IN ('rascunho', 'emitido', 'revogado')),
  correction_reason text NOT NULL
    CHECK (NULLIF(btrim(correction_reason), '') IS NOT NULL),
  snapshot jsonb NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_institutional_certificate_revisions_certificate
  ON public.institutional_certificate_revisions
  (certificate_id, changed_at DESC);

ALTER TABLE public.institutional_certificate_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institutional certificate revisions capability select"
  ON public.institutional_certificate_revisions;
CREATE POLICY "institutional certificate revisions capability select"
ON public.institutional_certificate_revisions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.institutional_certificates c
    WHERE c.id = institutional_certificate_revisions.certificate_id
      AND (
        public.has_org_access_permission(auth.uid(), c.organization_id, 'members.read')
        OR public.has_org_access_permission(auth.uid(), c.organization_id, 'documents.read')
        OR (
          c.source_module = 'discipulado'
          AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
        )
        OR (
          c.source_module = 'teologia'
          AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
        )
      )
  )
);

REVOKE INSERT, UPDATE, DELETE
  ON public.institutional_certificate_revisions FROM authenticated;
GRANT SELECT ON public.institutional_certificate_revisions TO authenticated;

CREATE OR REPLACE FUNCTION public.update_institutional_certificate(
  p_certificate_id uuid,
  p_recipient_name text,
  p_secondary_recipient_name text DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_course_name text DEFAULT NULL,
  p_workload_hours numeric DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_body_text text DEFAULT NULL,
  p_signer_name text DEFAULT NULL,
  p_signer_role text DEFAULT NULL,
  p_second_signer_name text DEFAULT NULL,
  p_second_signer_role text DEFAULT NULL,
  p_correction_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.institutional_certificates%ROWTYPE;
  v_recipient_name text := NULLIF(btrim(p_recipient_name), '');
  v_secondary_name text := NULLIF(btrim(p_secondary_recipient_name), '');
  v_event_date date;
  v_reason text := NULLIF(btrim(p_correction_reason), '');
  v_next_revision integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_row
  FROM public.institutional_certificates
  WHERE id = p_certificate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'certificate not found';
  END IF;
  IF v_row.status = 'revogado' THEN
    RAISE EXCEPTION 'revoked certificates cannot be edited';
  END IF;

  IF v_row.source_module = 'discipulado' THEN
    IF NOT public.has_org_access_permission(
      auth.uid(), v_row.organization_id, 'discipleship.manage'
    ) THEN
      RAISE EXCEPTION 'access denied to edit discipleship certificate';
    END IF;
  ELSIF v_row.source_module = 'teologia' THEN
    IF NOT public.has_org_access_permission(
      auth.uid(), v_row.organization_id, 'theology.manage'
    ) THEN
      RAISE EXCEPTION 'access denied to edit theology certificate';
    END IF;
  ELSIF NOT public.has_org_access_permission(
    auth.uid(), v_row.organization_id, 'members.write'
  ) THEN
    RAISE EXCEPTION 'access denied to edit institutional certificate';
  END IF;

  IF v_row.status = 'emitido' THEN
    IF NOT public.has_org_access_permission(
      auth.uid(), v_row.organization_id, 'documents.write'
    ) THEN
      RAISE EXCEPTION 'documents.write is required to correct an issued certificate';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'correction reason is required for issued certificates';
    END IF;
  END IF;

  IF v_recipient_name IS NULL THEN
    RAISE EXCEPTION 'recipient name is required';
  END IF;
  IF v_row.certificate_type = 'casamento' AND v_secondary_name IS NULL THEN
    RAISE EXCEPTION 'marriage certificate requires both names';
  END IF;
  IF p_workload_hours IS NOT NULL AND p_workload_hours < 0 THEN
    RAISE EXCEPTION 'workload hours cannot be negative';
  END IF;
  IF p_period_start IS NOT NULL
     AND p_period_end IS NOT NULL
     AND p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period end cannot be earlier than period start';
  END IF;

  v_event_date := COALESCE(p_event_date, v_row.event_date);
  v_next_revision := CASE
    WHEN v_row.status = 'emitido' THEN v_row.revision + 1
    ELSE v_row.revision
  END;

  INSERT INTO public.institutional_certificate_revisions (
    certificate_id,
    revision,
    certificate_status,
    correction_reason,
    snapshot,
    changed_by
  ) VALUES (
    v_row.id,
    v_row.revision,
    v_row.status,
    COALESCE(v_reason, 'Edição de rascunho'),
    to_jsonb(v_row),
    auth.uid()
  );

  UPDATE public.institutional_certificates
  SET recipient_name = v_recipient_name,
      secondary_recipient_name = v_secondary_name,
      event_date = v_event_date,
      location = NULLIF(btrim(p_location), ''),
      course_name = NULLIF(btrim(p_course_name), ''),
      workload_hours = p_workload_hours,
      period_start = p_period_start,
      period_end = p_period_end,
      body_text = NULLIF(btrim(p_body_text), ''),
      signer_name = NULLIF(btrim(p_signer_name), ''),
      signer_role = COALESCE(
        NULLIF(btrim(p_signer_role), ''),
        'Pastor Presidente'
      ),
      second_signer_name = NULLIF(btrim(p_second_signer_name), ''),
      second_signer_role = NULLIF(btrim(p_second_signer_role), ''),
      revision = v_next_revision,
      corrected_at = CASE
        WHEN v_row.status = 'emitido' THEN now()
        ELSE corrected_at
      END,
      corrected_by = CASE
        WHEN v_row.status = 'emitido' THEN auth.uid()
        ELSE corrected_by
      END,
      last_correction_reason = CASE
        WHEN v_row.status = 'emitido' THEN v_reason
        ELSE last_correction_reason
      END
  WHERE id = v_row.id;

  IF v_row.status = 'emitido' AND v_row.document_id IS NOT NULL THEN
    UPDATE public.documents
    SET title = v_row.title || ' — ' || v_recipient_name,
        content = jsonb_build_object(
          'certificate_id', v_row.id,
          'certificate_type', v_row.certificate_type,
          'member_id', v_row.member_id,
          'recipient_name', v_recipient_name,
          'secondary_recipient_name', v_secondary_name,
          'certificate_number', v_row.certificate_number,
          'public_token', v_row.public_token,
          'revision', v_next_revision,
          'corrected_at', now(),
          'correction_reason', v_reason
        )::text
    WHERE id = v_row.document_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_institutional_certificate(
  uuid, text, text, date, text, text, numeric, date, date, text,
  text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_institutional_certificate(
  uuid, text, text, date, text, text, numeric, date, date, text,
  text, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_institutional_certificates(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_organization_id IS NULL
     OR NOT (
       public.has_org_access_permission(auth.uid(), p_organization_id, 'members.read')
       OR public.has_org_access_permission(auth.uid(), p_organization_id, 'documents.read')
       OR public.has_org_access_permission(auth.uid(), p_organization_id, 'discipleship.read')
       OR public.has_org_access_permission(auth.uid(), p_organization_id, 'theology.read')
     ) THEN
    RAISE EXCEPTION 'access denied to list certificates';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      c.id, c.organization_id, c.certificate_type, c.source_module,
      c.source_enrollment_id, c.member_id, c.family_member_id,
      c.related_member_id, c.recipient_name, c.secondary_recipient_name,
      c.title, c.body_text, c.event_date, c.location, c.course_name,
      c.workload_hours, c.period_start, c.period_end, c.signer_name,
      c.signer_role, c.second_signer_name, c.second_signer_role,
      c.document_id, c.certificate_number, c.public_token, c.status,
      c.issued_at, c.revoked_at, c.revocation_reason, c.created_at,
      c.updated_at, c.revision, c.corrected_at, c.last_correction_reason,
      o.name AS organization_name,
      o.logo_url AS organization_logo_url,
      o.city AS organization_city,
      o.state AS organization_state,
      o.cnpj AS organization_cnpj,
      o.phone AS organization_phone,
      o.email AS organization_email
    FROM public.institutional_certificates c
    JOIN public.organizations o ON o.id = c.organization_id
    WHERE public.is_organization_descendant_or_self(p_organization_id, c.organization_id)
      AND (
        public.has_org_access_permission(auth.uid(), c.organization_id, 'members.read')
        OR public.has_org_access_permission(auth.uid(), c.organization_id, 'documents.read')
        OR (
          c.source_module = 'discipulado'
          AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.read')
        )
        OR (
          c.source_module = 'teologia'
          AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')
        )
      )
  ) item;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_institutional_certificates(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_institutional_certificates(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_institutional_certificate(
  p_token uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'certificate_type', c.certificate_type,
    'recipient_name', c.recipient_name,
    'secondary_recipient_name', c.secondary_recipient_name,
    'title', c.title,
    'body_text', c.body_text,
    'event_date', c.event_date,
    'location', c.location,
    'course_name', c.course_name,
    'workload_hours', c.workload_hours,
    'period_start', c.period_start,
    'period_end', c.period_end,
    'signer_name', c.signer_name,
    'signer_role', c.signer_role,
    'second_signer_name', c.second_signer_name,
    'second_signer_role', c.second_signer_role,
    'certificate_number', c.certificate_number,
    'status', c.status,
    'issued_at', c.issued_at,
    'revoked_at', c.revoked_at,
    'revocation_reason', c.revocation_reason,
    'revision', c.revision,
    'corrected_at', c.corrected_at,
    'organization_name', o.name,
    'organization_logo_url', o.logo_url,
    'organization_city', o.city,
    'organization_state', o.state,
    'organization_cnpj', o.cnpj,
    'organization_phone', o.phone,
    'organization_email', o.email
  )
  FROM public.institutional_certificates c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE c.public_token = p_token
    AND c.status IN ('emitido', 'revogado')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_institutional_certificate(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_institutional_certificate(uuid)
  TO anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.institutional_certificate_revisions') IS NULL THEN
    RAISE EXCEPTION 'certificate corrections: revision table was not created';
  END IF;
  IF to_regprocedure(
    'public.update_institutional_certificate(uuid,text,text,date,text,text,numeric,date,date,text,text,text,text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'certificate corrections: update RPC was not created';
  END IF;
END;
$$;

COMMIT;
