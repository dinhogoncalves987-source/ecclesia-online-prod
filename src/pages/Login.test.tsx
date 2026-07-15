import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";

const mockUseAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

function AdminStub() {
  return <div data-testid="admin-stub">admin dashboard</div>;
}

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry as never]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminStub />} />
        <Route path="/admin/membros" element={<div data-testid="membros-stub">membros</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Login", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("does not show the login form while auth is still loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    renderLogin();

    expect(screen.getByText("Abrindo Ecclesia")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("seu@email.com")).not.toBeInTheDocument();
  });

  // PROBLEMA CRÍTICO 1: uma sessão incerta (token persistido, ainda não
  // confirmada / falha transitória) nunca pode mostrar o formulário de
  // login — deve mostrar a tela de reconexão com "Tentar novamente".
  it("shows a reconnect screen instead of the login form when there is a connectionIssue", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, connectionIssue: true, retryConnection: vi.fn() });

    renderLogin();

    expect(screen.getByText("Não foi possível confirmar sua sessão")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("seu@email.com")).not.toBeInTheDocument();
  });

  it("keeps a user with no session on the login form", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    renderLogin();

    expect(screen.getByPlaceholderText("seu@email.com")).toBeInTheDocument();
  });

  it("redirects an already-authenticated user straight to /admin", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });

    renderLogin();

    expect(await screen.findByTestId("admin-stub")).toBeInTheDocument();
  });

  it("redirects an already-authenticated user back to the originally requested route", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });

    renderLogin({ pathname: "/login", state: { from: { pathname: "/admin/membros" } } });

    expect(await screen.findByTestId("membros-stub")).toBeInTheDocument();
  });
});
