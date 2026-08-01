-- ==========================================================================
-- Gestao: convergencia de acesso aos modulos institucionais
-- Timestamp: 20260803180000
-- ==========================================================================
--
-- Corrige dois estados legados observados na homologacao:
--   1. administradores/pastores ja vinculados antes da criacao das
--      responsabilidades hierarquicas podem existir em organization_users,
--      mas sem a linha equivalente em organization_responsibles;
--   2. definicoes antigas de church_admin/responsible_pastor podem nao conter
--      as capabilities dos tres modulos institucionais.
--
-- A migracao nao libera os modulos para qualquer usuario. Ela apenas reconcilia
-- o papel administrativo/pastoral que ja existe na mesma organizacao.
-- ==========================================================================

BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.organization_users') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organization_users');
  END IF;
  IF to_regclass('public.organization_responsibles') IS NULL THEN
    v_missing := array_append(v_missing, 'public.organization_responsibles');
  END IF;
  IF to_regclass('public.access_responsibility_definitions') IS NULL THEN
    v_missing := array_append(v_missing, 'public.access_responsibility_definitions');
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'management_access_visibility_convergence preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

UPDATE public.access_responsibility_definitions
SET permission_keys = (
      SELECT ARRAY(
        SELECT DISTINCT permission_key
        FROM unnest(
          COALESCE(permission_keys, ARRAY[]::text[])
          || ARRAY[
            'discipleship.read', 'discipleship.manage', 'discipleship.teach', 'discipleship.confidential',
            'theology.read', 'theology.manage', 'theology.teach', 'theology.confidential',
            'missions.read', 'missions.manage', 'missions.finance', 'missions.confidential'
          ]
        ) permission_key
        ORDER BY permission_key
      )
    ),
    updated_at = now()
WHERE responsibility_type IN ('church_admin', 'responsible_pastor');

INSERT INTO public.organization_responsibles (
  organization_id,
  responsibility_type,
  user_id,
  assigned_by,
  assigned_at,
  is_active,
  notes
)
SELECT
  membership.organization_id,
  CASE membership.role
    WHEN 'admin' THEN 'church_admin'
    WHEN 'church_admin' THEN 'church_admin'
    WHEN 'pastor' THEN 'responsible_pastor'
  END,
  membership.user_id,
  NULL,
  now(),
  true,
  'Reconciliado do vinculo administrativo legado pela release de gestao'
FROM public.organization_users membership
WHERE membership.is_active
  AND membership.role IN ('admin', 'church_admin', 'pastor')
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_responsibles responsible
    WHERE responsible.organization_id = membership.organization_id
      AND responsible.user_id = membership.user_id
      AND responsible.responsibility_type = CASE membership.role
        WHEN 'admin' THEN 'church_admin'
        WHEN 'church_admin' THEN 'church_admin'
        WHEN 'pastor' THEN 'responsible_pastor'
      END
      AND responsible.is_active
  );

COMMIT;
