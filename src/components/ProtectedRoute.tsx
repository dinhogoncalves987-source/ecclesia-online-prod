import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { OrganizationPending } from "@/components/OrganizationPending";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { canAccess, canonicalRole, isSuperAdmin, loading: roleLoading } = useRole();
  const { church, loading: churchLoading } = useChurch();

  if (loading || (user && (roleLoading || churchLoading || !canonicalRole))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!church && !isSuperAdmin) {
    return <OrganizationPending />;
  }

  if (!canAccess(location.pathname)) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
