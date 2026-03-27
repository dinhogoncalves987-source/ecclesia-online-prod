import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { Wallet, Users, TrendingUp, Calendar, Clock, Bell, Plus, ChevronRight, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();
  const [notices, setNotices] = useState([
    { id: 1, text: "Bem-vindo ao sistema de gestão da igreja!", time: "Agora", read: false },
  ]);
  const [metrics, setMetrics] = useState([
    { title: "Receita do Mês", value: "R$ 0", trend: "", icon: Wallet },
    { title: "Despesas do Mês", value: "R$ 0", trend: "", icon: TrendingUp },
    { title: "Membros Ativos", value: "0", icon: Users },
    { title: "Eventos no Mês", value: "0", icon: Calendar },
  ]);
  const [upcomingEvents, setUpcomingEvents] = useState<{ id: string; title: string; date: string; time: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
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
        supabase.from("transactions").select("type, amount").gte("date", startDate).lte("date", endDate),
        supabase.from("members").select("id, status"),
        supabase.from("events").select("id, title, event_date, time").gte("event_date", todayStr).order("event_date").limit(5),
      ]);

      const txData = txRes.data || [];
      const receita = txData.filter(t => t.type === "Entrada").reduce((s, t) => s + Number(t.amount), 0);
      const despesa = txData.filter(t => t.type === "Saída").reduce((s, t) => s + Number(t.amount), 0);
      const activeMembers = (membersRes.data || []).filter(m => m.status === "Ativo").length;

      // Count events this month
      const eventsThisMonthRes = await supabase.from("events").select("id").gte("event_date", startDate).lte("event_date", endDate);
      const eventsCount = (eventsThisMonthRes.data || []).length;

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;

      setMetrics([
        { title: "Receita do Mês", value: fmt(receita), trend: "", icon: Wallet },
        { title: "Despesas do Mês", value: fmt(despesa), trend: "", icon: TrendingUp },
        { title: "Membros Ativos", value: activeMembers.toString(), icon: Users },
        { title: "Eventos no Mês", value: eventsCount.toString(), icon: Calendar },
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
  }, [user]);

  const markAsRead = (id: number) => setNotices(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllAsRead = () => setNotices(prev => prev.map(n => ({ ...n, read: true })));
  const unreadCount = notices.filter(n => !n.read).length;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão geral da administração</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/agenda" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus size={16} strokeWidth={1.5} /> Novo Evento
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
                  <h2 className="font-serif text-lg">Próximos Eventos</h2>
                  <Link to="/admin/agenda" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                    Ver todos <ChevronRight size={12} />
                  </Link>
                </div>
                <div className="space-y-3">
                  {upcomingEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento próximo</p>
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
                    <h2 className="font-serif text-lg">Avisos</h2>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">Marcar todos como lidos</button>
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
              <h2 className="font-serif text-lg mb-3">Acesso Rápido</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Financeiro", path: "/admin/financeiro", icon: Wallet },
                  { label: "Membros", path: "/admin/membros", icon: Users },
                  { label: "Agenda", path: "/admin/agenda", icon: Calendar },
                  { label: "Bíblia", path: "/admin/biblia", icon: TrendingUp },
                ].map(item => (
                  <Link key={item.path} to={item.path} className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow">
                    <item.icon size={24} strokeWidth={1.5} className="text-primary" />
                    <span className="text-sm font-medium">{item.label}</span>
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
