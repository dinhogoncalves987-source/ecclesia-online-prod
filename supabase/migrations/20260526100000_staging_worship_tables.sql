-- Culto & Louvor: worship_songs + worship_setlists (organization-scoped).
-- Requires: organizations, is_org_user(), has_org_role(), update_updated_at_column()

CREATE TABLE IF NOT EXISTS public.worship_songs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  lyrics          text        NOT NULL DEFAULT '',
  musical_key     text,
  category        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worship_songs_org_created
  ON public.worship_songs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.worship_setlists (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  service_date    date,
  steps           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worship_setlists_steps_is_array CHECK (jsonb_typeof(steps) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_worship_setlists_org_date
  ON public.worship_setlists(organization_id, service_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_worship_setlists_org_updated
  ON public.worship_setlists(organization_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_worship_songs_updated_at ON public.worship_songs;
CREATE TRIGGER update_worship_songs_updated_at
BEFORE UPDATE ON public.worship_songs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_worship_setlists_updated_at ON public.worship_setlists;
CREATE TRIGGER update_worship_setlists_updated_at
BEFORE UPDATE ON public.worship_setlists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.worship_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worship_setlists ENABLE ROW LEVEL SECURITY;

-- worship_songs
DROP POLICY IF EXISTS "worship_songs org members read" ON public.worship_songs;
CREATE POLICY "worship_songs org members read" ON public.worship_songs
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "worship_songs org staff insert" ON public.worship_songs;
CREATE POLICY "worship_songs org staff insert" ON public.worship_songs
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "worship_songs org staff update" ON public.worship_songs;
CREATE POLICY "worship_songs org staff update" ON public.worship_songs
FOR UPDATE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
)
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "worship_songs org staff delete" ON public.worship_songs;
CREATE POLICY "worship_songs org staff delete" ON public.worship_songs
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

-- worship_setlists
DROP POLICY IF EXISTS "worship_setlists org members read" ON public.worship_setlists;
CREATE POLICY "worship_setlists org members read" ON public.worship_setlists
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "worship_setlists org staff insert" ON public.worship_setlists;
CREATE POLICY "worship_setlists org staff insert" ON public.worship_setlists
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "worship_setlists org staff update" ON public.worship_setlists;
CREATE POLICY "worship_setlists org staff update" ON public.worship_setlists
FOR UPDATE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
)
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "worship_setlists org staff delete" ON public.worship_setlists;
CREATE POLICY "worship_setlists org staff delete" ON public.worship_setlists
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);
