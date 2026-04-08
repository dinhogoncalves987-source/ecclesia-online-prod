import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Target, BarChart3 } from "lucide-react";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { useLanguage } from "@/hooks/useLanguage";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from "recharts";

type Transaction = {
  id: string; date: string; description: string; type: string; amount: number; status: string; category: string;
};

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--destructive))",
  "hsl(142 76% 36%)", "hsl(280 65% 60%)", "hsl(30 90% 55%)", "hsl(200 80% 50%)", "hsl(350 70% 50%)"
];

export function FinanceOverview({ transactions }: { transactions: Transaction[] }) {
  const { t } = useLanguage();

  const summary = useMemo(() => {
    const totalReceita = transactions.filter(tx => tx.type === "Entrada").reduce((s, tx) => s + Number(tx.amount), 0);
    const totalDespesa = transactions.filter(tx => tx.type === "Saída").reduce((s, tx) => s + Number(tx.amount), 0);
    const saldo = totalReceita - totalDespesa;
    const confirmed = transactions.filter(tx => tx.status === "Confirmado" || tx.status === "Pago").reduce((s, tx) => s + Number(tx.amount) * (tx.type === "Entrada" ? 1 : -1), 0);
    const pending = transactions.filter(tx => tx.status === "Pendente").length;
    const margin = totalReceita > 0 ? ((saldo / totalReceita) * 100).toFixed(1) : "0";
    return { totalReceita, totalDespesa, saldo, confirmed, pending, margin };
  }, [transactions]);

  const cards = [
    { title: t("Receita Total"), value: formatCurrency(summary.totalReceita), icon: TrendingUp, trend: `${summary.margin}% ${t("margem")}` },
    { title: t("Despesas Totais"), value: formatCurrency(summary.totalDespesa), icon: TrendingDown },
    { title: t("Saldo Atual"), value: formatCurrency(summary.saldo), icon: Wallet },
    { title: t("Confirmados"), value: formatCurrency(summary.confirmed), icon: Target, trend: `${summary.pending} ${t("pendentes")}` },
  ];

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; receita: number; despesa: number }> = {};
    transactions.forEach(tx => {
      const m = tx.date?.substring(0, 7) || "N/A";
      if (!months[m]) months[m] = { month: m, receita: 0, despesa: 0 };
      if (tx.type === "Entrada") months[m].receita += Number(tx.amount);
      else months[m].despesa += Number(tx.amount);
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12).map(m => ({
      ...m,
      month: m.month.substring(5) + "/" + m.month.substring(2, 4),
    }));
  }, [transactions]);

  const categoryData = useMemo(() => {
    const cats: Record<string, { name: string; receita: number; despesa: number }> = {};
    transactions.forEach(tx => {
      const cat = tx.category || "Geral";
      if (!cats[cat]) cats[cat] = { name: cat, receita: 0, despesa: 0 };
      if (tx.type === "Entrada") cats[cat].receita += Number(tx.amount);
      else cats[cat].despesa += Number(tx.amount);
    });
    return Object.values(cats).sort((a, b) => (b.receita + b.despesa) - (a.receita + a.despesa));
  }, [transactions]);

  const pieData = useMemo(() => {
    return categoryData.map(c => ({ name: c.name, value: c.receita + c.despesa })).filter(c => c.value > 0).slice(0, 8);
  }, [categoryData]);

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
