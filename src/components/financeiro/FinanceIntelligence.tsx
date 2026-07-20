import { useLanguage } from "@/hooks/useLanguage";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { useFinanceInsights, type FinanceInsightCategory } from "@/lib/financeInsights";
import type { TreasuryTransaction } from "@/lib/finance";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";

/**
 * CORREÇÃO 2026-07-24 (Fase H — restauração do Financeiro) — "Inteligência"
 * usava FINANCE_ALERTS/INTELLIGENCE_INSIGHTS/RECOMMENDED_ACTIONS fixos de
 * financeDemo.ts. Agora consome as mesmas regras determinísticas sobre
 * dados reais já usadas pelo Executivo (Fase G) — ver
 * src/lib/financeInsights.ts. Sem IA generativa: apenas comparação de
 * período/orçamento/status sobre transactions, campanhas, finance_budgets e
 * finance_accountability_reports reais.
 */

const CATEGORY_CONFIG: Record<FinanceInsightCategory, { Icon: typeof TrendingUp; labelKey: string; border: string; badge: string; dot: string }> = {
  growth: {
    Icon: TrendingUp,
    labelKey: "Crescimento",
    border: "border-green-500/30",
    badge: "bg-green-500/10 text-green-700",
    dot: "bg-green-500",
  },
  risk: {
    Icon: AlertCircle,
    labelKey: "Risco",
    border: "border-destructive/30",
    badge: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  opportunity: {
    Icon: Lightbulb,
    labelKey: "Oportunidade",
    border: "border-accent/30",
    badge: "bg-accent/10 text-accent",
    dot: "bg-accent",
  },
  pending: {
    Icon: AlertCircle,
    labelKey: "Pendência",
    border: "border-amber-500/30",
    badge: "bg-amber-500/10 text-amber-700",
    dot: "bg-amber-500",
  },
};

function buildInsightsCSV(insights: { message: string; category: string }[]): string {
  let csv = "Indicador,Categoria\n";
  insights.forEach(i => {
    csv += `"${i.message}","${i.category}"\n`;
  });
  return csv;
}

type Props = {
  onTabChange?: (tab: string) => void;
  transactions: TreasuryTransaction[];
};

export function FinanceIntelligence({ onTabChange, transactions }: Props) {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const { alerts, insights, actions } = useFinanceInsights({ transactions, t, fmt });

  const alertIcon = (type: string) => {
    if (type === "warning") return <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />;
    if (type === "success") return <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />;
    return <Info size={14} className="text-primary flex-shrink-0" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-accent" />
          <div>
            <h3 className="font-serif text-lg font-semibold">{t("Indicadores financeiros")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("Análise baseada nos dados do período atual")}</p>
          </div>
        </div>
        <DocExportMenu
          align="end"
          items={buildFinanceExportItems({
            moduleTitle: t("Indicadores financeiros"),
            summary: `${insights.length} ${t("indicadores analisados")}`,
            csvFn: () => buildInsightsCSV(insights),
            csvFilename: "indicadores.csv",
          })}
        />
      </div>

      {/* Alerts */}
      <section className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
        <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
          {t("Alertas financeiros")}
        </h4>
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-secondary/20">
              {alertIcon(a.type)}
              <p className="text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Insights by category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(CATEGORY_CONFIG) as FinanceInsightCategory[]).map(cat => {
          const cfg = CATEGORY_CONFIG[cat];
          const Icon = cfg.Icon;
          const items = insights.filter(i => i.category === cat);
          if (items.length === 0) return null;
          return (
            <section
              key={cat}
              className={`bg-card rounded-xl border shadow-sm p-5 ${cfg.border}`}
            >
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold mb-4 ${cfg.badge}`}>
                <Icon size={13} /> {t(cfg.labelKey)}
              </div>
              <ul className="space-y-2.5">
                {items.map(item => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    {item.message}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {insights.length === 0 && (
          <p className="text-sm text-center text-muted-foreground py-6 sm:col-span-2">
            {t("Nenhum indicador disponível ainda — os dados do período são insuficientes.")}
          </p>
        )}
      </div>

      {/* Recommended actions */}
      <section className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
        <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
          {t("Próximas ações recomendadas")}
        </h4>
        <div className="space-y-2">
          {actions.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">{t("Nenhuma ação pendente no momento.")}</p>
          ) : (
            actions.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => onTabChange?.(a.targetTab)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors text-left group"
              >
                <span>{a.message}</span>
                <ArrowRight size={14} className="text-muted-foreground flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
