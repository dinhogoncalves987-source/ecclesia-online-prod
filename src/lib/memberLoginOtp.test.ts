import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * OPERAÇÃO ESPECIAL — Parte D (Login por telefone/WhatsApp), camada
 * frontend fina sobre a RPC pública, a Edge Function e a RPC de teste
 * administrativo. Nenhuma sessão é fabricada aqui: a troca final sempre
 * passa por `supabase.auth.verifyOtp` (SDK oficial). Estes testes mockam o
 * cliente Supabase — nenhuma chamada de rede real ocorre.
 */

const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
    auth: { verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args) },
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockFunctionsInvoke.mockReset();
  mockVerifyOtp.mockReset();
});

describe("requestMemberLoginOtp", () => {
  it("propaga sucesso quando o backend aceita o desafio", async () => {
    const { requestMemberLoginOtp } = await import("./memberLoginOtp");
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });

    const result = await requestMemberLoginOtp("+55 11 91234-5678");

    expect(mockRpc).toHaveBeenCalledWith("request_member_login_otp", { p_phone: "+55 11 91234-5678" });
    expect(result).toEqual({ ok: true });
  });

  it("devolve o código de erro fail-closed do backend (ex.: transporte desligado) sem mascará-lo como sucesso", async () => {
    const { requestMemberLoginOtp } = await import("./memberLoginOtp");
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "otp_disabled", hint: "Peça à Secretaria para gerar um código de teste." },
      error: null,
    });

    const result = await requestMemberLoginOtp("11912345678");

    expect(result).toEqual({
      ok: false,
      error: "otp_disabled",
      hint: "Peça à Secretaria para gerar um código de teste.",
    });
  });

  it("trata falha de rede/RPC como erro genérico, nunca como sucesso silencioso", async () => {
    const { requestMemberLoginOtp } = await import("./memberLoginOtp");
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "network down" } });

    const result = await requestMemberLoginOtp("11912345678");

    expect(result).toEqual({ ok: false, error: "request_failed" });
  });
});

describe("verifyMemberLoginOtp", () => {
  it("troca um código válido por uma sessão real via supabase.auth.verifyOtp (nunca monta JWT)", async () => {
    const { verifyMemberLoginOtp } = await import("./memberLoginOtp");
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: {
        ok: true,
        email: "member-123@members.ecclesiaonline.internal",
        token_hash: "th_abc",
        member_id: "member-123",
        member_name: "Fulano de Tal",
      },
      error: null,
    });
    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    const result = await verifyMemberLoginOtp("11912345678", "482913");

    expect(mockFunctionsInvoke).toHaveBeenCalledWith("verify-member-login-otp", {
      body: { phone: "11912345678", code: "482913" },
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "member-123@members.ecclesiaonline.internal",
      token_hash: "th_abc",
      type: "magiclink",
    });
    expect(result).toEqual({ ok: true, memberId: "member-123", memberName: "Fulano de Tal" });
  });

  it("rejeita código incorreto/expirado sem chamar verifyOtp e reporta tentativas restantes", async () => {
    const { verifyMemberLoginOtp } = await import("./memberLoginOtp");
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { ok: false, error: "invalid_code", attempts_remaining: 2 },
      error: null,
    });

    const result = await verifyMemberLoginOtp("11912345678", "000000");

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "invalid_code", attemptsRemaining: 2 });
  });

  it("nunca cria sessão se a ponte email/token_hash vier incompleta do backend", async () => {
    const { verifyMemberLoginOtp } = await import("./memberLoginOtp");
    mockFunctionsInvoke.mockResolvedValueOnce({ data: { ok: true, email: "x@y.z" }, error: null });

    const result = await verifyMemberLoginOtp("11912345678", "482913");

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("reporta falha de ponte de sessão sem declarar sucesso quando verifyOtp falha", async () => {
    const { verifyMemberLoginOtp } = await import("./memberLoginOtp");
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { ok: true, email: "member-123@members.ecclesiaonline.internal", token_hash: "th_abc" },
      error: null,
    });
    mockVerifyOtp.mockResolvedValueOnce({ error: { message: "expired" } });

    const result = await verifyMemberLoginOtp("11912345678", "482913");

    expect(result).toEqual({ ok: false, error: "session_bridge_failed" });
  });

  it("trata a Edge Function indisponível como erro explícito, nunca como código correto", async () => {
    const { verifyMemberLoginOtp } = await import("./memberLoginOtp");
    mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });

    const result = await verifyMemberLoginOtp("11912345678", "482913");

    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "verification_unavailable" });
  });
});

describe("adminGenerateManualTestOtp", () => {
  it("revela o código de teste de um único membro apenas na resposta desta chamada", async () => {
    const { adminGenerateManualTestOtp } = await import("./memberLoginOtp");
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        member_id: "member-1",
        member_name: "Ciclana",
        phone_normalized: "+5511912345678",
        code: "123456",
        expires_at: "2026-07-24T20:10:00.000Z",
      },
      error: null,
    });

    const result = await adminGenerateManualTestOtp("member-1");

    expect(mockRpc).toHaveBeenCalledWith("admin_generate_manual_test_otp", { p_member_id: "member-1" });
    expect(result).toEqual({
      ok: true,
      memberId: "member-1",
      memberName: "Ciclana",
      phoneNormalized: "+5511912345678",
      code: "123456",
      expiresAt: "2026-07-24T20:10:00.000Z",
    });
  });

  it("propaga o bloqueio fail-closed do backend (ex.: fora do modo manual_test) sem inventar um código", async () => {
    const { adminGenerateManualTestOtp } = await import("./memberLoginOtp");
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "otp_manual_test_admin_only" },
      error: null,
    });

    const result = await adminGenerateManualTestOtp("member-1");

    expect(result).toEqual({ ok: false, error: "otp_manual_test_admin_only" });
  });

  it("trata resposta incompleta do backend como falha, nunca como sucesso parcial", async () => {
    const { adminGenerateManualTestOtp } = await import("./memberLoginOtp");
    mockRpc.mockResolvedValueOnce({ data: { ok: true, code: "123456" }, error: null });

    const result = await adminGenerateManualTestOtp("member-1");

    expect(result.ok).toBe(false);
  });
});
