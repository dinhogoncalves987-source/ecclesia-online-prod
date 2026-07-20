import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { isExpense, type TreasuryTransaction, type FinanceCostCenter } from "@/lib/finance";
import { AlertTriangle, Loader2, PieChart, Plus } from "lucide-react";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";
import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery, insertWithOrganizationScope } from "@/lib/organizationScope";
import { toast } from "sonner";

/**
 * CORREÇÃO 2026-07-20 (Fase D — restauração do Financeiro) — "Orçamento"
 * usava BUDGET_COST_CENTERS/BUDGET_SUMMARY fixos de financeDemo.ts. Agora o
 * "orçado" vem da nova tabela public.finance_budgets (migration
 * 20260721090000_finance_budgets.sql), editável por centro de custo/mês, e o
 * "realizado" continua vindo de `transactions` real (mesma fonte da
 * Tesouraria), agregado por cost_center_id. Sem nenhum valor fictício.
 */

type BudgetRow = { id: string; cost_center_id: string; period_year: number; period_month: number | null; budgeted_amount: number };

function useFinanceBudgetData(organizationId: string | undefined, year: number) {
  const [costCenters, setCostCenters] = useState<FinanceCostCenter[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!organizationId) { setCostCenters([]); setBudgets([]); setLoading(false); return; }
      setLoading(true);
      const [centersResult, budgetsResult] = await Promise.all([
        runScopedOrganizationQuery<FinanceCostCenter[]>("finance_cost_centers", organizationId, query =>
          query.select("*").eq("is_active", true).order("name")),
        runScopedOrganizationQuery<BudgetRow[]>("finance_budgets", organizationId, query =>
          query.select("id, cost_center_id, period_year, period_month, budgeted_amount").eq("period_year", year)),
      ]);
      if (!active) return;
      if (centersResult.error) console.error("[FinanceBudget] cost centers:", centersResult.error);
      if (budgetsResult.error) console.error("[FinanceBudget] budgets:", budgetsResult.error);
      setCostCenters(centersResult.data ?? []);
      setBudgets(budgetsResult.data ?? []);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [organizationId, year, reloadToken]);

  return { costCenters, budgets, loading, reload: () => setReloadToken(k => k + 1) };
}

