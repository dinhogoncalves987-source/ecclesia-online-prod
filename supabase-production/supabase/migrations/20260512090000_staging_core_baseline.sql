-- Staging-only core baseline for a fresh Supabase project.
-- Minimal organization/profile schema required before the treasury MVP migration.
-- Do not backfill or replay legacy churches/church_id migrations here.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role_title text DEFAULT 'Membro',
  phone text,
  email text,
  avatar_url text,
  platform_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text UNIQUE,
  organization_type text NOT NULL DEFAULT 'matriz',
  city text,
  state text,
  country_code text DEFAULT 'BR',
  language_code text DEFAULT 'pt-BR',
  email text,
  phone text,
  logo_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, role)
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'platform_role', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.platform_role, '') IN ('platform_admin', 'super_admin', 'superadmin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.organization_id IS NULL
      AND ur.role IN ('platform_admin', 'super_admin', 'superadmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_user(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND ou.organization_id = _organization_id
      AND COALESCE(ou.is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(
  _user_id uuid,
  _organization_id uuid,
  _roles text[]
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = _user_id
      AND ou.organization_id = _organization_id
      AND COALESCE(ou.is_active, true) = true
      AND ou.role = ANY(_roles)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.organization_id = _organization_id
      AND ur.role = ANY(_roles)
  );
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_platform_role ON public.profiles(platform_role);
CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON public.organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON public.organizations(active);
CREATE INDEX IF NOT EXISTS idx_organization_users_user_id ON public.organization_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_organization_id ON public.organization_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_organization_id ON public.user_roles(organization_id);

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_users_updated_at ON public.organization_users;
CREATE TRIGGER update_organization_users_updated_at
BEFORE UPDATE ON public.organization_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles authenticated read" ON public.profiles;
CREATE POLICY "profiles authenticated read" ON public.profiles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles users insert own" ON public.profiles;
CREATE POLICY "profiles users insert own" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles users update own" ON public.profiles;
CREATE POLICY "profiles users update own" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "organizations members read" ON public.organizations;
CREATE POLICY "organizations members read" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), id));

DROP POLICY IF EXISTS "organizations platform admins insert" ON public.organizations;
CREATE POLICY "organizations platform admins insert" ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "organizations admins update" ON public.organizations;
CREATE POLICY "organizations admins update" ON public.organizations
FOR UPDATE TO authenticated
USING (public.has_org_role(auth.uid(), id, ARRAY['admin', 'church_admin']))
WITH CHECK (public.has_org_role(auth.uid(), id, ARRAY['admin', 'church_admin']));

DROP POLICY IF EXISTS "organizations platform admins delete" ON public.organizations;
CREATE POLICY "organizations platform admins delete" ON public.organizations
FOR DELETE TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "organization users members read" ON public.organization_users;
CREATE POLICY "organization users members read" ON public.organization_users
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "organization users admins insert" ON public.organization_users;
CREATE POLICY "organization users admins insert" ON public.organization_users
FOR INSERT TO authenticated
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin', 'church_admin']));

DROP POLICY IF EXISTS "organization users admins update" ON public.organization_users;
CREATE POLICY "organization users admins update" ON public.organization_users
FOR UPDATE TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin', 'church_admin']))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['admin', 'church_admin']));

DROP POLICY IF EXISTS "organization users admins delete" ON public.organization_users;
CREATE POLICY "organization users admins delete" ON public.organization_users
FOR DELETE TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['admin', 'church_admin']));

DROP POLICY IF EXISTS "user roles users read own" ON public.user_roles;
CREATE POLICY "user roles users read own" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "user roles platform admins manage" ON public.user_roles;
CREATE POLICY "user roles platform admins manage" ON public.user_roles
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));
