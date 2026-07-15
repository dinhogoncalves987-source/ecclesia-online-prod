import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithOtpMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args) },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/publicUrl", () => ({
  getPublicAppUrl: () => "https://app.example.com",
}));

import {
  acceptMemberInvite,
  emailsMatch,
  normalizeEmail,
  sendMemberInviteMagicLink,
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
