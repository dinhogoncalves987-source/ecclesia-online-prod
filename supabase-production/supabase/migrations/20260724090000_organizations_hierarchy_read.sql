CREATE OR REPLACE FUNCTION public.can_admin_organization(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.organizations
      WHERE id = _organization_id

      UNION ALL

      SELECT parent.id, parent.parent_id, chain.depth + 1
      FROM public.organizations AS parent
      JOIN chain ON parent.id = chain.parent_id
      WHERE chain.depth < 10
    )
    SELECT 1
    FROM chain
    JOIN public.organization_users AS membership
      ON membership.organization_id = chain.id
    WHERE membership.user_id = _user_id
      AND COALESCE(membership.is_active, true) = true
      AND membership.role IN ('admin', 'church_admin')
  );
$$;

DROP POLICY IF EXISTS "organizations hierarchy read"
ON public.organizations;

CREATE POLICY "organizations hierarchy read"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  public.can_admin_organization(auth.uid(), id)
);