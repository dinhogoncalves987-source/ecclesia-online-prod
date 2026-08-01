-- ============================================================================
-- Gestao: ponte definitiva entre papeis legados e capabilities
-- Timestamp: 20260803190000
-- ============================================================================
--
-- Contas administrativas criadas antes do modelo de responsabilidades podem
-- ter o papel valido em user_roles, enquanto a unidade ativa permanece em
-- organization_users. O frontend historico reconhece essas duas fontes, mas
-- get_my_access_capabilities/has_org_access_permission consultavam apenas
-- organization_responsibles. O resultado era inconsistente: o usuario entrava
-- como administrador, mas os modulos governados por capability desapareciam e
-- o diretorio seguro de membros ocultava o user_id necessario para chamadas.
--
-- Esta migration:
--   1. materializa responsabilidades a partir das duas fontes legadas;
--   2. mantem uma ponte dinamica nas funcoes de autorizacao para evitar nova
--      divergencia durante a transicao;
--   3. nunca concede acesso global nem usa auth.users como fonte de papel.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organizations');
  END IF;
  IF to_regclass('public.organization_users') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organization_users');
  END IF;
  IF to_regclass('public.user_roles') IS NULL THEN
    v_missing := array_append(v_missing, 'public.user_roles');
  END IF;
  IF to_regclass('public.organization_responsibles') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organization_responsibles');
  END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'legacy_role_capability_bridge preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- Materializa somente papeis ja concedidos e sempre vinculados a uma
-- organization_id existente. Um papel legado sem organization_id so entra
-- quando o mesmo usuario possui vinculo ativo explicito na unidade; ele nunca
-- vira acesso irrestrito a todas as igrejas.
WITH legacy_assignments AS (
  SELECT membership.organization_id,
         membership.user_id,
         CASE membership.role
           WHEN 'admin' THEN 'church_admin'
           WHEN 'church_admin' THEN 'church_admin'
           WHEN 'pastor' THEN 'responsible_pastor'
           WHEN 'secretary' THEN 'secretary'
           WHEN 'tesoureiro' THEN 'treasurer'
           WHEN 'contador' THEN 'accountant'
           WHEN 'leader' THEN 'group_manager'
           WHEN 'lider' THEN 'group_manager'
           WHEN 'porteiro' THEN 'gatekeeper'
         END AS responsibility_type
  FROM public.organization_users membership
  WHERE membership.is_active
    AND membership.role IN (
      'admin','church_admin','pastor','secretary','tesoureiro',
      'contador','leader','lider','porteiro'
    )

  UNION

  SELECT legacy_role.organization_id,
         legacy_role.user_id,
         CASE legacy_role.role
           WHEN 'admin' THEN 'church_admin'
           WHEN 'church_admin' THEN 'church_admin'
           WHEN 'pastor' THEN 'responsible_pastor'
           WHEN 'secretary' THEN 'secretary'
           WHEN 'tesoureiro' THEN 'treasurer'
           WHEN 'contador' THEN 'accountant'
           WHEN 'leader' THEN 'group_manager'
           WHEN 'lider' THEN 'group_manager'
           WHEN 'porteiro' THEN 'gatekeeper'
         END AS responsibility_type
  FROM public.user_roles legacy_role
  WHERE legacy_role.organization_id IS NOT NULL
    AND legacy_role.role IN (
      'admin','church_admin','pastor','secretary','tesoureiro',
      'contador','leader','lider','porteiro'
    )

  UNION

  SELECT membership.organization_id,
         legacy_role.user_id,
         CASE legacy_role.role
           WHEN 'admin' THEN 'church_admin'
           WHEN 'church_admin' THEN 'church_admin'
           WHEN 'pastor' THEN 'responsible_pastor'
           WHEN 'secretary' THEN 'secretary'
           WHEN 'tesoureiro' THEN 'treasurer'
           WHEN 'contador' THEN 'accountant'
           WHEN 'leader' THEN 'group_manager'
           WHEN 'lider' THEN 'group_manager'
           WHEN 'porteiro' THEN 'gatekeeper'
         END AS responsibility_type
  FROM public.user_roles legacy_role
  JOIN public.organization_users membership
    ON membership.user_id = legacy_role.user_id
   AND membership.is_active
  WHERE legacy_role.organization_id IS NULL
    AND legacy_role.role IN (
      'admin','church_admin','pastor','secretary','tesoureiro',
      'contador','leader','lider','porteiro'
    )
)
INSERT INTO public.organization_responsibles (
  organization_id,
  responsibility_type,
  user_id,
  assigned_by,
  assigned_at,
  is_active,
  notes
)
SELECT assignment.organization_id,
       assignment.responsibility_type,
       assignment.user_id,
       NULL,
       now(),
       true,
       'Reconciliado de papel legado pela ponte definitiva de capabilities'
