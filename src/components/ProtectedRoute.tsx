import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { Loader2 } from "lucide-react";

const MEMBER_ACCESSIBLE_PATHS = [
  "/admin",
  "/admin/biblia",
  "/admin/oracoes",
  "/admin/chat",
  "/admin/comunicacao",
  "/admin/agenda",
  "/admin/escalas",
  "/admin/assembleia-geral",
  "/admin/cartas-recomendacao",
  "/admin/campanhas",
  "/admin/culto",
  "/admin/perfil",
  "/admin/marketplace",
  "/admin/comunidade",
];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { canAccess, canonicalRole, loading: roleLoading } = useRole();
  const { loading: churchLoading } = useChurch();

  if (loading || (user && (roleLoading || churchLoading))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isInitialEntry = location.pathname === "/admin" && new URLSearchParams(location.search).get("entry") === "1";

  const isMemberAccessiblePath = MEMBER_ACCESSIBLE_PATHS.some((p) =>
    location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  if (!canonicalRole) {
    if (isInitialEntry) {
      return <Navigate to="/admin/biblia" replace />;
    }

    if (isMemberAccessiblePath) {
      return <>{children}</>;
    }

    return <Navigate to="/admin" replace />;
  }

  if (!canAccess(location.pathname)) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
