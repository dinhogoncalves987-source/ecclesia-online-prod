import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BookOpen,
  MessageCircle,
  Users,
  ShoppingBag,
  Heart,
  User,
  Music,
  LayoutDashboard,
  Shield,
  LogOut,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";

const MEMBER_MODULES = [
  {
    icon: BookOpen,
    label: "Bíblia",
    description: "Leitura e assistente bíblico com IA",
    path: "/admin/biblia",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: Heart,
    label: "Orações",
    description: "Comunidade de oração e pedidos",
    path: "/admin/oracoes",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
  {
    icon: MessageCircle,
    label: "Chat",
    description: "Conversa com a sua comunidade",
    path: "/admin/chat",
    color: "text-sky-500",
    bg: "bg-sky-500/10",
  },
  {
    icon: Users,
    label: "Comunidade",
    description: "Grupos e conexões",
    path: "/admin/comunidade",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: ShoppingBag,
    label: "Marketplace",
    description: "Recursos e publicações",
    path: "/admin/marketplace",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Music,
    label: "Louvor",
    description: "Músicas e roteiros de culto",
    path: "/admin/culto",
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    icon: User,
    label: "Meu Perfil",
    description: "Dados pessoais e configurações",
    path: "/admin/perfil",
    color: "text-slate-500",
    bg: "bg-slate-500/10",
  },
];

export default function AppHome() {
  const { user, loading: authLoading } = useAuth();
  const { church, hasActiveMembership } = useChurch();
  const { isSuperAdmin, canonicalRole } = useRole();
  const navigate = useNavigate();
if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Bem-vindo";

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const isAdmin =
    canonicalRole &&
    ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader"].includes(
      canonicalRole,
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
            {initials}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold truncate max-w-[180px]">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">Membro Ecclesia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-serif tracking-tight">
            Olá, {displayName.split(" ")[0]}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Explore os recursos disponíveis para você na plataforma Ecclesia.
          </p>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-2 gap-3">
          {MEMBER_MODULES.map(({ icon: Icon, label, description, path, color, bg }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="group text-left p-4 rounded-xl border border-border/50 bg-card hover:border-accent/40 hover:shadow-md transition-all duration-200 active:scale-[0.98]"
            >
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <Icon size={18} className={color} />
              </div>
              <p className="text-sm font-semibold leading-tight">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{description}</p>
            </button>
          ))}
        </div>

        {/* Admin panel banner */}
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <LayoutDashboard size={18} className="text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Painel Administrativo</p>
                <p className="text-[11px] text-muted-foreground">
                  Acesse a gestão completa da sua organização
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        )}

        {isSuperAdmin && (
          <button
            onClick={() => navigate("/admin/super-admin")}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <Shield size={18} className="text-accent" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Cockpit da Plataforma</p>
                <p className="text-[11px] text-muted-foreground">
                  Central de controle e suporte Ecclesia
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        )}

        {/* Not linked to a church */}
        {!church && !hasActiveMembership && !isSuperAdmin && (
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50 text-center space-y-2">
            <p className="text-sm font-medium">Você ainda não está vinculado a uma igreja</p>
            <p className="text-xs text-muted-foreground">
              Peça ao secretário ou pastor da sua congregação para enviar um convite de acesso.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-[11px] text-muted-foreground/60">
        Ecclesia Online © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
