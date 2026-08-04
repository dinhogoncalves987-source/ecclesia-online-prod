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

function renderModal(whatsapp = "54999999999") {
  return render(
    <MemberInviteModal
      open
      onClose={vi.fn()}
      memberId="member-1"
      memberName="Pessoa Teste"
      organizationId="org-1"
      churchName="Igreja Teste"
      invitedBy="admin-1"
      whatsapp={whatsapp}
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
      whatsappNormalized: "5554999999999",
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
    expect(screen.getByText("Envie primeiro o link. Depois envie o código em uma segunda mensagem."))
      .toBeInTheDocument();
  });

  it("prepara link e código em duas mensagens separadas e na ordem correta", async () => {
    renderModal();
    const codeButton = await screen.findByRole("button", { name: "2. Enviar código pelo WhatsApp" });
    expect(codeButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "1. Enviar link pelo WhatsApp" }));
    expect(codeButton).toBeEnabled();
    expect(mocks.generateManualMemberInviteOtp).not.toHaveBeenCalled();

    const [linkUrl] = mocks.open.mock.calls[0];
    const firstMessage = decodeURIComponent(linkUrl);
    expect(firstMessage).toContain("/convite-membro/token-1");
    expect(firstMessage).not.toContain("Código de acesso");

    fireEvent.click(codeButton);

    await waitFor(() => {
      expect(mocks.generateManualMemberInviteOtp).toHaveBeenCalledWith("invite-1");
      expect(mocks.open).toHaveBeenCalledTimes(2);
    });
    const [url, target, features] = mocks.open.mock.calls[1];
    const secondMessage = decodeURIComponent(url);
    expect(url).toMatch(/^https:\/\/wa\.me\//);
    expect(secondMessage).toContain("123456");
    expect(secondMessage).not.toContain("/convite-membro/");
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
  });

  it("bloqueia a preparação quando não existe WhatsApp", async () => {
    renderModal("");

    expect(await screen.findByText(/Cadastre o WhatsApp deste membro/i)).toBeInTheDocument();
    expect(mocks.createMemberInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "1. Enviar link pelo WhatsApp" }))
      .not.toBeInTheDocument();
  });
});
