import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useCampaigns } from "@/hooks/useCampaigns";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { isExpense, type TreasuryTransaction } from "@/lib/finance";
import { activeCampaigns } from "@/lib/campaignsDemo";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { getTypeBadgeLabel } from "@/lib/organizationHierarchy";
import { useFinanceInsights } from "@/lib/financeInsights";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2, Megaphone, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";

/**
 * CORREÇÃO 2026-07-24 (Fase G — restauração do Financeiro) — "Executivo"
 * usava EXECUTIVE_STATS/HIERARCHY_LEVELS/SECTOR_PERFORMANCE/FINANCE_ALERTS/
 * RECOMMENDED_ACTIONS fixos de financeDemo.ts. Agora:
 *  - Os 6 KPIs vêm de `transactions` real (mesma fonte da Tesouraria) +
 *    campanhas reais (useCampaigns).
 *  - "Consolidado por hierarquia" vem da árvore real de organizações
 *    (useChurch().congregations, mesmo mecanismo já usado em
 *    MatrizDashboard.tsx), agregando receita por unidade via
 *    runScopedOrganizationQuery — sem nível fictício de "Convenção".
 *  - "Desempenho por setor" foi substituído por "Desempenho por centro de
 *    custo" (orçado vs. realizado), reaproveitando a mesma agregação real da
 *    Fase D (finance_budgets) — não existe hoje uma tabela de metas por
 *    setor geográfico; ver src/lib/financeInsights.ts.
 *  - Alertas/ações recomendadas vêm de src/lib/financeInsights.ts, regras
 *    determinísticas sobre os mesmos dados reais (também usado pela aba
 *    Inteligência).
 */

type HierarchyRow = { id: string; name: string; level: string; revenue: number; share: number };
type CenterRow = { name: string; revenue: number; goal: number; pct: number };

function useHierarchyRevenue() {
  const { church, congregations } = useChurch();
  const [rows, setRows] = useState<HierarchyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!church) { setRows([]); setLoading(false); return; }
      setLoading(true);
      const units = [church, ...congregations];
      const results = await Promise.all(units.map(async (u) => {
        const { data } = await runScopedOrganizationQuery<{ amount: number }[]>(
          "transactions", u.id, q => q.select("amount").eq("type", "Entrada"),
        );
        const revenue = (data ?? []).reduce((s, tx) => s + Number(tx.amount), 0);
        return { id: u.id, name: u.name, level: getTypeBadgeLabel(u.organization_type, church), revenue };
      }));
      if (!active) return;
      const total = results.reduce((s, r) => s + r.revenue, 0);
      setRows(
        results
          .map(r => ({ ...r, share: total > 0 ? Math.round((r.revenue / total) * 100) : 0 }))
          .sort((a, b) => b.revenue - a.revenue),
      );
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [church, congregations]);

  return { rows, loading };
}

type Props = {
  onTabChange?: (tab: string) => void;
  transactions: TreasuryTransaction[];
};

