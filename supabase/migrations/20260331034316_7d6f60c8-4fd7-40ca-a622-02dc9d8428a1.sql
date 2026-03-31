
-- Drop ALL existing SELECT policies on churches
DROP POLICY IF EXISTS "Users can view churches" ON public.churches;
DROP POLICY IF EXISTS "Authenticated users can view their church and siblings" ON public.churches;

-- Create a SECURITY DEFINER function that returns visible church IDs
-- This bypasses RLS so no recursion
CREATE OR REPLACE FUNCTION public.get_visible_church_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _church_id uuid;
  _is_superadmin boolean;
  _is_matriz boolean;
  _parent_id uuid;
BEGIN
  -- Check superadmin
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin') INTO _is_superadmin;
  
  IF _is_superadmin THEN
    -- Return ALL churches
    RETURN QUERY SELECT id FROM public.churches;
    RETURN;
  END IF;
  
  -- Get user's church
  SELECT church_id INTO _church_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  
  IF _church_id IS NULL THEN RETURN; END IF;
  
  -- Get church info
  SELECT is_matriz, parent_church_id INTO _is_matriz, _parent_id FROM public.churches WHERE id = _church_id;
  
  -- Always see own church
  RETURN NEXT _church_id;
  
  -- If in a matriz, see all children
  IF _is_matriz THEN
    RETURN QUERY SELECT id FROM public.churches WHERE parent_church_id = _church_id;
  END IF;
  
  -- See parent church
  IF _parent_id IS NOT NULL THEN
    RETURN NEXT _parent_id;
  END IF;
  
  RETURN;
END;
$$;

-- Simple policy using the function (no self-reference!)
CREATE POLICY "Users can view churches" ON public.churches
FOR SELECT TO authenticated
USING (id IN (SELECT get_visible_church_ids(auth.uid())));
