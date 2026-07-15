import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useChurch } from "./useChurchContext";
import { useAuthBootstrap } from "./useAuthBootstrap";
import { markBoot } from "@/lib/bootPerf";
import {
  CANONICAL_ROLES,
  getHighestRole,
  hasPermission,
  normalizeRole,
  type AdminRole,
  type LegacyAppRole,
} from "@/lib/permissions";

export type AppRole = LegacyAppRole;

// Which roles can access which modules
const MODULE_ACCESS: Record<string, AppRole[]> = {
  "/admin": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  // Campanhas: all roles can view; create/edit is gated inside the page via CAMPAIGN_MANAGE_ROLES
  "/admin/campanhas": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/financeiro": ["super_admin", "church_admin", "tesoureiro", "contador"],
  "/admin/membros": ["super_admin", "church_admin", "pastor", "secretary"],
  "/admin/agenda": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  // Institutional modules - every authenticated user must see these in the menu
  "/admin/biblia": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/culto": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/culto/biblioteca": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/culto/roteiros": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/culto/telao": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/culto/assistente": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/oracoes": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/comunicacao": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/grupos": ["super_admin", "church_admin", "pastor", "secretary", "leader"],
  "/admin/documentos": ["super_admin", "church_admin", "pastor", "secretary", "leader"],
  "/admin/cartas-recomendacao": ["super_admin", "church_admin", "pastor", "secretary", "member"],
  "/admin/relatorios": ["super_admin", "church_admin", "tesoureiro", "contador"],
  "/admin/assembleia-geral": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/escalas": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/perfil": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/gerenciar-acessos": ["super_admin", "church_admin"],
  "/admin/congregacoes": ["super_admin", "church_admin"],
  "/admin/configuracao-igreja": ["super_admin", "church_admin"],
  "/admin/super-admin": ["super_admin"],
  "/admin/marketplace": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/comunidade": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/chat":            ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/chat-secretaria": ["super_admin", "church_admin", "pastor", "secretary"],
  "/admin/solicitacoes": ["super_admin", "church_admin", "pastor", "secretary"],
  "/admin/carteira-ecclesia": ["super_admin", "church_admin", "pastor", "secretary", "member"],
  "/admin/porteiro": ["porteiro"],
};

/**
 * Roles that represent an ADDITIONAL capability granted on top of a person's
 * base identity, never a replacement for it. A person authorized as
 * "porteiro" is still fundamentally a member (or admin/pastor/etc.) of the
 * church — they just gain one extra button/route. So these roles are always
 * excluded when computing the base `canonicalRole`/`role` (which drives the
 * whole menu and module access), and are tracked separately in `extraRoles`
 * instead. If no other role remains after excluding them, the base identity
 * falls back to "member" — nobody is "just a porteiro", they are a member of
 * the church who also has porteiro authorization.
 *
 * This list is designed to grow (e.g. "tesoureiro", "secretary" as extra
 * capabilities on top of "member") without changing this mechanism.
 */
const EXTRA_CAPABILITY_ROLES: AdminRole[] = ["porteiro"];

