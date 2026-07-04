-- ============================================================
-- seed_multi_root_international_demo.sql
-- Demo: Plataforma Multi-Cliente, Multi-Raiz, Internacional
-- ============================================================
-- ESTRUTURA:
--   Árvore 1 — AD Brasil (CGADB) — modelo: ad_brasil_national
--   Árvore 2 — AD Restauração Internacional — modelo: international_flexible
--   Árvore 3 — Igreja simples independente — modelo: single_church
--
-- INSTRUÇÕES:
--   Executar manualmente no Supabase SQL Editor.
--   Idempotente — usa ON CONFLICT DO NOTHING.
--   NÃO destrói dados existentes.
--   Não aplica automaticamente.
--
-- UUIDs FIXOS para referência cruzada:
--   CGADB:                  aa000001-0000-0000-0000-000000000001
--   CIEPADERGS:             aa000002-0000-0000-0000-000000000002
--   AD Caxias:              aa000003-0000-0000-0000-000000000003
--   Distrito Santa Fé:      aa000004-0000-0000-0000-000000000004
--   Congregação Santa Fé I: aa000005-0000-0000-0000-000000000005
--   AD Restauração Intl:    bb000001-0000-0000-0000-000000000001
--   AD Portugal:            bb000002-0000-0000-0000-000000000002
--   Lisboa:                 bb000003-0000-0000-0000-000000000003
--   Campo Espanha:          bb000004-0000-0000-0000-000000000004
--   Igreja Independente X:  cc000001-0000-0000-0000-000000000001
-- ============================================================

-- ── ÁRVORE 1: AD Brasil / CGADB ──────────────────────────────────────────────

INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active, hierarchy_model,
  top_level_label, top_level_label_plural,
  municipal_level_label, municipal_level_label_plural,
  intermediate_level_label, intermediate_level_label_plural,
  local_unit_label, local_unit_label_plural
) VALUES (
  'aa000001-0000-0000-0000-000000000001',
  'CGADB — Convenção Geral das Assembleias de Deus no Brasil',
  'national_convention', NULL, true, 'ad_brasil_national',
  'Convenção Estadual', 'Convenções Estaduais',
  'Matriz Municipal', 'Matrizes Municipais',
  'Setor / Distrito', 'Setores / Distritos',
  'Congregação', 'Congregações'
) ON CONFLICT (id) DO NOTHING;

-- Convenção Estadual RS
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active
) VALUES (
  'aa000002-0000-0000-0000-000000000002',
  'CIEPADERGS — Convenção das Assembleias de Deus no RS',
  'state_convention',
  'aa000001-0000-0000-0000-000000000001',
  true
) ON CONFLICT (id) DO NOTHING;

-- Matriz Municipal
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active,
  uses_intermediate_level, uses_local_units
) VALUES (
  'aa000003-0000-0000-0000-000000000003',
  'AD Caxias do Sul — Ministério Central',
  'matriz',
  'aa000002-0000-0000-0000-000000000002',
  true, true, true
) ON CONFLICT (id) DO NOTHING;

-- Setor / Distrito
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active
) VALUES (
  'aa000004-0000-0000-0000-000000000004',
  'Distrito Santa Fé',
  'setor',
  'aa000003-0000-0000-0000-000000000003',
  true
) ON CONFLICT (id) DO NOTHING;

-- Congregação
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active
) VALUES (
  'aa000005-0000-0000-0000-000000000005',
  'Congregação Santa Fé I',
  'congregacao',
  'aa000004-0000-0000-0000-000000000004',
  true
) ON CONFLICT (id) DO NOTHING;

-- ── ÁRVORE 2: AD Restauração Internacional ────────────────────────────────────
-- Modelo: international_flexible
-- Permite: Internacional → Campo/Sede/Igreja diretamente
-- Não inclui CGADB. Não é filha da CGADB.

INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active, hierarchy_model,
  top_level_label, top_level_label_plural,
  municipal_level_label, municipal_level_label_plural,
  intermediate_level_label, intermediate_level_label_plural,
  local_unit_label, local_unit_label_plural
) VALUES (
  'bb000001-0000-0000-0000-000000000001',
  'Assembleia de Deus Restauração Internacional',
  'international_convention', NULL, true, 'international_flexible',
  'Campo / País', 'Campos / Países',
  'Sede / Igreja', 'Sedes / Igrejas',
  'Região / Área', 'Regiões / Áreas',
  'Congregação / Campus', 'Congregações / Campi'
) ON CONFLICT (id) DO NOTHING;

-- Portugal — filha direta do internacional (pula nível nacional)
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active
) VALUES (
  'bb000002-0000-0000-0000-000000000002',
  'AD Restauração — Portugal',
  'matriz',  -- campo/missão direto sem convenção nacional formal
  'bb000001-0000-0000-0000-000000000001',
  true
) ON CONFLICT (id) DO NOTHING;

-- Lisboa — sede direta sob Portugal
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active
) VALUES (
  'bb000003-0000-0000-0000-000000000003',
  'AD Restauração — Lisboa',
  'congregacao',
  'bb000002-0000-0000-0000-000000000002',
  true
) ON CONFLICT (id) DO NOTHING;

-- Espanha — campo direto do internacional
INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active
) VALUES (
  'bb000004-0000-0000-0000-000000000004',
  'Campo Espanha — AD Restauração',
  'sede',  -- sede missionária direta
  'bb000001-0000-0000-0000-000000000001',
  true
) ON CONFLICT (id) DO NOTHING;

-- ── ÁRVORE 3: Igreja Independente / Single Church ─────────────────────────────
-- Modelo: single_church
-- Sem filhos estruturais obrigatórios.
-- Usa módulos operacionais diretamente na própria organização.

INSERT INTO public.organizations (
  id, name, organization_type, parent_id, active, hierarchy_model,
  uses_intermediate_level, uses_local_units,
  municipal_level_label, municipal_level_label_plural
) VALUES (
  'cc000001-0000-0000-0000-000000000001',
  'Igreja Comunidade da Graça — São Paulo',
  'matriz', NULL, true, 'single_church',
  false, false,
  'Minha Igreja', 'Minha Igreja'
) ON CONFLICT (id) DO NOTHING;

-- ── Verificação ──────────────────────────────────────────────────────────────
SELECT
  id,
  name,
  organization_type,
  hierarchy_model,
  parent_id,
  CASE WHEN parent_id IS NULL THEN '🌳 RAIZ' ELSE '  └── filho' END AS posicao
FROM public.organizations
WHERE id IN (
  'aa000001-0000-0000-0000-000000000001',
  'aa000002-0000-0000-0000-000000000002',
  'aa000003-0000-0000-0000-000000000003',
  'aa000004-0000-0000-0000-000000000004',
  'aa000005-0000-0000-0000-000000000005',
  'bb000001-0000-0000-0000-000000000001',
  'bb000002-0000-0000-0000-000000000002',
  'bb000003-0000-0000-0000-000000000003',
  'bb000004-0000-0000-0000-000000000004',
  'cc000001-0000-0000-0000-000000000001'
)
ORDER BY posicao DESC, name;
