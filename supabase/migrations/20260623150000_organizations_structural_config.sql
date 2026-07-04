-- ============================================================
-- Migration: configuração estrutural e nomenclatura multi-denominacional
-- Data: 2026-06-23
-- ============================================================
-- OBJETIVO:
--   Permitir que cada organização configure sua própria
--   hierarquia e nomenclatura, sem hardcode no frontend.
--
--   Ex: AD → Convenção / Matriz Municipal / Distrito / Congregação
--       Igreja independente → Igreja / Campus
--       Church com campuses → Rede / Igreja / Campus
--
-- SEGURANÇA:
--   • ADD COLUMN IF NOT EXISTS — idempotente.
--   • Todos os novos campos são nullable — sem impacto em dados existentes.
--   • Não remove nem altera colunas existentes.
--   • Não altera RLS.
--   • Não afeta unit_status (já adicionado em 20260623120000).
-- ============================================================

-- ── Identificação denominacional ────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS denomination_type text DEFAULT NULL;

COMMENT ON COLUMN public.organizations.denomination_type IS
  'Ex: "Assembleia de Deus", "Adventista", "Independente", "Church"';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS hierarchy_model text DEFAULT NULL;

COMMENT ON COLUMN public.organizations.hierarchy_model IS
  'Ex: convention_matriz_intermediate_local | single_church | church_with_campuses | custom';

-- ── Labels configuráveis por nível ──────────────────────────────────────────
-- Cada organização nomeia seus próprios níveis hierárquicos.
-- NULL = usar fallback no frontend.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS top_level_label text DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS top_level_label_plural text DEFAULT NULL;

COMMENT ON COLUMN public.organizations.top_level_label IS
  'Nome singular do nível topo. Ex: Convenção, Rede, Ministério';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS municipal_level_label text DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS municipal_level_label_plural text DEFAULT NULL;

COMMENT ON COLUMN public.organizations.municipal_level_label IS
  'Nome singular do nível municipal. Ex: Matriz Municipal, Sede, Igreja';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS intermediate_level_label text DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS intermediate_level_label_plural text DEFAULT NULL;

COMMENT ON COLUMN public.organizations.intermediate_level_label IS
  'Nome singular do nível intermediário. Ex: Setor, Distrito, Região, Área, Campo';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS local_unit_label text DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS local_unit_label_plural text DEFAULT NULL;

COMMENT ON COLUMN public.organizations.local_unit_label IS
  'Nome singular da unidade local. Ex: Congregação, Igreja local, Filial, Campus, Templo';

-- ── Flags de níveis ativos ───────────────────────────────────────────────────
-- NULL = frontend usa default true/false baseado em organization_type.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS uses_convention_level boolean DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS uses_municipal_level boolean DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS uses_intermediate_level boolean DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS uses_local_units boolean DEFAULT NULL;

COMMENT ON COLUMN public.organizations.uses_intermediate_level IS
  'Se false, a Matriz gerencia unidades locais diretamente (sem nível intermediário).';

-- ── Notificação de conclusão ─────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE 'organizations: campos estruturais e nomenclatura multi-denominacional adicionados ✓';
END $$;
