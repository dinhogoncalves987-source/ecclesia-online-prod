import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, Users, Calendar, BookOpen, FileText,
  Heart, MessageSquare, UsersRound, Archive, BarChart3, Menu, X,
  Bell, ChevronLeft, Settings, LogOut, Maximize, Minimize
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Wallet, label: "Financeiro", path: "/admin/financeiro" },
  { icon: Users, label: "Membros", path: "/admin/membros" },
  { icon: Calendar, label: "Agenda", path: "/admin/agenda" },
  { icon: BookOpen, label: "Bíblia Sagrada", path: "/admin/biblia" },
  { icon: Heart, label: "Pedidos de Oração", path: "/admin/oracoes" },
  { icon: MessageSquare, label: "Comunicação", path: "/admin/comunicacao" },
  { icon: UsersRound, label: "Pequenos Grupos", path: "/admin/grupos" },
  { icon: Archive, label: "Documentos", path: "/admin/documentos" },
  { icon: BarChart3, label: "Relatórios", path: "/admin/relatorios" },
  { icon: FileText, label: "Escalas", path: "/admin/escalas" },
];

const mobileNavItems = [
  { icon: LayoutDashboard, label: "Início", path: "/admin" },
  { icon: Wallet, label: "Finanças", path: "/admin/financeiro" },
  { icon: Calendar, label: "Agenda", path: "/admin/agenda" },
  { icon: BookOpen, label: "Bíblia", path: "/admin/biblia" },
  { icon: Users, label: "Perfil", path: "/admin/membros" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setProfileName(data.full_name);
      });
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
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
        <div className="p-4 flex items-center gap-3 h-16">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-serif text-xl">Ω</span>
          </div>
          {!sidebarCollapsed && (
            <span className="font-serif text-xl tracking-tight text-foreground">Ecclesia</span>
          )}
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
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
              {!sidebarCollapsed && <span>{item.label}</span>}
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
            {!sidebarCollapsed && <span>Recolher</span>}
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
              <p className="text-sm text-muted-foreground">Bem-vindo de volta</p>
              <p className="text-sm font-medium">{displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors relative">
              <Bell size={18} strokeWidth={1.5} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
            </button>
            <div className="w-9 h-9 rounded-full bg-accent/20 border-2 border-accent/40 ml-1 flex items-center justify-center text-xs font-medium text-accent">
              {initials}
            </div>
          </div>
        </header>

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
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-accent font-serif text-xl">Ω</span>
                  </div>
                  <span className="font-serif text-xl tracking-tight">Ecclesia</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                  <X size={20} strokeWidth={1.5} />
                </button>
              </div>

              <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => (
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
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>

              <div className="p-3 border-t border-border/50 space-y-0.5">
                <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary w-full">
                  <Settings size={20} strokeWidth={1.5} /> Configurações
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary w-full"
                >
                  <LogOut size={20} strokeWidth={1.5} /> Sair
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
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
