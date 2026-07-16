-- Staging: Secretaria + platform announcements (organization_id schema).
-- Apply after 20260519150000_staging_schedules_table.sql and before demo seeds.
-- Aligns with src/integrations/supabase/types.ts. No church_id / churches.

-- ── members ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name       text        NOT NULL,
  member_role     text,
  status          text        NOT NULL DEFAULT 'Ativo'
    CHECK (status IN ('Ativo', 'Inativo', 'Visitante')),
  phone           text,
  email           text,
  address         text,
  city            text,
  state           text,
  country_code    text,
  birth_date      date,
  baptized_at     date,
  joined_at       date,
  notes           text,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_org_status
  ON public.members(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_members_org_name
  ON public.members(organization_id, full_name);

DROP TRIGGER IF EXISTS update_members_updated_at ON public.members;
CREATE TRIGGER update_members_updated_at
BEFORE UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── events ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  location        text,
  event_type      text,
  is_public       boolean     DEFAULT true,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_org_starts
  ON public.events(organization_id, starts_at ASC);

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── communications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title               text        NOT NULL,
  content             text        NOT NULL,
  communication_type  text,
  is_public           boolean     DEFAULT true,
  target_role         text,
  published_at        timestamptz,
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communications_org_published
  ON public.communications(organization_id, published_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS update_communications_updated_at ON public.communications;
CREATE TRIGGER update_communications_updated_at
BEFORE UPDATE ON public.communications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── groups ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  description       text,
  group_type        text,
  leader_member_id  uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  location          text,
  meeting_day       text,
  meeting_time      text,
  is_active         boolean     DEFAULT true,
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_org_name
  ON public.groups(organization_id, name);

DROP TRIGGER IF EXISTS update_groups_updated_at ON public.groups;
CREATE TRIGGER update_groups_updated_at
BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── prayer_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prayer_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  description     text,
  status          text        DEFAULT 'Ativo',
  is_private      boolean     DEFAULT false,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prayer_requests_org_created
  ON public.prayer_requests(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS update_prayer_requests_updated_at ON public.prayer_requests;
CREATE TRIGGER update_prayer_requests_updated_at
BEFORE UPDATE ON public.prayer_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── platform_announcements ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  short_description text        NOT NULL,
  full_content      text        NOT NULL,
  target_type       text        NOT NULL DEFAULT 'global',
  is_active         boolean     NOT NULL DEFAULT true,
  image_url         text,
  button_label      text,
  button_link       text,
  organization_id   uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  starts_at         timestamptz,
  ends_at           timestamptz,
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_announcements_active
  ON public.platform_announcements(is_active, starts_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS update_platform_announcements_updated_at ON public.platform_announcements;
CREATE TRIGGER update_platform_announcements_updated_at
BEFORE UPDATE ON public.platform_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: members ──────────────────────────────────────────────────────────────
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members org members read" ON public.members;
CREATE POLICY "members org members read" ON public.members
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "members org staff insert" ON public.members;
CREATE POLICY "members org staff insert" ON public.members
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "members org staff update" ON public.members;
CREATE POLICY "members org staff update" ON public.members
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

DROP POLICY IF EXISTS "members org staff delete" ON public.members;
CREATE POLICY "members org staff delete" ON public.members
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- ── RLS: events ───────────────────────────────────────────────────────────────
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events org members read" ON public.events;
CREATE POLICY "events org members read" ON public.events
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "events org staff insert" ON public.events;
CREATE POLICY "events org staff insert" ON public.events
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "events org staff update" ON public.events;
CREATE POLICY "events org staff update" ON public.events
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

DROP POLICY IF EXISTS "events org staff delete" ON public.events;
CREATE POLICY "events org staff delete" ON public.events
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- ── RLS: communications ─────────────────────────────────────────────────────
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communications org members read" ON public.communications;
CREATE POLICY "communications org members read" ON public.communications
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "communications org staff insert" ON public.communications;
CREATE POLICY "communications org staff insert" ON public.communications
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "communications org staff update" ON public.communications;
CREATE POLICY "communications org staff update" ON public.communications
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

DROP POLICY IF EXISTS "communications org staff delete" ON public.communications;
CREATE POLICY "communications org staff delete" ON public.communications
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- ── RLS: groups ───────────────────────────────────────────────────────────────
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups org members read" ON public.groups;
CREATE POLICY "groups org members read" ON public.groups
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "groups org staff insert" ON public.groups;
CREATE POLICY "groups org staff insert" ON public.groups
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "groups org staff update" ON public.groups;
CREATE POLICY "groups org staff update" ON public.groups
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

DROP POLICY IF EXISTS "groups org staff delete" ON public.groups;
CREATE POLICY "groups org staff delete" ON public.groups
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

-- ── RLS: prayer_requests ──────────────────────────────────────────────────────
ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_requests org members read" ON public.prayer_requests;
CREATE POLICY "prayer_requests org members read" ON public.prayer_requests
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "prayer_requests org members insert" ON public.prayer_requests;
CREATE POLICY "prayer_requests org members insert" ON public.prayer_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_user(auth.uid(), organization_id)
  AND (user_id IS NULL OR user_id = auth.uid())
);

DROP POLICY IF EXISTS "prayer_requests org update" ON public.prayer_requests;
CREATE POLICY "prayer_requests org update" ON public.prayer_requests
FOR UPDATE TO authenticated
USING (
  public.is_org_user(auth.uid(), organization_id)
  AND (
    user_id = auth.uid()
    OR public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
    )
  )
)
WITH CHECK (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "prayer_requests org delete" ON public.prayer_requests;
CREATE POLICY "prayer_requests org delete" ON public.prayer_requests
FOR DELETE TO authenticated
USING (
  public.is_org_user(auth.uid(), organization_id)
  AND (
    user_id = auth.uid()
    OR public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor']
    )
  )
);

-- ── RLS: platform_announcements ──────────────────────────────────────────────
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform announcements public read" ON public.platform_announcements;
CREATE POLICY "platform announcements public read" ON public.platform_announcements
FOR SELECT TO authenticated, anon
USING (is_active = true);

DROP POLICY IF EXISTS "platform announcements admin write" ON public.platform_announcements;
CREATE POLICY "platform announcements admin write" ON public.platform_announcements
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));
