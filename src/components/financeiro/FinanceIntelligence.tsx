import { useLanguage } from "@/hooks/useLanguage";
import { FINANCE_ALERTS, INTELLIGENCE_INSIGHTS, RECOMMENDED_ACTIONS } from "@/lib/financeDemo";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";

const CATEGORY_CONFIG = {
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
} as const;

function buildInsightsCSV(): string {
  let csv = "Indicador,Categoria\n";
  INTELLIGENCE_INSIGHTS.forEach(i => {
    csv += `"${i.messageKey}","${i.category}"\n`;
  });
  return csv;
}

type Props = {
  onTabChange?: (tab: string) => void;
};

export function FinanceIntelligence({ onTabChange }: Props) {
  const { t } = useLanguage();

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
            summary: `${INTELLIGENCE_INSIGHTS.length} indicadores analisados`,
            csvFn: buildInsightsCSV,
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
          {FINANCE_ALERTS.map(a => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-secondary/20">
              {alertIcon(a.type)}
              <p className="text-sm">{t(a.messageKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Insights by category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(CATEGORY_CONFIG) as (keyof typeof CATEGORY_CONFIG)[]).map(cat => {
          const cfg = CATEGORY_CONFIG[cat];
          const Icon = cfg.Icon;
          const items = INTELLIGENCE_INSIGHTS.filter(i => i.category === cat);
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
                    {t(item.messageKey)}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Recommended actions */}
      <section className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
        <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
          {t("Próximas ações recomendadas")}
        </h4>
        <div className="space-y-2">
          {RECOMMENDED_ACTIONS.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => onTabChange?.(a.targetTab)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 text-sm hover:bg-secondary/50 transition-colors text-left group"
            >
              <span>{t(a.messageKey)}</span>
              <ArrowRight size={14} className="text-muted-foreground flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
