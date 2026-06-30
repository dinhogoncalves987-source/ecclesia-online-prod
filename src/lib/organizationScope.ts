import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// ── Breadcrumb ────────────────────────────────────────────────────────────────

export interface OrgBreadcrumbItem {
  id: string;
  name: string;
  organization_type: string | null;
}

/**
 * Constrói o breadcrumb hierárquico (pai → ... → org) percorrendo parent_id.
 * Máximo de 10 níveis para evitar loops infinitos.
 */
export async function buildOrganizationBreadcrumb(
  orgId: string,
): Promise<OrgBreadcrumbItem[]> {
  const crumbs: OrgBreadcrumbItem[] = [];
  let currentId: string | null = orgId;
  let safety = 0;

  while (currentId && safety < 10) {
    safety++;
    const { data } = await supabase
      .from("organizations")
      .select("id, name, organization_type, parent_id")
      .eq("id", currentId)
      .single();

    if (!data) break;
    crumbs.unshift({
      id: data.id,
      name: data.name,
      organization_type: data.organization_type ?? null,
    });
    currentId = data.parent_id ?? null;
  }

  return crumbs;
}

// ── Descendentes ──────────────────────────────────────────────────────────────

/**
 * Retorna todos os IDs descendentes (incluindo o próprio root) usando BFS iterativo.
 * Útil para filtros de escopo hierárquico nos módulos.
 */
export async function getOrganizationDescendantIds(
  rootOrgId: string,
): Promise<string[]> {
  const visited = new Set<string>([rootOrgId]);
  const queue: string[] = [rootOrgId];

  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length);
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .in("parent_id", batch)
      .eq("active", true);

    for (const org of data ?? []) {
      if (!visited.has(org.id)) {
        visited.add(org.id);
        queue.push(org.id);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Retorna IDs para uso em filtros de escopo.
 * @param includeDescendants Se true (padrão), inclui todos os descendentes.
 * @param includeRoot Se true (padrão), inclui o próprio rootOrgId.
 */
export async function getOrganizationScopeIds(
  rootOrgId: string,
  options: { includeDescendants?: boolean; includeRoot?: boolean } = {},
): Promise<string[]> {
  const { includeDescendants = true, includeRoot = true } = options;

  if (!includeDescendants) {
    return includeRoot ? [rootOrgId] : [];
  }

  const all = await getOrganizationDescendantIds(rootOrgId);
  if (!includeRoot) {
    return all.filter((id) => id !== rootOrgId);
  }
  return all;
}

/**
 * Verifica se childId está dentro da árvore de rootId (incluindo ele mesmo).
 */
export async function isWithinOrganizationTree(
  childId: string,
  rootId: string,
): Promise<boolean> {
  const descendants = await getOrganizationDescendantIds(rootId);
  return descendants.includes(childId);
}

/**
 * Retorna um objeto de filtro Supabase-ready para escopo organizacional.
 * Exemplo de uso: query.in("organization_id", await getOrganizationScopeFilter(rootId))
 */
export async function getOrganizationScopeFilter(
  rootOrgId: string,
  includeDescendants = true,
): Promise<string[]> {
  return getOrganizationScopeIds(rootOrgId, { includeDescendants });
}

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
