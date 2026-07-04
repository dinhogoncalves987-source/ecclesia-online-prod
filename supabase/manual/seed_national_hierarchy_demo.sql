-- ============================================================
-- Seed: national_hierarchy_demo
-- ATENÇÃO: arquivo MANUAL — NÃO aplicar automaticamente.
-- Aplicar apenas em ambiente staging/demo.
-- Idempotente: usa INSERT ... ON CONFLICT DO NOTHING.
-- ============================================================
-- Monta árvore exemplo:
--   CGADB (nacional)
--   └── CIEPADERGS (estadual RS)
--       ├── AD Caxias do Sul (matriz — já pode existir)
--       │   ├── Setor Norte
--       │   │   ├── Congregação Santa Fé I
--       │   │   └── Congregação Santa Fé II
--       │   ├── Setor Centro
--       │   └── Setor Sul
--       └── AD Porto Alegre (matriz)
--   └── CIADESC (estadual SC)
--       └── AD Chapecó (matriz)
-- ============================================================

-- IDs fixos para uso idempotente
DO $$
DECLARE
  -- Nacional
  v_cgadb        uuid := 'c0000000-0000-0000-0000-000000000001'::uuid;
  -- Estaduais
  v_ciepadergs   uuid := 'c0000000-0000-0000-0000-000000000010'::uuid;
  v_ciadesc      uuid := 'c0000000-0000-0000-0000-000000000011'::uuid;
  -- Matrizes
  v_ad_caxias    uuid := 'c0000000-0000-0000-0000-000000000020'::uuid;
  v_ad_poa       uuid := 'c0000000-0000-0000-0000-000000000021'::uuid;
  v_ad_chapeco   uuid := 'c0000000-0000-0000-0000-000000000022'::uuid;
  -- Setores (Caxias)
  v_setor_norte  uuid := 'c0000000-0000-0000-0000-000000000030'::uuid;
  v_setor_centro uuid := 'c0000000-0000-0000-0000-000000000031'::uuid;
  v_setor_sul    uuid := 'c0000000-0000-0000-0000-000000000032'::uuid;
  -- Congregações
  v_cong_sfe_i   uuid := 'c0000000-0000-0000-0000-000000000040'::uuid;
  v_cong_sfe_ii  uuid := 'c0000000-0000-0000-0000-000000000041'::uuid;
  v_cong_centro  uuid := 'c0000000-0000-0000-0000-000000000042'::uuid;
