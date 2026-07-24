import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";

const mockUseAuth = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
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
    mockRpc.mockReset();
    mockFunctionsInvoke.mockReset();
    mockVerifyOtp.mockReset();
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

  // PARTE D — Login por telefone/WhatsApp: a tela de entrada nunca trava o
  // membro na etapa de telefone só porque o transporte real está desligado
  // nesta operação (produção 'disabled', staging 'manual_test') — ela
  // sempre avança para a etapa de código, com uma explicação amigável.
  describe("entrada por telefone/WhatsApp", () => {
    it("shows the phone form and advances to the code step even when the RPC reports the transport is off", async () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      mockRpc.mockResolvedValue({ data: { ok: false, error: "otp_manual_test_admin_only" }, error: null });

      renderLogin();

      fireEvent.click(screen.getByText("Entrar com telefone"));
      fireEvent.change(screen.getByPlaceholderText("(11) 91234-5678"), { target: { value: "11912345678" } });
      fireEvent.click(screen.getByText("Continuar"));

      await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("request_member_login_otp", { p_phone: "11912345678" }));
      expect(await screen.findByText(/teste controlado/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
    });

    it("exchanges a valid code for a real session via verifyOtp and redirects to /admin", async () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      mockRpc.mockResolvedValue({ data: { ok: false, error: "otp_disabled" }, error: null });
      mockFunctionsInvoke.mockResolvedValue({
        data: { ok: true, email: "otp-member-123@members.ecclesiaonline.internal", token_hash: "hash123", member_id: "m1", member_name: "Fulano" },
        error: null,
      });
      mockVerifyOtp.mockResolvedValue({ error: null });

      renderLogin();

      fireEvent.click(screen.getByText("Entrar com telefone"));
      fireEvent.change(screen.getByPlaceholderText("(11) 91234-5678"), { target: { value: "11912345678" } });
      fireEvent.click(screen.getByText("Continuar"));

      await screen.findByPlaceholderText("000000");
      fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

      await waitFor(() => expect(mockFunctionsInvoke).toHaveBeenCalledWith(
        "verify-member-login-otp",
        { body: { phone: "11912345678", code: "123456" } },
      ));
      await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: "otp-member-123@members.ecclesiaonline.internal",
        token_hash: "hash123",
        type: "magiclink",
      }));
      expect(await screen.findByTestId("admin-stub")).toBeInTheDocument();
    });

    it("shows an actionable error and never redirects when the code is wrong", async () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      mockRpc.mockResolvedValue({ data: { ok: false, error: "otp_disabled" }, error: null });
      mockFunctionsInvoke.mockResolvedValue({ data: { ok: false, error: "invalid_code", attempts_remaining: 3 }, error: null });

      renderLogin();

      fireEvent.click(screen.getByText("Entrar com telefone"));
      fireEvent.change(screen.getByPlaceholderText("(11) 91234-5678"), { target: { value: "11912345678" } });
      fireEvent.click(screen.getByText("Continuar"));

      await screen.findByPlaceholderText("000000");
      fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "000000" } });
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

      expect(await screen.findByText("Código incorreto. Confira e tente novamente.")).toBeInTheDocument();
      expect(mockVerifyOtp).not.toHaveBeenCalled();
      expect(screen.queryByTestId("admin-stub")).not.toBeInTheDocument();
    });
  });
});
