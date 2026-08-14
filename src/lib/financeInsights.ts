// ─────────────────────────────────────────────────────────────────────────────
// financeInsights.ts — regras determinísticas sobre dados financeiros reais.
//
// CORREÇÃO 2026-07-24 (Fase G — restauração do Financeiro) — "Executivo"
// (FinanceExecutive.tsx) mostrava alertas/ações fixos de financeDemo.ts. Este
// módulo centraliza a geração de alertas/insights/ações a partir de dados
// reais já existentes (transactions, finance_budgets, campaigns,
// finance_accountability_reports) — sem IA generativa, apenas comparação de
// período/orçamento/status, sempre vazio (nunca fictício) quando não há
// dado real suficiente.
//
// Também usado pela aba Inteligência (Fase H) — mesma fonte de dados,
// apresentação diferente.
//
// CORREÇÃO 2026-08-14 (CORREÇÃO C3.1 — eliminar fetch-all) — este hook
// recebia `transactions: TreasuryTransaction[]` (o array COMPLETO da
// organização, até 29.957+ linhas) e recalculava tudo com
// .filter()/.reduce() no navegador a cada render. Agora consome
// finance_dashboard_aggregates (3 chamadas agregadas: histórico completo
// para totais/hierarquia, mês atual e mês anterior para comparações) —
// nenhuma linha crua de transactions chega ao cliente. "Consolidado por
// hierarquia" (antes useHierarchyRevenue, com 1 consulta sem limite por
// unidade organizacional) também foi absorvido aqui, usando
// by_organization em uma única chamada agregada.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useChurch } from "@/hooks/useChurchContext";
import { useCampaigns } from "@/hooks/useCampaigns";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { type FinanceCostCenter } from "@/lib/finance";
import { activeCampaigns, campaignProgress } from "@/lib/campaignsDemo";
import { getTypeBadgeLabel } from "@/lib/organizationHierarchy";
import { useFinanceDashboardAggregates } from "@/hooks/useFinanceDashboardAggregates";
import {
  buildCostCenterTotalsMap,
  findOrganizationEntriesAmount,
  sumCategoryTotalsMatching,
} from "@/lib/financeDashboardAggregates";
import { currentMonthKey, monthDateRange, previousMonthKey } from "@/lib/financeDateRanges";

export type FinanceAlertType = "warning" | "success" | "info";
export type FinanceAlert = { id: string; type: FinanceAlertType; message: string };

export type FinanceInsightCategory = "growth" | "risk" | "opportunity" | "pending";
export type FinanceInsight = { id: string; message: string; category: FinanceInsightCategory };

export type FinanceAction = { id: string; message: string; targetTab: string };

export type HierarchyRow = { id: string; name: string; level: string; revenue: number; share: number };
export type CenterPerformanceRow = { name: string; pct: number; actual: number; budgeted: number };

export interface FinanceExecutiveStats {
  totalRevenue: number;
  totalExpenses: number;
  consolidatedBalance: number;
  monthlyTithes: number;
  monthlyOfferings: number;
}

type BudgetRow = { cost_center_id: string; period_year: number; period_month: number | null; budgeted_amount: number };
type AccountabilityReportRow = { id: string; period_label: string; status: string };

function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type Args = {
  t: (key: string) => string;
  fmt: (value: number) => string;
  /** Incremente para forçar nova busca (import/exclusão/reset). */
  reloadToken?: number;
};

