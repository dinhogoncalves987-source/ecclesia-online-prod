import { useLanguage } from "@/hooks/useLanguage";
import { BUDGET_COST_CENTERS, BUDGET_SUMMARY, formatFinanceCurrency } from "@/lib/financeDemo";
import { AlertTriangle, PieChart } from "lucide-react";
import { ExecutiveCard } from "@/components/ExecutiveCard";

export function FinanceBudget() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const overBudget = BUDGET_COST_CENTERS.filter((c) => c.pct > 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecutiveCard title={t("Orçamento mensal")} value={fmt(BUDGET_SUMMARY.monthlyBudget)} icon={PieChart} index={0} />
        <ExecutiveCard title={t("Realizado mensal")} value={fmt(BUDGET_SUMMARY.monthlyActual)} icon={PieChart} index={1} />
        <ExecutiveCard title={t("Orçamento anual")} value={fmt(BUDGET_SUMMARY.annualBudget)} icon={PieChart} index={2} />
        <ExecutiveCard title={t("Realizado anual")} value={fmt(BUDGET_SUMMARY.annualActual)} icon={PieChart} index={3} />
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        <h3 className="font-serif text-lg font-semibold mb-4">{t("Centros de custo")}</h3>
        <div className="space-y-4">
          {BUDGET_COST_CENTERS.map((c) => (
            <div key={c.name}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">{t(c.name)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {fmt(c.actual)} / {fmt(c.budgeted)} ({c.pct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.pct > 100 ? "bg-destructive" : "bg-accent"}`}
                  style={{ width: `${Math.min(c.pct, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {overBudget.length > 0 && (
        <section className="bg-destructive/5 border border-destructive/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-destructive" />
            <h3 className="font-serif font-semibold">{t("Alertas de estouro de orçamento")}</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {overBudget.map((c) => (
              <li key={c.name} className="text-muted-foreground">
                <span className="font-medium text-foreground">{t(c.name)}</span> — {c.pct}% {t("do orçamento utilizado")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
