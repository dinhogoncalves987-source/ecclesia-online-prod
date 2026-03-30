
-- Helper function: can user view data from a given church?
CREATE OR REPLACE FUNCTION public.can_view_church_data(_user_id uuid, _church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    _church_id = get_user_church_id(_user_id)
    OR is_matriz_admin(_user_id, _church_id)
$$;

-- Update handle_new_user to support church_slug from invite links
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_church_id uuid;
  church_slug_val text;
BEGIN
  church_slug_val := NEW.raw_user_meta_data->>'church_slug';
  
  IF church_slug_val IS NOT NULL AND church_slug_val != '' THEN
    SELECT id INTO target_church_id FROM public.churches WHERE slug = church_slug_val LIMIT 1;
  END IF;
  
  IF target_church_id IS NULL THEN
    SELECT id INTO target_church_id FROM public.churches WHERE is_matriz = true LIMIT 1;
  END IF;
  
  IF target_church_id IS NULL THEN
    INSERT INTO public.churches (name, slug, is_matriz)
    VALUES ('Igreja Matriz', 'igreja-matriz', true)
    RETURNING id INTO target_church_id;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, church_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), target_church_id);
  
  RETURN NEW;
END;
$$;

-- Update handle_new_user_role to include church_id
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_count INT;
  target_church_id uuid;
BEGIN
  SELECT church_id INTO target_church_id FROM public.profiles WHERE user_id = NEW.id LIMIT 1;
  
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, church_id) VALUES (NEW.id, 'admin', target_church_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, church_id) VALUES (NEW.id, 'membro', target_church_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Update RLS policies for church-based data isolation

-- TRANSACTIONS: Update SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all transactions" ON public.transactions;
CREATE POLICY "Users can view church transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.transactions;
CREATE POLICY "Users can insert church transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- MEMBERS: Update SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all members" ON public.members;
CREATE POLICY "Users can view church members" ON public.members
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Authenticated users can insert members" ON public.members;
CREATE POLICY "Users can insert church members" ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- EVENTS: Update SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
CREATE POLICY "Users can view church events" ON public.events
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
CREATE POLICY "Users can insert church events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- ANNOUNCEMENTS: Update SELECT policy
DROP POLICY IF EXISTS "Auth users can view announcements" ON public.announcements;
CREATE POLICY "Users can view church announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Auth users can insert announcements" ON public.announcements;
CREATE POLICY "Users can insert church announcements" ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- SCHEDULES: Update SELECT policy
DROP POLICY IF EXISTS "Auth users can view schedules" ON public.schedules;
CREATE POLICY "Users can view church schedules" ON public.schedules
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Auth users can insert schedules" ON public.schedules;
CREATE POLICY "Users can insert church schedules" ON public.schedules
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- DOCUMENTS: Update SELECT policy
DROP POLICY IF EXISTS "Auth users can view documents" ON public.documents;
CREATE POLICY "Users can view church documents" ON public.documents
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Auth users can insert documents" ON public.documents;
CREATE POLICY "Users can insert church documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- PRAYER_REQUESTS: Update SELECT policy
DROP POLICY IF EXISTS "Auth users can view prayer requests" ON public.prayer_requests;
CREATE POLICY "Users can view church prayer requests" ON public.prayer_requests
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Auth users can insert prayer requests" ON public.prayer_requests;
CREATE POLICY "Users can insert church prayer requests" ON public.prayer_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- SMALL_GROUPS: Update SELECT policy
DROP POLICY IF EXISTS "Auth users can view groups" ON public.small_groups;
CREATE POLICY "Users can view church groups" ON public.small_groups
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

DROP POLICY IF EXISTS "Auth users can insert groups" ON public.small_groups;
CREATE POLICY "Users can insert church groups" ON public.small_groups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND church_id = get_user_church_id(auth.uid()));

-- Ensure triggers exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