export function useFinanceInsights({ t, fmt, reloadToken }: Args) {
  const { church, congregations } = useChurch();
  const { campaigns } = useCampaigns();

  const hierarchyOrganizationIds = useMemo(
    () => (church ? [church.id, ...congregations.map(c => c.id)] : []),
    [church, congregations],
  );

  const thisMonthKey = currentMonthKey();
  const lastMonthKey = previousMonthKey(thisMonthKey);
  const thisMonthRange = useMemo(() => monthDateRange(thisMonthKey), [thisMonthKey]);
  const lastMonthRange = useMemo(() => monthDateRange(lastMonthKey), [lastMonthKey]);

  // Histórico completo — totais gerais, hierarquia e contas vencidas
  // (overdue nunca depende de p_date_from/p_date_to — ver migration
  // 20260814150000).
  const allTime = useFinanceDashboardAggregates({
    organizationId: church?.id,
    hierarchyOrganizationIds,
    reloadToken,
  });
  // Mês atual — dízimos/ofertas do mês, realizado por centro de custo.
  const thisMonth = useFinanceDashboardAggregates({
    organizationId: church?.id,
    dateFrom: thisMonthRange.from,
    dateTo: thisMonthRange.to,
    reloadToken,
  });
  // Mês anterior — apenas para comparação de crescimento.
  const lastMonth = useFinanceDashboardAggregates({
    organizationId: church?.id,
    dateFrom: lastMonthRange.from,
    dateTo: lastMonthRange.to,
    reloadToken,
  });

  const [costCenters, setCostCenters] = useState<FinanceCostCenter[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [reports, setReports] = useState<AccountabilityReportRow[]>([]);
  const [sideLoading, setSideLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!church?.id) {
        setCostCenters([]); setBudgets([]); setReports([]); setSideLoading(false);
        return;
      }
      setSideLoading(true);
      const year = new Date().getFullYear();
      const [centersRes, budgetsRes, reportsRes] = await Promise.all([
        runScopedOrganizationQuery<FinanceCostCenter[]>("finance_cost_centers", church.id, q =>
          q.select("*").eq("is_active", true)),
        runScopedOrganizationQuery<BudgetRow[]>("finance_budgets", church.id, q =>
          q.select("cost_center_id, period_year, period_month, budgeted_amount").eq("period_year", year)),
        runScopedOrganizationQuery<AccountabilityReportRow[]>("finance_accountability_reports", church.id, q =>
          q.select("id, period_label, status")),
      ]);
      if (!active) return;
      if (centersRes.error) console.error("[financeInsights] cost centers:", centersRes.error);
      if (budgetsRes.error) console.error("[financeInsights] budgets:", budgetsRes.error);
      if (reportsRes.error) console.error("[financeInsights] reports:", reportsRes.error);
      setCostCenters(centersRes.data ?? []);
      setBudgets(budgetsRes.data ?? []);
      setReports(reportsRes.data ?? []);
      setSideLoading(false);
    };
    load();
    return () => { active = false; };
  }, [church?.id, reloadToken]);

  const aggregatesLoading =
    allTime.status === "loading" || allTime.status === "idle" ||
    thisMonth.status === "loading" || thisMonth.status === "idle" ||
    lastMonth.status === "loading" || lastMonth.status === "idle";
  const loading = sideLoading || aggregatesLoading;

  return useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // ── Consolidado por hierarquia (antes useHierarchyRevenue) ──────────────
    const hierarchyUnits = church ? [church, ...congregations] : [];
    const hierarchyRowsRaw = hierarchyUnits.map(u => ({
      id: u.id,
      name: u.name,
      level: getTypeBadgeLabel(u.organization_type, church),
      revenue: allTime.data ? findOrganizationEntriesAmount(allTime.data.byOrganization, u.id) : 0,
    }));
    const hierarchyTotal = hierarchyRowsRaw.reduce((s, r) => s + r.revenue, 0);
    const hierarchyRows: HierarchyRow[] = hierarchyRowsRaw
      .map(r => ({ ...r, share: hierarchyTotal > 0 ? Math.round((r.revenue / hierarchyTotal) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // ── Orçamento: centros de custo acima do orçamento no mês ────────────────
    const actualByCenter = thisMonth.data ? buildCostCenterTotalsMap(thisMonth.data.byCostCenter, "Saida") : new Map<string, number>();
    const centerPerformance: CenterPerformanceRow[] = costCenters
      .map(c => {
        const id = c.id as string;
        const budgeted = budgets.find(b => b.cost_center_id === id && b.period_month === month && b.period_year === year)?.budgeted_amount ?? 0;
        const actual = actualByCenter.get(id) ?? 0;
        const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
        return { name: c.name, pct, actual, budgeted };
      })
      .sort((a, b) => b.actual - a.actual);
    const overBudgetCenters = centerPerformance
      .filter(c => c.budgeted > 0 && c.pct > 100)
      .sort((a, b) => b.pct - a.pct);

    // ── Campanhas ativas perto/atingindo a meta ───────────────────────────────
    const active = activeCampaigns(campaigns)
      .map(c => ({ title: c.title, pct: campaignProgress(c) }))
      .sort((a, b) => b.pct - a.pct);
    const topCampaign = active[0];

    // ── Prestação de contas pendente ───────────────────────────────────────────
    const pendingReports = reports.filter(r => r.status !== "Publicado");

    // ── Contas vencidas — sempre "hoje", nunca uma janela de período (ver
    // migration 20260814150000) ───────────────────────────────────────────────
    const overdue = allTime.data?.overdue ?? { count: 0, amount: 0 };

    // ── Crescimento de dízimos/ofertas/missões vs. mês anterior ──────────────
    const titheOfferingTerms = ["dizimo", "oferta", "missao", "missoes"];
    const titheOfferingSumThisMonth = thisMonth.data
      ? sumCategoryTotalsMatching(thisMonth.data.byCategory, titheOfferingTerms, "Entrada")
      : 0;
    const titheOfferingSumLastMonth = lastMonth.data
      ? sumCategoryTotalsMatching(lastMonth.data.byCategory, titheOfferingTerms, "Entrada")
      : 0;
    const titheGrowth = pctChange(titheOfferingSumThisMonth, titheOfferingSumLastMonth);

    // ── Crescimento de despesas vs. mês anterior ───────────────────────────────
    const expenseSumThisMonth = thisMonth.data?.totals.exitsAmount ?? 0;
    const expenseSumLastMonth = lastMonth.data?.totals.exitsAmount ?? 0;
    const expenseGrowth = pctChange(expenseSumThisMonth, expenseSumLastMonth);

    // ── Alertas ────────────────────────────────────────────────────────────────
    const alerts: FinanceAlert[] = [];
    if (overdue.count > 0) {
      alerts.push({
        id: "overdue", type: "warning",
        message: `${overdue.count} ${t("conta(s) vencida(s) totalizando")} ${fmt(overdue.amount)}`,
      });
    }
    overBudgetCenters.slice(0, 2).forEach((c, i) => {
      alerts.push({
        id: `budget-${i}`, type: "warning",
        message: `${t(c.name)} ${t("acima do orçamento")} (${c.pct}%)`,
      });
    });
    if (topCampaign && topCampaign.pct >= 70) {
      alerts.push({
        id: "campaign", type: "success",
        message: `${t("Campanha")} ${topCampaign.title} ${t("atingiu")} ${topCampaign.pct}%`,
      });
    }
    if (pendingReports.length > 0) {
      alerts.push({
        id: "accountability", type: "info",
        message: `${pendingReports.length} ${t("prestação(ões) de contas aguardando conclusão")}`,
      });
    }
    if (alerts.length === 0) {
      alerts.push({ id: "none", type: "info", message: t("Nenhuma pendência crítica encontrada.") });
    }

    // ── Insights por categoria ──────────────────────────────────────────────────
    const insights: FinanceInsight[] = [];
    if (titheGrowth > 0) {
      insights.push({ id: "growth-tithes", category: "growth", message: `${t("Dízimos e ofertas cresceram")} ${titheGrowth}% ${t("em relação ao mês anterior")}` });
    }
    if (expenseGrowth > 10) {
      insights.push({ id: "risk-expenses", category: "risk", message: `${t("Despesas cresceram")} ${expenseGrowth}% ${t("em relação ao mês anterior")}` });
    }
    if (topCampaign) {
      insights.push({ id: "opportunity-campaign", category: "opportunity", message: `${t("Campanha")} ${topCampaign.title} ${t("tem o maior engajamento")} (${topCampaign.pct}%)` });
    }
    if (pendingReports.length > 0) {
      insights.push({ id: "pending-reports", category: "pending", message: `${pendingReports.length} ${t("prestação(ões) de contas aguardando aprovação ou publicação")}` });
    }

    // ── Próximas ações recomendadas ─────────────────────────────────────────────
    const actions: FinanceAction[] = [];
    if (overBudgetCenters[0]) {
      actions.push({ id: "action-budget", message: `${t("Revisar orçamento de")} ${t(overBudgetCenters[0].name)}`, targetTab: "budget" });
    }
    if (pendingReports[0]) {
      actions.push({ id: "action-accountability", message: `${t("Concluir prestação de contas de")} ${pendingReports[0].period_label}`, targetTab: "accountability" });
    }
    if (topCampaign && topCampaign.pct >= 90) {
      actions.push({ id: "action-campaign", message: `${t("Revisar repasse da campanha")} ${topCampaign.title}`, targetTab: "campaigns" });
    }
    if (overdue.count > 0) {
      actions.push({ id: "action-overdue", message: t("Revisar contas vencidas"), targetTab: "accounts" });
    }

    // ── Estatísticas gerais (cards do Executivo) ────────────────────────────────
    const stats: FinanceExecutiveStats = {
      totalRevenue: allTime.data?.totals.entriesAmount ?? 0,
      totalExpenses: allTime.data?.totals.exitsAmount ?? 0,
      consolidatedBalance: (allTime.data?.totals.entriesAmount ?? 0) - (allTime.data?.totals.exitsAmount ?? 0),
      monthlyTithes: thisMonth.data ? sumCategoryTotalsMatching(thisMonth.data.byCategory, ["dizimo"], "Entrada") : 0,
      monthlyOfferings: thisMonth.data ? sumCategoryTotalsMatching(thisMonth.data.byCategory, ["oferta"], "Entrada") : 0,
    };

    return { alerts, insights, actions, loading, centerPerformance, hierarchyRows, hierarchyLoading: loading, stats };
  }, [
    church, congregations, campaigns, costCenters, budgets, reports, loading,
    allTime.data, thisMonth.data, lastMonth.data, t, fmt,
  ]);
}
