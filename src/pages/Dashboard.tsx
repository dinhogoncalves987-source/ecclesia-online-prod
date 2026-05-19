import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { MatrizDashboard } from "@/components/MatrizDashboard";
import { DailyDevotional } from "@/components/DailyDevotional";
import { motion } from "framer-motion";
import { Wallet, Users, TrendingUp, Calendar, Clock, Bell, Plus, ChevronRight, Loader2, Shield, Building2, Globe, BookOpen, Heart, Music, MessageSquare, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";

interface PlatformCampaign {
  id: string;
  title: string;
  short_description: string | null;
  image_url: string | null;
  button_label: string | null;
  button_link: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

type PlatformCampaignSelect = Pick<
  PlatformCampaign,
  "id" | "title" | "short_description" | "image_url" | "button_label" | "button_link" | "is_active" | "starts_at" | "ends_at" | "created_at"
>;

const isPlatformCampaign = (value: unknown): value is PlatformCampaign => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.is_active === "boolean" &&
    typeof item.created_at === "string"
  );
};

const loadPlatformAnnouncements = async (nowIso: string): Promise<PlatformCampaignSelect[]> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/platform_announcements`);

  url.searchParams.set("select", "id,title,short_description,image_url,button_label,button_link,is_active,starts_at,ends_at,created_at");
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("and", `(or(starts_at.is.null,starts_at.lte.${nowIso}),or(ends_at.is.null,ends_at.gte.${nowIso}))`);
  url.searchParams.set("order", "created_at.desc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${sessionData.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (!errorText.includes("platform_announcements")) {
      console.error("Erro ao carregar anúncios da plataforma", errorText);
    }
    return [];
  }

  const data: unknown = await response.json();
  return Array.isArray(data) ? data.filter(isPlatformCampaign) : [];
};

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church, isMatriz } = useChurch();
  const { canonicalRole, isAdmin, isSuperAdmin, role } = useRole();
  const isMembro = canonicalRole === "member" || canonicalRole === "leader" || role === "membro" || role === "lider" || role === "obreiro";
  const canViewPlatformCampaigns = isSuperAdmin || canonicalRole === "member";
  const [platformNotices, setPlatformNotices] = useState<PlatformCampaign[]>([]);
  const platformCampaigns = platformNotices;
  const [activeCampaignIndex, setActiveCampaignIndex] = useState(0);
  const [metrics, setMetrics] = useState([
    { title: t("Receita do Mês"), value: "R$ 0", trend: "", icon: Wallet, href: "/admin/financeiro" },
    { title: t("Despesas do Mês"), value: "R$ 0", trend: "", icon: TrendingUp, href: "/admin/financeiro" },
    { title: t("Membros Ativos"), value: "0", icon: Users, href: "/admin/membros" },
    { title: t("Eventos no Mês"), value: "0", icon: Calendar, href: "/admin/agenda" },
  ]);
  const [superMetrics, setSuperMetrics] = useState<{ churches: number; users: number } | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<{ id: string; title: string; date: string; time: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const nowIso = new Date().toISOString();

      const activeAnnouncements = await loadPlatformAnnouncements(nowIso);
      setPlatformNotices(activeAnnouncements);
      setActiveCampaignIndex(0);

      if (isSuperAdmin) {
        const [churchCount, userCount] = await Promise.all([
          supabase.from("organizations").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
        ]);
        setSuperMetrics({ churches: churchCount.count || 0, users: userCount.count || 0 });
      }

      if (!church) { setLoading(false); return; }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
      const todayStr = now.toISOString().split("T")[0];

      const [txRes, membersRes, eventsRes] = await Promise.all([
        runScopedOrganizationQuery<Array<{ type: string; amount: number }>>("transactions", church.id, query =>
          query.select("type, amount").gte("date", startDate).lte("date", endDate)
        ),
        runScopedOrganizationQuery<Array<{ id: string; status: string }>>("members", church.id, query =>
          query.select("id, status")
        ),
        runScopedOrganizationQuery<Array<{ id: string; title: string; starts_at: string }>>("events", church.id, query =>
          query.select("id, title, starts_at").gte("starts_at", `${todayStr}T00:00:00`).order("starts_at").limit(5)
        ),
      ]);

      const txData = txRes.data || [];
      const receita = txData.filter(t => t.type === "Entrada").reduce((s, t) => s + Number(t.amount), 0);
      const despesa = txData.filter(t => t.type === "Saída").reduce((s, t) => s + Number(t.amount), 0);
      const activeMembers = (membersRes.data || []).filter(m => m.status === "Ativo").length;

      const eventsThisMonthRes = await runScopedOrganizationQuery<Array<{ id: string }>>("events", church.id, query =>
        query.select("id").gte("starts_at", `${startDate}T00:00:00`).lte("starts_at", `${endDate}T23:59:59`)
      );
      const eventsCount = (eventsThisMonthRes.data || []).length;

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;

      setMetrics([
        { title: t("Receita do Mês"), value: fmt(receita), trend: "", icon: Wallet, href: "/admin/financeiro" },
        { title: t("Despesas do Mês"), value: fmt(despesa), trend: "", icon: TrendingUp, href: "/admin/financeiro" },
        { title: t("Membros Ativos"), value: activeMembers.toString(), icon: Users, href: "/admin/membros" },
        { title: t("Eventos no Mês"), value: eventsCount.toString(), icon: Calendar, href: "/admin/agenda" },
      ]);

      setUpcomingEvents((eventsRes.data || []).map(e => ({
        id: e.id,
        title: e.title,
        date: new Date(e.starts_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" }),
        time: new Date(e.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      })));

      setLoading(false);
    };
    load();
  }, [user, church, t, isSuperAdmin]);

  useEffect(() => {
    if (platformCampaigns.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveCampaignIndex(index => (index + 1) % platformCampaigns.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [platformCampaigns.length]);

  const formatAnnouncementDate = (date: string) =>
    new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  const getAnnouncementSummary = (announcement: PlatformCampaign) =>
    announcement.short_description || "";

  const renderCampaignBanner = () => {
    if (platformCampaigns.length === 0) return null;

    const campaign = platformCampaigns[activeCampaignIndex] || platformCampaigns[0];
    const actionLabel = campaign.button_label || t("Saiba mais");

    return (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="overflow-hidden rounded-2xl shadow-executive bg-card border border-border/50"
      >
        {campaign.image_url ? (
          <div className="aspect-[16/9] max-h-[420px] min-h-[190px] w-full overflow-hidden bg-foreground">
            <img src={campaign.image_url} alt={campaign.title} className="h-full w-full object-fill" />
          </div>
        ) : (
          <div className="flex aspect-[16/9] max-h-[420px] min-h-[190px] w-full items-center justify-center bg-gradient-to-br from-foreground via-foreground/90 to-accent/50 px-5 text-center">
            <Heart size={36} className="text-white/75" />
          </div>
        )}

        <div className="p-5 sm:p-6">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
              <Heart size={12} /> {t("Campanha missionária")}
            </span>
            <h2 className="mt-3 font-serif text-2xl sm:text-3xl text-foreground leading-tight">{campaign.title}</h2>
            {campaign.short_description && (
              <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">{campaign.short_description}</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {campaign.button_link && (
                <a href={campaign.button_link} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90">
                  {actionLabel} <ChevronRight size={16} />
                </a>
              )}
              {platformCampaigns.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {platformCampaigns.map((item, index) => (
                    <button key={item.id} type="button" onClick={() => setActiveCampaignIndex(index)}
                      className={`h-1.5 rounded-full transition-all ${index === activeCampaignIndex ? "w-6 bg-accent" : "w-2 bg-muted-foreground/35"}`}
                      aria-label={`${t("Campanha")} ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.section>
    );
  };

  // Member-only dashboard
  const renderMembroDashboard = () => (
    <>
      {/* Events */}
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
            <Link key={e.id} to="/admin/agenda" className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
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
            </Link>
          ))}
        </div>
      </div>

      {/* Notices */}
      {platformNotices.length > 0 && (
        <div className="bg-card rounded-xl shadow-executive p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg">{t("Avisos da Igreja")}</h2>
              <span className="text-[10px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">{platformNotices.length}</span>
            </div>
            <Bell size={16} className="text-muted-foreground" />
          </div>
          <div className="space-y-2">
            {platformNotices.map((n) => (
              <div key={n.id}
                className="p-3 rounded-lg transition-colors bg-secondary/30">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{n.title}</p>
                </div>
                {getAnnouncementSummary(n) && (
                  <p className="text-xs text-muted-foreground mt-1">{getAnnouncementSummary(n)}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{formatAnnouncementDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Access for members */}
      <div>
        <h2 className="font-serif text-lg mb-3">{t("Acesso Rápido")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { label: t("Bíblia Sagrada"), desc: t("Leia e medite na Palavra"), path: "/admin/biblia", icon: BookOpen },
            { label: t("Harpa"), desc: t("Hinário digital com áudio"), path: "/admin/hinario", icon: Music },
            { label: t("Agenda"), desc: t("Eventos e cultos"), path: "/admin/agenda", icon: Calendar },
            { label: t("Pedidos de Oração"), desc: t("Ore pela igreja"), path: "/admin/oracoes", icon: Heart },
            { label: t("Comunicação"), desc: t("Comunicados da igreja"), path: "/admin/comunicacao", icon: MessageSquare },
            { label: t("Escalas"), desc: t("Escalas de serviço"), path: "/admin/escalas", icon: FileText },
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
  );

  // Admin / SuperAdmin dashboard
  const renderAdminDashboard = () => (
    <>
      {/* Super Admin global metrics */}
      {isSuperAdmin && superMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link to="/admin/super-admin">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-xl p-4 shadow-sm border border-border/50 cursor-pointer hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 mb-2">
                <Globe size={18} className="text-primary" />
              </div>
              <p className="text-xl font-bold">{superMetrics.churches}</p>
              <p className="text-[10px] text-muted-foreground">{t("Total de Igrejas")}</p>
            </motion.div>
          </Link>
          <Link to="/admin/gerenciar-acessos">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-card rounded-xl p-4 shadow-sm border border-border/50 cursor-pointer hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent/10 mb-2">
                <Users size={18} className="text-accent" />
              </div>
              <p className="text-xl font-bold">{superMetrics.users}</p>
              <p className="text-[10px] text-muted-foreground">{t("Total de Usuários")}</p>
            </motion.div>
          </Link>
        </div>
      )}

      {/* Church metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <ExecutiveCard key={m.title} {...m} index={i} />
        ))}
      </div>

      {/* Matriz consolidated panel */}
      {isMatriz && isAdmin && <MatrizDashboard />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events - clickable */}
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
              <Link key={e.id} to="/admin/agenda" className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
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
              </Link>
            ))}
          </div>
        </div>

        {/* Notices - clickable */}
        <div className="bg-card rounded-xl shadow-executive p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg">{t("Avisos")}</h2>
              {platformNotices.length > 0 && (
                <span className="text-[10px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">{platformNotices.length}</span>
              )}
            </div>
            {isSuperAdmin && (
              <Link to="/admin/super-admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                {t("Gerenciar")} <ChevronRight size={12} />
              </Link>
            )}
          </div>
          <div className="space-y-2">
            {platformNotices.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("Nenhum aviso")}</p>
            )}
            {platformNotices.map((n) => (
              <div key={n.id}
                className="p-3 rounded-lg transition-colors bg-secondary/30">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{n.title}</p>
                </div>
                {getAnnouncementSummary(n) && (
                  <p className="text-xs text-muted-foreground mt-1">{getAnnouncementSummary(n)}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{formatAnnouncementDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick access */}
      <div>
        <h2 className="font-serif text-lg mb-3">{t("Acesso Rápido")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ...(isSuperAdmin ? [{ label: t("Super Admin"), desc: t("Gestão global da plataforma"), path: "/admin/super-admin", icon: Shield }] : []),
            { label: t("Financeiro"), desc: t("Controle financeiro e relatórios"), path: "/admin/financeiro", icon: Wallet },
            { label: t("Membros"), desc: t("Cadastro e gestão de membros"), path: "/admin/membros", icon: Users },
            { label: t("Agenda"), desc: t("Calendário e eventos da igreja"), path: "/admin/agenda", icon: Calendar },
            ...(isAdmin ? [{
              label: church?.organization_type === "convencao" ? "Matrizes"
                : church?.organization_type === "matriz" ? "Setores"
                : "Congregações",
              desc: church?.organization_type === "convencao" ? "Gerenciar matrizes municipais"
                : church?.organization_type === "matriz" ? "Gerenciar setores"
                : "Gerenciar congregações",
              path: "/admin/congregacoes",
              icon: Building2,
            }] : []),
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
  );

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Dashboard")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isSuperAdmin ? t("Visão global da plataforma") : isMembro ? t("Bem-vindo à sua igreja") : t("Visão geral da administração")}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {isSuperAdmin && (
                <Link to="/admin/super-admin" className="inline-flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-opacity">
                  <Shield size={16} strokeWidth={1.5} /> {t("Painel da Plataforma")}
                </Link>
              )}
              <Link to="/admin/agenda" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <Plus size={16} strokeWidth={1.5} /> {t("Novo Evento")}
              </Link>
            </div>
          )}
        </div>

        {/* Daily Devotional - always visible */}
        <DailyDevotional />
        {!loading && canViewPlatformCampaigns && renderCampaignBanner()}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          isAdmin ? renderAdminDashboard() : renderMembroDashboard()
        )}
      </div>
    </AdminLayout>
  );
}
