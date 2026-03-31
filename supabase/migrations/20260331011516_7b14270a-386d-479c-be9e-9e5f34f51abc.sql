
-- Create super_admins table
CREATE TABLE public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view" ON public.super_admins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

-- Create platform_notices table
CREATE TABLE public.platform_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  priority text NOT NULL DEFAULT 'Normal',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active notices" ON public.platform_notices
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Superadmins can insert notices" ON public.platform_notices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can update notices" ON public.platform_notices
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can delete notices" ON public.platform_notices
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

-- Function to check superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

-- Update get_user_role to prioritize superadmin
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'superadmin' THEN 0
    WHEN 'admin' THEN 1
    WHEN 'tesoureiro' THEN 2
    WHEN 'obreiro' THEN 3
    WHEN 'lider' THEN 4
    WHEN 'membro' THEN 5
  END
  LIMIT 1
$$;
