-- ============================================================
-- validate_multi_root_international_hierarchy.sql
-- Validação: plataforma multi-cliente, multi-raiz, internacional
-- ============================================================
-- Executar manualmente no Supabase SQL Editor após aplicar a migration.
-- Todos os testes devem retornar TRUE (✅ PASS) ou FALSE detectado (❌ FAIL).
-- ============================================================

-- ── 1. Testes de pares VÁLIDOS ────────────────────────────────────────────────

SELECT 'HIERARQUIA VÁLIDA — internacional' AS secao;

SELECT
  _parent || ' → ' || _child AS par,
  public.is_valid_organization_hierarchy(_parent, _child) AS resultado,
  CASE WHEN public.is_valid_organization_hierarchy(_parent, _child) THEN '✅ PASS' ELSE '❌ FAIL' END AS status
FROM (VALUES
  -- Internacional → qualquer nível abaixo
  ('international_convention', 'national_convention'),
  ('international_convention', 'state_convention'),
  ('international_convention', 'convencao'),
  ('international_convention', 'matriz'),
  ('international_convention', 'sede'),
  -- Nacional → estadual e atalhos
  ('national_convention', 'state_convention'),
  ('national_convention', 'convencao'),
  ('national_convention', 'matriz'),
  ('national_convention', 'sede'),
  -- Estadual → municipal
  ('state_convention', 'matriz'),
  ('state_convention', 'sede'),
  ('convencao', 'matriz'),
  ('convencao', 'sede'),
  -- Municipal → intermediário
  ('matriz', 'setor'),
  ('sede', 'setor'),
  -- Municipal → local (atalho direto)
  ('matriz', 'congregacao'),
  ('sede', 'congregacao'),
  -- Intermediário → local
  ('setor', 'congregacao')
) AS t(_parent, _child);

-- ── 2. Testes de pares BLOQUEADOS ─────────────────────────────────────────────

SELECT '--- HIERARQUIA BLOQUEADA (todos devem ser FALSE) ---' AS secao;

SELECT
  _parent || ' → ' || _child AS par,
  public.is_valid_organization_hierarchy(_parent, _child) AS resultado,
  CASE WHEN NOT public.is_valid_organization_hierarchy(_parent, _child) THEN '✅ BLOQUEADO CORRETO' ELSE '❌ FALHA — DEVERIA SER BLOQUEADO' END AS status
FROM (VALUES
  -- Congregação não cria filhos
  ('congregacao', 'congregacao'),
  ('congregacao', 'setor'),
  ('congregacao', 'matriz'),
  -- Setor não sobe
  ('setor', 'matriz'),
  ('setor', 'state_convention'),
  ('setor', 'national_convention'),
  -- Subir na hierarquia
  ('matriz', 'state_convention'),
  ('matriz', 'national_convention'),
  ('state_convention', 'national_convention'),
  -- Internacional não cria congregação direta
  ('international_convention', 'congregacao'),
  ('international_convention', 'setor'),
  -- Nacional não cria congregação direta
  ('national_convention', 'congregacao'),
  ('national_convention', 'setor'),
  -- Tipos inválidos/desconhecidos
  ('church', 'congregacao'),
  ('unknown', 'congregacao')
) AS t(_parent, _child);

-- ── 3. Múltiplas raízes ────────────────────────────────────────────────────────

SELECT '--- MÚLTIPLAS RAÍZES (parent_id IS NULL) ---' AS secao;

SELECT
  'Número de raízes (parent_id IS NULL)' AS verificacao,
  COUNT(*) AS total,
  CASE WHEN COUNT(*) >= 3 THEN '✅ MULTI-RAIZ ATIVO' ELSE '⚠️ Menos de 3 raízes (adicione via seed)' END AS status
FROM public.organizations
WHERE parent_id IS NULL AND active = true;

SELECT
  name,
  organization_type,
  hierarchy_model,
  '🌳 RAIZ INDEPENDENTE' AS tipo
FROM public.organizations
WHERE parent_id IS NULL AND active = true
ORDER BY organization_type, name;

-- ── 4. Verificação de modelos ──────────────────────────────────────────────────

SELECT '--- MODELOS DE HIERARQUIA CADASTRADOS ---' AS secao;

SELECT
  hierarchy_model,
  COUNT(*) AS total,
  STRING_AGG(name, ', ' ORDER BY name) AS exemplos
FROM public.organizations
WHERE hierarchy_model IS NOT NULL AND active = true
GROUP BY hierarchy_model
ORDER BY hierarchy_model;

