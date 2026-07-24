-- ============================================================================
-- Carta de Transferência oficial — numeração, emissão e validação pública
-- ============================================================================
-- Complementa public.member_transfers sem criar pessoa, igreja ou histórico
-- paralelos. Toda escrita crítica passa por RPC; o QR usa token permanente do
-- documento (não o token efêmero da Carteira de Membro).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.member_transfers') IS NULL THEN
    v_missing := array_append(v_missing, 'public.member_transfers');
  END IF;
  IF to_regclass('public.documents') IS NULL THEN
    v_missing := array_append(v_missing, 'public.documents');
  END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission(uuid,uuid,text)');
  END IF;
  IF to_regprocedure('public.is_organization_descendant_or_self(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.is_organization_descendant_or_self(uuid,uuid)');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'official transfer letters preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- Contador compartilhado e interno para documentos oficiais. A chave inclui
-- organização/tipo/ano; ON CONFLICT + RETURNING mantém a numeração atômica.
CREATE TABLE IF NOT EXISTS public.official_document_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_kind text NOT NULL CHECK (NULLIF(btrim(document_kind), '') IS NOT NULL),
  document_year integer NOT NULL CHECK (document_year BETWEEN 1900 AND 9999),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, document_kind, document_year)
);

ALTER TABLE public.official_document_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.official_document_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._next_official_document_number(
  p_organization_id uuid,
  p_document_kind text,
  p_document_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number bigint;
BEGIN
  IF p_organization_id IS NULL OR NULLIF(btrim(p_document_kind), '') IS NULL THEN
    RAISE EXCEPTION 'organization and document kind are required';
  END IF;

  INSERT INTO public.official_document_counters (
    organization_id, document_kind, document_year, last_number
  ) VALUES (
    p_organization_id, btrim(p_document_kind), p_document_year, 1
  )
  ON CONFLICT (organization_id, document_kind, document_year)
  DO UPDATE SET
    last_number = public.official_document_counters.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_number;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public._next_official_document_number(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.member_transfers
  ADD COLUMN IF NOT EXISTS transfer_number text,
  ADD COLUMN IF NOT EXISTS public_token uuid,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS origin_city text,
  ADD COLUMN IF NOT EXISTS origin_state text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS destination_city text,
  ADD COLUMN IF NOT EXISTS destination_state text,
  ADD COLUMN IF NOT EXISTS destination_country text,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_role text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS member_transfers_org_number_unique_idx
  ON public.member_transfers (organization_id, transfer_number)
  WHERE transfer_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_transfers_public_token_unique_idx
  ON public.member_transfers (public_token)
  WHERE public_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_secretaria_members(
  p_organization_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  full_name text,
  known_name text,
  member_code text,
  baptized_at date,
  baptism_place text,
  spouse_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_organization_id IS NULL
     OR NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'members.read') THEN
    RAISE EXCEPTION 'access denied to search members';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.full_name, m.known_name, m.member_code, m.baptized_at,
    m.baptism_place, m.spouse_name
  FROM public.members m
  WHERE public.is_organization_descendant_or_self(
      p_organization_id, COALESCE(m.congregation_id, m.sector_id, m.organization_id)
    )
    AND (
      v_query IS NULL
      OR m.full_name ILIKE '%' || v_query || '%'
      OR COALESCE(m.known_name, '') ILIKE '%' || v_query || '%'
      OR COALESCE(m.member_code, '') ILIKE '%' || v_query || '%'
      OR COALESCE(m.legacy_code, '') ILIKE '%' || v_query || '%'
    )
  ORDER BY m.full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.search_secretaria_members(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_secretaria_members(uuid, text, integer)
  TO authenticated;

-- Fluxo simplificado de tela: a Carta de Transferência sempre é emitida pela
-- unidade atual do membro para uma unidade interna ou igreja externa.
CREATE OR REPLACE FUNCTION public.create_member_transfer_letter(
  p_member_id uuid,
  p_destination_type text,
  p_destination_organization_id uuid DEFAULT NULL,
  p_destination_church_name text DEFAULT NULL,
  p_destination_city text DEFAULT NULL,
  p_destination_state text DEFAULT NULL,
  p_destination_country text DEFAULT 'Brasil',
  p_requested_at date DEFAULT CURRENT_DATE,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_origin_org uuid;
  v_origin_city text;
  v_origin_state text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT
    COALESCE(m.congregation_id, m.sector_id, m.organization_id),
    o.city,
    o.state
  INTO v_origin_org, v_origin_city, v_origin_state
  FROM public.members m
  JOIN public.organizations o
    ON o.id = COALESCE(m.congregation_id, m.sector_id, m.organization_id)
  WHERE m.id = p_member_id;

  IF v_origin_org IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  v_id := public.create_member_transfer(
    p_member_id,
    'emitida',
    p_destination_type,
    p_destination_organization_id,
    p_destination_church_name,
    COALESCE(p_requested_at, CURRENT_DATE),
    p_reason,
    NULL,
    NULL,
    NULL
  );

  UPDATE public.member_transfers
  SET origin_city = v_origin_city,
      origin_state = v_origin_state,
      origin_country = 'Brasil',
      destination_city = NULLIF(btrim(p_destination_city), ''),
      destination_state = NULLIF(upper(btrim(p_destination_state)), ''),
      destination_country = COALESCE(NULLIF(btrim(p_destination_country), ''), 'Brasil')
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_transfer_letter(
  uuid, text, uuid, text, text, text, text, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_transfer_letter(
  uuid, text, uuid, text, text, text, text, date, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_member_transfer_letter(
  p_transfer_id uuid,
  p_signer_name text DEFAULT NULL,
  p_signer_role text DEFAULT 'Pastor Presidente'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.member_transfers%ROWTYPE;
  v_member_name text;
  v_org_name text;
  v_pastor_name text;
  v_number bigint;
  v_transfer_number text;
  v_document_id uuid;
  v_token uuid;
  v_target text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_row
  FROM public.member_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF v_row.direction <> 'emitida' THEN
    RAISE EXCEPTION 'only outgoing transfers generate a transfer letter';
  END IF;
  IF v_row.document_id IS NOT NULL AND v_row.issued_at IS NOT NULL THEN
    RETURN v_row.document_id;
  END IF;
  IF v_row.status <> 'aprovada' THEN
    RAISE EXCEPTION 'transfer must be approved before issuing the letter';
  END IF;

  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'members.write')
     OR NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'documents.write') THEN
    RAISE EXCEPTION 'access denied to issue transfer letter';
  END IF;

  SELECT m.full_name INTO v_member_name
  FROM public.members m WHERE m.id = v_row.member_id;

  SELECT o.name, o.pastor_president_name
    INTO v_org_name, v_pastor_name
  FROM public.organizations o WHERE o.id = v_row.organization_id;

  v_number := public._next_official_document_number(
    v_row.organization_id, 'transferencia', EXTRACT(YEAR FROM CURRENT_DATE)::integer
  );
  v_transfer_number := format(
    'TR-%s-%s',
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    lpad(v_number::text, 6, '0')
  );
  v_token := COALESCE(v_row.public_token, gen_random_uuid());
  v_target := COALESCE(
    (SELECT name FROM public.organizations WHERE id = v_row.destination_organization_id),
    v_row.destination_church_name,
    'Igreja de destino'
  );

  INSERT INTO public.documents (
    organization_id, title, content, document_type, created_by
  ) VALUES (
    v_row.organization_id,
    'Carta de Transferência — ' || v_member_name,
    jsonb_build_object(
      'member_id', v_row.member_id,
      'member_name', v_member_name,
      'transfer_id', v_row.id,
      'transfer_number', v_transfer_number,
      'destination', v_target,
      'public_token', v_token
    )::text,
    'Carta de Transferência',
    auth.uid()
  )
  RETURNING id INTO v_document_id;

  UPDATE public.member_transfers
  SET transfer_number = v_transfer_number,
      public_token = v_token,
      document_id = v_document_id,
      issued_at = now(),
      signer_name = COALESCE(
        NULLIF(btrim(p_signer_name), ''),
        NULLIF(btrim(v_pastor_name), ''),
        'Secretaria da Igreja'
      ),
      signer_role = COALESCE(NULLIF(btrim(p_signer_role), ''), 'Pastor Presidente'),
      status = 'concluida',
      completed_at = COALESCE(completed_at, CURRENT_DATE)
  WHERE id = v_row.id;

  RETURN v_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_member_transfer_letter(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_member_transfer_letter(uuid, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_member_transfer_letter(
  p_transfer_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.member_transfers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'cancellation reason is required';
  END IF;

  SELECT * INTO v_row
  FROM public.member_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF v_row.status NOT IN ('solicitada', 'aprovada', 'concluida') THEN
    RAISE EXCEPTION 'transfer cannot be cancelled from status %', v_row.status;
  END IF;
  IF NOT public.has_org_access_permission(auth.uid(), v_row.organization_id, 'members.write') THEN
    RAISE EXCEPTION 'access denied to cancel transfer letter';
  END IF;

  UPDATE public.member_transfers
  SET status = 'cancelada',
      cancellation_reason = btrim(p_reason)
  WHERE id = p_transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_member_transfer_letter(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_member_transfer_letter(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_member_transfer_letters(
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
     OR NOT public.has_org_access_permission(auth.uid(), p_organization_id, 'members.read') THEN
    RAISE EXCEPTION 'access denied to list transfer letters';
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY item.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      mt.id,
      mt.member_id,
      m.full_name AS member_name,
      m.member_code,
      mt.organization_id,
      issuer.name AS organization_name,
      issuer.logo_url AS organization_logo_url,
      origin_org.name AS origin_church_name,
      COALESCE(mt.origin_city, origin_org.city) AS origin_city,
      COALESCE(mt.origin_state, origin_org.state) AS origin_state,
      COALESCE(destination_org.name, mt.destination_church_name) AS destination_church_name,
      mt.destination_type,
      mt.destination_city,
      mt.destination_state,
      mt.destination_country,
      mt.requested_at,
      mt.approved_at,
      mt.completed_at,
      mt.status,
      mt.reason,
      mt.cancellation_reason,
      mt.transfer_number,
      mt.public_token,
      mt.issued_at,
      mt.signer_name,
      mt.signer_role,
      mt.document_id,
      mt.created_at
    FROM public.member_transfers mt
    JOIN public.members m ON m.id = mt.member_id
    JOIN public.organizations issuer ON issuer.id = mt.organization_id
    LEFT JOIN public.organizations origin_org ON origin_org.id = mt.origin_organization_id
    LEFT JOIN public.organizations destination_org ON destination_org.id = mt.destination_organization_id
    WHERE mt.direction = 'emitida'
      AND public.is_organization_descendant_or_self(p_organization_id, mt.organization_id)
      AND public.has_org_access_permission(auth.uid(), mt.organization_id, 'members.read')
  ) item;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_member_transfer_letters(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_member_transfer_letters(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_member_transfer_letter(
  p_token uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', mt.id,
    'status', mt.status,
    'transfer_number', mt.transfer_number,
    'issued_at', mt.issued_at,
    'member_name', m.full_name,
    'member_code', m.member_code,
    'origin_church_name', origin_org.name,
    'origin_city', COALESCE(mt.origin_city, origin_org.city),
    'origin_state', COALESCE(mt.origin_state, origin_org.state),
    'destination_church_name', COALESCE(destination_org.name, mt.destination_church_name),
    'destination_city', COALESCE(mt.destination_city, destination_org.city),
    'destination_state', COALESCE(mt.destination_state, destination_org.state),
    'destination_country', mt.destination_country,
    'requested_at', mt.requested_at,
    'approved_at', mt.approved_at,
    'completed_at', mt.completed_at,
    'reason', mt.reason,
    'cancellation_reason', mt.cancellation_reason,
    'signer_name', mt.signer_name,
    'signer_role', mt.signer_role,
    'organization_name', issuer.name,
    'organization_logo_url', issuer.logo_url,
    'organization_city', issuer.city,
    'organization_state', issuer.state
  )
  FROM public.member_transfers mt
  JOIN public.members m ON m.id = mt.member_id
  JOIN public.organizations issuer ON issuer.id = mt.organization_id
  LEFT JOIN public.organizations origin_org ON origin_org.id = mt.origin_organization_id
  LEFT JOIN public.organizations destination_org ON destination_org.id = mt.destination_organization_id
  WHERE mt.public_token = p_token
    AND mt.issued_at IS NOT NULL
    AND mt.status IN ('concluida', 'cancelada')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_member_transfer_letter(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_member_transfer_letter(uuid)
  TO anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.official_document_counters') IS NULL THEN
    RAISE EXCEPTION 'official transfer letters: counter table was not created';
  END IF;
  IF to_regprocedure('public.issue_member_transfer_letter(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'official transfer letters: issue RPC was not created';
  END IF;
  IF to_regprocedure('public.get_public_member_transfer_letter(uuid)') IS NULL THEN
    RAISE EXCEPTION 'official transfer letters: public validation RPC was not created';
  END IF;
END;
$$;

COMMIT;
