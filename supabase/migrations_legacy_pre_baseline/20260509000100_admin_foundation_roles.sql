-- Fase 3 Administrativa: role helpers for multi-church permissions.
-- Banco real usa public.user_roles.role como text, não enum.

CREATE OR REPLACE FUNCTION public.normalize_app_role(_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'superadmin' THEN 'super_admin'
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'admin' THEN 'church_admin'
    WHEN 'church_admin' THEN 'church_admin'
    WHEN 'lider' THEN 'leader'
    WHEN 'leader' THEN 'leader'
    WHEN 'tesoureiro' THEN 'leader'
    WHEN 'obreiro' THEN 'leader'
    WHEN 'membro' THEN 'member'
    WHEN 'member' THEN 'member'
    ELSE 'member'
  END
$$;

CREATE OR REPLACE FUNCTION public.has_church_role(
  _user_id uuid,
  _church_id uuid,
  _role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.church_id = _church_id
        OR ur.church_id IS NULL
        OR public.normalize_app_role(ur.role) = 'super_admin'
      )
      AND public.normalize_app_role(ur.role) = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_church(
  _user_id uuid,
  _church_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_church_role(_user_id, _church_id, 'super_admin')
    OR public.has_church_role(_user_id, _church_id, 'church_admin')
$$;
