import { useState } from "react";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";

type HierarchyItem = typeof HIERARCHY_LEVELS[number];
type SectorItem = typeof SECTOR_PERFORMANCE[number];

type Props = {
  onTabChange?: (tab: string) => void;
};

export function FinanceExecutive({ onTabChange }: Props) {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  const [selectedHierarchy, setSelectedHierarchy] = useState<HierarchyItem | null>(null);
  const [selectedSector, setSelectedSector] = useState<SectorItem | null>(null);
  const [activeBar, setActiveBar] = useState<string | null>(null);

  const cards = [
    {
      title: t("Receita Total"),
      value: fmt(EXECUTIVE_STATS.totalRevenue),
      icon: TrendingUp,
      trend: "+6.2%",
      tab: "treasury",
    },
    {
      title: t("Despesas Totais"),
      value: fmt(EXECUTIVE_STATS.totalExpenses),
      icon: TrendingDown,
      tab: "treasury",
    },
    {
      title: t("Saldo Consolidado"),
      value: fmt(EXECUTIVE_STATS.consolidatedBalance),
      icon: Wallet,
      trend: "+4.8%",
      tab: "treasury",
    },
    {
      title: t("Campanhas Ativas"),
      value: String(EXECUTIVE_STATS.activeCampaigns),
      icon: Megaphone,
      tab: "campaigns",
    },
    {
      title: t("Dízimos do Mês"),
      value: fmt(EXECUTIVE_STATS.monthlyTithes),
      icon: TrendingUp,
      trend: "+8.4%",
      tab: "tithes",
    },
    {
      title: t("Ofertas do Mês"),
      value: fmt(EXECUTIVE_STATS.monthlyOfferings),
      icon: TrendingUp,
      trend: "+3.1%",
      tab: "tithes",
    },
  ];

  const alertIcon = (type: string) => {
    if (type === "warning") return <AlertTriangle size={16} className="text-amber-600" />;
    if (type === "success") return <CheckCircle2 size={16} className="text-green-600" />;
    return <Info size={16} className="text-primary" />;
  };

  const buildSummaryCSV = () => {
    let csv = "Indicador,Valor\n";
    csv += `"Receita Total",${EXECUTIVE_STATS.totalRevenue}\n`;
    csv += `"Despesas Totais",${EXECUTIVE_STATS.totalExpenses}\n`;
    csv += `"Saldo Consolidado",${EXECUTIVE_STATS.consolidatedBalance}\n`;
    csv += `"Campanhas Ativas",${EXECUTIVE_STATS.activeCampaigns}\n`;
    csv += `"Dízimos do Mês",${EXECUTIVE_STATS.monthlyTithes}\n`;
    csv += `"Ofertas do Mês",${EXECUTIVE_STATS.monthlyOfferings}\n\n`;
    csv += "Hierarquia,Receita,Participação\n";
    HIERARCHY_LEVELS.forEach(h => {
      csv += `"${h.name}",${h.revenue},${h.share}%\n`;
    });
    return csv;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("Visão consolidada — dados do período")}</p>
        <DocExportMenu
          align="end"
          items={buildFinanceExportItems({
            moduleTitle: t("Executivo — Visão Consolidada"),
            summary: `Receita: ${fmt(EXECUTIVE_STATS.totalRevenue)} | Despesas: ${fmt(EXECUTIVE_STATS.totalExpenses)} | Saldo: ${fmt(EXECUTIVE_STATS.consolidatedBalance)}`,
            csvFn: buildSummaryCSV,
            csvFilename: "executivo.csv",
          })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <ExecutiveCard
            key={c.title}
            title={c.title}
            value={c.value}
            icon={c.icon}
            trend={c.trend}
            index={i}
            onClick={onTabChange ? () => onTabChange(c.tab) : undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hierarchy */}
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Consolidado por hierarquia")}</h3>
          <div className="space-y-2">
            {HIERARCHY_LEVELS.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setSelectedHierarchy(item)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 text-sm hover:bg-secondary/60 transition-colors text-left group"
              >
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t(item.level)}</p>
                  <p className="font-medium truncate">{item.name}</p>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-3">
                  <div>
                    <p className="font-semibold tabular-nums">{fmt(item.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{item.share}%</p>
                  </div>
                  <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Sector performance bar chart */}
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-1">{t("Desempenho por setor")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("Clique em uma barra para ver detalhes")}</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={SECTOR_PERFORMANCE} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v / 1000}k`} />
              <YAxis type="category" dataKey="sector" width={90} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => fmt(value)}
              />
              <Bar
                dataKey="revenue"
                name={t("Receita")}
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data: SectorItem) => setSelectedSector(data)}
                onMouseEnter={(data: SectorItem) => setActiveBar(data.sector)}
                onMouseLeave={() => setActiveBar(null)}
              >
                {SECTOR_PERFORMANCE.map((entry) => (
                  <Cell
                    key={entry.sector}
                    fill={
                      activeBar === entry.sector
                        ? "hsl(var(--primary) / 0.8)"
                        : "hsl(var(--primary))"
                    }
                  />
                ))}
              </Bar>
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

      {/* ── Hierarchy detail modal ───────────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedHierarchy}
        onClose={() => setSelectedHierarchy(null)}
        title={selectedHierarchy?.name ?? ""}
        subtitle={selectedHierarchy ? t(selectedHierarchy.level) : undefined}
        maxWidth="sm"
      >
        {selectedHierarchy && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Receita Total")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedHierarchy.revenue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Participação</p>
                <p className="text-xl font-bold mt-1">{selectedHierarchy.share}%</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Participação no total consolidado</span>
                <span className="font-semibold text-foreground">{selectedHierarchy.share}%</span>
              </div>
              <div className="h-3 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${selectedHierarchy.share}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground p-3 rounded-lg bg-secondary/20">
              <p>Total convenção: {fmt(HIERARCHY_LEVELS[0].revenue)}</p>
            </div>
          </div>
        )}
      </FinanceDetailModal>

      {/* ── Sector detail modal ──────────────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedSector}
        onClose={() => setSelectedSector(null)}
        title={selectedSector?.sector ?? ""}
        subtitle="Desempenho do setor"
        maxWidth="sm"
      >
        {selectedSector && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Receita")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedSector.revenue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Meta</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedSector.goal)}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Atingimento da meta</span>
                <span className={`font-semibold ${selectedSector.pct >= 100 ? "text-success" : "text-destructive"}`}>
                  {selectedSector.pct}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${selectedSector.pct >= 100 ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${Math.min(selectedSector.pct, 100)}%` }}
                />
              </div>
            </div>
            <div className={`text-xs p-3 rounded-lg font-medium ${
              selectedSector.pct >= 100
                ? "bg-green-500/10 text-green-700"
                : "bg-amber-500/10 text-amber-700"
            }`}>
              {selectedSector.pct >= 100
                ? `Meta superada em ${fmt(selectedSector.revenue - selectedSector.goal)}`
                : `Faltam ${fmt(selectedSector.goal - selectedSector.revenue)} para a meta`}
            </div>
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
