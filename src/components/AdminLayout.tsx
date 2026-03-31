import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, Users, Calendar, BookOpen, FileText,
  Heart, MessageSquare, UsersRound, Archive, BarChart3, Menu, X,
  Bell, ChevronLeft, Settings, LogOut, Maximize, Minimize, Globe,
  Shield, User, Building2, Music, Gavel
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurch";
import { supabase } from "@/integrations/supabase/client";
import flagBR from "@/assets/flag-br.png";
import flagUS from "@/assets/flag-us.png";
import flagES from "@/assets/flag-es.png";

const flagMap = { pt: flagBR, en: flagUS, es: flagES } as const;

const baseNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: BookOpen, label: "Bíblia Sagrada", path: "/admin/biblia" },
  { icon: Music, label: "Harpa", path: "/admin/hinario" },
  { icon: Wallet, label: "Financeiro", path: "/admin/financeiro" },
  { icon: Users, label: "Membros", path: "/admin/membros" },
  { icon: Calendar, label: "Agenda", path: "/admin/agenda" },
  { icon: Heart, label: "Pedidos de Oração", path: "/admin/oracoes" },
  { icon: MessageSquare, label: "Comunicação", path: "/admin/comunicacao" },
  { icon: UsersRound, label: "Pequenos Grupos", path: "/admin/grupos" },
  { icon: Archive, label: "Documentos", path: "/admin/documentos" },
  { icon: Gavel, label: "Assembleia Geral", path: "/admin/assembleia-geral" },
  { icon: BarChart3, label: "Relatórios", path: "/admin/relatorios" },
  { icon: FileText, label: "Escalas", path: "/admin/escalas" },
  { icon: Shield, label: "Gerenciar Acessos", path: "/admin/gerenciar-acessos" },
  { icon: Building2, label: "Congregações", path: "/admin/congregacoes" },
  { icon: Globe, label: "Super Admin", path: "/admin/super-admin" },
];

const mobileNavItems = [
  { icon: LayoutDashboard, label: "Início", path: "/admin" },
  { icon: Wallet, label: "Finanças", path: "/admin/financeiro" },
  { icon: Calendar, label: "Agenda", path: "/admin/agenda" },
  { icon: BookOpen, label: "Bíblia", path: "/admin/biblia" },
  { icon: User, label: "Perfil", path: "/admin/perfil" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { canAccess, isAdmin, isSuperAdmin } = useRole();
  const { isMatriz } = useChurch();

  // Build nav items - rename "Congregações" to "Admin Matriz" for matriz admins
  const navItems = baseNavItems.map(item => {
    if (item.path === "/admin/congregacoes" && isMatriz && isAdmin) {
      return { ...item, label: "Admin Matriz" };
    }
    return item;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    try {
      const doc = document as any;
      const el = document.documentElement as any;
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
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setProfileName(data.full_name);
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    setShowLogoutConfirm(false);
    await signOut();
    navigate("/");
  };

  const displayName = profileName || user?.email?.split("@")[0] || "Usuário";
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-card shadow-executive transition-all duration-300 ${
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

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.filter(item => canAccess(item.path)).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive(item.path)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <item.icon
                size={20}
                strokeWidth={1.5}
                className={`flex-shrink-0 ${
                  isActive(item.path) ? "text-accent" : "group-hover:text-foreground"
                }`}
              />
              {!sidebarCollapsed && <span>{t(item.label)}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border/50">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
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
        <header className="h-16 bg-card/80 backdrop-blur-md shadow-[var(--shadow-sm)] flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
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
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors relative">
              <Bell size={18} strokeWidth={1.5} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
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

        {/* Fullscreen button below header */}
        <div className="flex justify-end px-4 lg:px-8 pt-2">
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
            title={isFullscreen ? t("Sair da tela cheia") : t("Tela cheia")}
          >
            {isFullscreen ? <Minimize size={18} className="text-foreground" /> : <Maximize size={18} className="text-foreground" />}
          </button>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
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
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
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

              <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
                {navItems.filter(item => canAccess(item.path)).map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive(item.path)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <item.icon size={20} strokeWidth={1.5} className={isActive(item.path) ? "text-accent" : ""} />
                    <span>{t(item.label)}</span>
                  </Link>
                ))}
              </nav>

              <div className="p-3 border-t border-border/50 space-y-0.5">
                <Link
                  to="/admin/perfil"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary w-full"
                >
                  <Settings size={20} strokeWidth={1.5} /> {t("Configurações")}
                </Link>
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
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-md shadow-[0_-1px_0_0_hsl(var(--border)/0.5)] flex justify-around items-center z-30">
        {mobileNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
              isActive(item.path) ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <item.icon size={20} strokeWidth={1.5} />
            <span className="text-[10px] font-medium">{t(item.label)}</span>
          </Link>
        ))}
      </nav>

      {/* Logout confirmation modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50"
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
  );
}
