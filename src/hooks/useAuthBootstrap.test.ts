import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useAuthBootstrap } from "./useAuthBootstrap";

// A minimal Supabase PostgREST-style chainable + thenable query result, so
// `await supabase.from(...).select(...).eq(...).maybeSingle()` and
// `await supabase.from(...).select(...).eq(...).eq(...)` both work
// regardless of how many `.eq()` calls the real code chains.
function makeQueryNode(result: { data: unknown; error: { message: string } | null }) {
  const node = {
    select: () => node,
    eq: () => node,
    order: () => node,
    in: () => node,
    maybeSingle: () => Promise.resolve(result),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return node;
}

type TableResults = Record<string, { data: unknown; error: { message: string } | null }>;

let tableResults: TableResults = {};
const fromMock = vi.fn((table: string) => makeQueryNode(tableResults[table] ?? { data: null, error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

function renderBootstrap(userId: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, ...renderHook(() => useAuthBootstrap(userId), { wrapper }) };
}

describe("useAuthBootstrap", () => {
  beforeEach(() => {
    fromMock.mockClear();
    tableResults = {
      profiles: { data: { platform_role: null }, error: null },
      user_roles: { data: [], error: null },
      organization_users: { data: [], error: null },
      super_admins: { data: null, error: null },
    };
  });

  // CENÁRIO OBRIGATÓRIO 5: ausência legítima (maybeSingle → null) não é erro.
  it("treats a legitimately absent profile/super_admins row as a normal null/false result, not an error", async () => {
    const { result } = renderBootstrap("user-1");

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data?.platformRole).toBeNull();
    expect(result.current.data?.isSuperAdminRow).toBe(false);
  });

  // CENÁRIO OBRIGATÓRIO 4: organization_users retorna erro real.
  it("throws/errors (does not silently return an empty memberships array) when organization_users fails for real", async () => {
    tableResults.organization_users = {
      data: null,
      error: { message: "upstream unavailable" },
    };

    const { result } = renderBootstrap("user-1");

    // `useAuthBootstrap` uses `retry: 2` internally, and the hook's own
    // per-query option wins over the test QueryClient's defaults — so this
    // genuinely retries (with real backoff delays) before settling into the
    // error state. That's the whole point of this test.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 8000 });

    // Never resolves as "success with empty memberships" — that would be
    // indistinguishable from "user genuinely has no organization".
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("throws when user_roles fails for real, instead of returning an empty array as success", async () => {
    tableResults.user_roles = { data: null, error: { message: "timeout" } };

    const { result } = renderBootstrap("user-1");

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 8000 });
    expect(result.current.data).toBeNull();
  });

  it("engages React Query retry when a real error occurs (queryFn actually throws)", async () => {
    tableResults.organization_users = { data: null, error: { message: "network error" } };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useAuthBootstrap("user-1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    // fromMock is called 4 times per attempt (profiles, user_roles,
    // organization_users, super_admins); more than one attempt's worth of
    // calls proves retry actually engaged, which the previous
    // "always resolves successfully" implementation could never do.
    expect(fromMock.mock.calls.length).toBeGreaterThan(4);
  });

  it("still resolves platformRole/memberships correctly when every query succeeds", async () => {
    tableResults = {
      profiles: { data: { platform_role: "church_admin" }, error: null },
      user_roles: { data: [{ role: "leader", organization_id: "org-1" }], error: null },
      organization_users: { data: [{ organization_id: "org-1", role: "member", is_active: true }], error: null },
      super_admins: { data: null, error: null },
    };

    const { result } = renderBootstrap("user-1");

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data?.platformRole).toBe("church_admin");
    expect(result.current.data?.memberships).toHaveLength(1);
  });

  it("does not query when userId is not yet known", () => {
    const { result } = renderBootstrap(null);

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
