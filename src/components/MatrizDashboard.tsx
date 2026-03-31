import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChurch } from "@/hooks/useChurch";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import {
  Building2, Users, Wallet, TrendingUp, TrendingDown, Heart,
  Calendar, ChevronDown, ChevronUp, Loader2, BarChart3, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface CongregationStats {
  id: string;
  name: string;
  pastor_name: string | null;
  city: string | null;
  members: number;
  activeMembers: number;
  income: number;
  expense: number;
  events: number;
  prayers: number;
}

export function MatrizDashboard() {
  const { church, congregations } = useChurch();
  const { t } = useLanguage();
  const [stats, setStats] = useState<CongregationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!church || congregations.length === 0) {
      setLoading(false);
      return;
    }
    loadStats();
  }, [church, congregations]);

  const loadStats = async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

    // Include matriz + all congregations
    const allChurchIds = [church!.id, ...congregations.map(c => c.id)];

    const results: CongregationStats[] = [];

    for (const cId of allChurchIds) {
      const c = cId === church!.id ? church! : congregations.find(x => x.id === cId)!;

      const [membersRes, incomeRes, expenseRes, eventsRes, prayersRes] = await Promise.all([
        supabase.from("members").select("status").eq("church_id", cId),
        supabase.from("transactions").select("amount").eq("type", "Entrada").eq("church_id", cId).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("transactions").select("amount").eq("type", "Saída").eq("church_id", cId).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("events").select("id").eq("church_id", cId).gte("event_date", monthStart).lte("event_date", monthEnd),
        supabase.from("prayer_requests").select("id").eq("church_id", cId),
      ]);

      const membersData = membersRes.data || [];
      results.push({
        id: cId,
        name: c.name,
        pastor_name: c.pastor_name,
        city: c.city,
        members: membersData.length,
        activeMembers: membersData.filter(m => m.status === "Ativo").length,
        income: (incomeRes.data || []).reduce((s, t) => s + Number(t.amount), 0),
        expense: (expenseRes.data || []).reduce((s, t) => s + Number(t.amount), 0),
        events: (eventsRes.data || []).length,
        prayers: (prayersRes.data || []).length,
      });
    }

    setStats(results);
    setLoading(false);
  };

  const totals = stats.reduce(
    (acc, s) => ({
      members: acc.members + s.members,
      activeMembers: acc.activeMembers + s.activeMembers,
      income: acc.income + s.income,
      expense: acc.expense + s.expense,
      events: acc.events + s.events,
      prayers: acc.prayers + s.prayers,
    }),
    { members: 0, activeMembers: 0, income: 0, expense: 0, events: 0, prayers: 0 }
  );

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-accent/10 rounded-xl">
          <Building2 size={24} className="text-accent" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold">{t("Painel Consolidado da Matriz")}</h2>
          <p className="text-xs text-muted-foreground">
            {stats.length} {t("unidades")} · {format(new Date(), "MMMM yyyy")}
          </p>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: t("Total Membros"), value: totals.members.toString(), icon: Users, color: "text-blue-600 bg-blue-500/10" },
          { label: t("Membros Ativos"), value: totals.activeMembers.toString(), icon: Users, color: "text-green-600 bg-green-500/10" },
          { label: t("Receita Total"), value: fmt(totals.income), icon: TrendingUp, color: "text-emerald-600 bg-emerald-500/10" },
          { label: t("Despesas Totais"), value: fmt(totals.expense), icon: TrendingDown, color: "text-red-600 bg-red-500/10" },
          { label: t("Saldo Geral"), value: fmt(totals.income - totals.expense), icon: Wallet, color: totals.income - totals.expense >= 0 ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10" },
          { label: t("Pedidos de Oração"), value: totals.prayers.toString(), icon: Heart, color: "text-pink-600 bg-pink-500/10" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-xl p-4 shadow-sm border border-border/50"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color} mb-2`}>
              <item.icon size={16} />
            </div>
            <p className="text-lg font-bold">{item.value}</p>
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Per-congregation breakdown */}
      <div className="bg-card rounded-xl shadow-executive overflow-hidden">
        <div className="p-5 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-serif text-base">{t("Detalhamento por Congregação")}</h3>
          <Link to="/admin/congregacoes" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {t("Gerenciar")} <ArrowRight size={12} />
          </Link>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t("Congregação")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("Membros")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("Receita")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("Despesa")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("Saldo")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("Eventos")}</th>
                <th className="px-5 py-3 font-medium text-right">{t("Orações")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const balance = s.income - s.expense;
                const isMatriz = s.id === church?.id;
                return (
                  <tr key={s.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        {isMatriz && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                            {t("Matriz")}
                          </span>
                        )}
                      </div>
                      {s.pastor_name && <p className="text-xs text-muted-foreground">{s.pastor_name}</p>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.activeMembers}/{s.members}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-600">{fmt(s.income)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-600">{fmt(s.expense)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums font-medium ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmt(balance)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.events}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.prayers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-border">
          {stats.map((s) => {
            const balance = s.income - s.expense;
            const isMatriz = s.id === church?.id;
            const expanded = expandedId === s.id;
            return (
              <div key={s.id} className="p-4">
                <button
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.name}</span>
                      {isMatriz && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                          {t("Matriz")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.activeMembers} {t("membros ativos")}</p>
                  </div>
                  {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </button>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 grid grid-cols-2 gap-2"
                  >
                    <div className="bg-secondary/30 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground">{t("Receita")}</p>
                      <p className="text-sm font-medium text-green-600">{fmt(s.income)}</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground">{t("Despesa")}</p>
                      <p className="text-sm font-medium text-red-600">{fmt(s.expense)}</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground">{t("Saldo")}</p>
                      <p className={`text-sm font-medium ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(balance)}</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground">{t("Eventos")}</p>
                      <p className="text-sm font-medium">{s.events}</p>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
