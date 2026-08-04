import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ConviteMembro from "./ConviteMembro";

const getInviteByTokenMock = vi.fn();
const verifyManualMemberInviteOtpMock = vi.fn();
const acceptMemberInviteMock = vi.fn();

vi.mock("@/lib/memberInvites", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memberInvites")>("@/lib/memberInvites");
  return {
    ...actual,
    getInviteByToken: (...args: unknown[]) => getInviteByTokenMock(...args),
    verifyManualMemberInviteOtp: (...args: unknown[]) => verifyManualMemberInviteOtpMock(...args),
    acceptMemberInvite: (...args: unknown[]) => acceptMemberInviteMock(...args),
  };
});

const VALID_INVITE = {
  invite_id: "inv-1",
  token: "tok-1",
  member_id: "mem-1",
  organization_id: "org-1",
  sector_id: null,
  congregation_id: null,
  role: "member",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  member_name: "Fulano de Tal",
  member_role: "Membro",
  member_photo: "",
  member_email: null,
  church_name: "Igreja Teste",
  church_city: "Cidade",
  church_state: "UF",
  congregation: "",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/convite-membro/tok-1"]}>
      <Routes>
        <Route path="/convite-membro/:token" element={<ConviteMembro />} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ConviteMembro — ativação manual exclusivamente por WhatsApp", () => {
  beforeEach(() => {
    getInviteByTokenMock.mockReset();
    verifyManualMemberInviteOtpMock.mockReset();
    acceptMemberInviteMock.mockReset();
    getInviteByTokenMock.mockResolvedValue({ data: VALID_INVITE, error: null });
  });

  it("não exige e-mail e mostra telefone + código", async () => {
    renderPage();
    await screen.findByText("Fulano de Tal");

    expect(screen.getByLabelText(/WhatsApp cadastrado/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Código de acesso/i)).toBeInTheDocument();
    expect(screen.queryByText(/e-mail/i)).not.toBeInTheDocument();
  });

  it("verifica token, telefone e código antes de aceitar o convite", async () => {
    verifyManualMemberInviteOtpMock.mockResolvedValue({ ok: true, userId: "user-1" });
    acceptMemberInviteMock.mockResolvedValue({
      success: true,
      member_id: "mem-1",
      organization_id: "org-1",
    });

    renderPage();
    await screen.findByText("Fulano de Tal");
    fireEvent.change(screen.getByLabelText(/WhatsApp cadastrado/i), {
      target: { value: "(54) 99999-9999" },
    });
    fireEvent.change(screen.getByLabelText(/Código de acesso/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ativar meu acesso/i }));

    await waitFor(() => {
      expect(verifyManualMemberInviteOtpMock).toHaveBeenCalledWith("tok-1", "54999999999", "123456");
    });
    expect(acceptMemberInviteMock).toHaveBeenCalledWith("tok-1", "user-1");
    expect(await screen.findByText("Acesso ativado!")).toBeInTheDocument();
  });

  it("não aceita o convite quando o código é inválido", async () => {
    verifyManualMemberInviteOtpMock.mockResolvedValue({ ok: false, error: "invalid_code" });

    renderPage();
    await screen.findByText("Fulano de Tal");
    fireEvent.change(screen.getByLabelText(/WhatsApp cadastrado/i), {
      target: { value: "54999999999" },
    });
    fireEvent.change(screen.getByLabelText(/Código de acesso/i), {
      target: { value: "999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ativar meu acesso/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Código incorreto/i);
    expect(acceptMemberInviteMock).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", "Este convite expirou. Solicite um novo à secretaria."],
    ["revoked", "Este convite foi revogado."],
    ["already_accepted", "Este convite já foi utilizado."],
  ])("recusa convite %s", async (errorCode, message) => {
    getInviteByTokenMock.mockResolvedValue({ data: null, error: errorCode });
    renderPage();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
