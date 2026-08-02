-- ==========================================================================
-- Gestao: auditoria e reconciliacao defensiva de acesso aos tres modulos
-- institucionais (Discipulado, Teologia, Missoes)
-- Timestamp: 20260804090000
-- ==========================================================================
--
-- Contexto (homologacao 20260728, segunda rodada): o perfil administrativo
-- legado usado ha meses continuava vendo somente Discipulado no menu,
-- mesmo depois das correcoes anteriores (20260803180000, 20260803190000,
-- 20260803200000) terem sido escritas no repositorio. Nao havia como
-- confirmar, a partir do codigo, se essas tres migrations tinham realmente
-- sido aplicadas no banco de staging (a API de gerenciamento respondeu 401
-- durante a tentativa de listagem, e credenciais novas estao fora de
-- escopo desta tarefa).
--
-- Esta migration NAO reescreve nenhuma migration anterior. Ela e
-- inteiramente idempotente e serve como uma segunda camada de garantia:
-- se 20260803180000/190000 ja foram aplicadas, todo bloco abaixo e um
-- no-op comprovado (as clausulas WHERE NOT/IS DISTINCT FROM nao encontram
-- nada para alterar). Se por qualquer motivo NAO foram aplicadas (ou foram
-- aplicadas parcialmente), esta migration completa o trabalho e deixa um
-- rastro auditavel via RAISE NOTICE — sem lancar excecao e sem bloquear o
-- restante do deploy, porque staging deve continuar aceitando o pacote
-- completo mesmo diante de um estado legado incomum.
--
-- Reforco defensivo adicional em relacao a 20260803190000: normaliza
-- espacos/caixa (`btrim(lower(...))`) ao comparar o texto do papel legado,
-- para o caso de um vinculo antigo ter sido gravado com variacao de
-- capitalizacao (" Admin", "Church_Admin" etc.) que os CASE anteriores,
-- sensiveis a caixa, nao cobririam.
-- ==========================================================================

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
      'management_access_reconciliation_audit preflight failed; missing: %',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- 1) Reforça (idempotente) as permission_keys de church_admin/responsible_pastor.
--    Repete exatamente o efeito de 20260803180000 — sem risco algum de
--    duplicar chaves (a subquery já deduplica via DISTINCT).
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
WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
  AND NOT (
    'discipleship.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'theology.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    AND 'missions.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
  );

-- 2) Reconcilia organization_responsibles a partir de organization_users e
--    user_roles, com normalização defensiva de espaço/caixa do texto do
--    papel legado (btrim + lower) — cobre variações de capitalização que
--    20260803190000 (comparação exata) não cobriria.
WITH legacy_assignments AS (
  SELECT membership.organization_id,
         membership.user_id,
         CASE btrim(lower(membership.role))
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
    AND btrim(lower(membership.role)) IN (
      'admin','church_admin','pastor','secretary','tesoureiro',
      'contador','leader','lider','porteiro'
    )

  UNION

  SELECT legacy_role.organization_id,
         legacy_role.user_id,
         CASE btrim(lower(legacy_role.role))
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
    AND btrim(lower(legacy_role.role)) IN (
      'admin','church_admin','pastor','secretary','tesoureiro',
      'contador','leader','lider','porteiro'
    )

  UNION

  SELECT membership.organization_id,
         legacy_role.user_id,
         CASE btrim(lower(legacy_role.role))
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
    AND btrim(lower(legacy_role.role)) IN (
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
       'Reconciliado pela auditoria defensiva de acesso (20260804090000)'
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

-- 3) Auditoria: nunca bloqueia o deploy (RAISE NOTICE, não EXCEPTION).
--    Deixa no log do banco a contagem de qualquer vínculo administrativo/
--    pastoral ativo que, mesmo depois desta migration, ainda não tenha uma
--    responsabilidade materializada — o único jeito de investigar isso é
--    olhar dados reais, o que está fora do alcance de uma migration.
DO $$
DECLARE
  v_still_missing integer;
  v_definitions_incomplete integer;
BEGIN
  SELECT count(*) INTO v_still_missing
  FROM public.organization_users membership
  WHERE membership.is_active
    AND btrim(lower(membership.role)) IN ('admin', 'church_admin', 'pastor')
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_responsibles responsible
      WHERE responsible.organization_id = membership.organization_id
        AND responsible.user_id = membership.user_id
        AND responsible.is_active
        AND responsible.responsibility_type IN ('church_admin', 'responsible_pastor')
    );

  SELECT count(*) INTO v_definitions_incomplete
  FROM public.access_responsibility_definitions
  WHERE responsibility_type IN ('church_admin', 'responsible_pastor')
    AND NOT (
      'discipleship.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
      AND 'theology.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
      AND 'missions.read' = ANY(COALESCE(permission_keys, ARRAY[]::text[]))
    );

  RAISE NOTICE
    'management_access_reconciliation_audit: % vinculo(s) administrativo(s)/pastoral(is) ainda sem organization_responsibles ativa; % definicao(oes) de church_admin/responsible_pastor ainda incompleta(s) apos esta migration.',
    v_still_missing, v_definitions_incomplete;
END;
$$;

COMMIT;
