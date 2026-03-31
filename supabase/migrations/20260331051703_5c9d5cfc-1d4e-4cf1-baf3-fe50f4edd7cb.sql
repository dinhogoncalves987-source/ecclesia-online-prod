
-- Table for general assemblies
CREATE TABLE public.assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  period text, -- e.g. "1º Trimestre 2026"
  assembly_date date NOT NULL DEFAULT CURRENT_DATE,
  youtube_url text,
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table for assembly attachments (atas, reports, docs)
CREATE TABLE public.assembly_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text,
  file_type text DEFAULT 'pdf',
  youtube_url text,
  attachment_type text NOT NULL DEFAULT 'document', -- document, video, report, minutes
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_attachments ENABLE ROW LEVEL SECURITY;

-- RLS for assemblies
CREATE POLICY "Users can view visible assemblies or own church" ON public.assemblies
  FOR SELECT TO authenticated
  USING (can_view_church_data(auth.uid(), church_id));

CREATE POLICY "Admins can insert assemblies" ON public.assemblies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND church_id = get_user_church_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'))
  );

CREATE POLICY "Admins can update own church assemblies" ON public.assemblies
  FOR UPDATE TO authenticated
  USING (
    can_view_church_data(auth.uid(), church_id)
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'))
  );

CREATE POLICY "Admins can delete own assemblies" ON public.assemblies
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- RLS for attachments (inherit from parent assembly)
CREATE POLICY "Users can view assembly attachments" ON public.assembly_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assemblies a 
    WHERE a.id = assembly_id AND can_view_church_data(auth.uid(), a.church_id)
  ));

CREATE POLICY "Admins can insert attachments" ON public.assembly_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assemblies a 
    WHERE a.id = assembly_id AND a.user_id = auth.uid()
  ));

CREATE POLICY "Admins can delete attachments" ON public.assembly_attachments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assemblies a 
    WHERE a.id = assembly_id AND a.user_id = auth.uid()
  ));

-- Storage bucket for assembly files
INSERT INTO storage.buckets (id, name, public) VALUES ('assemblies', 'assemblies', true);

-- Storage policies
CREATE POLICY "Auth users can upload assembly files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assemblies');

CREATE POLICY "Anyone can view assembly files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'assemblies');

CREATE POLICY "Auth users can delete own assembly files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'assemblies');

-- Updated_at trigger
CREATE TRIGGER update_assemblies_updated_at
  BEFORE UPDATE ON public.assemblies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
