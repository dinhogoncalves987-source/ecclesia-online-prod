import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

const mockUseAuth = vi.fn();
const mockUseRole = vi.fn();
const mockUseChurch = vi.fn();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => mockUseRole() }));
vi.mock("@/hooks/useChurchContext", () => ({ useChurch: () => mockUseChurch() }));

function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return <div data-testid="login-stub">login page — from: {from?.pathname ?? "none"}</div>;
}

function renderProtected(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route
          path={initialPath}
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">protected content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseRole.mockReset();
    mockUseChurch.mockReset();
  });

  it("does not redirect while auth is still resolving (never bounces prematurely)", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockUseRole.mockReturnValue({ canAccess: () => true, canonicalRole: null, loading: true });
    mockUseChurch.mockReturnValue({ loading: true });

    renderProtected("/admin");

    // Still resolving — must show the boot shell, never the login stub.
    expect(screen.getByText("Abrindo Ecclesia")).toBeInTheDocument();
    expect(screen.queryByTestId("login-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("does not redirect while role/church are still loading even if auth already resolved", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    mockUseRole.mockReturnValue({ canAccess: () => true, canonicalRole: null, loading: true });
    mockUseChurch.mockReturnValue({ loading: false });

    renderProtected("/admin");

    expect(screen.getByText("Abrindo Ecclesia")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("redirects to /login preserving the originally requested route when there is no session", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseRole.mockReturnValue({ canAccess: () => true, canonicalRole: null, loading: false });
    mockUseChurch.mockReturnValue({ loading: false });

    renderProtected("/admin/membros");

    expect(screen.getByTestId("login-stub")).toHaveTextContent("from: /admin/membros");
  });

  it("renders protected content once auth/role/church are all resolved with an accessible role", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    mockUseRole.mockReturnValue({ canAccess: () => true, canonicalRole: "church_admin", loading: false });
    mockUseChurch.mockReturnValue({ loading: false });

    renderProtected("/admin");

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  // PROBLEMA CRÍTICO 1: sessão incerta (token persistido, não confirmada)
  // nunca deve mostrar login nem conteúdo — deve mostrar reconexão.
  it("shows a reconnect screen (not login, not a permission redirect) when auth has a connectionIssue", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, connectionIssue: true, retryConnection: vi.fn() });
    mockUseRole.mockReturnValue({ canAccess: () => true, canonicalRole: null, loading: true });
    mockUseChurch.mockReturnValue({ loading: true });

    renderProtected("/admin/membros");

    expect(screen.getByText("Não foi possível confirmar sua sessão")).toBeInTheDocument();
    expect(screen.queryByTestId("login-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  // CENÁRIO OBRIGATÓRIO 6: falha real de bootstrap não deve virar
  // redirecionamento por falta de permissão nem "sem organização".
  it("shows a reconnect screen (never a permission-based redirect) when the bootstrap query really failed", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false, connectionIssue: false });
    mockUseRole.mockReturnValue({
      canAccess: () => false,
      canonicalRole: null,
      loading: false,
      bootstrapError: true,
      retryBootstrap: vi.fn(),
    });
    mockUseChurch.mockReturnValue({ loading: false, bootstrapError: true, retryBootstrap: vi.fn() });

    renderProtected("/admin/membros");

    expect(screen.getByText("Não foi possível confirmar suas permissões de acesso. Verifique sua internet e tente novamente.")).toBeInTheDocument();
    expect(screen.queryByTestId("login-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  // CENÁRIO OBRIGATÓRIO 7: botão "Tentar novamente" aciona o refetch certo.
  it("the reconnect screen's retry button calls the bootstrap retry functions", () => {
    const retryRole = vi.fn();
    const retryChurch = vi.fn();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false, connectionIssue: false });
    mockUseRole.mockReturnValue({
      canAccess: () => false,
      canonicalRole: null,
      loading: false,
      bootstrapError: true,
      retryBootstrap: retryRole,
    });
    mockUseChurch.mockReturnValue({ loading: false, bootstrapError: false, retryBootstrap: retryChurch });

    renderProtected("/admin/membros");

    fireEvent.click(screen.getByText("Tentar novamente"));

    expect(retryRole).toHaveBeenCalledTimes(1);
    expect(retryChurch).toHaveBeenCalledTimes(1);
  });
});
