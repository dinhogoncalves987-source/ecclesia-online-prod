import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRole } from "./useRole";

const mockUseAuth = vi.fn();
const mockUseChurch = vi.fn();
const mockUseAuthBootstrap = vi.fn();

vi.mock("./useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("./useChurchContext", () => ({ useChurch: () => mockUseChurch() }));
vi.mock("./useAuthBootstrap", () => ({ useAuthBootstrap: () => mockUseAuthBootstrap() }));

describe("useRole", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseChurch.mockReset();
    mockUseAuthBootstrap.mockReset();
  });

  it("computes the effective role from a successfully loaded bootstrap payload", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-1", loading: false });
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

    const { result } = renderHook(() => useRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canonicalRole).toBe("church_admin");
    expect(result.current.bootstrapError).toBe(false);
  });

  // CENÁRIO OBRIGATÓRIO 6: falha de bootstrap não redefine o usuário como
  // "member" — a última role conhecida (ou nenhuma, se nunca resolvida)
  // deve ser preservada, e o erro deve ficar visível via `bootstrapError`.
  it("never recomputes the role as 'member' when the bootstrap query has a real error", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-1", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: null,
      loading: false,
      isError: true,
      error: new Error("network error"),
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canonicalRole).not.toBe("member");
    expect(result.current.canonicalRole).toBeNull();
    expect(result.current.bootstrapError).toBe(true);
  });

  it("preserves a previously resolved role in memory if the bootstrap query later errors on refetch", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-1", loading: false });

    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-1", role: "pastor", is_active: true }],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.canonicalRole).toBe("pastor"));

    // Simulate a transient error on a background refetch: React Query keeps
    // the last successful `data` around, but flags `isError`.
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-1", role: "pastor", is_active: true }],
      },
      loading: false,
      isError: true,
      error: new Error("network error"),
      refetch: vi.fn(),
    });
    rerender();

    expect(result.current.canonicalRole).toBe("pastor");
    expect(result.current.bootstrapError).toBe(true);
  });

  it("resets to a logged-out role state when there is no user", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockUseChurch.mockReturnValue({ activeChurchId: null, loading: false });
    mockUseAuthBootstrap.mockReturnValue({ data: null, loading: false, isError: false, error: null, refetch: vi.fn() });

    const { result } = renderHook(() => useRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canonicalRole).toBeNull();
  });
});
