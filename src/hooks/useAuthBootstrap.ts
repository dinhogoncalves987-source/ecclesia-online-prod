import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { measureBoot } from "@/lib/bootPerf";

/**
 * useAuthBootstrap.ts
 *
 * Single shared data source for everything the app needs to know about the
 * logged-in user's platform/role/membership standing:
 *   - platform role (profiles.platform_role)
 *   - legacy/global roles (user_roles)
 *   - active organization memberships (organization_users)
 *   - legacy super_admins fallback flag
 *
 * Before this hook existed, `SupportContext`, `ChurchProvider` and `useRole`
 * each queried these same tables independently and sequentially (one
 * waiting on the previous), which meant `profiles` was fetched up to 3x,
 * `organization_users` up to 2x, `user_roles` up to 2x and `super_admins`
 * up to 2x per app open — with the whole chain gating the first
 * administrative render behind 3 sequential network round-trips.
 *
 * Now the 4 queries run ONCE, in parallel, as soon as the user id is known,
 * cached (per user id) via React Query so every consumer within the same
 * session reads from the same in-memory result instead of re-querying.
 *
 * IMPORTANT (correção): a real Supabase error (network, RLS, timeout, 5xx)
 * on ANY of the 4 queries MUST make this function throw, not swallow the
 * error into an empty/false default. `.maybeSingle()` already reports a
 * genuinely absent row as `{ data: null, error: null }` — it never lands in
 * the `error` branch for that legitimate case — so any non-null `.error`
 * here really is a failure, and treating it as "user has no role/org" would
 * silently turn a Supabase outage into an incorrect access decision.
 * Throwing lets React Query mark the query `isError`, drive its `retry`
 * policy, and lets consumers distinguish "confirmed empty" from "unknown
 * because it failed" — which they must never conflate (see SupportContext,
 * ChurchProvider, useRole).
 */

export interface BootstrapUserRoleRow {
  role: string;
  organization_id: string | null;
}

export interface BootstrapMembershipRow {
  organization_id: string;
  role: string;
  is_active: boolean;
}

export interface BootstrapAccessCapabilityRow {
  organization_id: string;
  source_organization_id: string;
  responsibility_type: string;
  permission_key: string;
}

export interface BootstrapData {
  platformRole: string | null;
  isSuperAdminRow: boolean;
  userRoles: BootstrapUserRoleRow[];
  memberships: BootstrapMembershipRow[];
  accessCapabilities: BootstrapAccessCapabilityRow[];
}

/** Thrown when one or more of the bootstrap queries fail for real (not a legitimate empty result). */
export class BootstrapFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapFetchError";
  }
}

async function fetchBootstrapData(userId: string): Promise<BootstrapData> {
  return measureBoot("bootstrap (profile+roles+memberships+super_admins)", async () => {
    const [profileResult, userRolesResult, membershipsResult, superAdminResult, capabilitiesResult] = await Promise.all([
      supabase.from("profiles").select("platform_role").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role, organization_id").eq("user_id", userId),
      supabase
        .from("organization_users")
        .select("organization_id, role, is_active")
        .eq("user_id", userId)
        .eq("is_active", true),
      supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.rpc("get_my_access_capabilities"),
    ]);

    const failures: Array<{ table: string; message: string }> = [];
    if (profileResult.error) failures.push({ table: "profiles", message: profileResult.error.message });
    if (userRolesResult.error) failures.push({ table: "user_roles", message: userRolesResult.error.message });
    if (membershipsResult.error) failures.push({ table: "organization_users", message: membershipsResult.error.message });
    if (superAdminResult.error) failures.push({ table: "super_admins", message: superAdminResult.error.message });
    if (capabilitiesResult.error) failures.push({ table: "get_my_access_capabilities", message: capabilitiesResult.error.message });

    if (failures.length > 0) {
      // Log locally only (never sent anywhere) — table names and error
      // messages, never the userId/session/token.
      console.error(
        "[bootstrap] Falha real ao carregar dados de acesso — não será tratada como 'sem função/vínculo':",
        failures.map((f) => `${f.table}: ${f.message}`).join("; "),
      );
      throw new BootstrapFetchError(
        `Falha ao carregar dados de acesso (${failures.map((f) => f.table).join(", ")})`,
      );
    }

    return {
      platformRole: (profileResult.data?.platform_role as string | null) ?? null,
      isSuperAdminRow: Boolean(superAdminResult.data?.user_id),
      userRoles: (userRolesResult.data || []) as BootstrapUserRoleRow[],
      memberships: (membershipsResult.data || []) as BootstrapMembershipRow[],
      accessCapabilities: (capabilitiesResult.data || []) as BootstrapAccessCapabilityRow[],
    };
  });
}

export function useAuthBootstrap(userId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["ecclesia-auth-bootstrap", userId],
    queryFn: () => fetchBootstrapData(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // Real failures now actually throw (see above), so this retry policy
    // finally has something meaningful to act on — previously the queryFn
    // always resolved "successfully" with empty defaults, so retry never
    // engaged even though it was configured.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  return {
    // `data` intentionally stays as the LAST successfully fetched payload
    // (React Query keeps previous `data` across a failed refetch by
    // default) — consumers must check `isError` before deciding whether to
    // trust it for a fresh decision, but they can still show/keep rendering
    // stale-but-real data while a background refetch is failing.
    data: query.data ?? null,
    loading: Boolean(userId) && query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