BEGIN

  -- ── 1. Sede Nacional (CGADB) ────────────────────────────────────────────
  INSERT INTO public.organizations
    (id, name, slug, organization_type, parent_id, city, state, active, unit_status,
     top_level_label, top_level_label_plural,
     municipal_level_label, municipal_level_label_plural,
     intermediate_level_label, intermediate_level_label_plural,
     local_unit_label, local_unit_label_plural,
     uses_convention_level, uses_municipal_level, uses_intermediate_level, uses_local_units)
  VALUES
    (v_cgadb, 'CGADB — Sede Nacional', 'cgadb-nacional', 'national_convention',
     NULL, 'Brasília', 'DF', true, 'Ativa',
     'Convenção Estadual', 'Convenções Estaduais',
     'Matriz Municipal', 'Matrizes Municipais',
     'Setor', 'Setores',
     'Congregação', 'Congregações',
     true, true, true, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Convenção Estadual RS (CIEPADERGS) ──────────────────────────────
  INSERT INTO public.organizations
    (id, name, slug, organization_type, parent_id, city, state, active, unit_status,
     top_level_label, top_level_label_plural,
     municipal_level_label, municipal_level_label_plural,
     intermediate_level_label, intermediate_level_label_plural,
     local_unit_label, local_unit_label_plural,
     uses_convention_level, uses_municipal_level, uses_intermediate_level, uses_local_units)
  VALUES
    (v_ciepadergs, 'CIEPADERGS — Convenção Estadual RS', 'ciepadergs-rs', 'state_convention',
     v_cgadb, 'Porto Alegre', 'RS', true, 'Ativa',
     'Convenção Estadual', 'Convenções Estaduais',
     'Matriz Municipal', 'Matrizes Municipais',
     'Setor', 'Setores',
     'Congregação', 'Congregações',
     true, true, true, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. Convenção Estadual SC (CIADESC) ─────────────────────────────────
  INSERT INTO public.organizations
    (id, name, slug, organization_type, parent_id, city, state, active, unit_status,
     uses_convention_level, uses_municipal_level, uses_intermediate_level, uses_local_units)
  VALUES
    (v_ciadesc, 'CIADESC — Convenção Estadual SC', 'ciadesc-sc', 'state_convention',
     v_cgadb, 'Florianópolis', 'SC', true, 'Ativa',
     true, true, true, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 4. AD Caxias do Sul (Matriz) ────────────────────────────────────────
  -- Inserir somente se não existir outro registro com este ID
  INSERT INTO public.organizations
    (id, name, slug, organization_type, parent_id, city, state, active, unit_status,
     intermediate_level_label, intermediate_level_label_plural,
     local_unit_label, local_unit_label_plural,
     uses_intermediate_level, uses_local_units)
  VALUES
    (v_ad_caxias, 'Assembleia de Deus em Caxias do Sul', 'ad-caxias-do-sul', 'matriz',
     v_ciepadergs, 'Caxias do Sul', 'RS', true, 'Ativa',
     'Setor', 'Setores', 'Congregação', 'Congregações',
     true, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 5. AD Porto Alegre (Matriz) ─────────────────────────────────────────
  INSERT INTO public.organizations
    (id, name, slug, organization_type, parent_id, city, state, active, unit_status,
     uses_intermediate_level, uses_local_units)
  VALUES
    (v_ad_poa, 'Assembleia de Deus em Porto Alegre', 'ad-porto-alegre', 'matriz',
     v_ciepadergs, 'Porto Alegre', 'RS', true, 'Ativa', true, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. AD Chapecó (Matriz) ──────────────────────────────────────────────
  INSERT INTO public.organizations
    (id, name, slug, organization_type, parent_id, city, state, active, unit_status,
     uses_intermediate_level, uses_local_units)
  VALUES
    (v_ad_chapeco, 'Assembleia de Deus em Chapecó', 'ad-chapeco', 'matriz',
     v_ciadesc, 'Chapecó', 'SC', true, 'Ativa', true, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 7. Setores da AD Caxias ─────────────────────────────────────────────
  INSERT INTO public.organizations (id, name, slug, organization_type, parent_id, city, state, active, unit_status)
  VALUES
    (v_setor_norte,  'Setor Norte',  'setor-norte-caxias',  'setor', v_ad_caxias, 'Caxias do Sul', 'RS', true, 'Ativa'),
    (v_setor_centro, 'Setor Centro', 'setor-centro-caxias', 'setor', v_ad_caxias, 'Caxias do Sul', 'RS', true, 'Ativa'),
    (v_setor_sul,    'Setor Sul',    'setor-sul-caxias',    'setor', v_ad_caxias, 'Caxias do Sul', 'RS', true, 'Ativa')
  ON CONFLICT (id) DO NOTHING;

  -- ── 8. Congregações ─────────────────────────────────────────────────────
  INSERT INTO public.organizations (id, name, slug, organization_type, parent_id, city, state, active, unit_status)
  VALUES
    (v_cong_sfe_i,  'Congregação Santa Fé I',  'cong-santa-fe-i',  'congregacao', v_setor_norte, 'Caxias do Sul', 'RS', true, 'Ativa'),
    (v_cong_sfe_ii, 'Congregação Santa Fé II', 'cong-santa-fe-ii', 'congregacao', v_setor_norte, 'Caxias do Sul', 'RS', true, 'Ativa'),
    (v_cong_centro, 'Congregação Central',     'cong-central',     'congregacao', v_setor_centro,'Caxias do Sul', 'RS', true, 'Ativa')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '====================================================';
  RAISE NOTICE 'seed_national_hierarchy_demo aplicado!';
  RAISE NOTICE 'Árvore:';
  RAISE NOTICE '  CGADB (nacional)';
  RAISE NOTICE '  ├── CIEPADERGS (estadual RS)';
  RAISE NOTICE '  │   ├── AD Caxias → Setor Norte, Centro, Sul';
  RAISE NOTICE '  │   │   └── Cong. Santa Fé I/II, Central';
  RAISE NOTICE '  │   └── AD Porto Alegre';
  RAISE NOTICE '  └── CIADESC (estadual SC)';
  RAISE NOTICE '      └── AD Chapecó';
  RAISE NOTICE '====================================================';

END $$;
