import { AdminLayout } from "@/components/AdminLayout";
import { BarChart3, Users, Wallet, Calendar, Heart, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { useLanguage } from "@/hooks/useLanguage";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function Relatorios() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const [stats, setStats] = useState({
    totalMembers: 0, activeMembers: 0, visitors: 0,
    totalIncome: 0, totalExpense: 0, balance: 0,
    totalEvents: 0, totalPrayers: 0, answeredPrayers: 0,
    totalGroups: 0, totalDocs: 0,
  });
  const [loading, setLoading] = useState(true);

  const { loading: churchLoading } = useChurch();

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    const load = async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

      const [members, income, expense, events, prayers, groups, docs] = await Promise.all([
        supabase.from("members").select("status").eq("church_id", church.id),
        supabase.from("transactions").select("amount").eq("type", "Entrada").eq("church_id", church.id).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("transactions").select("amount").eq("type", "Saída").eq("church_id", church.id).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("events").select("id").eq("church_id", church.id).gte("event_date", monthStart).lte("event_date", monthEnd),
        supabase.from("prayer_requests").select("status").eq("church_id", church.id),
        supabase.from("small_groups").select("id").eq("church_id", church.id),
        supabase.from("documents").select("id").eq("church_id", church.id),
      ]);

      const membersData = members.data || [];
      const incomeTotal = (income.data || []).reduce((s, t) => s + Number(t.amount), 0);
      const expenseTotal = (expense.data || []).reduce((s, t) => s + Number(t.amount), 0);
      const prayersData = prayers.data || [];

      setStats({
        totalMembers: membersData.length,
        activeMembers: membersData.filter(m => m.status === "Ativo").length,
        visitors: membersData.filter(m => m.status === "Visitante").length,
        totalIncome: incomeTotal, totalExpense: expenseTotal, balance: incomeTotal - expenseTotal,
        totalEvents: (events.data || []).length,
        totalPrayers: prayersData.length,
        answeredPrayers: prayersData.filter(p => p.status === "Respondido").length,
        totalGroups: (groups.data || []).length,
        totalDocs: (docs.data || []).length,
      });
      setLoading(false);
    };
    load();
  }, [church]);

  const cards = [
    { title: t("Total de Membros"), value: stats.totalMembers, sub: `${stats.activeMembers} ${t("ativos")} · ${stats.visitors} ${t("visitantes")}`, icon: Users, color: "text-blue-600 bg-blue-500/10" },
    { title: t("Receita do Mês"), value: `R$ ${stats.totalIncome.toLocaleString("pt-BR")}`, icon: TrendingUp, color: "text-green-600 bg-green-500/10" },
    { title: t("Despesa do Mês"), value: `R$ ${stats.totalExpense.toLocaleString("pt-BR")}`, icon: TrendingDown, color: "text-red-600 bg-red-500/10" },
    { title: t("Saldo"), value: `R$ ${stats.balance.toLocaleString("pt-BR")}`, icon: Wallet, color: stats.balance >= 0 ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10" },
    { title: t("Eventos no Mês"), value: stats.totalEvents, icon: Calendar, color: "text-purple-600 bg-purple-500/10" },
    { title: t("Pedidos de Oração"), value: stats.totalPrayers, sub: `${stats.answeredPrayers} ${t("respondidos")}`, icon: Heart, color: "text-pink-600 bg-pink-500/10" },
    { title: t("Pequenos Grupos"), value: stats.totalGroups, icon: Users, color: "text-amber-600 bg-amber-500/10" },
    { title: t("Documentos"), value: stats.totalDocs, icon: BarChart3, color: "text-accent bg-accent/10" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">{t("Relatórios")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Visão geral de")} {format(new Date(), "MMMM yyyy")}</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando relatórios...")}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-xl p-5 shadow-sm border border-border/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                      <Icon size={20} />
                    </div>
                    <span className="text-sm text-muted-foreground">{card.title}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  {card.sub && <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}