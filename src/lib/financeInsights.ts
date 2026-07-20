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
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useChurch } from "@/hooks/useChurchContext";
import { useCampaigns } from "@/hooks/useCampaigns";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { isExpense, type TreasuryTransaction, type FinanceCostCenter } from "@/lib/finance";
import { activeCampaigns, campaignProgress } from "@/lib/campaignsDemo";

export type FinanceAlertType = "warning" | "success" | "info";
export type FinanceAlert = { id: string; type: FinanceAlertType; message: string };

export type FinanceInsightCategory = "growth" | "risk" | "opportunity" | "pending";
export type FinanceInsight = { id: string; message: string; category: FinanceInsightCategory };

export type FinanceAction = { id: string; message: string; targetTab: string };

type BudgetRow = { cost_center_id: string; period_year: number; period_month: number | null; budgeted_amount: number };
type AccountabilityReportRow = { id: string; period_label: string; status: string };

// Mesma heurística de categorização usada em FinanceTithesOfferings.tsx —
// mantida local para não criar dependência entre componentes de aba.
function normalizeCategory(category: string | null | undefined): string {
  return (category ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function isTitheOrOffering(category: string | null | undefined): boolean {
  const c = normalizeCategory(category);
  return c.includes("dizimo") || c.includes("oferta") || c.includes("missao") || c.includes("missoes");
}
function monthKey(date: string): string { return date?.substring(0, 7) ?? ""; }
function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type Args = {
  transactions: TreasuryTransaction[];
  t: (key: string) => string;
  fmt: (value: number) => string;
};

export function useFinanceInsights({ transactions, t, fmt }: Args) {
  const { church } = useChurch();
  const { campaigns } = useCampaigns();

  const [costCenters, setCostCenters] = useState<FinanceCostCenter[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [reports, setReports] = useState<AccountabilityReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!church?.id) {
        setCostCenters([]); setBudgets([]); setReports([]); setLoading(false);
        return;
      }
      setLoading(true);
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
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [church?.id]);

  return useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const thisMonth = monthKey(now.toISOString());
    const lastMonth = previousMonthKey(thisMonth);

    // ── Orçamento: centros de custo acima do orçamento no mês ────────────────
    const actualByCenter = new Map<string, number>();
    transactions.filter(tx => isExpense(tx.type)).forEach(tx => {
      if (!tx.cost_center_id) return;
      if (monthKey(tx.date) !== thisMonth) return;
      actualByCenter.set(tx.cost_center_id, (actualByCenter.get(tx.cost_center_id) ?? 0) + Number(tx.amount));
    });
    const centerPerformance = costCenters
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

    // ── Contas vencidas (mesma heurística de FinanceAccounts.tsx) ─────────────
    const today = new Date().toISOString().split("T")[0];
    const overdue = transactions.filter(tx =>
      isExpense(tx.type) && tx.status !== "Pago" && tx.status !== "Confirmado" && tx.date < today);
    const overdueTotal = overdue.reduce((s, tx) => s + Number(tx.amount), 0);

    // ── Crescimento de dízimos/ofertas vs. mês anterior ────────────────────────
    const titheOfferingSum = (m: string) => transactions
      .filter(tx => !isExpense(tx.type) && monthKey(tx.date) === m && isTitheOrOffering(tx.category))
      .reduce((s, tx) => s + Number(tx.amount), 0);
    const titheGrowth = pctChange(titheOfferingSum(thisMonth), titheOfferingSum(lastMonth));

    // ── Crescimento de despesas vs. mês anterior ───────────────────────────────
    const expenseSum = (m: string) => transactions
      .filter(tx => isExpense(tx.type) && monthKey(tx.date) === m)
      .reduce((s, tx) => s + Number(tx.amount), 0);
    const expenseGrowth = pctChange(expenseSum(thisMonth), expenseSum(lastMonth));

    // ── Alertas ────────────────────────────────────────────────────────────────
    const alerts: FinanceAlert[] = [];
    if (overdue.length > 0) {
      alerts.push({
        id: "overdue", type: "warning",
        message: `${overdue.length} ${t("conta(s) vencida(s) totalizando")} ${fmt(overdueTotal)}`,
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
    if (overdue.length > 0) {
      actions.push({ id: "action-overdue", message: t("Revisar contas vencidas"), targetTab: "accounts" });
    }

    return { alerts, insights, actions, loading, centerPerformance };
  }, [transactions, campaigns, costCenters, budgets, reports, loading, t, fmt]);
}
