-- Staging: create public.documents table for the Documentos module.
-- Apply after 20260513121000_staging_organizations_child_insert_rls.sql.
-- update_updated_at_column(), is_org_user(), has_org_role() already exist
-- from 20260512090000_staging_core_baseline.sql — no need to redefine.

CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text,
  document_type   text        NOT NULL DEFAULT 'Geral',
  file_url        text,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_org_created
  ON public.documents(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_org_type
  ON public.documents(organization_id, document_type);

DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents org members read" ON public.documents;
CREATE POLICY "documents org members read" ON public.documents
FOR SELECT TO authenticated
USING (public.is_org_user(auth.uid(), organization_id));

DROP POLICY IF EXISTS "documents org staff insert" ON public.documents;
CREATE POLICY "documents org staff insert" ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

DROP POLICY IF EXISTS "documents org staff update" ON public.documents;
CREATE POLICY "documents org staff update" ON public.documents
FOR UPDATE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
)
WITH CHECK (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor']
  )
);

DROP POLICY IF EXISTS "documents org admins delete" ON public.documents;
CREATE POLICY "documents org admins delete" ON public.documents
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin']
  )
);
