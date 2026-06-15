-- ============================================================
-- Secretaria: Carta de Recomendacao Digital (recommendation_letters)
-- ============================================================
-- Apply after 20260519140000_staging_documents_table.sql.
-- Helper functions update_updated_at_column(), is_org_user() and
-- has_org_role() already exist from 20260512090000_staging_core_baseline.sql.
--
-- Product rule: this feature lives inside the Secretaria module.
--
-- member_id convention:
--   Stores the auth.users id of the member who requested the letter
--   (auth.uid() at request time). This lets a member read ONLY their own
--   requests via RLS, while name/email are kept as plain text snapshots.
--
-- Status lifecycle:
--   requested -> under_review -> approved | rejected
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recommendation_letters (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id          uuid,
  member_name        text        NOT NULL,
  member_email       text,
  destination_church text        NOT NULL,
  destination_city   text        NOT NULL,
  destination_state  text,
  reason             text        NOT NULL,
  observations       text,
  status             text        NOT NULL DEFAULT 'requested'
                       CHECK (status IN ('requested', 'under_review', 'approved', 'rejected')),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at        timestamptz,
  approved_at        timestamptz,
  reviewed_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_letters_org_requested
  ON public.recommendation_letters(organization_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_letters_org_status
  ON public.recommendation_letters(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_recommendation_letters_member
  ON public.recommendation_letters(member_id);

DROP TRIGGER IF EXISTS update_recommendation_letters_updated_at ON public.recommendation_letters;
CREATE TRIGGER update_recommendation_letters_updated_at
BEFORE UPDATE ON public.recommendation_letters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.recommendation_letters ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────────────────────
-- Staff (admin / church_admin / secretary / pastor) see every letter of the org.
-- A member sees only the letters they requested (member_id = auth.uid()).
DROP POLICY IF EXISTS "recommendation_letters read" ON public.recommendation_letters;
CREATE POLICY "recommendation_letters read" ON public.recommendation_letters
FOR SELECT TO authenticated
USING (
  public.is_org_user(auth.uid(), organization_id)
  AND (
    public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor']
    )
    OR member_id = auth.uid()
  )
);

-- ── INSERT ───────────────────────────────────────────────────────────────────
-- Any active member of the organization may create a request for that org.
DROP POLICY IF EXISTS "recommendation_letters insert" ON public.recommendation_letters;
CREATE POLICY "recommendation_letters insert" ON public.recommendation_letters
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_user(auth.uid(), organization_id)
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
-- Status transitions (under_review / approved / rejected) are restricted to
-- staff. The application layer further restricts which buttons each role sees
-- (secretary/church_admin: em analise + rejeitar; pastor/church_admin: aprovar).
DROP POLICY IF EXISTS "recommendation_letters update" ON public.recommendation_letters;
CREATE POLICY "recommendation_letters update" ON public.recommendation_letters
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

-- ── DELETE ───────────────────────────────────────────────────────────────────
-- Only organization admins may delete a letter.
DROP POLICY IF EXISTS "recommendation_letters delete" ON public.recommendation_letters;
CREATE POLICY "recommendation_letters delete" ON public.recommendation_letters
FOR DELETE TO authenticated
USING (
  public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin']
  )
);
