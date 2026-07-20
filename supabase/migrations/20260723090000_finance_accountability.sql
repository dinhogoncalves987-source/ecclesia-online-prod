-- ============================================================================
-- Migration: finance_accountability_reports + finance_accountability_approvals
-- Timestamp: 20260723090000
-- ============================================================================
--
-- OBJETIVO
-- Fase F da restauração do módulo Financeiro (ver plano de restauração
-- "Restauração Financeiro Completo"): dentro da aba "Prestação de Contas",
-- os "Relatórios Contábeis" (DRE/Balancete/Fluxo, em FinanceReports.tsx) já
-- usam dados reais (`transactions` + `finance_monthly_closings`) e não são
-- alterados por esta migration. O que faltava era o workflow de aprovação
-- multi-instância dos "Relatórios históricos", 100% fictício
-- (ACCOUNTABILITY_REPORTS de src/lib/financeDemo.ts, com aprovadores fixos
-- "Pr. João Silva"/"Maria Santos"/"Conselho Fiscal"). Esta migration cria as
-- duas tabelas reais que substituem esse array.
--
-- DESENHO
-- `finance_accountability_reports`: uma linha por período de prestação de
-- contas (mensal/trimestral/anual) por organização. `period_key` é o
-- identificador estável do período (ex.: "2026-05", "2026-Q1", "2026" —
-- mesmo formato que a UI já usa para o seletor de mês em
-- FinanceAccountability.tsx), único por organização. `period_label` é só o
-- texto de exibição (ex.: "Maio/2026"), nunca usado para lógica.
--
-- `finance_accountability_approvals`: papéis de aprovador configuráveis por
-- igreja (não um enum fixo — texto livre em `role`), permitindo que cada
-- organização defina seu próprio fluxo (Pastor/Tesoureiro/Conselho é apenas
-- o valor padrão sugerido pela UI ao criar um relatório, nunca uma restrição
-- do banco).
--
-- Reaproveita helpers de RLS já existentes (`is_org_finance_reader` /
-- `is_org_finance_writer`, de 20260512100000) — nenhuma função nova de RLS.
--
-- Idempotente e forward-only. Aplicada byte a byte idêntica em staging
-- (supabase/migrations/) e produção (supabase-production/supabase/migrations/).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_accountability_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_key        text NOT NULL,
  period_label      text NOT NULL,
  report_type       text NOT NULL CHECK (report_type IN ('Mensal', 'Trimestral', 'Anual')),
  status            text NOT NULL DEFAULT 'Em preparação'
                       CHECK (status IN ('Em preparação', 'Aguardando aprovação', 'Aprovado', 'Publicado')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_accountability_reports IS
  'Relatório de prestação de contas por período/organização. "Comprovantes" continuam derivados em tempo real de public.transactions (receipt_url) — nunca duplicados aqui. Substitui ACCOUNTABILITY_REPORTS fictício de src/lib/financeDemo.ts.';
COMMENT ON COLUMN public.finance_accountability_reports.period_key IS 'Identificador estável do período: "YYYY-MM" (mensal), "YYYY-Q#" (trimestral) ou "YYYY" (anual).';

CREATE UNIQUE INDEX IF NOT EXISTS finance_accountability_reports_org_period_uidx
  ON public.finance_accountability_reports (organization_id, period_key);
CREATE INDEX IF NOT EXISTS idx_finance_accountability_reports_org ON public.finance_accountability_reports (organization_id);

DROP TRIGGER IF EXISTS finance_accountability_reports_updated_at ON public.finance_accountability_reports;
CREATE TRIGGER finance_accountability_reports_updated_at
BEFORE UPDATE ON public.finance_accountability_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.finance_accountability_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES public.finance_accountability_reports(id) ON DELETE CASCADE,
  role              text NOT NULL,
  approver_name     text NOT NULL,
  done              boolean NOT NULL DEFAULT false,
  decided_at        timestamptz,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_accountability_approvals IS
  'Aprovadores (papel configurável por igreja, não um enum fixo) de um finance_accountability_reports.';

CREATE INDEX IF NOT EXISTS idx_finance_accountability_approvals_report ON public.finance_accountability_approvals (report_id);

DROP TRIGGER IF EXISTS finance_accountability_approvals_updated_at ON public.finance_accountability_approvals;
CREATE TRIGGER finance_accountability_approvals_updated_at
BEFORE UPDATE ON public.finance_accountability_approvals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.finance_accountability_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accountability_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance accountability reports readers read" ON public.finance_accountability_reports;
CREATE POLICY "finance accountability reports readers read" ON public.finance_accountability_reports
FOR SELECT TO authenticated
USING (public.is_org_finance_reader(auth.uid(), organization_id));

DROP POLICY IF EXISTS "finance accountability reports writers manage" ON public.finance_accountability_reports;
CREATE POLICY "finance accountability reports writers manage" ON public.finance_accountability_reports
FOR ALL TO authenticated
USING (public.is_org_finance_writer(auth.uid(), organization_id))
WITH CHECK (public.is_org_finance_writer(auth.uid(), organization_id));

-- Approvals não têm organization_id direto — a policy segue via o relatório
-- pai (mesmo padrão de escopo indireto usado em campaign_contributions →
-- campaigns).
DROP POLICY IF EXISTS "finance accountability approvals readers read" ON public.finance_accountability_approvals;
CREATE POLICY "finance accountability approvals readers read" ON public.finance_accountability_approvals
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.finance_accountability_reports r
  WHERE r.id = finance_accountability_approvals.report_id
    AND public.is_org_finance_reader(auth.uid(), r.organization_id)
));

DROP POLICY IF EXISTS "finance accountability approvals writers manage" ON public.finance_accountability_approvals;
CREATE POLICY "finance accountability approvals writers manage" ON public.finance_accountability_approvals
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.finance_accountability_reports r
  WHERE r.id = finance_accountability_approvals.report_id
    AND public.is_org_finance_writer(auth.uid(), r.organization_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.finance_accountability_reports r
  WHERE r.id = finance_accountability_approvals.report_id
    AND public.is_org_finance_writer(auth.uid(), r.organization_id)
));

-- GRANT de tabela explícito — sem ele, o Postgres bloqueia a consulta antes
-- de qualquer policy de RLS ser avaliada (ver 20260717180000, causa raiz do
-- incidente "permission denied for table user_roles" em produção).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accountability_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accountability_approvals TO authenticated;

-- ============================================================================
-- Verificação final
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.finance_accountability_reports') IS NULL THEN
    RAISE EXCEPTION 'public.finance_accountability_reports não foi criada';
  END IF;

  IF to_regclass('public.finance_accountability_approvals') IS NULL THEN
    RAISE EXCEPTION 'public.finance_accountability_approvals não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_accountability_reports'::regclass) THEN
    RAISE EXCEPTION 'public.finance_accountability_reports sem RLS habilitado';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_accountability_approvals'::regclass) THEN
    RAISE EXCEPTION 'public.finance_accountability_approvals sem RLS habilitado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'finance_accountability_reports'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'public.finance_accountability_reports sem GRANT SELECT para authenticated';
  END IF;

  RAISE NOTICE 'Migration finance_accountability: confirmado ✓';
END $$;
