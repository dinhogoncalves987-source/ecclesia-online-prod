import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ConviteMembro from "./ConviteMembro";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const getInviteByTokenMock     = vi.fn();
const acceptMemberInviteMock   = vi.fn();
const signUpForMemberInviteMock = vi.fn();

vi.mock("@/lib/memberInvites", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memberInvites")>("@/lib/memberInvites");
  return {
    ...actual,
    getInviteByToken: (...args: unknown[]) => getInviteByTokenMock(...args),
    acceptMemberInvite: (...args: unknown[]) => acceptMemberInviteMock(...args),
    signUpForMemberInvite: (...args: unknown[]) => signUpForMemberInviteMock(...args),
    buildInviteUrl: (token: string) => `https://app.example.com/convite-membro/${token}`,
  };
});

const signOutMock = vi.fn().mockResolvedValue(undefined);
const resendMock  = vi.fn().mockResolvedValue({ data: {}, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => signOutMock(...args),
      resend: (...args: unknown[]) => resendMock(...args),
    },
  },
}));

const VALID_INVITE = {
  invite_id:       "inv-1",
  token:           "tok-1",
  member_id:       "mem-1",
  organization_id: "org-1",
  sector_id:       null,
  congregation_id: null,
  role:            "member",
  expires_at:      new Date(Date.now() + 86400000).toISOString(),
  member_name:     "Fulano de Tal",
  member_role:     "Membro",
  member_photo:    "",
  member_email:    "fulano@example.com",
  church_name:     "Igreja Teste",
  church_city:     "Cidade",
  church_state:    "UF",
  congregation:    "",
};

