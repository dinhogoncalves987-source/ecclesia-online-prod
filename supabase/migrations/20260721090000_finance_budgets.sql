-- ============================================================================
-- Migration: finance_budgets
-- Timestamp: 20260721090000
-- ============================================================================
--
-- OBJETIVO
-- Fase D da restauração do módulo Financeiro (ver plano de restauração
-- "Restauração Financeiro Completo"): a aba "Orçamento" usava valores fixos
-- de src/lib/financeDemo.ts (BUDGET_COST_CENTERS/BUDGET_SUMMARY) porque não
-- existia, até agora, nenhuma tabela para guardar o valor ORÇADO por centro
-- de custo — `public.finance_cost_centers` (criada em
-- 20260512100000_staging_treasury_mvp.sql) só tem o cadastro do centro de
-- custo, sem nenhum valor monetário. Esta migration cria essa tabela para
-- que o "realizado" (já real hoje, agregado de `transactions`) passe a ser
-- comparado contra um "orçado" real e editável, em vez de um número fixo.
--
-- DESENHO
-- Uma linha por (organização, centro de custo, ano, mês-ou-nulo). `NULL` em
-- `period_month` representa orçamento ANUAL daquele centro de custo/ano (não
-- soma automaticamente com os orçamentos mensais — é um valor independente
-- que a própria igreja escolhe preencher ou não). Um índice único trata o
-- `NULL` como um mês "0" (`COALESCE`) porque o Postgres, por padrão, NUNCA
-- considera dois `NULL` iguais em uma constraint UNIQUE normal — sem esse
-- índice calculado seria possível cadastrar o mesmo orçamento anual duas
-- vezes por engano.
--
-- Reaproveita helpers de RLS já existentes (`is_org_finance_reader` /
-- `is_org_finance_writer`, de 20260512100000) — nenhuma função nova de RLS.
--
-- Idempotente e forward-only. Aplicada byte a byte idêntica em staging
-- (supabase/migrations/) e produção (supabase-production/supabase/migrations/).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_budgets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cost_center_id   uuid NOT NULL REFERENCES public.finance_cost_centers(id) ON DELETE CASCADE,
  period_year      int NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  -- NULL = orçamento anual do centro de custo/ano; 1-12 = orçamento mensal.
  period_month     int CHECK (period_month BETWEEN 1 AND 12),
  budgeted_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (budgeted_amount >= 0),
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_budgets IS
  'Valor orçado por centro de custo/ano/mês (mês NULL = orçamento anual). O "realizado" continua vindo de public.transactions, agregado por cost_center_id/período — nunca duplicado aqui.';
COMMENT ON COLUMN public.finance_budgets.period_month IS 'NULL = orçamento anual do period_year; 1-12 = orçamento daquele mês específico.';

CREATE UNIQUE INDEX IF NOT EXISTS finance_budgets_org_center_period_uidx
  ON public.finance_budgets (organization_id, cost_center_id, period_year, COALESCE(period_month, 0));

CREATE INDEX IF NOT EXISTS idx_finance_budgets_org ON public.finance_budgets (organization_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_cost_center ON public.finance_budgets (cost_center_id);

DROP TRIGGER IF EXISTS finance_budgets_updated_at ON public.finance_budgets;
CREATE TRIGGER finance_budgets_updated_at
BEFORE UPDATE ON public.finance_budgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.finance_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance budgets readers read" ON public.finance_budgets;
CREATE POLICY "finance budgets readers read" ON public.finance_budgets
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance budgets writers manage" ON public.finance_budgets;
CREATE POLICY "finance budgets writers manage" ON public.finance_budgets
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

-- GRANT de tabela explícito — sem ele, o Postgres bloqueia a consulta antes
-- de qualquer policy de RLS ser avaliada (ver 20260717180000, causa raiz do
-- incidente "permission denied for table user_roles" em produção).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_budgets TO authenticated;

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.finance_budgets') IS NULL THEN
    RAISE EXCEPTION 'public.finance_budgets não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_budgets'::regclass) THEN
    RAISE EXCEPTION 'public.finance_budgets sem RLS habilitado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'finance_budgets'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'public.finance_budgets sem GRANT SELECT para authenticated';
  END IF;

  RAISE NOTICE 'Migration finance_budgets: confirmado ✓';
END $$;
