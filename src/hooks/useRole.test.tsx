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

  it("grants super_admin only from the authoritative super_admins row", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: null, loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: true,
        userRoles: [],
        memberships: [],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canonicalRole).toBe("super_admin");
    expect(result.current.canAccess("/admin/super-admin")).toBe(true);
  });

  it("does not grant super_admin from profiles.platform_role or a legacy user_roles row", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-1", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: "super_admin",
        isSuperAdminRow: false,
        userRoles: [{ role: "superadmin", organization_id: null }],
        memberships: [
          { organization_id: "org-1", role: "member", is_active: true },
          { organization_id: "org-1", role: "super_admin", is_active: true },
        ],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canonicalRole).toBe("member");
    expect(result.current.canAccess("/admin/super-admin")).toBe(false);
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

  it("adds module access from a cumulative responsibility without changing the member identity", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-1", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-1", role: "member", is_active: true }],
        accessCapabilities: [
          {
            organization_id: "org-1",
            source_organization_id: "org-1",
            responsibility_type: "gatekeeper",
            permission_key: "gatekeeper.use",
          },
        ],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canonicalRole).toBe("member");
    expect(result.current.hasCapability("gatekeeper.use")).toBe(true);
    expect(result.current.canAccess("/admin/porteiro")).toBe(true);
  });

  // REGRESSÃO — homologação 20260728: perfil administrativo legado (vínculo
  // criado antes das responsabilidades hierárquicas de Discipulado/Teologia/
  // Missões) que só recebeu de volta a capability de Discipulado no banco.
  // Reproduz exatamente o sintoma relatado: Discipulado aparece, Teologia e
  // Missões continuam ausentes — mesmo perfil, mesma organização, único
  // diferencial é quais permission_keys o backend devolveu no bootstrap.
  // Este teste trava o comportamento fail-closed do frontend: a ausência
  // real da capability no banco (não um bug de UI) é a única explicação
  // aceitável para o módulo ficar oculto.
  it("perfil administrativo legado com apenas discipleship.read reconciliado perde Teologia e Missões", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "legacy-admin" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-legacy", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-legacy", role: "church_admin", is_active: true }],
        accessCapabilities: [
          {
            organization_id: "org-legacy",
            source_organization_id: "org-legacy",
            responsibility_type: "church_admin",
            permission_key: "discipleship.read",
          },
        ],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // church_admin ainda é o canonicalRole — não é um problema de identidade.
    expect(result.current.canonicalRole).toBe("church_admin");
    expect(result.current.canAccess("/admin/discipulado")).toBe(true);
    expect(result.current.canAccess("/admin/teologia")).toBe(false);
    expect(result.current.canAccess("/admin/missoes")).toBe(false);
  });

  // Mesmo perfil legado, agora com as três capabilities reconciliadas pela
  // migration corretiva (20260803180000/190000/200000 + hotfix desta
  // release). Discipulado, Teologia e Missões devem abrir simetricamente —
  // nenhum tratamento especial para um módulo em relação aos outros dois.
  it("perfil administrativo legado com discipleship/theology/missions reconciliados vê os três módulos", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "legacy-admin" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-legacy", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-legacy", role: "church_admin", is_active: true }],
        accessCapabilities: [
          "discipleship.read", "theology.read", "missions.read",
        ].map((permission_key) => ({
          organization_id: "org-legacy",
          source_organization_id: "org-legacy",
          responsibility_type: "church_admin",
          permission_key,
        })),
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canonicalRole).toBe("church_admin");
    expect(result.current.canAccess("/admin/discipulado")).toBe(true);
    expect(result.current.canAccess("/admin/teologia")).toBe(true);
    expect(result.current.canAccess("/admin/missoes")).toBe(true);
  });

  // Papel legado equivalente vindo de `pastor` (responsible_pastor), fonte
  // organization_users — mesma reconciliação, identidade diferente.
  it("pastor responsável legado com as três capabilities reconciliadas vê os três módulos", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "legacy-pastor" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-legacy", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-legacy", role: "pastor", is_active: true }],
        accessCapabilities: [
          "discipleship.read", "theology.read", "missions.read",
        ].map((permission_key) => ({
          organization_id: "org-legacy",
          source_organization_id: "org-legacy",
          responsibility_type: "responsible_pastor",
          permission_key,
        })),
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canAccess("/admin/discipulado")).toBe(true);
    expect(result.current.canAccess("/admin/teologia")).toBe(true);
    expect(result.current.canAccess("/admin/missoes")).toBe(true);
  });

  it("permite ao gestor de acessos navegar na hierarquia sem conceder gestão estrutural", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUseChurch.mockReturnValue({ activeChurchId: "org-1", loading: false });
    mockUseAuthBootstrap.mockReturnValue({
      data: {
        platformRole: null,
        isSuperAdminRow: false,
        userRoles: [],
        memberships: [{ organization_id: "org-1", role: "member", is_active: true }],
        accessCapabilities: [
          {
            organization_id: "org-1",
            source_organization_id: "org-1",
            responsibility_type: "access_manager",
            permission_key: "access.manage",
          },
        ],
      },
      loading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useRole());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canonicalRole).toBe("member");
    expect(result.current.canAccess("/admin/gerenciar-acessos")).toBe(true);
    expect(result.current.canAccess("/admin/congregacoes")).toBe(true);
    expect(result.current.hasCapability("organization.manage")).toBe(false);
  });
});
