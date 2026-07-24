-- ============================================================================
-- Central de Certificados institucionais e acadêmicos
-- ============================================================================
-- Um único modelo oficial com dados variáveis. Reutiliza members,
-- member_family, documents, Discipulado, Teologia, organizations e o
-- histórico compartilhado. O logo/marca d'água é lido de organizations no
-- momento da visualização; não é copiado nem fixado nesta tabela.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.official_document_counters') IS NULL THEN
    v_missing := array_append(v_missing, 'public.official_document_counters');
  END IF;
  IF to_regclass('public.member_family') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_family');
  END IF;
  IF to_regclass('public.discipleship_enrollments') IS NULL THEN
    v_missing := array_append(v_missing, 'public.discipleship_enrollments');
  END IF;
  IF to_regclass('public.theology_enrollments') IS NULL THEN
    v_missing := array_append(v_missing, 'public.theology_enrollments');
  END IF;
  IF to_regprocedure('public.mark_discipleship_certificate_issued(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.mark_discipleship_certificate_issued(uuid,uuid)');
  END IF;
  IF to_regprocedure('public.mark_theology_certificate_issued(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.mark_theology_certificate_issued(uuid,uuid)');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'institutional certificates preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.institutional_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  certificate_type text NOT NULL CHECK (certificate_type IN (
    'apresentacao_crianca',
    'batismo_aguas',
    'casamento',
    'ministerial',
    'curso_discipulado',
    'formacao_teologica'
  )),
  source_module text NOT NULL DEFAULT 'secretaria'
    CHECK (source_module IN ('secretaria', 'discipulado', 'teologia')),
  source_enrollment_id uuid,

  -- Pessoa principal sempre vem de members. Apresentação de criança pode
  -- apontar também para member_family; casamento pode apontar para um segundo
  -- membro, sem obrigar que o cônjuge tenha conta própria.
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  family_member_id uuid REFERENCES public.member_family(id) ON DELETE RESTRICT,
  related_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,

  recipient_name text NOT NULL CHECK (NULLIF(btrim(recipient_name), '') IS NOT NULL),
  secondary_recipient_name text,
  title text NOT NULL DEFAULT 'Certificado' CHECK (NULLIF(btrim(title), '') IS NOT NULL),
  body_text text,
  event_date date NOT NULL,
  location text,
  course_name text,
  workload_hours numeric(7,1) CHECK (workload_hours IS NULL OR workload_hours >= 0),
  period_start date,
  period_end date,

  signer_name text,
  signer_role text,
  second_signer_name text,
  second_signer_role text,

  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  certificate_number text,
  public_token uuid,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'emitido', 'revogado')),
  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    (certificate_type = 'curso_discipulado'
      AND source_module = 'discipulado' AND source_enrollment_id IS NOT NULL)
    OR
    (certificate_type = 'formacao_teologica'
      AND source_module = 'teologia' AND source_enrollment_id IS NOT NULL)
    OR
    (certificate_type NOT IN ('curso_discipulado', 'formacao_teologica')
      AND source_module = 'secretaria' AND source_enrollment_id IS NULL)
  ),
  CHECK (
    certificate_type <> 'apresentacao_crianca' OR family_member_id IS NOT NULL
  ),
  CHECK (
    certificate_type <> 'casamento'
    OR NULLIF(btrim(secondary_recipient_name), '') IS NOT NULL
  ),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_institutional_certificates_org_status
  ON public.institutional_certificates (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_certificates_member
  ON public.institutional_certificates (member_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS institutional_certificates_org_number_unique_idx
  ON public.institutional_certificates (organization_id, certificate_number)
  WHERE certificate_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS institutional_certificates_public_token_unique_idx
  ON public.institutional_certificates (public_token)
  WHERE public_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS institutional_certificates_academic_source_unique_idx
  ON public.institutional_certificates (source_module, source_enrollment_id)
  WHERE source_enrollment_id IS NOT NULL AND status <> 'revogado';

DROP TRIGGER IF EXISTS update_institutional_certificates_updated_at
  ON public.institutional_certificates;
CREATE TRIGGER update_institutional_certificates_updated_at
BEFORE UPDATE ON public.institutional_certificates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.institutional_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institutional_certificates capability select"
  ON public.institutional_certificates;
CREATE POLICY "institutional_certificates capability select"
ON public.institutional_certificates
FOR SELECT TO authenticated
USING (
  public.has_org_access_permission(auth.uid(), organization_id, 'members.read')
  OR public.has_org_access_permission(auth.uid(), organization_id, 'documents.read')
  OR (
    source_module = 'discipulado'
    AND public.has_org_access_permission(auth.uid(), organization_id, 'discipleship.read')
  )
  OR (
    source_module = 'teologia'
    AND public.has_org_access_permission(auth.uid(), organization_id, 'theology.read')
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.institutional_certificates FROM authenticated;
GRANT SELECT ON public.institutional_certificates TO authenticated;

CREATE OR REPLACE FUNCTION public.list_member_family_for_certificates(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT COALESCE(congregation_id, sector_id, organization_id)
    INTO v_org_id
  FROM public.members
  WHERE id = p_member_id;

  IF v_org_id IS NULL
     OR NOT public.has_org_access_permission(auth.uid(), v_org_id, 'members.read') THEN
    RAISE EXCEPTION 'member not found or access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.full_name), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT id, member_id, related_member_id, relation, full_name, birth_date, gender
    FROM public.member_family
    WHERE member_id = p_member_id AND is_active = true
  ) f;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_member_family_for_certificates(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_member_family_for_certificates(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_academic_certificate_candidates(
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

  SELECT COALESCE(jsonb_agg(item ORDER BY item.completed_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      'discipulado'::text AS source_module,
      'curso_discipulado'::text AS certificate_type,
      e.id AS enrollment_id,
      e.member_id,
      m.full_name AS recipient_name,
      c.organization_id,
      c.name AS class_name,
      course.name AS course_name,
      course.workload_hours,
      c.start_date AS period_start,
      COALESCE(e.completed_at, c.expected_end_date, CURRENT_DATE) AS period_end,
      COALESCE(e.completed_at, c.expected_end_date, CURRENT_DATE) AS completed_at
    FROM public.discipleship_enrollments e
    JOIN public.discipleship_classes c ON c.id = e.class_id
    JOIN public.discipleship_courses course ON course.id = c.course_id
    JOIN public.members m ON m.id = e.member_id
    WHERE e.status = 'concluido'
      AND e.certificate_document_id IS NULL
      AND public.is_organization_descendant_or_self(p_organization_id, c.organization_id)
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'discipleship.manage')

    UNION ALL

    SELECT
      'teologia'::text AS source_module,
      'formacao_teologica'::text AS certificate_type,
      e.id AS enrollment_id,
      e.member_id,
      m.full_name AS recipient_name,
      c.organization_id,
      c.name AS class_name,
      program.name AS course_name,
      program.workload_hours,
      period.start_date AS period_start,
      COALESCE(e.completed_at, period.end_date, CURRENT_DATE) AS period_end,
      COALESCE(e.completed_at, period.end_date, CURRENT_DATE) AS completed_at
    FROM public.theology_enrollments e
    JOIN public.theology_classes c ON c.id = e.class_id
    JOIN public.theology_programs program ON program.id = c.program_id
    JOIN public.theology_periods period ON period.id = c.period_id
    JOIN public.members m ON m.id = e.member_id
    WHERE e.status = 'concluido'
      AND e.certificate_document_id IS NULL
      AND public.is_organization_descendant_or_self(p_organization_id, c.organization_id)
      AND public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.manage')
  ) item;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_academic_certificate_candidates(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_academic_certificate_candidates(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.create_institutional_certificate(
  p_organization_id uuid,
  p_certificate_type text,
  p_member_id uuid,
  p_family_member_id uuid DEFAULT NULL,
  p_related_member_id uuid DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_secondary_recipient_name text DEFAULT NULL,
  p_event_date date DEFAULT CURRENT_DATE,
  p_location text DEFAULT NULL,
  p_course_name text DEFAULT NULL,
  p_workload_hours numeric DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_source_module text DEFAULT 'secretaria',
  p_source_enrollment_id uuid DEFAULT NULL,
  p_body_text text DEFAULT NULL,
  p_signer_name text DEFAULT NULL,
  p_signer_role text DEFAULT 'Pastor Presidente',
  p_second_signer_name text DEFAULT NULL,
  p_second_signer_role text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_member_name text;
  v_member_org uuid;
  v_family_name text;
  v_family_owner uuid;
  v_family_related uuid;
  v_course_name text := NULLIF(btrim(p_course_name), '');
  v_workload numeric := p_workload_hours;
  v_period_start date := p_period_start;
  v_period_end date := p_period_end;
  v_event_date date := COALESCE(p_event_date, CURRENT_DATE);
  v_source_module text := COALESCE(NULLIF(btrim(p_source_module), ''), 'secretaria');
  v_title text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_certificate_type NOT IN (
    'apresentacao_crianca', 'batismo_aguas', 'casamento',
    'ministerial', 'curso_discipulado', 'formacao_teologica'
  ) THEN
    RAISE EXCEPTION 'invalid certificate type';
  END IF;

  SELECT full_name, COALESCE(congregation_id, sector_id, organization_id)
    INTO v_member_name, v_member_org
  FROM public.members
  WHERE id = p_member_id;

  IF v_member_org IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  IF p_certificate_type = 'curso_discipulado' THEN
    SELECT
      m.full_name, c.organization_id, course.name, course.workload_hours,
      c.start_date, COALESCE(e.completed_at, c.expected_end_date, CURRENT_DATE)
    INTO
      v_member_name, v_member_org, v_course_name, v_workload,
      v_period_start, v_period_end
    FROM public.discipleship_enrollments e
    JOIN public.discipleship_classes c ON c.id = e.class_id
    JOIN public.discipleship_courses course ON course.id = c.course_id
    JOIN public.members m ON m.id = e.member_id
    WHERE e.id = p_source_enrollment_id
      AND e.member_id = p_member_id
      AND e.status = 'concluido'
      AND e.certificate_document_id IS NULL;

    IF NOT FOUND THEN RAISE EXCEPTION 'discipleship enrollment is not eligible'; END IF;
    IF NOT public.has_org_access_permission(auth.uid(), v_member_org, 'discipleship.manage') THEN
      RAISE EXCEPTION 'access denied to issue discipleship certificate';
    END IF;
    v_source_module := 'discipulado';
    v_event_date := v_period_end;

  ELSIF p_certificate_type = 'formacao_teologica' THEN
    SELECT
      m.full_name, c.organization_id, program.name, program.workload_hours,
      period.start_date, COALESCE(e.completed_at, period.end_date, CURRENT_DATE)
    INTO
      v_member_name, v_member_org, v_course_name, v_workload,
      v_period_start, v_period_end
    FROM public.theology_enrollments e
    JOIN public.theology_classes c ON c.id = e.class_id
    JOIN public.theology_programs program ON program.id = c.program_id
    JOIN public.theology_periods period ON period.id = c.period_id
    JOIN public.members m ON m.id = e.member_id
    WHERE e.id = p_source_enrollment_id
      AND e.member_id = p_member_id
      AND e.status = 'concluido'
      AND e.certificate_document_id IS NULL;

    IF NOT FOUND THEN RAISE EXCEPTION 'theology enrollment is not eligible'; END IF;
    IF NOT public.has_org_access_permission(auth.uid(), v_member_org, 'theology.manage') THEN
      RAISE EXCEPTION 'access denied to issue theology certificate';
    END IF;
    v_source_module := 'teologia';
    v_event_date := v_period_end;

  ELSE
    IF p_organization_id IS NULL
       OR NOT public.is_organization_descendant_or_self(p_organization_id, v_member_org)
       OR NOT public.has_org_access_permission(auth.uid(), v_member_org, 'members.write') THEN
      RAISE EXCEPTION 'access denied to create institutional certificate';
    END IF;
    v_source_module := 'secretaria';
  END IF;

  IF p_certificate_type = 'apresentacao_crianca' THEN
    SELECT full_name, member_id, related_member_id
      INTO v_family_name, v_family_owner, v_family_related
    FROM public.member_family
    WHERE id = p_family_member_id AND is_active = true;

    IF v_family_owner IS DISTINCT FROM p_member_id THEN
      RAISE EXCEPTION 'family member does not belong to the selected guardian';
    END IF;
    v_member_name := v_family_name;
  END IF;

  IF p_certificate_type = 'casamento'
     AND NULLIF(btrim(p_secondary_recipient_name), '') IS NULL THEN
    RAISE EXCEPTION 'marriage certificate requires both names';
  END IF;

  v_title := CASE p_certificate_type
    WHEN 'apresentacao_crianca' THEN 'Certificado de Apresentação de Criança'
    WHEN 'batismo_aguas' THEN 'Certificado de Batismo em Águas'
    WHEN 'casamento' THEN 'Certificado de Casamento'
    WHEN 'ministerial' THEN 'Certificado Ministerial'
    WHEN 'curso_discipulado' THEN 'Certificado de Curso e Discipulado'
    WHEN 'formacao_teologica' THEN 'Certificado de Formação Teológica'
  END;

  INSERT INTO public.institutional_certificates (
    organization_id, certificate_type, source_module, source_enrollment_id,
    member_id, family_member_id, related_member_id, recipient_name,
    secondary_recipient_name, title, body_text, event_date, location,
    course_name, workload_hours, period_start, period_end,
    signer_name, signer_role, second_signer_name, second_signer_role,
    created_by
  ) VALUES (
    v_member_org, p_certificate_type, v_source_module, p_source_enrollment_id,
    p_member_id, p_family_member_id, COALESCE(p_related_member_id, v_family_related),
    COALESCE(NULLIF(btrim(p_recipient_name), ''), v_member_name),
    NULLIF(btrim(p_secondary_recipient_name), ''), v_title,
    NULLIF(btrim(p_body_text), ''), v_event_date, NULLIF(btrim(p_location), ''),
    v_course_name, v_workload, v_period_start, v_period_end,
    NULLIF(btrim(p_signer_name), ''),
    COALESCE(NULLIF(btrim(p_signer_role), ''), 'Pastor Presidente'),
    NULLIF(btrim(p_second_signer_name), ''),
    NULLIF(btrim(p_second_signer_role), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_institutional_certificate(
  uuid, text, uuid, uuid, uuid, text, text, date, text, text, numeric,
  date, date, text, uuid, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_institutional_certificate(
  uuid, text, uuid, uuid, uuid, text, text, date, text, text, numeric,
  date, date, text, uuid, text, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_institutional_certificate(
  p_certificate_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.institutional_certificates%ROWTYPE;
  v_number bigint;
  v_certificate_number text;
  v_document_id uuid;
  v_token uuid;
  v_org_pastor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row
  FROM public.institutional_certificates
  WHERE id = p_certificate_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF v_row.status = 'emitido' AND v_row.document_id IS NOT NULL THEN
    RETURN v_row.document_id;
  END IF;
  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'only draft certificates can be issued';
  END IF;

  IF v_row.source_module = 'discipulado' THEN
    IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'discipleship.manage') THEN
      RAISE EXCEPTION 'access denied to issue discipleship certificate';
    END IF;
  ELSIF v_row.source_module = 'teologia' THEN
    IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'theology.manage') THEN
      RAISE EXCEPTION 'access denied to issue theology certificate';
    END IF;
  ELSIF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'members.write') THEN
    RAISE EXCEPTION 'access denied to issue institutional certificate';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'documents.write') THEN
    RAISE EXCEPTION 'documents.write is required to issue a certificate';
  END IF;

  SELECT pastor_president_name INTO v_org_pastor
  FROM public.organizations WHERE id = v_row.organization_id;

  v_number := public._next_official_document_number(
    v_row.organization_id, 'certificado', EXTRACT(YEAR FROM CURRENT_DATE)::integer
  );
  v_certificate_number := format(
    'CERT-%s-%s',
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    lpad(v_number::text, 6, '0')
  );
  v_token := COALESCE(v_row.public_token, gen_random_uuid());

  INSERT INTO public.documents (
    organization_id, title, content, document_type, created_by
  ) VALUES (
    v_row.organization_id,
    v_row.title || ' — ' || v_row.recipient_name,
    jsonb_build_object(
      'certificate_id', v_row.id,
      'certificate_type', v_row.certificate_type,
      'member_id', v_row.member_id,
      'recipient_name', v_row.recipient_name,
      'certificate_number', v_certificate_number,
      'public_token', v_token
    )::text,
    'Certificado',
    auth.uid()
  )
  RETURNING id INTO v_document_id;

  UPDATE public.institutional_certificates
  SET document_id = v_document_id,
      certificate_number = v_certificate_number,
      public_token = v_token,
      status = 'emitido',
      issued_at = now(),
      issued_by = auth.uid(),
      signer_name = COALESCE(
        NULLIF(btrim(signer_name), ''),
        NULLIF(btrim(v_org_pastor), ''),
        'Secretaria da Igreja'
      ),
      signer_role = COALESCE(NULLIF(btrim(signer_role), ''), 'Pastor Presidente')
  WHERE id = v_row.id;

  IF v_row.source_module = 'discipulado' THEN
    PERFORM public.mark_discipleship_certificate_issued(
      v_row.source_enrollment_id, v_document_id
    );
  ELSIF v_row.source_module = 'teologia' THEN
    PERFORM public.mark_theology_certificate_issued(
      v_row.source_enrollment_id, v_document_id
    );
  ELSE
    PERFORM public.register_member_history_event(
      v_row.member_id,
      'certificado_emitido',
      v_row.title || ': ' || v_row.recipient_name,
      v_row.body_text,
      v_row.event_date::timestamptz,
      'secretaria',
      'institutional_certificates',
      v_row.id,
      v_document_id,
      NULL,
      'normal',
      NULL,
      NULL,
      NULL
    );

    IF v_row.related_member_id IS NOT NULL
       AND v_row.related_member_id <> v_row.member_id THEN
      PERFORM public.register_member_history_event(
        v_row.related_member_id,
        'certificado_emitido',
        v_row.title || ': ' || COALESCE(v_row.secondary_recipient_name, v_row.recipient_name),
        v_row.body_text,
        v_row.event_date::timestamptz,
        'secretaria',
        'institutional_certificates',
        v_row.id,
        v_document_id,
        NULL,
        'normal',
        NULL,
        NULL,
        NULL
      );
    END IF;
  END IF;

  RETURN v_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_institutional_certificate(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_institutional_certificate(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_institutional_certificate(
  p_certificate_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.institutional_certificates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'revocation reason is required';
  END IF;

  SELECT * INTO v_row
  FROM public.institutional_certificates
  WHERE id = p_certificate_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF v_row.status <> 'emitido' THEN
    RAISE EXCEPTION 'only issued certificates can be revoked';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'documents.write') THEN
    RAISE EXCEPTION 'access denied to revoke certificate';
  END IF;

  UPDATE public.institutional_certificates
  SET status = 'revogado',
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = btrim(p_reason)
  WHERE id = p_certificate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_institutional_certificate(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_institutional_certificate(uuid, text)
  TO authenticated;

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
  IF to_regclass('public.institutional_certificates') IS NULL THEN
    RAISE EXCEPTION 'institutional certificates: table was not created';
  END IF;
  IF to_regprocedure('public.issue_institutional_certificate(uuid)') IS NULL THEN
    RAISE EXCEPTION 'institutional certificates: issue RPC was not created';
  END IF;
  IF to_regprocedure('public.get_public_institutional_certificate(uuid)') IS NULL THEN
    RAISE EXCEPTION 'institutional certificates: public validation RPC was not created';
  END IF;
END;
$$;

COMMIT;
