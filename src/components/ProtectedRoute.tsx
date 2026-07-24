import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { AppBootScreen } from "@/components/AppBootScreen";
import { ReconnectScreen } from "@/components/ReconnectScreen";
import { markBoot } from "@/lib/bootPerf";

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
  "/tv",
  "/canal",
  "/video",
  "/admin/perfil",
  "/admin/marketplace",
  "/admin/comunidade",
  "/admin/carteira-ecclesia",
];

// Ordered list of candidate landing routes. When the user lands on a route
// their role can't access (e.g. the generic "/admin" after login, for a role
// like "porteiro" that has no dashboard access), we walk this list and send
// them to the first one they DO have access to — instead of bouncing back to
// the same blocked route, which would render a blank screen forever.
const FALLBACK_ROUTE_PRIORITY = [
  "/admin",
  "/admin/porteiro",
  "/admin/carteira-ecclesia",
  "/admin/biblia",
  "/admin/perfil",
];

function NoAccessFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Seu acesso ainda não possui uma área liberada. Fale com a secretaria.
      </p>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, loading, connectionIssue, retryConnection } = useAuth();
  const { canAccess, canonicalRole, loading: roleLoading, bootstrapError: roleBootstrapError, retryBootstrap: retryRole } = useRole();
  const { loading: churchLoading, bootstrapError: churchBootstrapError, retryBootstrap: retryChurch } = useChurch();
  const readyMarkedRef = useRef(false);

  const isReady = !loading && Boolean(user) && !roleLoading && !churchLoading;
  useEffect(() => {
    if (isReady && !readyMarkedRef.current) {
      readyMarkedRef.current = true;
      markBoot("admin route ready");
    }
  }, [isReady]);

  // A persisted session exists but couldn't be confirmed (offline/timeout):
  // never fall through to the login form or a permission-based redirect —
  // show a recoverable reconnect screen instead. See PROBLEMA CRÍTICO 1.
  if (connectionIssue) {
    return <ReconnectScreen onRetry={retryConnection} />;
  }

  // The shared bootstrap query (role/membership data) really failed — never
  // interpret this as "no permission"/"no organization". See PROBLEMA
  // CRÍTICO 2.
  if (user && (roleBootstrapError || churchBootstrapError)) {
    return (
      <ReconnectScreen
        onRetry={() => {
          retryRole();
          retryChurch();
        }}
        description="Não foi possível confirmar suas permissões de acesso. Verifique sua internet e tente novamente."
      />
    );
  }

  if (loading || (user && (roleLoading || churchLoading))) {
    return <AppBootScreen />;
  }

  if (!user) {
    // Preserve the originally requested route so Login can send the user
    // back to it after a successful sign-in, instead of always landing on
    // the generic /admin.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isInitialEntry = location.pathname === "/admin" && new URLSearchParams(location.search).get("entry") === "1";

  const isMemberAccessiblePath = MEMBER_ACCESSIBLE_PATHS.some((p) =>
    location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  // Defensive/legacy path: canonicalRole is only null while roleLoading is
  // true (already handled above), but keep this guard in case that ever
  // changes so we never fall through without a decision.
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
    const fallbackRoute = FALLBACK_ROUTE_PRIORITY.find((p) => canAccess(p));

    // No candidate route is accessible for this role at all — show a clear
    // message instead of an endless/blank redirect loop.
    if (!fallbackRoute) {
      return <NoAccessFallback />;
    }

    // Already on the only accessible route (shouldn't happen given canAccess
    // just returned false for it, but guarded to avoid any redirect loop).
    if (fallbackRoute === location.pathname) {
      return <>{children}</>;
    }

    return <Navigate to={fallbackRoute} replace />;
  }

  return <>{children}</>;
}
