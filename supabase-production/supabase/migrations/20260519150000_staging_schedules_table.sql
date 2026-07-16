-- Staging: create public.schedules table for the Escalas module.
-- Apply after 20260519140000_staging_documents_table.sql.
-- update_updated_at_column(), is_org_user(), has_org_role() already exist
-- from 20260512090000_staging_core_baseline.sql — no need to redefine.

CREATE TABLE IF NOT EXISTS public.schedules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  schedule_date   date        NOT NULL,
  ministry        text        NOT NULL DEFAULT 'Geral',
  assigned_to     text,
  notes           text,
  status          text        NOT NULL DEFAULT 'Pendente',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_org_date
  ON public.schedules(organization_id, schedule_date ASC);

CREATE INDEX IF NOT EXISTS idx_schedules_org_ministry
  ON public.schedules(organization_id, ministry);

DROP TRIGGER IF EXISTS update_schedules_updated_at ON public.schedules;
CREATE TRIGGER update_schedules_updated_at
BEFORE UPDATE ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules org members read" ON public.schedules;
CREATE POLICY "schedules org members read" ON public.schedules
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "schedules org staff insert" ON public.schedules;
CREATE POLICY "schedules org staff insert" ON public.schedules
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
);

DROP POLICY IF EXISTS "schedules org staff update" ON public.schedules;
CREATE POLICY "schedules org staff update" ON public.schedules
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

DROP POLICY IF EXISTS "schedules org admins delete" ON public.schedules;
CREATE POLICY "schedules org admins delete" ON public.schedules
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);
