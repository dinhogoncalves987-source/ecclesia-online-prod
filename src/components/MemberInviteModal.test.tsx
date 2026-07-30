import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberInviteModal } from "./MemberInviteModal";

const mocks = vi.hoisted(() => ({
  createMemberInvite: vi.fn(),
  generateManualMemberInviteOtp: vi.fn(),
  revokeMemberInvites: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/memberInvites", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memberInvites")>("@/lib/memberInvites");
  return {
    ...actual,
    createMemberInvite: (...args: unknown[]) => mocks.createMemberInvite(...args),
    generateManualMemberInviteOtp: (...args: unknown[]) => mocks.generateManualMemberInviteOtp(...args),
    revokeMemberInvites: (...args: unknown[]) => mocks.revokeMemberInvites(...args),
  };
});

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: (value: string) => value, lang: "pt" }),
}));

const invite = {
  id: "invite-1",
  token: "token-1",
  member_id: "member-1",
  organization_id: "org-1",
  sector_id: null,
  congregation_id: null,
  invited_by: "admin-1",
  role: "member",
  status: "pending",
  expires_at: "2026-08-03T12:00:00.000Z",
  accepted_at: null,
  accepted_by: null,
  revoked_at: null,
  created_at: "2026-07-30T12:00:00.000Z",
};

function renderModal(phone = "54999999999") {
  return render(
    <MemberInviteModal
      open
      onClose={vi.fn()}
      memberId="member-1"
      memberName="Pessoa Teste"
      organizationId="org-1"
      churchName="Igreja Teste"
      invitedBy="admin-1"
      phone={phone}
      email={null}
    />,
  );
}

describe("MemberInviteModal — convite manual sem Meta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createMemberInvite.mockResolvedValue({ data: invite, error: null });
    mocks.generateManualMemberInviteOtp.mockResolvedValue({
      ok: true,
      code: "123456",
      memberName: "Pessoa Teste",
      phoneNormalized: "5554999999999",
      expiresAt: "2026-07-30T12:10:00.000Z",
    });
    vi.stubGlobal("open", mocks.open);
  });

  it("cria o convite sem exigir e-mail, mas não gera código nem abre WhatsApp automaticamente", async () => {
    renderModal();

    await screen.findByText(/token-1/);
    expect(mocks.createMemberInvite).toHaveBeenCalledTimes(1);
    expect(mocks.generateManualMemberInviteOtp).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(screen.getByText("Nada é enviado automaticamente. Você revisa e confirma no WhatsApp."))
      .toBeInTheDocument();
  });

  it("só prepara o código e abre o WhatsApp Business após clique explícito", async () => {
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Preparar no WhatsApp Business" }));

    await waitFor(() => {
      expect(mocks.generateManualMemberInviteOtp).toHaveBeenCalledWith("invite-1");
      expect(mocks.open).toHaveBeenCalledTimes(1);
    });
    const [url, target, features] = mocks.open.mock.calls[0];
    expect(url).toMatch(/^https:\/\/wa\.me\//);
    expect(decodeURIComponent(url)).toContain("Código de acesso: 123456");
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
  });

  it("bloqueia a preparação quando não existe telefone ou WhatsApp", async () => {
    renderModal("");

    expect(await screen.findByText(/Cadastre o WhatsApp ou telefone/i)).toBeInTheDocument();
    expect(mocks.createMemberInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Preparar no WhatsApp Business" }))
      .not.toBeInTheDocument();
  });
});
