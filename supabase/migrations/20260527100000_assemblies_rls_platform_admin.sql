-- Assembleia Geral: bypass explícito de platform_admin em RLS de assemblies e assembly_attachments.
-- Corrige INSERT de anexo para Super Admin sem vínculo org (subquery em assemblies sob RLS).
-- Não altera storage, seed nem frontend.

-- ══════════════════════════════════════════════════════════════════════════════
-- assemblies
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assemblies org staff read" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org members read visible" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff insert" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff update" ON public.assemblies;
DROP POLICY IF EXISTS "assemblies org staff delete" ON public.assemblies;

CREATE POLICY "assemblies org staff read" ON public.assemblies
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.is_org_user(auth.uid(), organization_id)
    AND public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
    )
  )
);

CREATE POLICY "assemblies org members read visible" ON public.assemblies
FOR SELECT TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_user(auth.uid(), organization_id)
  AND COALESCE(is_visible, false) = true
  AND NOT public.has_org_role(
    auth.uid(), organization_id,
    ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
  )
  AND NOT public.is_platform_admin(auth.uid())
);

CREATE POLICY "assemblies org staff insert" ON public.assemblies
FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
    )
  )
);

CREATE POLICY "assemblies org staff update" ON public.assemblies
FOR UPDATE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
    )
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
    )
  )
);

CREATE POLICY "assemblies org staff delete" ON public.assemblies
FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(
      auth.uid(), organization_id,
      ARRAY['admin', 'church_admin', 'secretary', 'pastor']
    )
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- assembly_attachments
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.assembly_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assembly_attachments org staff read" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org members read visible" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff insert" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff update" ON public.assembly_attachments;
DROP POLICY IF EXISTS "assembly_attachments org staff delete" ON public.assembly_attachments;

CREATE POLICY "assembly_attachments org staff read" ON public.assembly_attachments
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.is_org_user(auth.uid(), a.organization_id)
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org members read visible" ON public.assembly_attachments
FOR SELECT TO authenticated
USING (
  NOT public.is_platform_admin(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.is_org_user(auth.uid(), a.organization_id)
      AND COALESCE(a.is_visible, false) = true
      AND NOT public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org staff insert" ON public.assembly_attachments
FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org staff update" ON public.assembly_attachments
FOR UPDATE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor', 'leader']
      )
  )
);

CREATE POLICY "assembly_attachments org staff delete" ON public.assembly_attachments
FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = assembly_id
      AND a.organization_id IS NOT NULL
      AND public.has_org_role(
        auth.uid(), a.organization_id,
        ARRAY['admin', 'church_admin', 'secretary', 'pastor']
      )
  )
);
