
-- Prayer Requests
CREATE TABLE public.prayer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  is_anonymous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Ativo',
  praying_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view prayer requests" ON public.prayer_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert prayer requests" ON public.prayer_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update own prayer requests" ON public.prayer_requests FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete own prayer requests" ON public.prayer_requests FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  priority text NOT NULL DEFAULT 'Normal',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert announcements" ON public.announcements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update own announcements" ON public.announcements FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete own announcements" ON public.announcements FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Small Groups
CREATE TABLE public.small_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  leader text NOT NULL,
  meeting_day text,
  meeting_time text,
  location text,
  description text,
  max_members int NOT NULL DEFAULT 12,
  current_members int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Ativo',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.small_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view groups" ON public.small_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert groups" ON public.small_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update own groups" ON public.small_groups FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete own groups" ON public.small_groups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Geral',
  description text,
  file_url text,
  file_type text DEFAULT 'pdf',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view documents" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update own documents" ON public.documents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete own documents" ON public.documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Schedules (Escalas)
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  schedule_date date NOT NULL,
  ministry text NOT NULL DEFAULT 'Geral',
  assigned_to text,
  notes text,
  status text NOT NULL DEFAULT 'Confirmado',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view schedules" ON public.schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert schedules" ON public.schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update own schedules" ON public.schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete own schedules" ON public.schedules FOR DELETE TO authenticated USING (auth.uid() = user_id);
