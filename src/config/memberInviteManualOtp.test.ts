import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migration = "20260803160000_member_invite_manual_whatsapp_otp.sql";
const whatsappOnlyMigration = "20260804100000_member_invite_whatsapp_only_split_delivery.sql";

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("convite manual de membro — sem Meta", () => {
  it("mantém a migration idêntica nos dois bancos", () => {
    const staging = read(`supabase/migrations/${migration}`);
    const production = read(`supabase-production/supabase/migrations/${migration}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("mantém a convergência WhatsApp-only idêntica nos dois bancos", () => {
    const staging = read(`supabase/migrations/${whatsappOnlyMigration}`);
    const production = read(`supabase-production/supabase/migrations/${whatsappOnlyMigration}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("vincula geração e verificação somente ao WhatsApp, sem fallback para telefone", () => {
    const sql = read(`supabase/migrations/${whatsappOnlyMigration}`);
    expect(sql).toContain("v_whatsapp := public._normalize_phone_e164_br(v_member.whatsapp)");
    expect(sql).toContain("'error', 'member_missing_whatsapp'");
    expect(sql).toContain("'error', 'whatsapp_mismatch'");
    expect(sql).not.toContain("v_member.phone");
    expect(sql).not.toContain("COALESCE(");
  });

  it("separa link e código em duas mensagens e usa somente form.whatsapp", () => {
    const modal = read("src/components/MemberInviteModal.tsx");
    const helpers = read("src/lib/memberInvites.ts");
    const members = read("src/pages/Membros.tsx");

    expect(modal).toContain("1. Enviar link pelo WhatsApp");
    expect(modal).toContain("2. Enviar código pelo WhatsApp");
    expect(helpers).toContain("buildWhatsappCodeLink");
    expect(members).toContain("whatsapp:   form.whatsapp?.trim() || null");
    expect(members).not.toContain("form.whatsapp?.trim() || form.phone?.trim()");
  });

  it("armazena somente hash, expira e limita tentativas", () => {
    const sql = read(`supabase/migrations/${migration}`);
    expect(sql).toContain("digest(v_code, 'sha256')");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("max_attempts, expires_at");
    expect(sql).toContain("attempt_count >= v_challenge.max_attempts");
    expect(sql).toContain("used_at IS NULL");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_generate_member_invite_otp(uuid)");
  });

  it("não dispara mensagem nem depende de API da Meta", () => {
    const sources = [
      read(`supabase/migrations/${migration}`),
      read("src/components/MemberInviteModal.tsx"),
      read("src/lib/memberInvites.ts"),
      read("supabase/functions/verify-member-login-otp/index.ts"),
    ].join("\n");

    expect(sources).toContain("https://wa.me/");
    expect(sources).not.toContain("graph.facebook.com");
    expect(sources).not.toContain("WHATSAPP_ACCESS_TOKEN");
    expect(sources).not.toContain("WHATSAPP_PHONE_NUMBER_ID");
  });
});
