-- Atualização segura do próprio perfil.
-- O frontend não depende de GRANT UPDATE amplo e nunca escolhe outro user_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_own_profile(_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_unknown_keys text[];
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_profile_patch' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(key ORDER BY key)
  INTO v_unknown_keys
  FROM jsonb_object_keys(_patch) AS key
  WHERE key <> ALL (ARRAY['full_name', 'phone', 'role_title', 'avatar_url']);

  IF v_unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported_profile_fields: %', array_to_string(v_unknown_keys, ', ')
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (user_id, full_name, phone, role_title, avatar_url)
  VALUES (
    v_user_id,
    CASE WHEN _patch ? 'full_name' THEN NULLIF(btrim(_patch->>'full_name'), '') ELSE NULL END,
    CASE WHEN _patch ? 'phone' THEN NULLIF(btrim(_patch->>'phone'), '') ELSE NULL END,
    CASE WHEN _patch ? 'role_title' THEN NULLIF(btrim(_patch->>'role_title'), '') ELSE 'Membro' END,
    CASE WHEN _patch ? 'avatar_url' THEN NULLIF(btrim(_patch->>'avatar_url'), '') ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = CASE WHEN _patch ? 'full_name' THEN NULLIF(btrim(_patch->>'full_name'), '') ELSE profiles.full_name END,
    phone = CASE WHEN _patch ? 'phone' THEN NULLIF(btrim(_patch->>'phone'), '') ELSE profiles.phone END,
    role_title = CASE WHEN _patch ? 'role_title' THEN NULLIF(btrim(_patch->>'role_title'), '') ELSE profiles.role_title END,
    avatar_url = CASE WHEN _patch ? 'avatar_url' THEN NULLIF(btrim(_patch->>'avatar_url'), '') ELSE profiles.avatar_url END
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_profile.user_id,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'role_title', v_profile.role_title,
    'avatar_url', v_profile.avatar_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated;

COMMIT;
