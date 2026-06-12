import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { BUDGET_COST_CENTERS, BUDGET_SUMMARY, formatFinanceCurrency } from "@/lib/financeDemo";
import { AlertTriangle, PieChart } from "lucide-react";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";

type CostCenter = typeof BUDGET_COST_CENTERS[number];

export function FinanceBudget() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const overBudget = BUDGET_COST_CENTERS.filter((c) => c.pct > 100);

  const [selectedCenter, setSelectedCenter] = useState<CostCenter | null>(null);

  const buildCSV = () => {
    let csv = "Centro de custo,Orçado,Realizado,% Utilizado\n";
    BUDGET_COST_CENTERS.forEach(c => {
      csv += `"${c.name}",${c.budgeted},${c.actual},${c.pct}%\n`;
    });
    csv += `\n"Total mensal orçado",${BUDGET_SUMMARY.monthlyBudget}\n`;
    csv += `"Total mensal realizado",${BUDGET_SUMMARY.monthlyActual}\n`;
    csv += `"Total anual orçado",${BUDGET_SUMMARY.annualBudget}\n`;
    csv += `"Total anual realizado",${BUDGET_SUMMARY.annualActual}\n`;
    return csv;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecutiveCard title={t("Orçamento mensal")} value={fmt(BUDGET_SUMMARY.monthlyBudget)} icon={PieChart} index={0} />
        <ExecutiveCard title={t("Realizado mensal")} value={fmt(BUDGET_SUMMARY.monthlyActual)} icon={PieChart} index={1} />
        <ExecutiveCard title={t("Orçamento anual")} value={fmt(BUDGET_SUMMARY.annualBudget)} icon={PieChart} index={2} />
        <ExecutiveCard title={t("Realizado anual")} value={fmt(BUDGET_SUMMARY.annualActual)} icon={PieChart} index={3} />
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-lg font-semibold">{t("Centros de custo")}</h3>
          <DocExportMenu
            align="end"
            items={buildFinanceExportItems({
              moduleTitle: t("Orçamento — Centros de Custo"),
              summary: `Realizado: ${fmt(BUDGET_SUMMARY.monthlyActual)} / ${fmt(BUDGET_SUMMARY.monthlyBudget)} (${Math.round((BUDGET_SUMMARY.monthlyActual / BUDGET_SUMMARY.monthlyBudget) * 100)}%)`,
              csvFn: buildCSV,
              csvFilename: "orcamento.csv",
            })}
          />
        </div>
        <div className="space-y-3">
          {BUDGET_COST_CENTERS.map((c) => {
            const over = c.pct > 100;
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedCenter(c)}
                className="w-full text-left group hover:bg-secondary/30 rounded-lg p-2 -mx-2 transition-colors"
              >
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium group-hover:text-primary transition-colors">{t(c.name)}</span>
                  <span className={`tabular-nums text-xs ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    {fmt(c.actual)} / {fmt(c.budgeted)}
                    <span className={`ml-1 font-semibold ${over ? "text-destructive" : "text-foreground"}`}>
                      ({c.pct}%)
                    </span>
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

        <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("Total realizado")}</p>
            <p className="font-semibold tabular-nums mt-0.5">{fmt(BUDGET_SUMMARY.monthlyActual)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("Disponível")}</p>
            <p className={`font-semibold tabular-nums mt-0.5 ${BUDGET_SUMMARY.monthlyBudget - BUDGET_SUMMARY.monthlyActual >= 0 ? "text-success" : "text-destructive"}`}>
              {fmt(BUDGET_SUMMARY.monthlyBudget - BUDGET_SUMMARY.monthlyActual)}
            </p>
          </div>
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
                <span className="font-medium text-foreground">{t(c.name)}</span>
                {" — "}
                <span className="text-destructive font-semibold">{c.pct}%</span>
                {" "}{t("do orçamento utilizado")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Cost center detail modal ────────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedCenter}
        onClose={() => setSelectedCenter(null)}
        title={selectedCenter ? t(selectedCenter.name) : ""}
        subtitle="Centro de custo"
        maxWidth="sm"
      >
        {selectedCenter && (() => {
          const over = selectedCenter.pct > 100;
          const available = selectedCenter.budgeted - selectedCenter.actual;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Orçado</p>
                  <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedCenter.budgeted)}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Realizado</p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${over ? "text-destructive" : ""}`}>
                    {fmt(selectedCenter.actual)}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Utilização do orçamento</span>
                  <span className={`font-semibold ${over ? "text-destructive" : "text-success"}`}>
                    {selectedCenter.pct}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${over ? "bg-destructive" : "bg-accent"}`}
                    style={{ width: `${Math.min(selectedCenter.pct, 100)}%` }}
                  />
                </div>
              </div>
              <div className={`p-3 rounded-lg text-sm font-medium ${
                over
                  ? "bg-destructive/10 text-destructive"
                  : "bg-green-500/10 text-green-700"
              }`}>
                {over
                  ? `Estouro de ${fmt(Math.abs(available))} acima do orçamento`
                  : `Disponível: ${fmt(available)}`}
              </div>
            </div>
          );
        })()}
      </FinanceDetailModal>
    </div>
  );
}
