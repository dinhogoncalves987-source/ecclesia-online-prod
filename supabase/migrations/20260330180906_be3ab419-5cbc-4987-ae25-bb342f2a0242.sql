
-- 1. Create churches table with hierarchy support
CREATE TABLE public.churches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#D4A843',
  parent_church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  address text,
  city text,
  state text,
  phone text,
  email text,
  pastor_name text,
  is_matriz boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;

-- 2. Add church_id to all existing tables
ALTER TABLE public.profiles ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.members ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.announcements ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.prayer_requests ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;
ALTER TABLE public.small_groups ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL;

-- 3. Security definer function to get user's church
CREATE OR REPLACE FUNCTION public.get_user_church_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT church_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 4. Function to check if user belongs to matriz that owns a given church
CREATE OR REPLACE FUNCTION public.is_matriz_admin(_user_id uuid, _church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.churches my_church ON my_church.id = p.church_id
    JOIN public.churches target_church ON target_church.id = _church_id
    WHERE p.user_id = _user_id
      AND my_church.is_matriz = true
      AND (target_church.parent_church_id = my_church.id OR target_church.id = my_church.id)
      AND public.has_role(_user_id, 'admin')
  )
$$;

-- 5. RLS for churches table
CREATE POLICY "Authenticated users can view their church and siblings"
ON public.churches FOR SELECT TO authenticated
USING (
  id = public.get_user_church_id(auth.uid())
  OR parent_church_id = public.get_user_church_id(auth.uid())
  OR id = (SELECT parent_church_id FROM public.churches WHERE id = public.get_user_church_id(auth.uid()))
  OR (SELECT is_matriz FROM public.churches WHERE id = public.get_user_church_id(auth.uid())) = true
);

CREATE POLICY "Admins can insert churches"
ON public.churches FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update own church or sub-churches"
ON public.churches FOR UPDATE TO authenticated
USING (
  id = public.get_user_church_id(auth.uid())
  OR public.is_matriz_admin(auth.uid(), id)
);

CREATE POLICY "Admins can delete sub-churches"
ON public.churches FOR DELETE TO authenticated
USING (public.is_matriz_admin(auth.uid(), id));

-- 6. Update handle_new_user to auto-create default church if none exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_church_id uuid;
BEGIN
  -- Get or create a default church
  SELECT id INTO default_church_id FROM public.churches WHERE is_matriz = true LIMIT 1;
  
  IF default_church_id IS NULL THEN
    INSERT INTO public.churches (name, slug, is_matriz)
    VALUES ('Igreja Matriz', 'igreja-matriz', true)
    RETURNING id INTO default_church_id;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, church_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), default_church_id);
  
  RETURN NEW;
END;
$$;

-- 7. Recreate the trigger for handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Add realtime for churches
ALTER PUBLICATION supabase_realtime ADD TABLE public.churches;
