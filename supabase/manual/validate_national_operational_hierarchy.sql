-- ============================================================
-- Validação: national_operational_hierarchy
-- ATENÇÃO: arquivo MANUAL — NÃO aplicar automaticamente.
-- Execute para verificar se a migration foi aplicada corretamente.
-- ============================================================

\echo '=== VALIDAÇÃO: Estrutura Operacional Nacional ==='

-- ── 1. Validar função is_valid_organization_hierarchy ─────────────────────
\echo ''
\echo '--- 1. Testes da função is_valid_organization_hierarchy ---'

SELECT
  parent_type,
  child_type,
  should_be,
  public.is_valid_organization_hierarchy(parent_type, child_type) AS result,
  CASE
    WHEN public.is_valid_organization_hierarchy(parent_type, child_type) = should_be THEN '✓ OK'
    ELSE '✗ FALHOU'
  END AS status
FROM (VALUES
  -- Nacional
  ('national_convention', 'state_convention', true),
  ('national_convention', 'convencao',        true),
  ('national_convention', 'matriz',           false),
  ('national_convention', 'congregacao',      false),
  -- Estadual
  ('state_convention',    'matriz',           true),
  ('state_convention',    'sede',             true),
  ('state_convention',    'setor',            false),
  ('state_convention',    'congregacao',      false),
  -- Convencao legado
  ('convencao',           'matriz',           true),
  ('convencao',           'sede',             true),
  ('convencao',           'setor',            false),
  -- Matriz
  ('matriz',              'setor',            true),
  ('matriz',              'congregacao',      true),   -- atalho direto
  ('matriz',              'state_convention', false),
  -- Sede
  ('sede',                'setor',            true),
  ('sede',                'congregacao',      true),   -- atalho direto
  ('sede',                'matriz',           false),
  -- Setor
  ('setor',               'congregacao',      true),
  ('setor',               'matriz',           false),
  ('setor',               'setor',            false),
  -- Congregacao
  ('congregacao',         'congregacao',      false),
  ('congregacao',         'setor',            false),
  ('congregacao',         'matriz',           false)
) AS t(parent_type, child_type, should_be);

-- ── 2. Verificar campos financeiros em organizations ──────────────────────
\echo ''
\echo '--- 2. Campos financeiros estruturais ---'
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'organizations'
  AND column_name IN (
    'has_operational_cashbox',
    'is_financially_autonomous',
    'financially_consolidates_to_id',
    'cnpj',
    'financial_policy_notes'
  )
ORDER BY column_name;

-- ── 3. Verificar tabela organization_hierarchy_rules ─────────────────────
\echo ''
\echo '--- 3. Regras de hierarquia cadastradas ---'
SELECT parent_type, child_type, is_active, description
FROM public.organization_hierarchy_rules
WHERE is_active = true
ORDER BY parent_type, child_type;

-- ── 4. Verificar tabela organization_affiliations ─────────────────────────
\echo ''
\echo '--- 4. Tabela organization_affiliations ---'
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'organization_affiliations'
ORDER BY ordinal_position;

-- ── 5. Verificar tabela organization_responsibles ─────────────────────────
\echo ''
\echo '--- 5. Tabela organization_responsibles ---'
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'organization_responsibles'
ORDER BY ordinal_position;

-- ── 6. Verificar RLS das novas tabelas ────────────────────────────────────
\echo ''
\echo '--- 6. RLS das novas tabelas ---'
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organization_hierarchy_rules',
    'organization_affiliations',
    'organization_responsibles'
  )
ORDER BY tablename;

-- ── 7. Políticas RLS das novas tabelas ───────────────────────────────────
\echo ''
\echo '--- 7. Policies das novas tabelas ---'
SELECT
  tablename,
  policyname,
  cmd AS command,
  qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organization_hierarchy_rules',
    'organization_affiliations',
    'organization_responsibles'
  )
ORDER BY tablename, policyname;

-- ── 8. Verificar árvore demo (se seed foi aplicado) ──────────────────────
\echo ''
\echo '--- 8. Árvore demo (se seed_national_hierarchy_demo foi aplicado) ---'
WITH RECURSIVE tree AS (
  SELECT id, name, organization_type, parent_id, 0 AS depth, name AS path
  FROM public.organizations
  WHERE id IN (
    'c0000000-0000-0000-0000-000000000001'::uuid  -- CGADB
  )
  UNION ALL
  SELECT o.id, o.name, o.organization_type, o.parent_id, t.depth + 1, t.path || ' > ' || o.name
  FROM public.organizations o
  JOIN tree t ON o.parent_id = t.id
  WHERE t.depth < 5
)
SELECT
  repeat('  ', depth) || name AS hierarquia,
  organization_type,
  depth
FROM tree
ORDER BY path;

-- ── 9. Resumo final ───────────────────────────────────────────────────────
\echo ''
\echo '--- 9. Contagem de organizações por tipo ---'
SELECT
  organization_type,
  COUNT(*) AS total,
  SUM(CASE WHEN active THEN 1 ELSE 0 END) AS ativas
FROM public.organizations
GROUP BY organization_type
ORDER BY organization_type;

\echo ''
\echo '=== Validação concluída ==='
