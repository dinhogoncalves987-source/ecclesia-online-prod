import { useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ChurchContext, type Church } from "./useChurchContext";
import { useAuthBootstrap, type BootstrapData } from "./useAuthBootstrap";
import { isPlatformAdminRole, pickDefaultActiveChurch } from "@/lib/churchContext";
import { useSupportContext } from "@/contexts/SupportContext";
import { isMatrizLevel, normalizeOrganizationType } from "@/lib/organizationHierarchy";
import { markBoot } from "@/lib/bootPerf";

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
  short_name?: string | null;
  acronym?: string | null;
  pastor_president_name?: string | null;
};

const mapOrganizationToChurch = (org: OrganizationRow): Church => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo_url: org.logo_url,
  primary_color: null,
  parent_church_id: org.parent_id,
  // Normalizado (não comparação de string crua) para reconhecer também
  // aliases legados (ex.: "church") e evitar falso-negativo de matriz/sede.
  is_matriz: isMatrizLevel(normalizeOrganizationType(org.organization_type)),
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
  short_name: org.short_name ?? null,
  acronym: org.acronym ?? null,
  pastor_president_name: org.pastor_president_name ?? null,
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
  // short_name, acronym, pastor_president_name: selecionados diretamente em
  // ConfiguracaoIgreja.tsx para evitar quebra antes de migration ser aplicada.
].join(",");

/**
 * Whether this user is a platform admin (super_admin/platform_admin/support_*),
 * derived entirely from data useAuthBootstrap already fetched — no
 * additional profiles/user_roles/super_admins queries needed here anymore.
 */
function isBootstrapPlatformAdmin(bootstrap: BootstrapData): boolean {
  if (isPlatformAdminRole(bootstrap.platformRole)) return true;

  const hasGlobalAdminRole = bootstrap.userRoles.some(
    (row) => !row.organization_id && isPlatformAdminRole(row.role),
  );
  if (hasGlobalAdminRole) return true;

  return bootstrap.isSuperAdminRow;
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
  // memberships (organization_users) already come from the shared bootstrap
  // fetch — no independent query here for the common case. Only the
  // downstream `organizations` lookup (by the resulting ids) is inherently
  // a second round-trip, since we can't know which orgs to fetch before
  // knowing the membership ids.
  const { data: bootstrap, loading: bootstrapLoading, isError: bootstrapIsError, refetch: refetchBootstrap } = useAuthBootstrap(user?.id);
  const [church, setChurch] = useState<Church | null>(null);
  const [profileChurchId, setProfileChurchId] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasActiveMembership, setHasActiveMembership] = useState(false);

  const fetchChurches = useCallback(async () => {
    if (!user) {
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setHasActiveMembership(false);
      setLoading(false);
      return;
    }

    if (bootstrapIsError) {
      // A REAL failure upstream (network/server/RLS) — never fall back to
      // "no membership" / trigger OrganizationPending from this, and never
      // wipe out whatever church data we already had in memory. Just settle
      // `loading` so ProtectedRoute can show a recoverable error state
      // (driven by `bootstrapError`) instead of spinning forever.
      setLoading(false);
      return;
    }

    if (bootstrapLoading || !bootstrap) {
      setLoading(true);
      return;
    }

    setLoading(true);

    // SEGURANÇA (FASE 2): nenhuma auto-associação por church_slug acontece
    // mais aqui. `ensureOrganizationMembership`/`join_organization_by_slug`
    // permitiam que qualquer usuário autenticado se vinculasse como membro
    // de QUALQUER organização apenas conhecendo (ou adivinhando) o slug
    // público — sem convite, token ou aprovação de um administrador. Essa
    // RPC foi removida do banco (ver migration
    // 20260715141000_remove_open_slug_join.sql). Um usuário sem organização
    // ativa agora só ganha uma ao aceitar um convite tokenizado real
    // (accept_member_invite / accept_access_invite) — nunca automaticamente
    // aqui no bootstrap.
    const organizationIds = bootstrap.memberships
      .map((membership) => membership.organization_id)
      .filter(Boolean);

    // Vínculo ativo é a fonte de verdade para decidir OrganizationPending.
    setHasActiveMembership(organizationIds.length > 0);

    let organizationsQueryIds: string[] | null = organizationIds;

    if (organizationIds.length === 0) {
      const platformAdmin = isBootstrapPlatformAdmin(bootstrap);
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
    markBoot("church resolved");
  }, [user, isPlatformUser, bootstrap, bootstrapLoading, bootstrapIsError, refetchBootstrap]);

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

  const retryBootstrap = useCallback(() => {
    void refetchBootstrap();
  }, [refetchBootstrap]);

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
        bootstrapError: bootstrapIsError,
        retryBootstrap,
        switchChurch,
        clearActiveChurch,
        refetch: fetchChurches,
      }}
    >
      {children}
    </ChurchContext.Provider>
  );
}
