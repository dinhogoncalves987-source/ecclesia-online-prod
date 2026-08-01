-- ============================================================================
-- Gestao: hotfix do bootstrap de acesso
-- Timestamp: 20260803200000
-- ============================================================================
--
-- A migration 20260803190000 ja materializou os papeis legados validos em
-- organization_responsibles. Manter as mesmas fontes legadas novamente dentro
-- das funcoes executadas em toda abertura tornou o caminho critico de login
-- desnecessariamente caro. Este hotfix preserva as responsabilidades gravadas
-- e restaura as funcoes enxutas, baseadas na fonte canonica materializada.
-- Nenhum usuario, papel, vinculo ou responsabilidade e removido.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_org_access_permission(
  _user_id uuid,
  _organization_id uuid,
  _permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin(_user_id)
  OR EXISTS (
    SELECT 1
    FROM public.organization_responsibles responsible
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = responsible.responsibility_type
     AND definition.is_active
    WHERE responsible.user_id = _user_id
      AND responsible.is_active
      AND _permission_key = ANY(definition.permission_keys)
      AND (
        responsible.organization_id = _organization_id
        OR (
          definition.inherits_to_descendants
          AND public.is_organization_descendant_or_self(
            responsible.organization_id,
            _organization_id
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_access_capabilities()
RETURNS TABLE (
  organization_id uuid,
  source_organization_id uuid,
  responsibility_type text,
  permission_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE direct_assignments AS (
    SELECT responsible.organization_id AS source_organization_id,
           responsible.responsibility_type,
           definition.permission_keys,
           definition.inherits_to_descendants
    FROM public.organization_responsibles responsible
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = responsible.responsibility_type
     AND definition.is_active
    WHERE responsible.user_id = auth.uid()
      AND responsible.is_active
  ), expanded AS (
    SELECT assignment.source_organization_id AS organization_id,
           assignment.source_organization_id,
           assignment.responsibility_type,
           assignment.permission_keys,
           assignment.inherits_to_descendants,
           ARRAY[assignment.source_organization_id]::uuid[] AS path
    FROM direct_assignments assignment
    UNION ALL
    SELECT child.id,
           expanded.source_organization_id,
           expanded.responsibility_type,
           expanded.permission_keys,
           expanded.inherits_to_descendants,
           expanded.path || child.id
    FROM expanded
    JOIN public.organizations child ON child.parent_id = expanded.organization_id
    WHERE expanded.inherits_to_descendants
      AND child.active
      AND NOT child.id = ANY(expanded.path)
  )
  SELECT DISTINCT expanded.organization_id,
         expanded.source_organization_id,
         expanded.responsibility_type,
         permission.permission_key
  FROM expanded
  CROSS JOIN LATERAL unnest(expanded.permission_keys) permission(permission_key)

  UNION

  SELECT church_group.organization_id,
         church_group.organization_id,
         'group_leader'::text,
         'groups.read'::text
  FROM public.group_members group_membership
  JOIN public.members member ON member.id = group_membership.member_id
  JOIN public.groups church_group ON church_group.id = group_membership.group_id
  WHERE member.user_id = auth.uid()
    AND group_membership.role IN ('leader', 'co_leader')
    AND church_group.is_active;
$$;

REVOKE ALL ON FUNCTION public.has_org_access_permission(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_access_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_access_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_access_capabilities() TO authenticated;

COMMIT;
