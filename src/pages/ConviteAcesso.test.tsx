import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConviteAcesso from "./ConviteAcesso";

const getUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signOutMock = vi.fn();
const getInviteMock = vi.fn();
const acceptInviteMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
}));

vi.mock("@/lib/accessInvites", () => ({
  getAccessInviteByToken: (...args: unknown[]) => getInviteMock(...args),
  acceptAccessInvite: (...args: unknown[]) => acceptInviteMock(...args),
  buildAccessInviteUrl: (token: string) => `https://app.example.com/convite-acesso/${token}`,
}));

const VALID_INVITE = {
  invite_id: "inv-1",
  token: "tok-1",
  organization_id: "org-1",
  full_name: "Maria Teste",
  email: "maria@example.com",
  phone: "",
  role: "secretary",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  church_name: "Igreja Teste",
  church_city: "Cidade",
  church_state: "UF",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/convite-acesso/tok-1"]}>
      <Routes>
        <Route path="/convite-acesso/:token" element={<ConviteAcesso />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ConviteAcesso — mailbox proof", () => {
  beforeEach(() => {
    getUserMock.mockReset().mockResolvedValue({ data: { user: null } });
    signInWithOtpMock.mockReset().mockResolvedValue({ data: {}, error: null });
    signInWithPasswordMock.mockReset();
    signOutMock.mockReset();
    acceptInviteMock.mockReset();
    getInviteMock.mockReset().mockResolvedValue({ data: VALID_INVITE, error: null });
  });

  it("sends a magic link to the fixed invite e-mail and never accepts before the click", async () => {
    renderPage();
    await screen.findByText("Maria Teste");

    fireEvent.click(screen.getByRole("button", { name: /não tem conta/i }));
    fireEvent.click(screen.getByRole("button", { name: /enviar link seguro/i }));

    await screen.findByText(/verifique seu e-mail/i);
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "maria@example.com",
      options: {
        emailRedirectTo: "https://app.example.com/convite-acesso/tok-1",
        shouldCreateUser: true,
        data: { full_name: "Maria Teste" },
      },
    });
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });

  it("refuses a legacy invite without an e-mail", async () => {
    getInviteMock.mockResolvedValue({ data: { ...VALID_INVITE, email: "" }, error: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/não possui e-mail cadastrado/i)).toBeInTheDocument();
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });
});