-- ── 5. Árvore AD Brasil ───────────────────────────────────────────────────────

SELECT '--- ÁRVORE AD BRASIL (CGADB) ---' AS secao;

WITH RECURSIVE arvore AS (
  SELECT
    id, name, organization_type, parent_id, 0 AS nivel,
    name AS caminho
  FROM public.organizations
  WHERE id = 'aa000001-0000-0000-0000-000000000001'

  UNION ALL

  SELECT
    o.id, o.name, o.organization_type, o.parent_id, a.nivel + 1,
    a.caminho || ' → ' || o.name
  FROM public.organizations o
  JOIN arvore a ON o.parent_id = a.id
  WHERE a.nivel < 6
)
SELECT
  REPEAT('  ', nivel) || name AS estrutura,
  organization_type AS tipo,
  nivel
FROM arvore
ORDER BY caminho;

-- ── 6. Árvore AD Restauração Internacional ────────────────────────────────────

SELECT '--- ÁRVORE RESTAURAÇÃO INTERNACIONAL ---' AS secao;

WITH RECURSIVE arvore AS (
  SELECT
    id, name, organization_type, parent_id, 0 AS nivel,
    name AS caminho
  FROM public.organizations
  WHERE id = 'bb000001-0000-0000-0000-000000000001'

  UNION ALL

  SELECT
    o.id, o.name, o.organization_type, o.parent_id, a.nivel + 1,
    a.caminho || ' → ' || o.name
  FROM public.organizations o
  JOIN arvore a ON o.parent_id = a.id
  WHERE a.nivel < 6
)
SELECT
  REPEAT('  ', nivel) || name AS estrutura,
  organization_type AS tipo,
  nivel
FROM arvore
ORDER BY caminho;

-- ── 7. Igreja simples (single_church) ─────────────────────────────────────────

SELECT '--- IGREJA SIMPLES (SINGLE CHURCH) ---' AS secao;

SELECT
  o.name,
  o.organization_type,
  o.hierarchy_model,
  o.uses_intermediate_level,
  o.uses_local_units,
  COALESCE(cnt.total_filhos, 0) AS total_filhos,
  CASE WHEN COALESCE(cnt.total_filhos, 0) = 0 THEN '✅ SEM FILHOS (CORRETO)' ELSE '⚠️ TEM FILHOS' END AS status
FROM public.organizations o
LEFT JOIN (
  SELECT parent_id, COUNT(*) AS total_filhos
  FROM public.organizations
  WHERE active = true
  GROUP BY parent_id
) cnt ON cnt.parent_id = o.id
WHERE o.hierarchy_model = 'single_church' AND o.active = true;

-- ── 8. Verificação de tabelas criadas ─────────────────────────────────────────

SELECT '--- TABELAS CRIADAS ---' AS secao;

SELECT
  table_name,
  CASE WHEN table_name IS NOT NULL THEN '✅ EXISTE' ELSE '❌ NÃO EXISTE' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organization_hierarchy_rules',
    'organization_affiliations',
    'organization_responsibles'
  )
ORDER BY table_name;

-- ── 9. Campos financeiros estruturais ─────────────────────────────────────────

SELECT '--- CAMPOS FINANCEIROS EM ORGANIZATIONS ---' AS secao;

SELECT
  column_name,
  data_type,
  '✅ EXISTE' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'organizations'
  AND column_name IN (
    'has_operational_cashbox',
    'is_financially_autonomous',
    'financially_consolidates_to_id',
    'cnpj',
    'financial_policy_notes'
  )
ORDER BY column_name;

-- ── 10. Contagem final de registros de hierarquia ─────────────────────────────

SELECT '--- REGRAS DE HIERARQUIA DOCUMENTADAS ---' AS secao;

SELECT
  parent_type,
  STRING_AGG(child_type, ', ' ORDER BY child_type) AS filhos_permitidos
FROM public.organization_hierarchy_rules
WHERE is_active = true
GROUP BY parent_type
ORDER BY CASE parent_type
  WHEN 'international_convention' THEN 1
  WHEN 'national_convention'      THEN 2
  WHEN 'state_convention'         THEN 3
  WHEN 'convencao'                THEN 4
  WHEN 'matriz'                   THEN 5
  WHEN 'sede'                     THEN 6
  WHEN 'setor'                    THEN 7
  ELSE 99
END;

SELECT '=== VALIDAÇÃO CONCLUÍDA ===' AS resultado;