FROM legacy_assignments assignment
JOIN public.organizations organization
  ON organization.id = assignment.organization_id
JOIN public.access_responsibility_definitions definition
  ON definition.responsibility_type = assignment.responsibility_type
 AND definition.is_active
WHERE assignment.responsibility_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_responsibles responsible
    WHERE responsible.organization_id = assignment.organization_id
      AND responsible.user_id = assignment.user_id
      AND responsible.responsibility_type = assignment.responsibility_type
      AND responsible.is_active
  );

-- A verificacao usada pelas RLS passa a reconhecer as mesmas fontes de papel
-- que o bootstrap do aplicativo. A permissao continua vindo do catalogo
-- central; o papel legado nao injeta permission_key arbitraria.
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
  )
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT membership.organization_id,
             membership.user_id,
             membership.role
      FROM public.organization_users membership
      WHERE membership.is_active

      UNION

      SELECT legacy_role.organization_id,
             legacy_role.user_id,
             legacy_role.role
      FROM public.user_roles legacy_role
      WHERE legacy_role.organization_id IS NOT NULL

      UNION

      SELECT membership.organization_id,
             legacy_role.user_id,
             legacy_role.role
      FROM public.user_roles legacy_role
      JOIN public.organization_users membership
        ON membership.user_id = legacy_role.user_id
       AND membership.is_active
      WHERE legacy_role.organization_id IS NULL
    ) legacy_assignment
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = CASE legacy_assignment.role
           WHEN 'admin' THEN 'church_admin'
           WHEN 'church_admin' THEN 'church_admin'
           WHEN 'pastor' THEN 'responsible_pastor'
           WHEN 'secretary' THEN 'secretary'
           WHEN 'tesoureiro' THEN 'treasurer'
           WHEN 'contador' THEN 'accountant'
           WHEN 'leader' THEN 'group_manager'
           WHEN 'lider' THEN 'group_manager'
           WHEN 'porteiro' THEN 'gatekeeper'
         END
     AND definition.is_active
    WHERE legacy_assignment.user_id = _user_id
      AND legacy_assignment.role IN (
        'admin','church_admin','pastor','secretary','tesoureiro',
        'contador','leader','lider','porteiro'
      )
      AND _permission_key = ANY(definition.permission_keys)
      AND (
        legacy_assignment.organization_id = _organization_id
        OR (
          definition.inherits_to_descendants
          AND public.is_organization_descendant_or_self(
            legacy_assignment.organization_id,
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

    UNION

    SELECT legacy_assignment.organization_id,
           CASE legacy_assignment.role
             WHEN 'admin' THEN 'church_admin'
             WHEN 'church_admin' THEN 'church_admin'
             WHEN 'pastor' THEN 'responsible_pastor'
             WHEN 'secretary' THEN 'secretary'
             WHEN 'tesoureiro' THEN 'treasurer'
             WHEN 'contador' THEN 'accountant'
             WHEN 'leader' THEN 'group_manager'
             WHEN 'lider' THEN 'group_manager'
             WHEN 'porteiro' THEN 'gatekeeper'
           END AS responsibility_type,
           definition.permission_keys,
           definition.inherits_to_descendants
    FROM (
      SELECT membership.organization_id,
             membership.user_id,
             membership.role
      FROM public.organization_users membership
      WHERE membership.is_active

      UNION

      SELECT legacy_role.organization_id,
             legacy_role.user_id,
             legacy_role.role
      FROM public.user_roles legacy_role
      WHERE legacy_role.organization_id IS NOT NULL

      UNION

      SELECT membership.organization_id,
             legacy_role.user_id,
             legacy_role.role
      FROM public.user_roles legacy_role
      JOIN public.organization_users membership
        ON membership.user_id = legacy_role.user_id
       AND membership.is_active
      WHERE legacy_role.organization_id IS NULL
    ) legacy_assignment
    JOIN public.access_responsibility_definitions definition
      ON definition.responsibility_type = CASE legacy_assignment.role
           WHEN 'admin' THEN 'church_admin'
           WHEN 'church_admin' THEN 'church_admin'
           WHEN 'pastor' THEN 'responsible_pastor'
           WHEN 'secretary' THEN 'secretary'
           WHEN 'tesoureiro' THEN 'treasurer'
           WHEN 'contador' THEN 'accountant'
           WHEN 'leader' THEN 'group_manager'
           WHEN 'lider' THEN 'group_manager'
           WHEN 'porteiro' THEN 'gatekeeper'
         END
     AND definition.is_active
    WHERE legacy_assignment.user_id = auth.uid()
      AND legacy_assignment.role IN (
        'admin','church_admin','pastor','secretary','tesoureiro',
        'contador','leader','lider','porteiro'
      )
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
