
-- Fix infinite recursion in churches SELECT policy
-- The problem: is_matriz_admin() queries churches table, which triggers the SELECT policy again

-- Drop the problematic SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view their church and siblings" ON public.churches;

-- Recreate is_matriz_admin to NOT query churches table directly (use profiles instead)
CREATE OR REPLACE FUNCTION public.is_matriz_admin(_user_id uuid, _church_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  user_church uuid;
  current_parent uuid;
  max_depth int := 10;
  i int := 0;
BEGIN
  -- Get user's church from profiles (no RLS issue)
  SELECT church_id INTO user_church FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  
  IF user_church IS NULL THEN RETURN false; END IF;
  
  -- Check if user is admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN false;
  END IF;
  
  -- Walk up from _church_id to see if we hit user_church
  SELECT parent_church_id INTO current_parent FROM public.churches WHERE id = _church_id;
  
  WHILE current_parent IS NOT NULL AND i < max_depth LOOP
    IF current_parent = user_church THEN RETURN true; END IF;
    SELECT parent_church_id INTO current_parent FROM public.churches WHERE id = current_parent;
    i := i + 1;
  END LOOP;
  
  RETURN false;
END;
$$;

-- Recreate can_view_church_data to be safe too
CREATE OR REPLACE FUNCTION public.can_view_church_data(_user_id uuid, _church_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  user_church uuid;
BEGIN
  -- Superadmin sees everything
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin') THEN
    RETURN true;
  END IF;
  
  SELECT church_id INTO user_church FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  
  -- User sees own church
  IF _church_id = user_church THEN RETURN true; END IF;
  
  -- Matriz admin sees sub-churches
  RETURN is_matriz_admin(_user_id, _church_id);
END;
$$;

-- Recreate is_superadmin without touching churches
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

-- New simple SELECT policy that doesn't cause recursion
CREATE POLICY "Users can view churches" ON public.churches
FOR SELECT TO authenticated
USING (
  -- Superadmin sees all
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin')
  -- User sees own church
  OR id = (SELECT church_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  -- User sees parent church
  OR id = (SELECT c.parent_church_id FROM public.churches c WHERE c.id = (SELECT church_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1))
  -- Matriz admin sees children
  OR parent_church_id = (SELECT church_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  -- If user is in a matriz, see all children
  OR (EXISTS (SELECT 1 FROM public.churches c WHERE c.id = (SELECT church_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) AND c.is_matriz = true))
);

-- Also fix UPDATE policy to not use is_superadmin() which is safe, but let's be consistent
DROP POLICY IF EXISTS "Admins can update own church or sub-churches" ON public.churches;
CREATE POLICY "Admins can update own church or sub-churches" ON public.churches
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin')
  OR id = (SELECT church_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  OR is_matriz_admin(auth.uid(), id)
);

-- Fix DELETE policy
DROP POLICY IF EXISTS "Admins can delete sub-churches" ON public.churches;
CREATE POLICY "Admins can delete sub-churches" ON public.churches
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin')
  OR is_matriz_admin(auth.uid(), id)
);
