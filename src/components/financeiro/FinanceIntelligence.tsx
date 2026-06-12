import { useLanguage } from "@/hooks/useLanguage";
import { INTELLIGENCE_INSIGHTS } from "@/lib/financeDemo";
import { AlertCircle, Lightbulb, Sparkles, TrendingUp } from "lucide-react";

const categoryConfig = {
  growth: { icon: TrendingUp, labelKey: "Crescimento", color: "text-green-600 bg-green-500/10" },
  risk: { icon: AlertCircle, labelKey: "Risco", color: "text-destructive bg-destructive/10" },
  opportunity: { icon: Lightbulb, labelKey: "Oportunidade", color: "text-accent bg-accent/10" },
  pending: { icon: AlertCircle, labelKey: "Pendência", color: "text-amber-600 bg-amber-500/10" },
} as const;

export function FinanceIntelligence() {
  const { t } = useLanguage();

  const byCategory = (cat: keyof typeof categoryConfig) =>
    INTELLIGENCE_INSIGHTS.filter((i) => i.category === cat);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles size={20} className="text-accent" />
        <h3 className="font-serif text-lg font-semibold">{t("Inteligência financeira")}</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(categoryConfig) as (keyof typeof categoryConfig)[]).map((cat) => {
          const cfg = categoryConfig[cat];
          const Icon = cfg.icon;
          const items = byCategory(cat);
          return (
            <section key={cat} className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold mb-4 ${cfg.color}`}>
                <Icon size={14} /> {t(cfg.labelKey)}
              </div>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.id} className="text-sm p-3 rounded-lg bg-secondary/30">
                    {t(item.messageKey)}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