function renderTree() {
  return (
    <MemoryRouter initialEntries={["/convite-membro/tok-1"]}>
      <Routes>
        <Route path="/convite-membro/:token" element={<ConviteMembro />} />
        <Route path="/login" element={<div data-testid="login-stub" />} />
        <Route path="/forgot-password" element={<div data-testid="forgot-stub" />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(renderTree());
}

describe("ConviteMembro — secure member invite flow", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    getInviteByTokenMock.mockReset();
    acceptMemberInviteMock.mockReset();
    signUpForMemberInviteMock.mockReset();
    signOutMock.mockClear();
    resendMock.mockClear();
    getInviteByTokenMock.mockResolvedValue({ data: VALID_INVITE, error: null });
  });

  // CENÁRIO OBRIGATÓRIO: conta nova exige confirmação de e-mail.
  it("does not finalize the link right after sign-up — waits for e-mail confirmation", async () => {
    signUpForMemberInviteMock.mockResolvedValue({
      data: { user: { id: "new-1", identities: [{ id: "x" }] }, session: null },
      error: null,
    });

    renderPage();
    await screen.findByText("Fulano de Tal");

    fireEvent.change(screen.getByPlaceholderText("Crie uma senha"), { target: { value: "senha123" } });
    fireEvent.change(screen.getByPlaceholderText("Repita a senha"), { target: { value: "senha123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar senha e ativar acesso/i }));

    await screen.findByText(/enviamos um link de confirmação/i);
    expect(signUpForMemberInviteMock).toHaveBeenCalledWith("fulano@example.com", "senha123", "tok-1");
    expect(acceptMemberInviteMock).not.toHaveBeenCalled();
  });

  // CENÁRIO OBRIGATÓRIO: conta existente nunca tem a senha alterada.
  it("never touches an existing account's password — detects it and points to login/recovery", async () => {
    signUpForMemberInviteMock.mockResolvedValue({
      data: { user: { id: "existing-1", identities: [] }, session: null },
      error: null,
    });

    renderPage();
    await screen.findByText("Fulano de Tal");

    fireEvent.change(screen.getByPlaceholderText("Crie uma senha"), { target: { value: "senha123" } });
    fireEvent.change(screen.getByPlaceholderText("Repita a senha"), { target: { value: "senha123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar senha e ativar acesso/i }));

    await screen.findByText(/já existe uma conta/i);
    expect(screen.getByRole("link", { name: /fazer login/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /esqueci minha senha/i })).toBeInTheDocument();
    // No password of any pre-existing account was ever touched — the only
    // account-creation call made was the official signUp; nothing else.
    expect(acceptMemberInviteMock).not.toHaveBeenCalled();
  });

  // CENÁRIO OBRIGATÓRIO: e-mail divergente é recusado.
  it("blocks and offers sign-out when the current session's e-mail does not match the invite", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u-other", email: "outra@example.com" }, loading: false });

    renderPage();

    await screen.findByText(/conectado\(a\) com uma conta diferente/i);
    expect(acceptMemberInviteMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sair desta conta/i })).toBeInTheDocument();
  });

  // CENÁRIO OBRIGATÓRIO: convite expirado, revogado ou já aceito são recusados.
  it.each([
    ["expired", "Este convite expirou. Solicite um novo ao secretário."],
    ["revoked", "Este convite foi revogado."],
    ["already_accepted", "Este convite já foi utilizado."],
  ])("shows a terminal error for a(n) %s invite", async (errorCode, expectedMessage) => {
    getInviteByTokenMock.mockResolvedValue({ data: null, error: errorCode });

    renderPage();

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  // CENÁRIO OBRIGATÓRIO: duas tentativas simultâneas não produzem dois aceites.
  it("auto-accepts at most once for a matching authenticated session, even across re-renders", async () => {
    acceptMemberInviteMock.mockResolvedValue({ success: true, member_id: "m1", organization_id: "o1" });
    mockUseAuth.mockReturnValue({ user: { id: "u-1", email: "fulano@example.com" }, loading: false });

    const { rerender } = renderPage();

    await waitFor(() => expect(acceptMemberInviteMock).toHaveBeenCalledTimes(1));

    // A fresh (but equivalent) user object, as a real AuthProvider re-render
    // would produce — must not trigger a second accept call.
    mockUseAuth.mockReturnValue({ user: { id: "u-1", email: "fulano@example.com" }, loading: false });
    rerender(renderTree());

    await new Promise((r) => setTimeout(r, 20));
    expect(acceptMemberInviteMock).toHaveBeenCalledTimes(1);
  });

  it("does not submit the sign-up form twice from a rapid double click", async () => {
    signUpForMemberInviteMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { user: { id: "n1", identities: [{ id: "x" }] }, session: null }, error: null }), 20)),
    );

    renderPage();
    await screen.findByText("Fulano de Tal");

    fireEvent.change(screen.getByPlaceholderText("Crie uma senha"), { target: { value: "senha123" } });
    fireEvent.change(screen.getByPlaceholderText("Repita a senha"), { target: { value: "senha123" } });
    const submitButton = screen.getByRole("button", { name: /criar senha e ativar acesso/i });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await screen.findByText(/enviamos um link de confirmação/i);
    expect(signUpForMemberInviteMock).toHaveBeenCalledTimes(1);
  });

  it("finalizes automatically and redirects once the session matches the invite's e-mail", async () => {
    acceptMemberInviteMock.mockResolvedValue({ success: true, member_id: "m1", organization_id: "o1" });
    mockUseAuth.mockReturnValue({ user: { id: "u-1", email: "Fulano@Example.com" }, loading: false });

    renderPage();

    await waitFor(() => expect(acceptMemberInviteMock).toHaveBeenCalledWith("tok-1", "u-1"));
    await screen.findByText("Acesso ativado!");
  });

  it("surfaces a clear, recoverable error (not a silent failure) when the RPC itself refuses the link", async () => {
    acceptMemberInviteMock.mockResolvedValue({ success: false, error: "invite_expired", message: "expirou" });
    mockUseAuth.mockReturnValue({ user: { id: "u-1", email: "fulano@example.com" }, loading: false });

    renderPage();

    await screen.findByText("Este convite expirou. Solicite um novo link à secretaria.");
  });
});
