-- Staging/local: allow org admins to create child units following official hierarchy.
-- convencao -> matriz -> setor -> congregacao
-- Platform admins keep unrestricted insert via "organizations platform admins insert".

CREATE OR REPLACE FUNCTION public.is_valid_organization_hierarchy(
  _parent_type text,
  _child_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _parent_type = 'convencao' AND _child_type = 'matriz' THEN true
    WHEN _parent_type IN ('matriz', 'sede') AND _child_type = 'setor' THEN true
    WHEN _parent_type = 'setor' AND _child_type = 'congregacao' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.is_valid_organization_hierarchy(text, text) IS
  'Validates parent/child organization_type pairs for institutional hierarchy.';

DROP POLICY IF EXISTS "organizations admins insert children" ON public.organizations;

CREATE POLICY "organizations admins insert children"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
  parent_id IS NOT NULL
  AND public.has_org_role(auth.uid(), parent_id, ARRAY['admin', 'church_admin'])
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS parent_org
    WHERE parent_org.id = parent_id
      AND COALESCE(parent_org.active, true) = true
      AND public.is_valid_organization_hierarchy(parent_org.organization_type, organization_type)
  )
);
