import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/publicUrl", () => ({
  getPublicAppUrl: () => "https://app.example.com",
}));

import {
  acceptMemberInvite,
  buildWhatsappCodeLink,
  buildWhatsappLink,
  emailsMatch,
  generateManualMemberInviteOtp,
  normalizeEmail,
  sendMemberInviteMagicLink,
  verifyManualMemberInviteOtp,
} from "./memberInvites";

describe("memberInvites — e-mail helpers", () => {
  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Fulano@Example.COM  ")).toBe("fulano@example.com");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });

  it("emailsMatch is case/whitespace-insensitive but never matches two empty e-mails", () => {
    expect(emailsMatch(" Fulano@Example.com ", "fulano@example.com")).toBe(true);
    expect(emailsMatch("fulano@example.com", "outro@example.com")).toBe(false);
    expect(emailsMatch(null, null)).toBe(false);
    expect(emailsMatch("", "")).toBe(false);
  });
});

describe("memberInvites — mailbox proof by magic link", () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset();
    signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
  });

  it("sends a magic link to the fixed e-mail and redirects back to this exact invite", async () => {
    await sendMemberInviteMagicLink("membro@example.com", "tok-abc");

    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    const arg = signInWithOtpMock.mock.calls[0][0];
    expect(arg.email).toBe("membro@example.com");
    expect(arg.options.emailRedirectTo).toBe("https://app.example.com/convite-membro/tok-abc");
    expect(arg.options.shouldCreateUser).toBe(true);
    expect(arg).not.toHaveProperty("password");
  });
});

describe("memberInvites — convite manual sem Meta", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    verifyOtpMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("monta a primeira mensagem somente com o link, sem expor o código", () => {
    const link = buildWhatsappLink(
      "(54) 99999-9999",
      "Fulano",
      "Igreja Teste",
      "https://app.example.com/convite-membro/tok",
    );
    expect(link).toMatch(/^https:\/\/wa\.me\/5554999999999\?text=/);
    expect(decodeURIComponent(link)).toContain("https://app.example.com/convite-membro/tok");
    expect(decodeURIComponent(link)).not.toContain("Código de acesso");
    expect(link).not.toContain("graph.facebook.com");
  });

  it("monta a segunda mensagem somente com o código, sem repetir o link", () => {
    const link = buildWhatsappCodeLink(
      "(54) 99999-9999",
      "Fulano",
      "123456",
    );
    const message = decodeURIComponent(link);
    expect(message).toContain("123456");
    expect(message).not.toContain("/convite-membro/");
    expect(message).not.toContain("Igreja Teste");
  });

  it("gera o código pela RPC autenticada e nunca persiste o texto no cliente", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        member_name: "Fulano",
        phone_normalized: "5554999999999",
        code: "123456",
        expires_at: "2026-07-30T12:00:00Z",
      },
      error: null,
    });

    const result = await generateManualMemberInviteOtp("invite-1");
    expect(rpcMock).toHaveBeenCalledWith("admin_generate_member_invite_otp", {
      p_invite_id: "invite-1",
    });
    expect(result).toMatchObject({ ok: true, code: "123456" });
  });

  it("troca a prova validada pela sessão oficial do Supabase Auth", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        email: "otp-member-id@members.ecclesiaonline.internal",
        token_hash: "hash",
      }),
    }));
    verifyOtpMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const result = await verifyManualMemberInviteOtp("tok", "54999999999", "123456");
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "otp-member-id@members.ecclesiaonline.internal",
      token_hash: "hash",
      type: "magiclink",
    });
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });
});

// CENÁRIO OBRIGATÓRIO: admin existente não é rebaixado / e-mail divergente é
// recusado / convite já usado é recusado — a proteção real vive na RPC SQL
// (accept_member_invite / finalize_member_invite_activation, migrations
// 20260708102000_fix_member_invite_accept_safety.sql e
// 20260709100000_member_invite_email_binding.sql). Estes
// testes garantem que o wrapper JS repassa fielmente cada código de erro da
// RPC para a UI, em vez de mascará-los como sucesso.
describe("memberInvites — acceptMemberInvite relays RPC-level protections faithfully", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("relays email_mismatch (divergent e-mail is refused)", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "email_mismatch", message: "x" }, error: null });
    const result = await acceptMemberInvite("tok", "user-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("email_mismatch");
  });

  it("relays existing_org_access (an existing admin/church_admin is never demoted to member)", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "existing_org_access", message: "x" }, error: null });
    const result = await acceptMemberInvite("tok", "user-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("existing_org_access");
  });

  it("relays invite_not_pending (expired/revoked/already-accepted invites are refused)", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "invite_not_pending", message: "x" }, error: null });
    const result = await acceptMemberInvite("tok", "user-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("invite_not_pending");
  });

  it("relays invite_expired", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "invite_expired", message: "x" }, error: null });
    const result = await acceptMemberInvite("tok", "user-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("invite_expired");
  });

  it("relays member_already_linked", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "member_already_linked", message: "x" }, error: null });
    const result = await acceptMemberInvite("tok", "user-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("member_already_linked");
  });

  it("passes through a real success", async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, member_id: "m1", organization_id: "o1" },
      error: null,
    });
    const result = await acceptMemberInvite("tok", "user-1");
    expect(result).toEqual({ success: true, member_id: "m1", organization_id: "o1" });
  });

  it("calls the RPC with the caller's own token + userId only (never an e-mail)", async () => {
    rpcMock.mockResolvedValue({ data: { success: true }, error: null });
    await acceptMemberInvite("tok-xyz", "user-42");
    expect(rpcMock).toHaveBeenCalledWith("accept_member_invite", { p_token: "tok-xyz", p_user_id: "user-42" });
  });
});
