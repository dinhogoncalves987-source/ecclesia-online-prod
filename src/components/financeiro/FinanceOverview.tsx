import { TrendingUp, TrendingDown, Wallet, Target, BarChart3, Loader2, AlertTriangle } from "lucide-react";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { useLanguage } from "@/hooks/useLanguage";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from "recharts";
import { useChurch } from "@/hooks/useChurchContext";
import { useFinanceDashboardAggregates } from "@/hooks/useFinanceDashboardAggregates";
import { buildMonthlySeries, buildCategorySeries } from "@/lib/financeDashboardAggregates";

const CURRENCY_LOCALE: Record<string, { locale: string; currency: string }> = {
  pt: { locale: "pt-BR", currency: "BRL" },
  en: { locale: "en-US", currency: "USD" },
  es: { locale: "es-MX", currency: "MXN" },
};

const makeCurrencyFormatter = (lang: string) => (v: number) => {
  const { locale, currency } = CURRENCY_LOCALE[lang] ?? CURRENCY_LOCALE.pt;
  return v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--destructive))",
  "hsl(142 76% 36%)", "hsl(280 65% 60%)", "hsl(30 90% 55%)", "hsl(200 80% 50%)", "hsl(350 70% 50%)"
];

/**
 * CORREÇÃO 2026-08-14 (FASE 1D-C3 — desempenho) — antes, esta seção recebia
 * TODAS as transações da organização via prop e recalculava totais/gráficos
 * inteiramente no navegador (.filter/.reduce sobre 29.957+ linhas a cada
 * render). Agora consome finance_dashboard_aggregates: 1 RPC agregada
 * server-side (SUM/COUNT/GROUP BY), sujeita à mesma RLS de leitura
 * financeira de sempre — nenhuma linha crua chega ao cliente.
 */
export function FinanceOverview({ reloadToken }: { reloadToken?: number }) {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const formatCurrency = makeCurrencyFormatter(lang);

  const { status, data, error } = useFinanceDashboardAggregates({
    organizationId: church?.id,
    reloadToken,
  });

  const totals = data?.totals ?? null;
  const monthlyData = data ? buildMonthlySeries(data.byMonth) : [];
  const categoryData = data ? buildCategorySeries(data.byCategory) : [];
  const pieData = categoryData.map(c => ({ name: c.name, value: c.receita + c.despesa })).filter(c => c.value > 0).slice(0, 8);

  const totalReceita = totals?.entriesAmount ?? 0;
  const totalDespesa = totals?.exitsAmount ?? 0;
  const saldo = totalReceita - totalDespesa;
  const margin = totalReceita > 0 ? ((saldo / totalReceita) * 100).toFixed(1) : "0";

  const cards = [
    { title: t("Receita Total"), value: formatCurrency(totalReceita), icon: TrendingUp, trend: `${margin}% ${t("margem")}` },
    { title: t("Despesas Totais"), value: formatCurrency(totalDespesa), icon: TrendingDown },
    { title: t("Saldo Atual"), value: formatCurrency(saldo), icon: Wallet },
    { title: t("Confirmados"), value: formatCurrency(totals?.confirmedNet ?? 0), icon: Target, trend: `${totals?.pendingCount ?? 0} ${t("pendentes")}` },
  ];

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
        <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-destructive">
        <AlertTriangle size={16} />
        {t("Não foi possível carregar a visão geral financeira.")}
        {error ? <span className="text-muted-foreground">({error})</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((s, i) => <ExecutiveCard key={s.title} {...s} index={i} />)}
      </div>

      {/* Monthly Chart */}
      <div className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold">{t("Fluxo Mensal")}</h3>
        </div>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receita" name={t("Receitas")} fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesa" name={t("Despesas")} fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-12">{t("Nenhuma movimentação encontrada.")}</p>
        )}
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-base font-semibold mb-4">{t("Distribuição por Categoria")}</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-12">{t("Sem dados")}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {pieData.map((c, i) => (
              <span key={c.name} className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {c.name}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-base font-semibold mb-4">{t("Receitas vs Despesas por Categoria")}</h3>
          {categoryData.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {categoryData.map(c => {
                const total = c.receita + c.despesa;
                const recPct = total > 0 ? (c.receita / total) * 100 : 0;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-secondary/50">
                      <div className="bg-success/70 rounded-l-full" style={{ width: `${recPct}%` }} />
                      <div className="bg-destructive/70 rounded-r-full" style={{ width: `${100 - recPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-12">{t("Sem dados")}</p>
          )}
        </div>
      </div>

      {/* Accumulated flow */}
      {monthlyData.length > 0 && (
        <div className="bg-card rounded-xl shadow-executive p-5">
          <h3 className="font-serif text-base font-semibold mb-4">{t("Fluxo Acumulado")}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData.map((m, i, arr) => {
              const accReceita = arr.slice(0, i + 1).reduce((s, x) => s + x.receita, 0);
              const accDespesa = arr.slice(0, i + 1).reduce((s, x) => s + x.despesa, 0);
              return { ...m, saldo: accReceita - accDespesa };
            })}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Area type="monotone" dataKey="saldo" name={t("Saldo Acumulado")} stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