export function FinanceBudget({ transactions }: { transactions: TreasuryTransaction[] }) {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { hasRole, hasCapability } = useRole();
  const canWriteFinance = hasCapability("finance.write") || hasRole(["super_admin", "church_admin", "tesoureiro", "contador"]);
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { costCenters, budgets, loading, reload } = useFinanceBudgetData(church?.id, year);

  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [showNewCenter, setShowNewCenter] = useState(false);
  const [newCenterName, setNewCenterName] = useState("");
  const [savingCenter, setSavingCenter] = useState(false);

  const actualByCenter = useMemo(() => {
    const monthly = new Map<string, number>();
    const annual = new Map<string, number>();
    transactions.filter(tx => isExpense(tx.type)).forEach(tx => {
      if (!tx.cost_center_id) return;
      const txDate = tx.date ? new Date(`${tx.date}T00:00:00`) : null;
      if (!txDate || txDate.getFullYear() !== year) return;
      annual.set(tx.cost_center_id, (annual.get(tx.cost_center_id) ?? 0) + Number(tx.amount));
      if (txDate.getMonth() + 1 === month) {
        monthly.set(tx.cost_center_id, (monthly.get(tx.cost_center_id) ?? 0) + Number(tx.amount));
      }
    });
    return { monthly, annual };
  }, [transactions, year, month]);

  const budgetedByCenter = useMemo(() => {
    const monthly = new Map<string, number>();
    const annual = new Map<string, number>();
    budgets.forEach(b => {
      if (b.period_month === month) monthly.set(b.cost_center_id, Number(b.budgeted_amount));
      if (b.period_month === null) annual.set(b.cost_center_id, Number(b.budgeted_amount));
    });
    // Sem orçamento anual explícito: soma os orçamentos mensais cadastrados no ano como estimativa.
    costCenters.forEach(c => {
      if (!c.id || annual.has(c.id)) return;
      const sumMonths = budgets.filter(b => b.cost_center_id === c.id && b.period_month !== null)
        .reduce((s, b) => s + Number(b.budgeted_amount), 0);
      if (sumMonths > 0) annual.set(c.id, sumMonths);
    });
    return { monthly, annual };
  }, [budgets, costCenters, month]);

  const rows = useMemo(() => costCenters.map(c => {
    const id = c.id as string;
    const budgeted = budgetedByCenter.monthly.get(id) ?? 0;
    const actual = actualByCenter.monthly.get(id) ?? 0;
    const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : (actual > 0 ? 100 : 0);
    return { id, name: c.name, budgeted, actual, pct };
  }), [costCenters, budgetedByCenter, actualByCenter]);

  const overBudget = rows.filter(r => r.budgeted > 0 && r.pct > 100);

  const summary = useMemo(() => {
    const monthlyBudget = rows.reduce((s, r) => s + r.budgeted, 0);
    const monthlyActual = rows.reduce((s, r) => s + r.actual, 0);
    const annualBudget = costCenters.reduce((s, c) => s + (budgetedByCenter.annual.get(c.id as string) ?? 0), 0);
    const annualActual = costCenters.reduce((s, c) => s + (actualByCenter.annual.get(c.id as string) ?? 0), 0);
    return { monthlyBudget, monthlyActual, annualBudget, annualActual };
  }, [rows, costCenters, budgetedByCenter, actualByCenter]);

  const selectedRow = rows.find(r => r.id === selectedCenterId) ?? null;

  const buildCSV = () => {
    let csv = "Centro de custo,Orçado,Realizado,% Utilizado\n";
    rows.forEach(r => {
      csv += `"${r.name}",${r.budgeted},${r.actual},${r.pct}%\n`;
    });
    csv += `\n"Total mensal orçado",${summary.monthlyBudget}\n`;
    csv += `"Total mensal realizado",${summary.monthlyActual}\n`;
    csv += `"Total anual orçado",${summary.annualBudget}\n`;
    csv += `"Total anual realizado",${summary.annualActual}\n`;
    return csv;
  };

  const openCenter = (id: string) => {
    setSelectedCenterId(id);
    const current = budgetedByCenter.monthly.get(id) ?? 0;
    setEditValue(current > 0 ? String(current) : "");
  };

  const saveBudget = async () => {
    if (!church || !selectedCenterId) return;
    const amount = Number(editValue.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) { toast.error(t("Informe um valor válido.")); return; }
    setSavingBudget(true);
    const { data: existing } = await runScopedOrganizationQuery<{ id: string }[]>(
      "finance_budgets", church.id, query => query.select("id").eq("cost_center_id", selectedCenterId).eq("period_year", year).eq("period_month", month),
    );
    const existingId = existing?.[0]?.id;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = existingId
      ? await supabase.from("finance_budgets").update({ budgeted_amount: amount, updated_by: userId }).eq("id", existingId)
      : await insertWithOrganizationScope("finance_budgets", church.id, {
          cost_center_id: selectedCenterId, period_year: year, period_month: month,
          budgeted_amount: amount, created_by: userId,
        });
    setSavingBudget(false);
    if (error) {
      console.error("[FinanceBudget] saveBudget:", error);
      toast.error(t("Não foi possível salvar o orçamento."));
      return;
    }
    toast.success(t("Orçamento salvo!"));
    reload();
  };

  const createCostCenter = async () => {
    if (!church || !newCenterName.trim()) return;
    setSavingCenter(true);
    const { error } = await insertWithOrganizationScope("finance_cost_centers", church.id, {
      name: newCenterName.trim(), type: "departamento", is_active: true,
    });
    setSavingCenter(false);
    if (error) {
      console.error("[FinanceBudget] createCostCenter:", error);
      toast.error(t("Não foi possível criar o centro de custo."));
      return;
    }
    setNewCenterName("");
    setShowNewCenter(false);
    reload();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecutiveCard title={t("Orçamento mensal")} value={fmt(summary.monthlyBudget)} icon={PieChart} index={0} />
        <ExecutiveCard title={t("Realizado mensal")} value={fmt(summary.monthlyActual)} icon={PieChart} index={1} />
        <ExecutiveCard title={t("Orçamento anual")} value={fmt(summary.annualBudget)} icon={PieChart} index={2} />
        <ExecutiveCard title={t("Realizado anual")} value={fmt(summary.annualActual)} icon={PieChart} index={3} />
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center justify-between mb-5 gap-3">
          <h3 className="font-serif text-lg font-semibold">{t("Centros de custo")}</h3>
          <div className="flex items-center gap-2">
            {canWriteFinance && (
              <button
                type="button"
                onClick={() => setShowNewCenter(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary/30 transition-colors"
              >
                <Plus size={13} /> {t("Centro de custo")}
              </button>
            )}
            <DocExportMenu
              align="end"
              items={buildFinanceExportItems({
                moduleTitle: t("Orçamento — Centros de Custo"),
                summary: `Realizado: ${fmt(summary.monthlyActual)} / ${fmt(summary.monthlyBudget)}`,
                csvFn: buildCSV,
                csvFilename: "orcamento.csv",
              })}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t("Nenhum centro de custo cadastrado ainda. Crie um centro de custo para definir orçamentos.")}
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => {
              const over = c.budgeted > 0 && c.pct > 100;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCenter(c.id)}
                  className="w-full text-left group hover:bg-secondary/30 rounded-lg p-2 -mx-2 transition-colors"
                >
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium group-hover:text-primary transition-colors">{t(c.name)}</span>
                    <span className={`tabular-nums text-xs ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                      {fmt(c.actual)} / {c.budgeted > 0 ? fmt(c.budgeted) : t("sem orçamento")}
                      {c.budgeted > 0 && (
                        <span className={`ml-1 font-semibold ${over ? "text-destructive" : "text-foreground"}`}>
                          ({c.pct}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? "bg-destructive" : "bg-accent"}`}
                      style={{ width: `${Math.min(c.pct, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("Total realizado")}</p>
              <p className="font-semibold tabular-nums mt-0.5">{fmt(summary.monthlyActual)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("Disponível")}</p>
              <p className={`font-semibold tabular-nums mt-0.5 ${summary.monthlyBudget - summary.monthlyActual >= 0 ? "text-success" : "text-destructive"}`}>
                {fmt(summary.monthlyBudget - summary.monthlyActual)}
              </p>
            </div>
          </div>
        )}
      </section>

      {overBudget.length > 0 && (
        <section className="bg-destructive/5 border border-destructive/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-destructive" />
            <h3 className="font-serif font-semibold">{t("Alertas de estouro de orçamento")}</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {overBudget.map((c) => (
              <li key={c.id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{t(c.name)}</span>
                {" — "}
                <span className="text-destructive font-semibold">{c.pct}%</span>
                {" "}{t("do orçamento utilizado")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Cost center detail / edit budget modal ──────────────────── */}
      <FinanceDetailModal
        open={!!selectedRow}
        onClose={() => setSelectedCenterId(null)}
        title={selectedRow ? t(selectedRow.name) : ""}
        subtitle="Centro de custo"
        maxWidth="sm"
      >
        {selectedRow && (() => {
          const over = selectedRow.budgeted > 0 && selectedRow.pct > 100;
          const available = selectedRow.budgeted - selectedRow.actual;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Orçado")}</p>
                  <p className="text-xl font-bold tabular-nums mt-1">{selectedRow.budgeted > 0 ? fmt(selectedRow.budgeted) : "—"}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Realizado")}</p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${over ? "text-destructive" : ""}`}>
                    {fmt(selectedRow.actual)}
                  </p>
                </div>
              </div>

              {selectedRow.budgeted > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("Utilização do orçamento")}</span>
                    <span className={`font-semibold ${over ? "text-destructive" : "text-success"}`}>
                      {selectedRow.pct}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? "bg-destructive" : "bg-accent"}`}
                      style={{ width: `${Math.min(selectedRow.pct, 100)}%` }}
                    />
                  </div>
                  <div className={`p-3 rounded-lg text-sm font-medium ${over ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700"}`}>
                    {over
                      ? `${t("Estouro de")} ${fmt(Math.abs(available))} ${t("acima do orçamento")}`
                      : `${t("Disponível")}: ${fmt(available)}`}
                  </div>
                </div>
              )}

              {canWriteFinance && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Orçado deste mês")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      placeholder="0,00"
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={saveBudget}
                      disabled={savingBudget}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingBudget && <Loader2 size={14} className="animate-spin" />} {t("Salvar")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </FinanceDetailModal>

      {/* ── New cost center modal ───────────────────────────────────── */}
      <FinanceDetailModal
        open={showNewCenter}
        onClose={() => setShowNewCenter(false)}
        title={t("Novo centro de custo")}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Nome")}</label>
            <input
              type="text"
              value={newCenterName}
              onChange={e => setNewCenterName(e.target.value)}
              placeholder={t("Ex.: Missões, Manutenção, Eventos...")}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewCenter(false)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary/30 transition-colors"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              onClick={createCostCenter}
              disabled={!newCenterName.trim() || savingCenter}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingCenter && <Loader2 size={14} className="animate-spin" />} {t("Criar")}
            </button>
          </div>
        </div>
      </FinanceDetailModal>
    </div>
  );
}
