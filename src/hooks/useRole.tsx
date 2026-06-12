import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useChurch } from "./useChurchContext";
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
  "/admin/campanhas": ["super_admin", "church_admin", "leader", "member", "tesoureiro", "contador"],
  "/admin/financeiro": ["super_admin", "church_admin", "tesoureiro", "contador"],
  "/admin/membros": ["super_admin", "church_admin", "pastor", "secretary"],
  "/admin/agenda": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/biblia": ["super_admin", "church_admin", "leader", "member"],
  "/admin/culto": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/culto/biblioteca": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/culto/roteiros": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/culto/telao": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/culto/assistente": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/oracoes": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/comunicacao": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/grupos": ["super_admin", "church_admin", "pastor", "secretary", "leader"],
  "/admin/documentos": ["super_admin", "church_admin", "pastor", "secretary", "leader"],
  "/admin/relatorios": ["super_admin", "church_admin", "tesoureiro", "contador"],
  "/admin/assembleia-geral": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/escalas": ["super_admin", "church_admin", "pastor", "secretary", "leader", "member"],
  "/admin/perfil": ["super_admin", "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "member"],
  "/admin/gerenciar-acessos": ["super_admin", "church_admin"],
  "/admin/congregacoes": ["super_admin", "church_admin"],
  "/admin/super-admin": ["super_admin"],
};

export function useRole() {
  const { user } = useAuth();
  const { activeChurchId, loading: churchLoading } = useChurch();
  const [role, setRole] = useState<AppRole | null>(null);
  const [canonicalRole, setCanonicalRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setCanonicalRole(null);
      setLoading(false);
      return;
    }

    if (churchLoading) {
      setLoading(true);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);
      const [legacyRolesResult, organizationRolesResult, profileResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role, organization_id")
          .eq("user_id", user.id)
          .order("role"),
        supabase
          .from("organization_users")
          .select("role, organization_id, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true),
        supabase
          .from("profiles")
          .select("platform_role")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const platformRole = profileResult.data?.platform_role as AppRole | null | undefined;
      const legacyRows = (legacyRolesResult.data || []) as Array<{ role: AppRole; organization_id?: string | null }>;
      const organizationRows = (organizationRolesResult.data || []) as Array<{ role: AppRole; organization_id: string | null }>;
      const rows: Array<{ role: AppRole; organization_id?: string | null }> = [
        ...legacyRows,
        ...organizationRows,
        ...(platformRole ? [{ role: platformRole }] : []),
      ];

      if (rows.length > 0) {
        const globalRoles = rows.filter(r => normalizeRole(r.role) === "super_admin");
        const churchRoles = rows.filter(r => {
          const scopedOrganizationId = r.organization_id ?? null;
          return !scopedOrganizationId || !activeChurchId || scopedOrganizationId === activeChurchId;
        });
        const relevantRoles = globalRoles.length > 0 ? globalRoles : churchRoles;
        const bestCanonicalRole = getHighestRole(relevantRoles.map(r => r.role));
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
        const bestLegacyRole = legacyPriority.find(p => relevantRoles.some(r => r.role === p)) || "membro";

        setCanonicalRole(bestCanonicalRole);
        setRole(bestLegacyRole);
      } else {
        setCanonicalRole("member");
        setRole("membro");
      }
      setLoading(false);
    };

    fetchRole();
  }, [user, activeChurchId, churchLoading]);

  const canAccess = (path: string): boolean => {
    if (!canonicalRole) return false;
    const allowed = MODULE_ACCESS[path];
    if (!allowed) return true; // unknown paths are open
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

  return { role, canonicalRole, loading, canAccess, hasRole, isAdmin, isSuperAdmin, isLeader, isMember };
}
