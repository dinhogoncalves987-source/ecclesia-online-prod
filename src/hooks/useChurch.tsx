import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ChurchContext, type Church } from "./useChurchContext";
import { ensureOrganizationMembership } from "@/lib/organizationMembership";
import { isPlatformAdminRole, pickDefaultActiveChurch } from "@/lib/churchContext";
import { useSupportContext } from "@/contexts/SupportContext";

const ACTIVE_CHURCH_STORAGE_KEY = "ecclesia.activeChurchId";

type OrganizationRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  organization_type: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  active: boolean | null;
  // ── Status operacional ────────────────────────────────
  unit_status?: string | null;
  // ── Configuração denominacional ───────────────────────
  denomination_type?: string | null;
  hierarchy_model?: string | null;
  // ── Labels configuráveis ─────────────────────────────
  top_level_label?: string | null;
  top_level_label_plural?: string | null;
  municipal_level_label?: string | null;
  municipal_level_label_plural?: string | null;
  intermediate_level_label?: string | null;
  intermediate_level_label_plural?: string | null;
  local_unit_label?: string | null;
  local_unit_label_plural?: string | null;
  // ── Flags de níveis ───────────────────────────────────
  uses_convention_level?: boolean | null;
  uses_municipal_level?: boolean | null;
  uses_intermediate_level?: boolean | null;
  uses_local_units?: boolean | null;
  // Financial structural fields
  has_operational_cashbox?: boolean | null;
  is_financially_autonomous?: boolean | null;
  financially_consolidates_to_id?: string | null;
  cnpj?: string | null;
  financial_policy_notes?: string | null;
};

const mapOrganizationToChurch = (org: OrganizationRow): Church => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo_url: org.logo_url,
  primary_color: null,
  parent_church_id: org.parent_id,
  is_matriz: org.organization_type === "matriz" || org.organization_type === "sede",
  organization_type: org.organization_type ?? null,
  address: null,
  city: org.city,
  state: org.state,
  phone: org.phone,
  email: org.email,
  pastor_name: null,
  unit_status: org.unit_status ?? null,
  denomination_type: org.denomination_type ?? null,
  hierarchy_model: org.hierarchy_model ?? null,
  top_level_label: org.top_level_label ?? null,
  top_level_label_plural: org.top_level_label_plural ?? null,
  municipal_level_label: org.municipal_level_label ?? null,
  municipal_level_label_plural: org.municipal_level_label_plural ?? null,
  intermediate_level_label: org.intermediate_level_label ?? null,
  intermediate_level_label_plural: org.intermediate_level_label_plural ?? null,
  local_unit_label: org.local_unit_label ?? null,
  local_unit_label_plural: org.local_unit_label_plural ?? null,
  uses_convention_level: org.uses_convention_level ?? null,
  uses_municipal_level: org.uses_municipal_level ?? null,
  uses_intermediate_level: org.uses_intermediate_level ?? null,
  uses_local_units: org.uses_local_units ?? null,
  has_operational_cashbox: org.has_operational_cashbox ?? null,
  is_financially_autonomous: org.is_financially_autonomous ?? null,
  financially_consolidates_to_id: org.financially_consolidates_to_id ?? null,
  cnpj: org.cnpj ?? null,
  financial_policy_notes: org.financial_policy_notes ?? null,
});

const ORGANIZATION_SELECT = [
  "id", "parent_id", "name", "slug", "organization_type",
  "city", "state", "email", "phone", "logo_url", "active",
  "unit_status",
  "denomination_type", "hierarchy_model",
  "top_level_label", "top_level_label_plural",
  "municipal_level_label", "municipal_level_label_plural",
  "intermediate_level_label", "intermediate_level_label_plural",
  "local_unit_label", "local_unit_label_plural",
  "uses_convention_level", "uses_municipal_level",
  "uses_intermediate_level", "uses_local_units",
  "has_operational_cashbox", "is_financially_autonomous",
  "financially_consolidates_to_id", "cnpj", "financial_policy_notes",
].join(",");