export function useRole() {
  const { user } = useAuth();
  const { activeChurchId, loading: churchLoading } = useChurch();
  // Bootstrap already fetched user_roles + organization_users + profiles in
  // a single parallel round when the user signed in (see useAuthBootstrap) —
  // no additional Supabase query is needed here, this hook only computes
  // the effective role from data that's already in memory.
  const { data: bootstrap, loading: bootstrapLoading, isError: bootstrapIsError, refetch: refetchBootstrap } = useAuthBootstrap(user?.id);
  const [role, setRole] = useState<AppRole | null>(null);
  const [canonicalRole, setCanonicalRole] = useState<AdminRole | null>(null);
  const [extraRoles, setExtraRoles] = useState<Set<AdminRole>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setCanonicalRole(null);
      setExtraRoles(new Set());
      setLoading(false);
      return;
    }

    if (bootstrapIsError) {
      // A REAL failure upstream — never recompute the role as "member" from
      // this. Keep whatever role was last successfully resolved (possibly
      // still null, if we never resolved one) and settle `loading` so
      // ProtectedRoute can show a recoverable error state instead of
      // silently downgrading access.
      setLoading(false);
      return;
    }

    if (churchLoading || bootstrapLoading || !bootstrap) {
      setLoading(true);
      return;
    }

    setLoading(true);

    const legacyRows = bootstrap.userRoles as Array<{ role: AppRole; organization_id?: string | null }>;
    const organizationRows = bootstrap.memberships as Array<{ role: AppRole; organization_id: string | null }>;
    const rows: Array<{ role: AppRole; organization_id?: string | null }> = [
      // A autoridade global não vem de profiles.platform_role nem de uma
      // linha legada em user_roles. O backend usa exclusivamente
      // super_admins (isPlatformAdmin), então o frontend deve espelhar a
      // mesma regra e nunca conceder a rota /admin/super-admin por uma fonte
      // que o próprio backend não reconhece como autoridade raiz.
      ...legacyRows.filter((row) => normalizeRole(row.role) !== "super_admin"),
      ...organizationRows.filter((row) => normalizeRole(row.role) !== "super_admin"),
      ...(bootstrap.isSuperAdminRow ? [{ role: "super_admin" as AppRole }] : []),
    ];

    if (rows.length > 0) {
      const globalRoles = rows.filter(r => normalizeRole(r.role) === "super_admin");
      const churchRoles = rows.filter(r => {
        const scopedOrganizationId = r.organization_id ?? null;
        return !scopedOrganizationId || !activeChurchId || scopedOrganizationId === activeChurchId;
      });
      const relevantRoles = globalRoles.length > 0 ? globalRoles : churchRoles;

      // Extra capabilities (e.g. "porteiro") never become the base identity.
      // They must be collected from BOTH globalRoles and churchRoles — not
      // just `relevantRoles` — otherwise a "porteiro" grant on the active
      // church would be silently ignored for a user who also holds a
      // global role (e.g. platform super_admin).
      const capabilitySourceRoles = [...globalRoles, ...churchRoles];
      const newExtraRoles = new Set(
        capabilitySourceRoles
          .map(r => normalizeRole(r.role))
          .filter(r => EXTRA_CAPABILITY_ROLES.includes(r)),
      );
      const identityRoles = relevantRoles.filter(
        r => !EXTRA_CAPABILITY_ROLES.includes(normalizeRole(r.role)),
      );

      const bestCanonicalRole = identityRoles.length > 0
        ? getHighestRole(identityRoles.map(r => r.role))
        : "member";

      const legacyPriority: AppRole[] = [
        "platform_admin",
        "super_admin",
        "superadmin",
        "church_admin",
        "admin",
        "pastor",
        "secretary",
        "tesoureiro",
        "contador",
        "obreiro",
        "leader",
        "lider",
        "member",
        "membro",
      ];
      const bestLegacyRole = identityRoles.length > 0
        ? (legacyPriority.find(p => identityRoles.some(r => r.role === p)) || "membro")
        : "membro";

      setCanonicalRole(bestCanonicalRole);
      setRole(bestLegacyRole);
      setExtraRoles(newExtraRoles);
    } else {
      setCanonicalRole("member");
      setRole("membro");
      setExtraRoles(new Set());
    }
    setLoading(false);
    markBoot("role resolved");
  }, [user, activeChurchId, churchLoading, bootstrap, bootstrapLoading, bootstrapIsError]);

  const canAccess = (path: string): boolean => {
    if (!canonicalRole) return false;
    // Modo Porteiro e uma capacidade extra (porteiro), nunca a identidade
    // base do usuario — por isso a checagem usa extraRoles, nao
    // canonicalRole/role. Nao e liberado por hierarquia administrativa da
    // igreja; apenas o superadmin da plataforma tem passe livre.
    if (path === "/admin/porteiro") {
      return extraRoles.has("porteiro") || canonicalRole === "super_admin";
    }

    const allowed = MODULE_ACCESS[path];
    if (!allowed) return false; // unknown paths are denied by default
    if (role && allowed.includes(role)) return true;

    const canonicalAllowed = allowed.filter((allowedRole): allowedRole is AdminRole =>
      CANONICAL_ROLES.includes(normalizeRole(allowedRole)),
    ).map(normalizeRole);
    return hasPermission(canonicalRole, canonicalAllowed);
  };

  const isAdmin = ["church_admin", "super_admin", "pastor", "secretary"].includes(canonicalRole || "");
  const isSuperAdmin = canonicalRole === "super_admin";
  const isLeader = canonicalRole === "leader";
  const isMember = canonicalRole === "member";
  const hasRole = (allowedRoles: AdminRole[]) => hasPermission(canonicalRole, allowedRoles);
  // Extra capability granted on top of the base identity (see EXTRA_CAPABILITY_ROLES).
  const hasExtraRole = (extraRole: AdminRole) => extraRoles.has(extraRole);
  const isPorteiro = extraRoles.has("porteiro");

  return {
    role, canonicalRole, loading, canAccess, hasRole, isAdmin, isSuperAdmin, isLeader, isMember,
    hasExtraRole, isPorteiro,
    /** True when the shared bootstrap query really failed (not just loading/absent). */
    bootstrapError: bootstrapIsError,
    /** Retries the shared bootstrap query. */
    retryBootstrap: refetchBootstrap,
  };
}
