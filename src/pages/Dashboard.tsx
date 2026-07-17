import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { MatrizDashboard } from "@/components/MatrizDashboard";
import { isModuleEnabled, isRouteEnabled } from "@/config/modules";
import { motion } from "framer-motion";
import { Wallet, Users, TrendingUp, Calendar, Clock, Bell, Plus, ChevronRight, Loader2, Shield, Building2, Globe, BookOpen, Heart, Music2, MessageSquare, FileText } from "lucide-react";
import { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useSupportContext } from "@/contexts/SupportContext";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import { environment } from "@/config/environment";
import { isReviewModeActive } from "@/config/reviewMode";

// FASE 6 (separação de bundle por build): "devotional" é staging-only (ver
// src/config/modules.ts). `import.meta.env.VITE_APP_ENV` é substituído por
// uma string literal em build-time pelo Vite, tornando esta comparação uma
// expressão constante ANTES do tree-shaking do Rollup — o branch morto
// (incluindo o `import()`) nunca entra no grafo de módulos de um build de
// produção. Mesmo padrão de src/App.tsx e src/pages/Financeiro.tsx.
const IS_STAGING_BUILD = import.meta.env.VITE_APP_ENV === "staging";
const DailyDevotional = IS_STAGING_BUILD
  ? lazy(() => import("@/components/DailyDevotional").then((m) => ({ default: m.DailyDevotional })))
  : null;

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
  // Modo Avaliação: esta função ignora o cliente Supabase (Proxy simulável)
  // e monta uma requisição REST crua com `environment.supabaseUrl` — por
  // isso precisa de uma verificação explícita aqui para nunca contatar o
  // Supabase real (produção/staging) enquanto avaliação estiver ativa.
  if (isReviewModeActive()) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const url = new URL(`${environment.supabaseUrl}/rest/v1/platform_announcements`);

  url.searchParams.set("select", "id,title,short_description,image_url,button_label,button_link,is_active,starts_at,ends_at,created_at");
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("and", `(or(starts_at.is.null,starts_at.lte.${nowIso}),or(ends_at.is.null,ends_at.gte.${nowIso}))`);
  url.searchParams.set("order", "created_at.desc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: environment.supabasePublishableKey,
      Authorization: `Bearer ${sessionData.session?.access_token || environment.supabasePublishableKey}`,
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
  const { t, lang } = useLanguage();
  const { church, isMatriz } = useChurch();
  const { canonicalRole, isAdmin, isSuperAdmin, role } = useRole();
  const { isPlatformUser, isSupportModeActive, activeSupportOrg, platformRole } = useSupportContext();
  const isMembro = canonicalRole === "member" || canonicalRole === "leader" || role === "membro" || role === "lider" || role === "obreiro";
  const canViewPlatformCampaigns = isSuperAdmin || canonicalRole === "member";

  // For platform users without support org selected, show platform overview
  const isPlatformOverviewMode = isPlatformUser && !isSupportModeActive;

  const orgType = church?.organization_type ?? null;
  const isInternationalOrg = orgType === "international_convention";
  const isNationalOrg = orgType === "national_convention";
  const isStateOrg    = orgType === "state_convention" || orgType === "convencao";
  const isSingleChurchOrg = church?.hierarchy_model === "single_church";

  /** Subtitle label for current org in dashboard header */
  const orgDashboardSubtitle = (): string => {
    if (isPlatformOverviewMode) return t("Visão global da plataforma Ecclesia");
    if (isSuperAdmin && isSupportModeActive) return `Modo suporte: ${activeSupportOrg?.name ?? ""}`;
    if (isSuperAdmin) return t("Visão global da plataforma");
    if (isInternationalOrg) return "Painel da Organização Internacional";
    if (isNationalOrg) return "Painel da Sede Nacional";
    if (isStateOrg) return `Painel da ${church?.top_level_label ?? "Convenção Estadual"}`;
    if (orgType === "matriz" || orgType === "sede") {
      if (isSingleChurchOrg) return `Painel — ${church?.name ?? "Minha Igreja"}`;
      return `Painel da ${church?.municipal_level_label ?? "Matriz Municipal"}`;
    }
    if (orgType === "setor") return `Painel do ${church?.intermediate_level_label ?? "Setor"}`;
    if (orgType === "congregacao") return `Painel da ${church?.local_unit_label ?? "Congregação"}`;
    if (isMembro) return t("Bem-vindo à sua igreja");
    return t("Visão geral da administração");
  };

  /** Structure nav label for Quick Access card */
  const structureNavLabel = (): { label: string; desc: string } => {
    if (isInternationalOrg) {
      if (church?.hierarchy_model === "international_flexible") {
        return { label: "Campos / Países / Igrejas", desc: "Gerenciar estrutura internacional" };
      }
      return { label: church?.top_level_label_plural ?? "Convenções / Países", desc: "Gerenciar estrutura internacional" };
    }
    if (isNationalOrg) return { label: "Convenções Estaduais", desc: "Gerenciar estrutura nacional" };
    if (isStateOrg) return { label: church?.municipal_level_label_plural ?? "Matrizes / Sedes", desc: "Gerenciar matrizes e sedes" };
    if (orgType === "matriz" || orgType === "sede") {
      if (isSingleChurchOrg) return { label: church?.name ?? "Minha Igreja", desc: "Dados e operações da igreja" };
      const label = church?.intermediate_level_label_plural ?? "Setores";
      return { label, desc: `Gerenciar ${label.toLowerCase()}` };
    }
    const label = church?.local_unit_label_plural ?? "Congregações";
    return { label, desc: `Gerenciar ${label.toLowerCase()}` };
  };
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

      const dateLocale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
      const fmt = (v: number) => {
        if (lang === "en") return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
        if (lang === "es") return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
        return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
      };

      setMetrics([
        { title: t("Receita do Mês"), value: fmt(receita), trend: "", icon: Wallet, href: "/admin/financeiro" },
        { title: t("Despesas do Mês"), value: fmt(despesa), trend: "", icon: TrendingUp, href: "/admin/financeiro" },
        { title: t("Membros Ativos"), value: activeMembers.toString(), icon: Users, href: "/admin/membros" },
        { title: t("Eventos no Mês"), value: eventsCount.toString(), icon: Calendar, href: "/admin/agenda" },
      ]);

      setUpcomingEvents((eventsRes.data || []).map(e => ({
        id: e.id,
        title: e.title,
        date: new Date(e.starts_at).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" }),
        time: new Date(e.starts_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }),
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

  const formatAnnouncementDate = (date: string) => {
    const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
    return new Date(date).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  const getAnnouncementSummary = (announcement: PlatformCampaign) =>
    announcement.short_description || "";

  const renderCampaignBanner = () => {
    if (platformCampaigns.length === 0) return null;

    const campaign = platformCampaigns[activeCampaignIndex] || platformCampaigns[0];
    const actionLabel = campaign.button_label || t("Saiba mais");

    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="overflow-hidden rounded-2xl shadow-executive bg-card border border-border/50"
      >
        {campaign.image_url ? (
          <div className="aspect-[16/9] max-h-[420px] min-h-[190px] w-full overflow-hidden bg-foreground">
            <img src={campaign.image_url} alt={campaign.title} className="h-full w-full object-cover" />
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
            { label: t("Culto & Louvor"), desc: t("Hinos, roteiros e louvor"), path: "/admin/culto", icon: Music2 },
            { label: t("Agenda"), desc: t("Eventos e cultos"), path: "/admin/agenda", icon: Calendar },
            { label: t("Pedidos de Oração"), desc: t("Ore pela igreja"), path: "/admin/oracoes", icon: Heart },
            { label: t("Comunicação"), desc: t("Comunicados da igreja"), path: "/admin/comunicacao", icon: MessageSquare },
            { label: t("Escalas"), desc: t("Escalas de serviço"), path: "/admin/escalas", icon: FileText },
          ]
            // FASE 6: nunca oferecer link de dashboard para módulo staging-only
            // em produção (bíblia/culto ficam fora do bundle e da allowlist).
            .filter((item) => isRouteEnabled(item.path))
            .map((item, i) => (
            <Link key={item.path} to={item.path}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-card rounded-xl p-4 shadow-sm border border-border/50 cursor-pointer hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 mb-2">
                <Globe size={18} className="text-primary" />
              </div>
              <p className="text-xl font-bold">{superMetrics.churches}</p>
              <p className="text-[10px] text-muted-foreground">{t("Total de Igrejas")}</p>
            </motion.div>
          </Link>
          <Link to="/admin/gerenciar-acessos">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
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
      {false && isMatriz && isAdmin && <MatrizDashboard />}

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
              label: structureNavLabel().label,
              desc: structureNavLabel().desc,
              path: "/admin/congregacoes",
              icon: Building2,
            }] : []),
          ].map((item, i) => (
            <Link key={item.path} to={item.path}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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
      <div className="isolate space-y-8 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">
              {church?.name ?? t("Dashboard")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {orgDashboardSubtitle()}
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

        {/* Devocional — em teste, restrito a staging (ver src/config/modules.ts) */}
        {isModuleEnabled("devotional") && DailyDevotional && (
          <Suspense fallback={null}>
            <DailyDevotional />
          </Suspense>
        )}
        {/* Campanhas (FASE 6): widget de dashboard staging-only removido daqui —
            nunca importado estaticamente para não entrar no bundle de produção.
            Módulo continua disponível em /admin/campanhas no build de staging. */}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : !church && !isSuperAdmin && !isPlatformOverviewMode ? (
          /* No church assigned — welcome/onboarding state (regular users only) */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-accent/20 bg-card shadow-executive p-8 text-center max-w-2xl mx-auto"
          >
            <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-accent font-serif text-3xl">Ω</span>
            </div>
            <h2 className="font-serif text-xl mb-2">{t("Bem-vindo ao Ecclesia Admin")}</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              {lang === "en"
                ? "Your account is not linked to a church yet. Ask your administrator to send you an invitation link, or use an existing invite to join your organization."
                : lang === "es"
                  ? "Tu cuenta aún no está vinculada a una iglesia. Pide a tu administrador que te envíe un enlace de invitación o usa uno existente para unirte a tu organización."
                  : "Sua conta ainda não está vinculada a uma igreja. Peça ao seu administrador que envie um link de convite, ou utilize um convite existente para ingressar na sua organização."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left mt-2">
              {[
                { icon: BookOpen, title: lang === "en" ? "AI Bible Assistant" : lang === "es" ? "Asistente Bíblico IA" : "Assistente Bíblico IA", desc: lang === "en" ? "Chat with a pastoral AI guide" : lang === "es" ? "Conversa con un guía pastoral IA" : "Converse com um guia pastoral IA", href: "/admin/biblia" },
                { icon: Music2,   title: lang === "en" ? "Worship" : lang === "es" ? "Culto y Alabanza" : "Culto & Louvor", desc: lang === "en" ? "Hymns, worship orders & AI" : lang === "es" ? "Himnos, roteiros y IA" : "Hinos, roteiros e IA", href: "/admin/culto" },
                { icon: Heart,    title: lang === "en" ? "Prayer Requests" : lang === "es" ? "Pedidos de Oración" : "Pedidos de Oração", desc: lang === "en" ? "Pray with your community" : lang === "es" ? "Ora con tu comunidad" : "Ore com sua comunidade", href: "/admin/oracoes" },
              ]
                // FASE 6: onboarding de produção não pode linkar módulo staging-only.
                .filter(item => isRouteEnabled(item.href))
                .map(item => (
                <Link key={item.href} to={item.href}
                  className="p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors flex flex-col gap-2">
                  <item.icon size={18} className="text-accent" strokeWidth={1.5} />
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </Link>
              ))}
            </div>
          </motion.div>
        ) : (
          (isAdmin || isPlatformOverviewMode) ? renderAdminDashboard() : renderMembroDashboard()
        )}
      </div>
    </AdminLayout>
  );
}