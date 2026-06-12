import { useLanguage } from "@/hooks/useLanguage";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import {
  EXECUTIVE_STATS,
  FINANCE_ALERTS,
  HIERARCHY_LEVELS,
  RECOMMENDED_ACTIONS,
  SECTOR_PERFORMANCE,
  formatFinanceCurrency,
} from "@/lib/financeDemo";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Megaphone, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function FinanceExecutive() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  const cards = [
    { title: t("Receita Total"), value: fmt(EXECUTIVE_STATS.totalRevenue), icon: TrendingUp, trend: "+6.2%" },
    { title: t("Despesas Totais"), value: fmt(EXECUTIVE_STATS.totalExpenses), icon: TrendingDown },
    { title: t("Saldo Consolidado"), value: fmt(EXECUTIVE_STATS.consolidatedBalance), icon: Wallet, trend: "+4.8%" },
    { title: t("Campanhas Ativas"), value: String(EXECUTIVE_STATS.activeCampaigns), icon: Megaphone },
    { title: t("Dízimos do Mês"), value: fmt(EXECUTIVE_STATS.monthlyTithes), icon: TrendingUp, trend: "+8.4%" },
    { title: t("Ofertas do Mês"), value: fmt(EXECUTIVE_STATS.monthlyOfferings), icon: TrendingUp, trend: "+3.1%" },
  ];

  const alertIcon = (type: string) => {
    if (type === "warning") return <AlertTriangle size={16} className="text-amber-600" />;
    if (type === "success") return <CheckCircle2 size={16} className="text-green-600" />;
    return <Info size={16} className="text-primary" />;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <ExecutiveCard key={c.title} {...c} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Consolidado por hierarquia")}</h3>
          <div className="space-y-2">
            {HIERARCHY_LEVELS.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 text-sm">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t(item.level)}</p>
                  <p className="font-medium truncate">{item.name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold tabular-nums">{fmt(item.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{item.share}%</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Desempenho por setor")}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={SECTOR_PERFORMANCE} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v / 1000}k`} />
              <YAxis type="category" dataKey="sector" width={90} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => fmt(value)}
              />
              <Bar dataKey="revenue" name={t("Receita")} fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Alertas financeiros")}</h3>
          <div className="space-y-2">
            {FINANCE_ALERTS.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50">
                {alertIcon(a.type)}
                <p className="text-sm">{t(a.messageKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Próximas ações recomendadas")}</h3>
          <div className="space-y-2">
            {RECOMMENDED_ACTIONS.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 text-sm">
                <span>{t(a.messageKey)}</span>
                <ArrowRight size={14} className="text-muted-foreground flex-shrink-0" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
