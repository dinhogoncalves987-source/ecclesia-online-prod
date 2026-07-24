import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, Users, Calendar, BookOpen, FileText,
  Heart, MessageSquare, UsersRound, Archive, BarChart3, Menu, X,
  Bell, ChevronLeft, ChevronDown, Settings, LogOut, Maximize, Minimize, Globe,
  Shield, User, Building2, Music2, Gavel, Briefcase, ShoppingBag, MessageCircle, Megaphone, ScrollText,
  MessagesSquare, ClipboardList, CreditCard, LayoutGrid, ScanLine, GraduationCap, Landmark, Send
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { useUnreadInternalMessages } from "@/hooks/useUnreadInternalMessages";
import { PresenceProvider } from "@/hooks/usePresence";
import { useOwnProfile } from "@/hooks/useOwnProfile";
import { supabase } from "@/integrations/supabase/client";
import { SupportModeBanner } from "@/components/platform/SupportModeBanner";
import { RequireSupportOrganization } from "@/components/platform/RequireSupportOrganization";
import { useSupportContext } from "@/contexts/SupportContext";
import { isRouteEnabled } from "@/config/modules";
import flagBR from "@/assets/flag-br.png";
import flagUS from "@/assets/flag-us.png";
import flagES from "@/assets/flag-es.png";

const flagMap = { pt: flagBR, en: flagUS, es: flagES } as const;

type NavItem = { icon: React.ElementType; label: string; path: string };
type NavSection = {
  id: string;
  labelKey?: string;
  collapsible?: boolean;
  separator?: boolean;
  items: NavItem[];
};

const SECRETARIA_PATHS = [
  "/admin/membros", "/admin/carteira-ecclesia", "/admin/agenda", "/admin/comunicacao",
  "/admin/grupos", "/admin/escalas", "/admin/documentos",
  "/admin/cartas-recomendacao", "/admin/assembleia-geral", "/admin/oracoes",
  "/admin/chat-secretaria", "/admin/solicitacoes",
];
// Global chat route — lives outside Secretaria, never auto-expands it
const GLOBAL_CHAT_PATH = "/admin/chat";

const PORTARIA_PATHS = ["/admin/porteiro"];

const CONFIG_PATHS = ["/admin/perfil", "/admin/configuracao-igreja"];

const navSections: NavSection[] = [
  {
    id: "main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",  path: "/admin" },
      { icon: MessagesSquare,  label: "Conversas",  path: "/admin/chat" },
    ],
  },
  {
    id: "espiritual",
    separator: true,
    items: [
      { icon: BookOpen, label: "Bíblia Sagrada", path: "/admin/biblia" },
      { icon: Music2, label: "Culto & Louvor", path: "/admin/culto" },
      { icon: Megaphone, label: "Campanhas", path: "/admin/campanhas" },
      // OPERAÇÃO 2 — staging-only (ver src/config/modules.ts); filtrado por
      // isRouteEnabled() abaixo, igual aos demais itens desta seção.
      { icon: GraduationCap, label: "Discipulado", path: "/admin/discipulado" },
      // OPERAÇÃO 3 — mesmo padrão staging-only do Discipulado: visibilidade
      // real controlada por isRouteEnabled() abaixo.
      { icon: Landmark, label: "Teologia", path: "/admin/teologia" },
      // OPERAÇÃO 4 — mesmo padrão staging-only do Discipulado/Teologia:
      // visibilidade real controlada por isRouteEnabled() abaixo.
      { icon: Send, label: "Missões", path: "/admin/missoes" },
    ],
  },
  {
    id: "secretaria",
    labelKey: "Secretaria",
    collapsible: true,
    separator: true,
    items: [
      { icon: Users, label: "Membros", path: "/admin/membros" },
      { icon: CreditCard, label: "Carteira de Membro", path: "/admin/carteira-ecclesia" },
      { icon: ScrollText, label: "Cartas de Recomendação", path: "/admin/cartas-recomendacao" },
      { icon: ClipboardList, label: "Solicitações", path: "/admin/solicitacoes" },
      { icon: Archive, label: "Documentos", path: "/admin/documentos" },
      { icon: MessageSquare, label: "Comunicação", path: "/admin/comunicacao" },
      { icon: Heart, label: "Pedidos de Oração", path: "/admin/oracoes" },
      { icon: Calendar, label: "Agenda", path: "/admin/agenda" },
      { icon: FileText, label: "Escalas", path: "/admin/escalas" },
      { icon: UsersRound, label: "Pequenos Grupos", path: "/admin/grupos" },
      { icon: Gavel, label: "Assembleia Geral", path: "/admin/assembleia-geral" },
    ],
  },
  {
    id: "portaria",
    labelKey: "Portaria",
    collapsible: true,
    separator: true,
    items: [
      { icon: ScanLine, label: "Modo Porteiro", path: "/admin/porteiro" },
    ],
  },
  {
    id: "financeiro",
    separator: true,
    items: [
      { icon: Wallet, label: "Financeiro", path: "/admin/financeiro" },
      { icon: BarChart3, label: "Relatórios", path: "/admin/relatorios" },
    ],
  },
  {
    id: "admin",
    labelKey: "Administração",
    separator: true,
    items: [
      { icon: Building2, label: "Congregações", path: "/admin/congregacoes" },
      { icon: Shield, label: "Gerenciar Acessos", path: "/admin/gerenciar-acessos" },
      { icon: LayoutGrid, label: "Cockpit", path: "/admin/super-admin" },
    ],
  },
  {
    id: "ecossistema",
    labelKey: "Ecossistema",
    separator: true,
    items: [
      { icon: MessageCircle, label: "Comunidade", path: "/admin/comunidade" },
      { icon: ShoppingBag, label: "Marketplace", path: "/admin/marketplace" },
    ],
  },
];

