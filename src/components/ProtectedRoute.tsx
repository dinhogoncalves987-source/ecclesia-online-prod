import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { Loader2 } from "lucide-react";

const UNIVERSAL_MEMBER_PATHS = [
  "/admin/biblia",
  "/admin/oracoes",
  "/admin/chat",
  "/admin/chat-secretaria",
  "/admin/comunidade",
  "/admin/marketplace",
  "/admin/culto",
  "/admin/perfil",
  "/admin/campanhas",
];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { canAccess, isSuperAdmin, loading: roleLoading } = useRole();
  const { church, hasActiveMembership, loading: churchLoading } = useChurch();

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

  const isUniversalPath = UNIVERSAL_MEMBER_PATHS.some((p) =>
    location.pathname.startsWith(p),
  );

  if (!church && !isSuperAdmin && !hasActiveMembership) {
    if (isUniversalPath) {
      return <>{children}</>;
    }

    return <Navigate to="/app" replace />;
  }

  if (!canAccess(location.pathname)) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
