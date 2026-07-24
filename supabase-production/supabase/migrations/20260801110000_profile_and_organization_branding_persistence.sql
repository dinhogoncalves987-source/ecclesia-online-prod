-- ============================================================================
-- Persistência confiável do perfil pessoal e da identidade institucional
-- ============================================================================
--
-- Corrige duas lacunas observadas na homologação:
--   1. organization-assets existia sem policies próprias de escrita;
--   2. Perfil e Configuração da Igreja dependiam de UPDATE direto, sujeito a
--      divergência de GRANT/RLS entre staging e produção.
--
-- As escritas passam por RPCs SECURITY DEFINER com allowlist de campos. Nenhuma
-- função permite alterar papel de plataforma, vínculo, hierarquia ou outro
-- campo administrativo fora da tela correspondente.
-- ============================================================================

BEGIN;

DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    v_missing := array_append(v_missing, 'public.profiles');
  END IF;
  IF to_regclass('public.organizations') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organizations');
  END IF;
  IF to_regclass('storage.objects') IS NULL THEN
    v_missing := array_append(v_missing, 'storage.objects');
  END IF;
  IF to_regprocedure('public.can_admin_organization(uuid,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.can_admin_organization(uuid,uuid)');
  END IF;
  IF to_regprocedure('public.has_org_access_permission(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.has_org_access_permission(uuid,uuid,text)');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'profile/branding persistence preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;
END
$preflight$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-assets', 'organization-assets', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

CREATE OR REPLACE FUNCTION public.can_edit_organization_profile(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _organization_id IS NOT NULL
    AND (
      public.can_admin_organization(_user_id, _organization_id)
      OR public.has_org_access_permission(
        _user_id,
        _organization_id,
        'organization.manage'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.organization_asset_organization_id(
  _object_name text
)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_segment text;
BEGIN
  IF split_part(COALESCE(_object_name, ''), '/', 1) <> 'organization-logos' THEN
    RETURN NULL;
  END IF;

  v_segment := split_part(_object_name, '/', 2);
  IF v_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_segment::uuid;
END;
$$;

DROP POLICY IF EXISTS "organization assets public read" ON storage.objects;
CREATE POLICY "organization assets public read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'organization-assets');

DROP POLICY IF EXISTS "organization assets authorized insert" ON storage.objects;
CREATE POLICY "organization assets authorized insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organization-assets'
  AND public.can_edit_organization_profile(
    auth.uid(),
    public.organization_asset_organization_id(name)
  )
);

DROP POLICY IF EXISTS "organization assets authorized update" ON storage.objects;
CREATE POLICY "organization assets authorized update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'organization-assets'
  AND public.can_edit_organization_profile(
    auth.uid(),
    public.organization_asset_organization_id(name)
  )
)
WITH CHECK (
  bucket_id = 'organization-assets'
  AND public.can_edit_organization_profile(
    auth.uid(),
    public.organization_asset_organization_id(name)
  )
);

DROP POLICY IF EXISTS "organization assets authorized delete" ON storage.objects;
CREATE POLICY "organization assets authorized delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'organization-assets'
  AND public.can_edit_organization_profile(
    auth.uid(),
    public.organization_asset_organization_id(name)
  )
);

CREATE OR REPLACE FUNCTION public.save_own_profile(
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_role_title text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_full_name text := NULLIF(btrim(COALESCE(p_full_name, '')), '');
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_role_title text := NULLIF(btrim(COALESCE(p_role_title, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'full name is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_full_name) > 160
     OR char_length(COALESCE(v_phone, '')) > 40
     OR char_length(COALESCE(v_role_title, '')) > 120 THEN
    RAISE EXCEPTION 'profile field exceeds maximum length' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (
    user_id,
    email,
    full_name,
    phone,
    role_title,
    updated_at
  )
  VALUES (
    v_user_id,
    v_email,
    v_full_name,
    v_phone,
    v_role_title,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role_title = EXCLUDED.role_title,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'full_name', v_full_name,
    'phone', v_phone,
    'role_title', v_role_title
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_own_profile_avatar(
  p_avatar_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_avatar_url text := NULLIF(btrim(COALESCE(p_avatar_url, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_avatar_url IS NULL OR char_length(v_avatar_url) > 2048 THEN
    RAISE EXCEPTION 'invalid avatar URL' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (user_id, email, avatar_url, updated_at)
  VALUES (v_user_id, v_email, v_avatar_url, now())
  ON CONFLICT (user_id) DO UPDATE
  SET avatar_url = EXCLUDED.avatar_url, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'avatar_url', v_avatar_url
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_organization_profile(
  p_organization_id uuid,
  p_name text,
  p_short_name text DEFAULT NULL,
  p_acronym text DEFAULT NULL,
  p_cnpj text DEFAULT NULL,
  p_street text DEFAULT NULL,
  p_address_number text DEFAULT NULL,
  p_address_complement text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_website_url text DEFAULT NULL,
  p_pastor_president_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_edit_organization_profile(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'organization name is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) > 240 THEN
    RAISE EXCEPTION 'organization name exceeds maximum length' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
  SET
    name = v_name,
    short_name = NULLIF(btrim(COALESCE(p_short_name, '')), ''),
    acronym = NULLIF(btrim(COALESCE(p_acronym, '')), ''),
    cnpj = NULLIF(btrim(COALESCE(p_cnpj, '')), ''),
    street = NULLIF(btrim(COALESCE(p_street, '')), ''),
    address_number = NULLIF(btrim(COALESCE(p_address_number, '')), ''),
    address_complement = NULLIF(btrim(COALESCE(p_address_complement, '')), ''),
    neighborhood = NULLIF(btrim(COALESCE(p_neighborhood, '')), ''),
    city = NULLIF(btrim(COALESCE(p_city, '')), ''),
    state = NULLIF(btrim(COALESCE(p_state, '')), ''),
    zip_code = NULLIF(btrim(COALESCE(p_zip_code, '')), ''),
    phone = NULLIF(btrim(COALESCE(p_phone, '')), ''),
    email = NULLIF(btrim(COALESCE(p_email, '')), ''),
    website_url = NULLIF(btrim(COALESCE(p_website_url, '')), ''),
    pastor_president_name =
      NULLIF(btrim(COALESCE(p_pastor_president_name, '')), ''),
    updated_at = now()
  WHERE id = p_organization_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_updated_id,
    'name', v_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_organization_logo(
  p_organization_id uuid,
  p_logo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_logo_url text := NULLIF(btrim(COALESCE(p_logo_url, '')), '');
  v_updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_edit_organization_profile(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF v_logo_url IS NULL OR char_length(v_logo_url) > 2048 THEN
    RAISE EXCEPTION 'invalid logo URL' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
  SET logo_url = v_logo_url, updated_at = now()
  WHERE id = p_organization_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_updated_id,
    'logo_url', v_logo_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_edit_organization_profile(uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organization_asset_organization_id(text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_own_profile(text, text, text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_own_profile_avatar(text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_organization_profile(
  uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_organization_logo(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_edit_organization_profile(uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.organization_asset_organization_id(text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_own_profile(text, text, text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_own_profile_avatar(text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_profile(
  uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_logo(uuid, text)
TO authenticated;

COMMIT;