// Mobile bottom nav — max 4 route shortcuts + permanent "Mais" button.
// Never remove Agenda: it is a core church module.
// Finanças and Perfil remain reachable via the "Mais" sidebar overlay.
const mobileNavItems = [
  { icon: LayoutDashboard, label: "Início",  path: "/admin" },
  { icon: Calendar,        label: "Agenda",  path: "/admin/agenda" },
  { icon: MessagesSquare,  label: "Chat",    path: "/admin/chat" },
  { icon: BookOpen,        label: "Bíblia",  path: "/admin/biblia" },
];

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { canAccess, isAdmin, isSuperAdmin } = useRole();
  const { church } = useChurch();
  const { isPlatformUser, isSupportModeActive } = useSupportContext();
  const { unreadCount: unreadChatCount } = useUnreadInternalMessages(church?.id, user?.id);

  // Routes that are platform-level and do NOT require a support org selected
  const UNGUARDED_PLATFORM_PATHS = [
    "/admin",               // Dashboard (shows platform metrics)
    "/admin/super-admin",   // SuperAdmin page
    "/admin/perfil",        // Profile
    "/admin/gerenciar-acessos", // Team manager for super admin
  ];

  // Check if current route needs org context for platform users
  const isGuardedRoute = isPlatformUser
    && !isSupportModeActive
    && !UNGUARDED_PLATFORM_PATHS.some(
        (p) => location.pathname === p || (p !== "/admin" && location.pathname.startsWith(p + "/")),
      );

  const childUnitsNavLabel = (): string => {
    const orgType = church?.organization_type;
    const model   = church?.hierarchy_model;
    if (orgType === "international_convention") {
      if (model === "international_flexible") return t("Campos / Países");
      return church?.top_level_label_plural ?? t("Convenções / Países");
    }
    if (orgType === "national_convention") return church?.top_level_label_plural ?? t("Convenções Estaduais");
    if (orgType === "state_convention") return church?.municipal_level_label_plural ?? t("Matrizes / Sedes");
    if (orgType === "convencao") return church?.municipal_level_label_plural ?? t("Matrizes");
    if (orgType === "matriz" || orgType === "sede") {
      if (model === "single_church") return church?.municipal_level_label ?? t("Minha Igreja");
      if (church?.uses_local_units === false && church?.uses_intermediate_level === false) {
        return church?.municipal_level_label ?? t("Minha unidade");
      }
      if (church?.uses_intermediate_level === false) {
        return church?.local_unit_label_plural ?? t("Unidades locais");
      }
      return church?.intermediate_level_label_plural ?? t("Unidades");
    }
    if (orgType === "setor") return church?.local_unit_label_plural ?? t("Unidades locais");
    if (orgType === "subsede") return church?.local_unit_label_plural ?? t("Congregações");
    return church?.local_unit_label_plural ?? t("Unidades locais");
  };

  // Build resolved sections (applying dynamic Congregações label)
  const resolvedSections: NavSection[] = navSections.map(section => ({
    ...section,
    items: section.items.map(item =>
      item.path === "/admin/congregacoes" && isAdmin
        ? { ...item, label: childUnitsNavLabel() }
        : item
    ),
  }));

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [secretariaExpanded, setSecretariaExpanded] = useState(() =>
    SECRETARIA_PATHS.includes(location.pathname)
  );
  const [portariaExpanded, setPortariaExpanded] = useState(() =>
    PORTARIA_PATHS.includes(location.pathname)
  );
  const [configExpanded, setConfigExpanded] = useState(() =>
    CONFIG_PATHS.includes(location.pathname)
  );

  // Auto-expand Secretaria section when navigating to a secretaria path.
  // Never expand for the global chat route — it lives outside Secretaria.
  useEffect(() => {
    if (location.pathname !== GLOBAL_CHAT_PATH && SECRETARIA_PATHS.includes(location.pathname)) {
      setSecretariaExpanded(true);
    }
    if (PORTARIA_PATHS.includes(location.pathname)) {
      setPortariaExpanded(true);
    }
    if (CONFIG_PATHS.includes(location.pathname)) {
      setConfigExpanded(true);
    }
  }, [location.pathname]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: ownProfile } = useOwnProfile(user?.id);
  const profileName = ownProfile?.full_name ?? "";
  const avatarUrl = ownProfile?.avatar_url ?? null;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    try {
      const doc = document as FullscreenDocument;
      const el = document.documentElement as FullscreenElement;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      }
    } catch { /* not supported */ }
  }, []);

  useEffect(() => {
    const handler = () => {
      const doc = document as FullscreenDocument;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const renderNavSections = (collapsed: boolean, onLinkClick?: () => void) => (
    <nav className="flex-1 px-3 py-2 overflow-y-auto">
      {resolvedSections.map(section => {
        const visibleItems = section.items.filter(item => canAccess(item.path) && isRouteEnabled(item.path));
        if (visibleItems.length === 0) return null;

        const isSecretaria = section.id === "secretaria";
        const isPortaria = section.id === "portaria";
        const isCollapsible = isSecretaria || isPortaria;
        const sectionHasActive = visibleItems.some(i => isActive(i.path));
        const expanded = isCollapsible
          ? (sidebarCollapsed || (isSecretaria ? secretariaExpanded : portariaExpanded))
          : true;

        return (
          <div key={section.id}>
            {section.separator && <div className="my-2 border-t border-border/40" />}

            {/* Section header (label or collapsible trigger) */}
            {section.labelKey && !collapsed && (
              isCollapsible ? (
                <button
                  onClick={() => isSecretaria ? setSecretariaExpanded(v => !v) : setPortariaExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Briefcase size={13} strokeWidth={2} />
                    {t(section.labelKey)}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`transition-transform duration-200 ${isSecretaria ? (secretariaExpanded ? "rotate-0" : "-rotate-90") : (portariaExpanded ? "rotate-0" : "-rotate-90")}`}
                  />
                </button>
              ) : (
                <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t(section.labelKey)}
                </p>
              )
            )}

            {/* Items */}
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="sec-items"
                  initial={isCollapsible ? { height: 0, opacity: 0 } : false}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div className={`space-y-0.5 ${isCollapsible && !collapsed ? "pl-1" : ""}`}>
                    {visibleItems.map(item => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onLinkClick}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                          isActive(item.path)
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        <span className="relative flex-shrink-0">
                          <item.icon
                            size={18}
                            strokeWidth={1.5}
                            className={
                              isActive(item.path) ? "text-accent" : "group-hover:text-foreground"
                            }
                          />
                          {item.path === GLOBAL_CHAT_PATH && unreadChatCount > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                              {unreadChatCount > 99 ? "99+" : unreadChatCount}
                            </span>
                          )}
                        </span>
                        {!collapsed && <span>{t(item.label)}</span>}
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Collapsed: show collapsible section icon trigger */}
            {isCollapsible && collapsed && sectionHasActive && (
              <div className="w-2 h-2 rounded-full bg-accent mx-auto my-1" />
            )}
          </div>
        );
      })}
    </nav>
  );

  const handleSignOut = async () => {
    setShowLogoutConfirm(false);
    await signOut();
    navigate("/");
  };

  const displayName = profileName || user?.email?.split("@")[0] || "Usuário";
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <PresenceProvider organizationId={church?.id} currentUserId={user?.id}>
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-card shadow-executive transition-all duration-300 ${
          sidebarCollapsed ? "w-[72px]" : "w-72"
        }`}
      >
        <Link to="/admin" className="p-4 flex items-center gap-3 h-16">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-serif text-xl">Ω</span>
          </div>
          {!sidebarCollapsed && (
            <span className="font-serif text-xl tracking-tight text-foreground">Ecclesia</span>
          )}
        </Link>

        {renderNavSections(sidebarCollapsed)}

        <div className="p-3 border-t border-border/50 space-y-1">
          {/* Configurações — collapsible section at the bottom */}
          {!sidebarCollapsed ? (
            <div>
              <button
                onClick={() => setConfigExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Settings size={18} strokeWidth={1.5} />
                  {t("Configurações")}
                </span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${configExpanded ? "rotate-0" : "-rotate-90"}`}
                />
              </button>
              {configExpanded && (
                <div className="mt-0.5 space-y-0.5 pl-1">
                  <Link
                    to="/admin/perfil"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
                  >
                    <User size={18} strokeWidth={1.5} /> {t("Meu Perfil")}
                  </Link>
                  {canAccess("/admin/configuracao-igreja") && (
                    <Link
                      to="/admin/configuracao-igreja"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
                    >
                      <Settings size={18} strokeWidth={1.5} /> {t("Configuração da Igreja")}
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setSidebarCollapsed(false); setConfigExpanded(true); }}
              className="flex justify-center py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
              title={t("Configurações")}
            >
              <Settings size={20} strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full ${!sidebarCollapsed ? "" : "justify-center"}`}
          >
            <ChevronLeft
              size={20}
              strokeWidth={1.5}
              className={`transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}
            />
            {!sidebarCollapsed && <span>{t("Recolher")}</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {/*
          Header não é "sticky" no mobile de propósito: no diagnóstico do
          rasgo gráfico em Android/Redmi, a combinação de `position: sticky`
          com o `overflow-y-auto`/`overflow-x-hidden` do <main> abaixo era o
          padrão mais associado ao artefato de composição. Como o header já
          fica fora da área de rolagem interna do <main> no mobile (o <main>
          não cria mais seu próprio scroller ali — ver comentário abaixo),
          "sticky" não tinha efeito posicional nenhum no mobile, só criava um
          contexto de composição extra sem necessidade. Em desktop (`lg:`), o
          <main> volta a rolar internamente e o header permanece sticky.
        */}
        <header className="h-16 bg-card/95 lg:bg-card/80 lg:backdrop-blur-md shadow-[var(--shadow-sm)] flex items-center justify-between px-4 lg:px-8 z-30 lg:sticky lg:top-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
            <div className="hidden sm:block">
              <p className="text-sm text-muted-foreground">{t("Bem-vindo de volta")}</p>
              <p className="text-sm font-medium">{displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language selector */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-sm font-semibold"
              >
                <Globe size={16} />
              </button>
              {langMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 py-1 min-w-[160px]">
                    {([
                      { code: "pt" as const, flag: flagBR, label: "Português" },
                      { code: "en" as const, flag: flagUS, label: "English" },
                      { code: "es" as const, flag: flagES, label: "Español" },
                    ]).map(l => (
                      <button key={l.code} onClick={() => { setLang(l.code); setLangMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary transition-colors ${lang === l.code ? "font-bold text-primary" : ""}`}>
                        <img src={l.flag} alt={l.label} className="w-5 h-5 rounded-sm object-cover" /> {l.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <ThemeToggle />
            <button
              onClick={toggleFullscreen}
              className="hidden sm:flex p-2 rounded-lg hover:bg-secondary transition-colors"
              title={isFullscreen ? t("Sair da tela cheia") : t("Tela cheia")}
            >
              {isFullscreen ? <Minimize size={18} className="text-foreground" /> : <Maximize size={18} className="text-foreground" />}
            </button>
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <Bell size={18} strokeWidth={1.5} />
            </button>
            {/* Profile avatar with dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="w-9 h-9 rounded-full overflow-hidden border-2 border-accent/40 ml-1 flex items-center justify-center text-xs font-medium text-accent bg-accent/20 hover:border-accent transition-colors"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </button>
              {profileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
                    <Link
                      to="/admin/perfil"
                      onClick={() => setProfileMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                    >
                      <User size={16} /> {t("Meu Perfil")}
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin/gerenciar-acessos"
                        onClick={() => setProfileMenuOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                      >
                        <Shield size={16} /> {t("Gerenciar Acessos")}
                      </Link>
                    )}
                    <hr className="my-1 border-border" />
                    <button
                      onClick={() => { setProfileMenuOpen(false); setShowLogoutConfirm(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary transition-colors text-destructive"
                    >
                      <LogOut size={16} /> {t("Sair")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/*
          No mobile, o <main> NÃO cria seu próprio contêiner de rolagem
          (overflow-visible): a página inteira rola pelo documento/body, o
          que evita a combinação sticky+overflow-y-auto+overflow-x-hidden
          identificada como causa provável do rasgo gráfico em Android/Redmi.
          `pb-20` reserva espaço para a navegação inferior fixa. Em desktop
          (`lg:`), o <main> volta a rolar internamente (mais previsível numa
          janela grande, sem o mesmo risco em hardware desktop).
        */}
        <main className="flex-1 overflow-visible pb-20 lg:pb-0 lg:overflow-y-auto lg:overflow-x-hidden">
          {/* Support mode banner — visible for all platform users */}
          <SupportModeBanner />
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {isGuardedRoute
              ? <RequireSupportOrganization>{children}</RequireSupportOrganization>
              : children
            }
          </div>
        </main>
      </div>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/30 z-50 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-y-0 left-0 w-72 bg-card shadow-executive-hover z-50 lg:hidden flex flex-col"
            >
              <div className="p-4 flex items-center justify-between h-16">
                <Link to="/admin" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                  <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-accent font-serif text-xl">Ω</span>
                  </div>
                  <span className="font-serif text-xl tracking-tight">Ecclesia</span>
                </Link>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                  <X size={20} strokeWidth={1.5} />
                </button>
              </div>

              {renderNavSections(false, () => setMobileMenuOpen(false))}

              <div className="p-3 border-t border-border/50 space-y-0.5">
                {/* Configurações — collapsible in mobile too */}
                <button
                  onClick={() => setConfigExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary font-medium"
                >
                  <span className="flex items-center gap-3">
                    <Settings size={20} strokeWidth={1.5} /> {t("Configurações")}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${configExpanded ? "rotate-0" : "-rotate-90"}`}
                  />
                </button>
                {configExpanded && (
                  <div className="space-y-0.5 pl-2">
                    <Link
                      to="/admin/perfil"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary w-full"
                    >
                      <User size={20} strokeWidth={1.5} /> {t("Meu Perfil")}
                    </Link>
                    {canAccess("/admin/configuracao-igreja") && (
                      <Link
                        to="/admin/configuracao-igreja"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary w-full"
                      >
                        <Settings size={20} strokeWidth={1.5} /> {t("Configuração da Igreja")}
                      </Link>
                    )}
                  </div>
                )}
                <button
                  onClick={() => { setMobileMenuOpen(false); setShowLogoutConfirm(true); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary w-full"
                >
                  <LogOut size={20} strokeWidth={1.5} /> {t("Sair")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden h-16 bg-card shadow-[0_-1px_0_0_hsl(var(--border)/0.5)] flex justify-around items-center z-30 fixed bottom-0 left-0 right-0">
        {mobileNavItems.filter(item => canAccess(item.path) && isRouteEnabled(item.path)).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
              isActive(item.path) ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <span className="relative">
              <item.icon size={20} strokeWidth={1.5} />
              {item.path === GLOBAL_CHAT_PATH && unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">{t(item.label)}</span>
          </Link>
        ))}
        {/* Permanent "Mais" button — opens the full sidebar overlay */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
        >
          <Menu size={20} strokeWidth={1.5} />
          <span className="text-[10px] font-medium">{t("Mais")}</span>
        </button>
      </nav>

      {/* Logout confirmation modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/30 z-50"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-card rounded-2xl shadow-xl border border-border p-6 w-full max-w-sm">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <LogOut size={24} className="text-destructive" />
                  </div>
                  <h3 className="font-serif text-lg font-semibold mb-1">{t("Sair da conta")}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{t("Tem certeza que deseja sair? Você precisará fazer login novamente.")}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowLogoutConfirm(false)}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                      {t("Cancelar")}
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {t("Sim, sair")}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    </PresenceProvider>
  );
}
