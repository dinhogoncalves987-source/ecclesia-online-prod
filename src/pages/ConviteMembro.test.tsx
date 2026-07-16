import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ConviteMembro from "./ConviteMembro";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const getInviteByTokenMock     = vi.fn();
const acceptMemberInviteMock   = vi.fn();
const sendMemberInviteMagicLinkMock = vi.fn();

vi.mock("@/lib/memberInvites", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memberInvites")>("@/lib/memberInvites");
  return {
    ...actual,
    getInviteByToken: (...args: unknown[]) => getInviteByTokenMock(...args),
    acceptMemberInvite: (...args: unknown[]) => acceptMemberInviteMock(...args),
    sendMemberInviteMagicLink: (...args: unknown[]) => sendMemberInviteMagicLinkMock(...args),
    buildInviteUrl: (token: string) => `https://app.example.com/convite-membro/${token}`,
  };
});

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => signOutMock(...args),
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
    sendMemberInviteMagicLinkMock.mockReset();
    signOutMock.mockClear();
    getInviteByTokenMock.mockResolvedValue({ data: VALID_INVITE, error: null });
  });

  // CENÁRIO OBRIGATÓRIO: nova ou existente exige prova da caixa postal.
  it("does not finalize before the recipient opens the secure e-mail link", async () => {
    sendMemberInviteMagicLinkMock.mockResolvedValue({ data: {}, error: null });

    renderPage();
    await screen.findByText("Fulano de Tal");

    fireEvent.click(screen.getByRole("button", { name: /enviar link seguro para meu e-mail/i }));

    await screen.findByText(/enviamos um link seguro/i);
    expect(sendMemberInviteMagicLinkMock).toHaveBeenCalledWith("fulano@example.com", "tok-1");
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
    sendMemberInviteMagicLinkMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 20)),
    );

    renderPage();
    await screen.findByText("Fulano de Tal");

    const submitButton = screen.getByRole("button", { name: /enviar link seguro para meu e-mail/i });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await screen.findByText(/enviamos um link seguro/i);
    expect(sendMemberInviteMagicLinkMock).toHaveBeenCalledTimes(1);
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
