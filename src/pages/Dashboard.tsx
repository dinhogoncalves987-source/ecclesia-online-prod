import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { Wallet, Users, TrendingUp, Calendar, Clock, Bell, Plus, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const initialMetrics = [
  { title: "Dízimos do Mês", value: "R$ 42.580", trend: "+12,4%", icon: Wallet },
  { title: "Ofertas do Mês", value: "R$ 18.320", trend: "+8,2%", icon: TrendingUp },
  { title: "Membros Ativos", value: "347", trend: "+5", trendLabel: "novos este mês", icon: Users },
  { title: "Eventos no Mês", value: "12", icon: Calendar },
];

const initialEvents = [
  { id: 1, title: "Culto de Adoração", date: "Domingo, 23 Mar", time: "09:00", type: "Culto" },
  { id: 2, title: "Reunião de Líderes", date: "Terça, 25 Mar", time: "19:30", type: "Reunião" },
  { id: 3, title: "Estudo Bíblico", date: "Quarta, 26 Mar", time: "20:00", type: "Estudo" },
  { id: 4, title: "Ensaio do Louvor", date: "Sexta, 28 Mar", time: "19:00", type: "Ensaio" },
  { id: 5, title: "Encontro de Jovens", date: "Sábado, 29 Mar", time: "19:00", type: "Evento" },
];

const initialNotices = [
  { id: 1, text: "Relatório financeiro de fevereiro disponível para revisão.", time: "Há 2 horas", read: false },
  { id: 2, text: "3 novos pedidos de oração recebidos.", time: "Há 4 horas", read: false },
  { id: 3, text: "Escala de louvor de março publicada.", time: "Ontem", read: true },
  { id: 4, text: "Novo membro cadastrado: Priscila Mendes.", time: "Ontem", read: true },
];

export default function Dashboard() {
  const [notices, setNotices] = useState(initialNotices);

  const markAsRead = (id: number) => {
    setNotices(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotices(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notices.filter(n => !n.read).length;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão geral da administração — Março 2026</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/agenda" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus size={16} strokeWidth={1.5} /> Novo Evento
            </Link>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {initialMetrics.map((m, i) => (
            <ExecutiveCard key={m.title} {...m} index={i} />
          ))}
        </div>

        {/* Events & Notices */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming events */}
          <div className="bg-card rounded-xl shadow-executive p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg">Próximos Eventos</h2>
              <Link to="/admin/agenda" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                Ver todos <ChevronRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {initialEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="w-1 h-10 bg-accent rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.date}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} />
                      {e.time}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0">
                    {e.type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notices */}
          <div className="bg-card rounded-xl shadow-executive p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg">Avisos</h2>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    Marcar todos como lidos
                  </button>
                )}
                <Bell size={16} className="text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              {notices.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    n.read ? "bg-secondary/30" : "bg-accent/10 hover:bg-accent/15 border-l-2 border-accent"
                  }`}
                >
                  <p className="text-sm">{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick access */}
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
      </div>
    </AdminLayout>
  );
}
