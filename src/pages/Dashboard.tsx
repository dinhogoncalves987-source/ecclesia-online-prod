import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { MatrizDashboard } from "@/components/MatrizDashboard";
import { motion } from "framer-motion";
import { Wallet, Users, TrendingUp, Calendar, Clock, Bell, Plus, ChevronRight, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church, isMatriz } = useChurch();
  const { isAdmin } = useRole();
  const [notices, setNotices] = useState([
    { id: 1, text: t("Bem-vindo ao sistema de gestão da igreja!"), time: t("Agora"), read: false },
  ]);
  const [metrics, setMetrics] = useState([
    { title: t("Receita do Mês"), value: "R$ 0", trend: "", icon: Wallet },
    { title: t("Despesas do Mês"), value: "R$ 0", trend: "", icon: TrendingUp },
    { title: t("Membros Ativos"), value: "0", icon: Users },
    { title: t("Eventos no Mês"), value: "0", icon: Calendar },
  ]);
  const [upcomingEvents, setUpcomingEvents] = useState<{ id: string; title: string; date: string; time: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !church) return;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
      const todayStr = now.toISOString().split("T")[0];

      const [txRes, membersRes, eventsRes] = await Promise.all([
        supabase.from("transactions").select("type, amount").eq("church_id", church.id).gte("date", startDate).lte("date", endDate),
        supabase.from("members").select("id, status").eq("church_id", church.id),
        supabase.from("events").select("id, title, event_date, time").eq("church_id", church.id).gte("event_date", todayStr).order("event_date").limit(5),
      ]);

      const txData = txRes.data || [];
      const receita = txData.filter(t => t.type === "Entrada").reduce((s, t) => s + Number(t.amount), 0);
      const despesa = txData.filter(t => t.type === "Saída").reduce((s, t) => s + Number(t.amount), 0);
      const activeMembers = (membersRes.data || []).filter(m => m.status === "Ativo").length;

      const eventsThisMonthRes = await supabase.from("events").select("id").eq("church_id", church.id).gte("event_date", startDate).lte("event_date", endDate);
      const eventsCount = (eventsThisMonthRes.data || []).length;

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;

      setMetrics([
        { title: t("Receita do Mês"), value: fmt(receita), trend: "", icon: Wallet },
        { title: t("Despesas do Mês"), value: fmt(despesa), trend: "", icon: TrendingUp },
        { title: t("Membros Ativos"), value: activeMembers.toString(), icon: Users },
        { title: t("Eventos no Mês"), value: eventsCount.toString(), icon: Calendar },
      ]);

      setUpcomingEvents((eventsRes.data || []).map(e => ({
        id: e.id,
        title: e.title,
        date: new Date(e.event_date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" }),
        time: e.time,
      })));

      setLoading(false);
    };
    load();
  }, [user, church, t]);

  const markAsRead = (id: number) => setNotices(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllAsRead = () => setNotices(prev => prev.map(n => ({ ...n, read: true })));
  const unreadCount = notices.filter(n => !n.read).length;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Visão geral da administração")}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/agenda" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus size={16} strokeWidth={1.5} /> {t("Novo Evento")}
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.map((m, i) => (
                <ExecutiveCard key={m.title} {...m} index={i} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-card rounded-xl shadow-executive p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-lg">{t("Próximos Eventos")}</h2>
                  <Link to="/admin/agenda" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                    {t("Ver todos")} <ChevronRight size={12} />
                  </Link>
                </div>
                <div className="space-y-3">
                  {upcomingEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("Nenhum evento próximo")}</p>
                  )}
                  {upcomingEvents.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                      <div className="w-1 h-10 bg-accent rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{e.date}</p>
                      </div>
                      {e.time && (
                        <div className="text-right flex-shrink-0">
                          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock size={12} /> {e.time}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-xl shadow-executive p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-lg">{t("Avisos")}</h2>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">{t("Marcar todos como lidos")}</button>
                    )}
                    <Bell size={16} className="text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  {notices.map((n) => (
                    <button key={n.id} onClick={() => markAsRead(n.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${n.read ? "bg-secondary/30" : "bg-accent/10 hover:bg-accent/15 border-l-2 border-accent"}`}>
                      <p className="text-sm">{n.text}</p>
                      <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-serif text-lg mb-3">{t("Acesso Rápido")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: t("Financeiro"), desc: t("Controle financeiro e relatórios"), path: "/admin/financeiro", icon: Wallet },
                  { label: t("Membros"), desc: t("Cadastro e gestão de membros"), path: "/admin/membros", icon: Users },
                  { label: t("Agenda"), desc: t("Calendário e eventos da igreja"), path: "/admin/agenda", icon: Calendar },
                  { label: t("Bíblia"), desc: t("Leitura e estudo bíblico"), path: "/admin/biblia", icon: TrendingUp },
                ].map((item, i) => (
                  <Link key={item.path} to={item.path}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.05 }}
                      className="bg-card p-5 rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow duration-300 h-full"
                    >
                      <div className="p-2.5 bg-accent/10 rounded-lg w-fit mb-3">
                        <item.icon size={20} strokeWidth={1.5} className="text-accent" />
                      </div>
                      <h3 className="font-medium text-sm">{item.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}