async function resolvePlatformAdmin(userId: string): Promise<boolean> {
  const [profileResult, globalRolesResult, superAdminRow] = await Promise.all([
    supabase.from("profiles").select("platform_role").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .is("organization_id", null),
    supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);

  if (isPlatformAdminRole(profileResult.data?.platform_role)) return true;

  const globalRoles = (globalRolesResult.data || []) as Array<{ role: string }>;
  if (globalRoles.some((row) => isPlatformAdminRole(row.role))) return true;

  return Boolean(superAdminRow.data?.user_id);
}

async function fetchActiveOrganizations(
  organizationIds: string[] | null,
): Promise<{ organizations: OrganizationRow[]; error: unknown }> {
  let query = supabase
    .from("organizations")
    .select(ORGANIZATION_SELECT)
    .order("name");

  if (organizationIds !== null) {
    if (organizationIds.length === 0) {
      return { organizations: [], error: null };
    }
    // Quando buscamos organizações por vínculo explícito (organization_users),
    // o vínculo ativo é a fonte de verdade — NÃO descartar a org pelo flag
    // `active`, pois isso renderiza OrganizationPending indevidamente para
    // usuários com vínculo válido (ex.: church_admin municipal).
    query = query.in("id", organizationIds);
  } else {
    // Platform admins listando todas as organizações: apenas as ativas.
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  return { organizations: (data || []) as OrganizationRow[], error };
}

export function ChurchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isPlatformUser, activeSupportOrg } = useSupportContext();
  const [church, setChurch] = useState<Church | null>(null);
  const [profileChurchId, setProfileChurchId] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasActiveMembership, setHasActiveMembership] = useState(false);
  const linkingRef = useRef(false);

  const fetchChurches = useCallback(async () => {
    if (!user) {
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setHasActiveMembership(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: memberships, error: membershipsError } = await supabase
      .from("organization_users")
      .select("organization_id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (membershipsError) {
      console.error("Erro ao buscar organizações do usuário:", membershipsError);
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setHasActiveMembership(false);
      setLoading(false);
      return;
    }

    let organizationIds = (memberships || [])
      .map((membership) => membership.organization_id)
      .filter(Boolean);

    if (organizationIds.length === 0 && !linkingRef.current) {
      linkingRef.current = true;
      try {
        const { linked } = await ensureOrganizationMembership(user);
        if (linked) {
          const { data: retryMemberships, error: retryError } = await supabase
            .from("organization_users")
            .select("organization_id, role, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true);

          if (!retryError && retryMemberships?.length) {
            organizationIds = retryMemberships
              .map((membership) => membership.organization_id)
              .filter(Boolean);
          }
        }
      } finally {
        linkingRef.current = false;
      }
    }

    // Vínculo ativo é a fonte de verdade para decidir OrganizationPending.
    setHasActiveMembership(organizationIds.length > 0);

    let organizationsQueryIds: string[] | null = organizationIds;

    if (organizationIds.length === 0) {
      const platformAdmin = await resolvePlatformAdmin(user.id);
      if (platformAdmin) {
        organizationsQueryIds = null;
      } else {
        setChurch(null);
        setProfileChurchId(null);
        setChurches([]);
        setLoading(false);
        return;
      }
    }

    const { organizations, error: organizationsError } = await fetchActiveOrganizations(
      organizationsQueryIds,
    );

    if (organizationsError) {
      console.error("Erro ao buscar organizações:", organizationsError);
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setLoading(false);
      return;
    }

    const visibleChurches = organizations.map(mapOrganizationToChurch);

    // Platform users (super_admin, platform_admin, support_*) do NOT auto-select
    // an active church. Their active church is driven by SupportContext.
    // This prevents the Super Admin from appearing "as a church" on login.
    if (isPlatformUser) {
      setChurches(visibleChurches);
      setProfileChurchId(null);
      setChurch(null);
      setLoading(false);
      return;
    }

    const storedChurchId = localStorage.getItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`);
    const activeChurch = pickDefaultActiveChurch(visibleChurches, storedChurchId);

    if (activeChurch && user) {
      const shouldPersist =
        !storedChurchId ||
        !visibleChurches.some((c) => c.id === storedChurchId);
      if (shouldPersist) {
        localStorage.setItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`, activeChurch.id);
      }
    }

    setProfileChurchId(activeChurch?.id || visibleChurches[0]?.id || null);
    setChurches(visibleChurches);
    setChurch(activeChurch);
    setLoading(false);
  }, [user, isPlatformUser]);

  useEffect(() => {
    fetchChurches();
  }, [fetchChurches]);

  // When support context changes (org selected/cleared), update active church
  useEffect(() => {
    if (!isPlatformUser) return;
    setChurch(activeSupportOrg);
    setProfileChurchId(activeSupportOrg?.id ?? null);
  }, [isPlatformUser, activeSupportOrg]);

  const switchChurch = (churchId: string) => {
    const found = churches.find((c) => c.id === churchId);
    if (!found) return false;

    setChurch(found);
    if (user) {
      localStorage.setItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`, found.id);
    }
    return true;
  };

  const clearActiveChurch = () => {
    if (user) {
      localStorage.removeItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`);
    }
    const profileChurch = churches.find((c) => c.id === profileChurchId) || churches[0] || null;
    setChurch(profileChurch);
  };

  const isMatriz = church?.is_matriz ?? false;
  const congregations = churches.filter((c) => c.parent_church_id === church?.id);

  return (
    <ChurchContext.Provider
      value={{
        church,
        activeChurch: church,
        activeChurchId: church?.id || null,
        profileChurchId,
        churches,
        loading,
        isMatriz,
        congregations,
        hasActiveMembership,
        switchChurch,
        clearActiveChurch,
        refetch: fetchChurches,
      }}
    >
      {children}
    </ChurchContext.Provider>
  );
}
