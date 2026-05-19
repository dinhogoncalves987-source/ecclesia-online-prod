import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Valid table names derived from the generated Supabase schema. */
export type KnownTableName = keyof Database["public"]["Tables"];

export const ORGANIZATION_ID_COLUMN = "organization_id";
export const LEGACY_CHURCH_ID_COLUMN = "church_id";
const ENABLE_LEGACY_CHURCH_SCOPE_FALLBACK =
  import.meta.env.VITE_ENABLE_LEGACY_CHURCH_SCOPE_FALLBACK !== "false";

const isMissingOrganizationColumn = (error: unknown) => {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error || "");

  return message.includes(ORGANIZATION_ID_COLUMN) || message.includes("schema cache");
};

// Internal helpers – the `as never` casts here are unavoidable because the
// Supabase client generics cannot be satisfied with a runtime string variable,
// even when the type is constrained to valid table names. They are isolated
// here so no caller needs to use unsafe casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryBuilder = any;
type SupabaseResult<T> = PromiseLike<{ data: T | null; error: unknown }>;
type FilterableResult<T> = SupabaseResult<T> & {
  eq: (column: string, value: string) => SupabaseResult<T>;
};

export async function runScopedOrganizationQuery<T>(
  table: KnownTableName,
  organizationId: string,
  buildQuery: (query: AnyQueryBuilder) => unknown,
) {
  const organizationQuery = buildQuery(supabase.from(table as never)) as FilterableResult<T>;

  const organizationResult = await organizationQuery.eq(ORGANIZATION_ID_COLUMN, organizationId);
  if (
    !organizationResult.error ||
    !ENABLE_LEGACY_CHURCH_SCOPE_FALLBACK ||
    !isMissingOrganizationColumn(organizationResult.error)
  ) {
    return organizationResult;
  }

  const legacyQuery = buildQuery(supabase.from(table as never)) as FilterableResult<T>;

  return legacyQuery.eq(LEGACY_CHURCH_ID_COLUMN, organizationId);
}

export async function insertWithOrganizationScope<T>(
  table: KnownTableName,
  organizationId: string,
  payload: Record<string, unknown>,
  buildQuery?: (query: AnyQueryBuilder) => unknown,
) {
  const withOrganizationId = { ...payload, [ORGANIZATION_ID_COLUMN]: organizationId };
  const organizationQuery = buildQuery
    ? buildQuery(supabase.from(table as never).insert(withOrganizationId as never))
    : supabase.from(table as never).insert(withOrganizationId as never);

  const organizationResult = await (organizationQuery as SupabaseResult<T>);
  if (
    !organizationResult.error ||
    !ENABLE_LEGACY_CHURCH_SCOPE_FALLBACK ||
    !isMissingOrganizationColumn(organizationResult.error)
  ) {
    return organizationResult;
  }

  const withLegacyChurchId = { ...payload, [LEGACY_CHURCH_ID_COLUMN]: organizationId };
  const legacyQuery = buildQuery
    ? buildQuery(supabase.from(table as never).insert(withLegacyChurchId as never))
    : supabase.from(table as never).insert(withLegacyChurchId as never);

  return legacyQuery as SupabaseResult<T>;
}
