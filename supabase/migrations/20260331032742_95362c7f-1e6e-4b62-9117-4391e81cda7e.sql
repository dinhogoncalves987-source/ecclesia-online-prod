
-- Recursive is_matriz_admin: checks if user is admin of ANY ancestor church
CREATE OR REPLACE FUNCTION public.is_matriz_admin(_user_id uuid, _church_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH RECURSIVE ancestors AS (
    -- Start from target church
    SELECT id, parent_church_id FROM public.churches WHERE id = _church_id
    UNION ALL
    -- Walk up the hierarchy
    SELECT c.id, c.parent_church_id 
    FROM public.churches c
    JOIN ancestors a ON c.id = a.parent_church_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM ancestors a
    JOIN public.profiles p ON p.church_id = a.id
    WHERE p.user_id = _user_id
      AND a.id != _church_id  -- don't match the church itself, only ancestors
      AND public.has_role(_user_id, 'admin')
  )
$$;

-- Also allow superadmin to insert churches  
DROP POLICY IF EXISTS "Admins can insert churches" ON public.churches;
CREATE POLICY "Admins can insert churches" ON public.churches
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- Allow superadmin to update any church
DROP POLICY IF EXISTS "Admins can update own church or sub-churches" ON public.churches;
CREATE POLICY "Admins can update own church or sub-churches" ON public.churches
FOR UPDATE TO authenticated
USING (
  is_superadmin(auth.uid())
  OR id = get_user_church_id(auth.uid())
  OR is_matriz_admin(auth.uid(), id)
);

-- Allow superadmin to delete any church
DROP POLICY IF EXISTS "Admins can delete sub-churches" ON public.churches;
CREATE POLICY "Admins can delete sub-churches" ON public.churches
FOR DELETE TO authenticated
USING (
  is_superadmin(auth.uid())
  OR is_matriz_admin(auth.uid(), id)
);

-- Allow superadmin to manage super_admins table
CREATE POLICY "Superadmins can insert super_admins"
ON public.super_admins FOR INSERT TO authenticated
WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can delete super_admins"
ON public.super_admins FOR DELETE TO authenticated
USING (is_superadmin(auth.uid()));

-- Allow superadmin to manage ALL user_roles
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)
);
