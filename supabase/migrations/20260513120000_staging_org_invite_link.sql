-- Staging/local: link new or returning users to an organization via invite slug (church_slug).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_slug text;
  org_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'platform_role', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  invite_slug := NULLIF(trim(NEW.raw_user_meta_data->>'church_slug'), '');
  IF invite_slug IS NOT NULL THEN
    SELECT o.id INTO org_id
    FROM public.organizations o
    WHERE o.slug = invite_slug
      AND COALESCE(o.active, true) = true
    LIMIT 1;

    IF org_id IS NOT NULL THEN
      INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
      VALUES (org_id, NEW.id, 'member', true)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET is_active = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_organization_by_slug(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  org_id uuid;
  normalized_slug text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  normalized_slug := NULLIF(trim(_slug), '');
  IF normalized_slug IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_slug');
  END IF;

  SELECT o.id INTO org_id
  FROM public.organizations o
  WHERE o.slug = normalized_slug
    AND COALESCE(o.active, true) = true
  LIMIT 1;

  IF org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization_not_found');
  END IF;

  INSERT INTO public.organization_users (organization_id, user_id, role, is_active)
  VALUES (org_id, uid, 'member', true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET is_active = true;

  RETURN jsonb_build_object('ok', true, 'organization_id', org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_organization_by_slug(text) TO authenticated;
