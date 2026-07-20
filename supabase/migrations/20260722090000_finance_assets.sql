-- ============================================================================
-- Migration: finance_assets
-- Timestamp: 20260722090000
-- ============================================================================
--
-- OBJETIVO
-- Fase E da restauração do módulo Financeiro (ver plano de restauração
-- "Restauração Financeiro Completo"): a aba "Patrimônio" usava o array fixo
-- FINANCE_ASSETS de src/lib/financeDemo.ts, e a troca de status
-- (Ativo/Em manutenção/Baixado) era só estado React local — nunca persistia
-- em lugar nenhum. Esta migration cria a tabela real de inventário de bens
-- patrimoniais por organização.
--
-- DESENHO
-- Uma linha por bem patrimonial. `status` replica exatamente os 3 valores já
-- usados na UI (Ativo/Em manutenção/Baixado) via CHECK. Reaproveita helpers
-- de RLS já existentes (`is_org_finance_reader` / `is_org_finance_writer`,
-- de 20260512100000) — nenhuma função nova de RLS.
--
-- Idempotente e forward-only. Aplicada byte a byte idêntica em staging
-- (supabase/migrations/) e produção (supabase-production/supabase/migrations/).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  category          text NOT NULL,
  estimated_value   numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
  status            text NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Em manutenção', 'Baixado')),
  responsible       text,
  location          text,
  notes             text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_assets IS
  'Inventário real de bens patrimoniais por organização (Patrimônio). Substitui FINANCE_ASSETS fictício de src/lib/financeDemo.ts.';

CREATE INDEX IF NOT EXISTS idx_finance_assets_org ON public.finance_assets (organization_id);
CREATE INDEX IF NOT EXISTS idx_finance_assets_status ON public.finance_assets (status);

DROP TRIGGER IF EXISTS finance_assets_updated_at ON public.finance_assets;
CREATE TRIGGER finance_assets_updated_at
BEFORE UPDATE ON public.finance_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.finance_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance assets readers read" ON public.finance_assets;
CREATE POLICY "finance assets readers read" ON public.finance_assets
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance assets writers manage" ON public.finance_assets;
CREATE POLICY "finance assets writers manage" ON public.finance_assets
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

-- GRANT de tabela explícito — sem ele, o Postgres bloqueia a consulta antes
-- de qualquer policy de RLS ser avaliada (ver 20260717180000, causa raiz do
-- incidente "permission denied for table user_roles" em produção).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_assets TO authenticated;

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.finance_assets') IS NULL THEN
    RAISE EXCEPTION 'public.finance_assets não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_assets'::regclass) THEN
    RAISE EXCEPTION 'public.finance_assets sem RLS habilitado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'finance_assets'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'public.finance_assets sem GRANT SELECT para authenticated';
  END IF;

  RAISE NOTICE 'Migration finance_assets: confirmado ✓';
END $$;
