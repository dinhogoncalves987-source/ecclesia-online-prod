
-- Update can_view_church_data to include superadmin
CREATE OR REPLACE FUNCTION public.can_view_church_data(_user_id uuid, _church_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- Superadmin sees EVERYTHING
    is_superadmin(_user_id)
    -- User sees own church
    OR _church_id = get_user_church_id(_user_id)
    -- Matriz admin sees sub-churches
    OR is_matriz_admin(_user_id, _church_id)
$$;

-- Update churches SELECT policy so superadmin sees all
DROP POLICY IF EXISTS "Authenticated users can view their church and siblings" ON public.churches;

CREATE POLICY "Authenticated users can view their church and siblings"
ON public.churches FOR SELECT TO authenticated
USING (
  is_superadmin(auth.uid())
  OR id = get_user_church_id(auth.uid())
  OR parent_church_id = get_user_church_id(auth.uid())
  OR id = (SELECT c.parent_church_id FROM churches c WHERE c.id = get_user_church_id(auth.uid()))
  OR (SELECT c.is_matriz FROM churches c WHERE c.id = get_user_church_id(auth.uid())) = true
);
