import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ChurchProvider } from "./useChurch";
import { useChurch } from "./useChurchContext";

const mockUseAuth = vi.fn();
const mockUseAuthBootstrap = vi.fn();
const mockUseSupportContext = vi.fn();
const fromMock = vi.fn();

vi.mock("./useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("./useAuthBootstrap", () => ({ useAuthBootstrap: () => mockUseAuthBootstrap() }));
vi.mock("@/contexts/SupportContext", () => ({ useSupportContext: () => mockUseSupportContext() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
function Probe() {
  const { church, churches, loading, hasActiveMembership, bootstrapError } = useChurch();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="bootstrapError">{String(bootstrapError)}</span>
      <span data-testid="hasActiveMembership">{String(hasActiveMembership)}</span>
      <span data-testid="church">{church ? church.id : "null"}</span>
      <span data-testid="churchesCount">{churches.length}</span>
    </div>
  );
}

function renderChurch() {
  return render(
    <ChurchProvider>
      <Probe />
    </ChurchProvider>,
  );
}

describe("ChurchProvider", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuthBootstrap.mockReset();
    mockUseSupportContext.mockReset();
    fromMock.mockReset();
    mockUseSupportContext.mockReturnValue({ isPlatformUser: false, activeSupportOrg: null });
  });

  // CENÁRIO OBRIGATÓRIO 6: falha real de bootstrap não deve fazer o
  // ChurchProvider concluir "sem vínculo" / disparar OrganizationPending.
  it("never resolves as 'no membership' when the shared bootstrap query really failed", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: null,
      loading: false,
      isError: true,
      error: new Error("network error"),
      refetch: vi.fn(),
    });

    renderChurch();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("bootstrapError").textContent).toBe("true");
    // Membership flag stays at its initial/stale value — never flips to a
    // confident "false" derived from an error.
    expect(screen.getByTestId("hasActiveMembership").textContent).toBe("false");
    expect(screen.getByTestId("church").textContent).toBe("null");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("resolves the active church normally when bootstrap succeeds with an active membership", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-1", role: "church_admin", is_active: true }],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const orgResult = {
      data: [{ id: "org-1", parent_id: null, name: "Igreja 1", slug: "igreja-1", organization_type: "church" }],
      error: null,
    };
    const makeOrgQueryNode = (): unknown => {
      const node = {
        select: () => node,
        order: () => node,
        eq: () => node,
        in: () => node,
        then: (
          onFulfilled: (v: typeof orgResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(orgResult).then(onFulfilled, onRejected),
      };
      return node;
    };
    fromMock.mockReturnValue(makeOrgQueryNode());

    renderChurch();

    await waitFor(() => expect(screen.getByTestId("hasActiveMembership").textContent).toBe("true"));
    expect(screen.getByTestId("bootstrapError").textContent).toBe("false");
    expect(screen.getByTestId("church").textContent).toBe("org-1");
  });

  // Retomada da PWA — "contexto da organização ativa": o usuário pertence a
  // duas organizações e havia trocado para a segunda antes do app ter sido
  // reiniciado (kill de processo, fechar/reabrir, etc). Um novo mount do
  // ChurchProvider (equivalente a um reload completo) deve restaurar
  // exatamente a organização que estava ativa — não a primeira da lista —
  // lendo `ecclesia.activeChurchId.<userId>` do localStorage.
  it("restores the previously active organization (not the first one) from localStorage across a fresh mount", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [
          { organization_id: "org-1", role: "church_admin", is_active: true },
          { organization_id: "org-2", role: "church_admin", is_active: true },
        ],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const orgResult = {
      data: [
        { id: "org-1", parent_id: null, name: "Igreja 1", slug: "igreja-1", organization_type: "church" },
        { id: "org-2", parent_id: null, name: "Igreja 2", slug: "igreja-2", organization_type: "church" },
      ],
      error: null,
    };
    const makeOrgQueryNode = (): unknown => {
      const node = {
        select: () => node,
        order: () => node,
        eq: () => node,
        in: () => node,
        then: (
          onFulfilled: (v: typeof orgResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(orgResult).then(onFulfilled, onRejected),
      };
      return node;
    };
    fromMock.mockReturnValue(makeOrgQueryNode());

    localStorage.setItem("ecclesia.activeChurchId.u1", "org-2");

    renderChurch();

    await waitFor(() => expect(screen.getByTestId("hasActiveMembership").textContent).toBe("true"));
    expect(screen.getByTestId("church").textContent).toBe("org-2");

    localStorage.removeItem("ecclesia.activeChurchId.u1");
  });
});