export function FinanceExecutive({ onTabChange, transactions }: Props) {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const { campaigns } = useCampaigns();

  const { rows: hierarchyRows, loading: hierarchyLoading } = useHierarchyRevenue();
  const { alerts, insights, actions, loading: insightsLoading, centerPerformance } = useFinanceInsights({ transactions, t, fmt });

  const [selectedHierarchy, setSelectedHierarchy] = useState<HierarchyRow | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<CenterRow | null>(null);
  const [activeBar, setActiveBar] = useState<string | null>(null);

  const thisMonth = new Date().toISOString().substring(0, 7);

  const stats = useMemo(() => {
    const totalRevenue = transactions.filter(tx => !isExpense(tx.type)).reduce((s, tx) => s + Number(tx.amount), 0);
    const totalExpenses = transactions.filter(tx => isExpense(tx.type)).reduce((s, tx) => s + Number(tx.amount), 0);
    const consolidatedBalance = totalRevenue - totalExpenses;
    const activeCampaignsCount = activeCampaigns(campaigns).length;

    const monthly = (predicate: (category: string) => boolean) => transactions
      .filter(tx => !isExpense(tx.type) && tx.date?.substring(0, 7) === thisMonth && predicate((tx.category ?? "").toLowerCase()))
      .reduce((s, tx) => s + Number(tx.amount), 0);
    const monthlyTithes = monthly(c => c.includes("dízimo") || c.includes("dizimo"));
    const monthlyOfferings = monthly(c => c.includes("oferta"));

    return { totalRevenue, totalExpenses, consolidatedBalance, activeCampaignsCount, monthlyTithes, monthlyOfferings };
  }, [transactions, campaigns, thisMonth]);

  const cards = [
    { title: t("Receita Total"), value: fmt(stats.totalRevenue), icon: TrendingUp, tab: "treasury" },
    { title: t("Despesas Totais"), value: fmt(stats.totalExpenses), icon: TrendingDown, tab: "treasury" },
    { title: t("Saldo Consolidado"), value: fmt(stats.consolidatedBalance), icon: Wallet, tab: "treasury" },
    { title: t("Campanhas Ativas"), value: String(stats.activeCampaignsCount), icon: Megaphone, tab: "campaigns" },
    { title: t("Dízimos do Mês"), value: fmt(stats.monthlyTithes), icon: TrendingUp, tab: "tithes" },
    { title: t("Ofertas do Mês"), value: fmt(stats.monthlyOfferings), icon: TrendingUp, tab: "tithes" },
  ];

  const alertIcon = (type: string) => {
    if (type === "warning") return <AlertTriangle size={16} className="text-amber-600" />;
    if (type === "success") return <CheckCircle2 size={16} className="text-green-600" />;
    return <Info size={16} className="text-primary" />;
  };

  const buildSummaryCSV = () => {
    let csv = "Indicador,Valor\n";
    csv += `"Receita Total",${stats.totalRevenue}\n`;
    csv += `"Despesas Totais",${stats.totalExpenses}\n`;
    csv += `"Saldo Consolidado",${stats.consolidatedBalance}\n`;
    csv += `"Campanhas Ativas",${stats.activeCampaignsCount}\n`;
    csv += `"Dízimos do Mês",${stats.monthlyTithes}\n`;
    csv += `"Ofertas do Mês",${stats.monthlyOfferings}\n\n`;
    csv += "Unidade,Receita,Participação\n";
    hierarchyRows.forEach(h => { csv += `"${h.name}",${h.revenue},${h.share}%\n`; });
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
            summary: `Receita: ${fmt(stats.totalRevenue)} | Despesas: ${fmt(stats.totalExpenses)} | Saldo: ${fmt(stats.consolidatedBalance)}`,
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
            index={i}
            onClick={onTabChange ? () => onTabChange(c.tab) : undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hierarchy — árvore real de organizações */}
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Consolidado por hierarquia")}</h3>
          {hierarchyLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
            </div>
          ) : hierarchyRows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhuma unidade encontrada.")}</p>
          ) : (
            <div className="space-y-2">
              {hierarchyRows.map((item) => (
                <button
                  key={item.id}
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
          )}
        </section>

        {/* Cost center performance — orçado vs. realizado (Fase D) */}
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-1">{t("Desempenho por centro de custo")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("Clique em uma barra para ver detalhes")}</p>
          {insightsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
            </div>
          ) : centerPerformance.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhum centro de custo cadastrado ainda.")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={centerPerformance} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => fmt(value)}
                />
                <Bar
                  dataKey="actual"
                  name={t("Realizado")}
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(data: CenterRow) => setSelectedCenter({ name: data.name, revenue: data.actual, goal: data.budgeted, pct: data.pct })}
                  onMouseEnter={(data: CenterRow) => setActiveBar(data.name)}
                  onMouseLeave={() => setActiveBar(null)}
                >
                  {centerPerformance.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={
                        entry.budgeted > 0 && entry.pct > 100
                          ? "hsl(var(--destructive))"
                          : activeBar === entry.name
                            ? "hsl(var(--primary) / 0.8)"
                            : "hsl(var(--primary))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Alertas financeiros")}</h3>
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50">
                {alertIcon(a.type)}
                <p className="text-sm">{a.message}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Próximas ações recomendadas")}</h3>
          <div className="space-y-2">
            {actions.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-6">{t("Nenhuma ação pendente no momento.")}</p>
            ) : (
              actions.map((a) => (
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

      {insights.length > 0 && (
        <section className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Indicadores")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {insights.map((i) => (
              <div key={i.id} className="flex items-start gap-2 text-sm p-3 rounded-lg bg-secondary/20">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary" />
                {i.message}
              </div>
            ))}
          </div>
        </section>
      )}

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
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${selectedHierarchy.share}%` }} />
              </div>
            </div>
          </div>
        )}
      </FinanceDetailModal>

      {/* ── Cost center detail modal ─────────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedCenter}
        onClose={() => setSelectedCenter(null)}
        title={selectedCenter?.name ?? ""}
        subtitle={t("Desempenho do centro de custo")}
        maxWidth="sm"
      >
        {selectedCenter && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Realizado")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedCenter.revenue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Orçado")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{selectedCenter.goal > 0 ? fmt(selectedCenter.goal) : "—"}</p>
              </div>
            </div>
            {selectedCenter.goal > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t("Utilização do orçamento")}</span>
                  <span className={`font-semibold ${selectedCenter.pct >= 100 ? "text-destructive" : "text-success"}`}>
                    {selectedCenter.pct}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${selectedCenter.pct >= 100 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${Math.min(selectedCenter.pct, 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className={`text-xs p-3 rounded-lg font-medium ${
              selectedCenter.goal === 0
                ? "bg-secondary/30 text-muted-foreground"
                : selectedCenter.pct < 100
                  ? "bg-green-500/10 text-green-700"
                  : "bg-destructive/10 text-destructive"
            }`}>
              {selectedCenter.goal === 0
                ? t("Nenhum orçamento definido para este centro de custo.")
                : selectedCenter.pct < 100
                  ? `${t("Disponível")}: ${fmt(selectedCenter.goal - selectedCenter.revenue)}`
                  : `${t("Estouro de")} ${fmt(selectedCenter.revenue - selectedCenter.goal)} ${t("acima do orçamento")}`}
            </div>
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
