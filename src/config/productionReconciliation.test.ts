import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationPath = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260715160000_reconcile_production_security.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.toLowerCase();

describe("reconciliação atômica da produção", () => {
  it("é transacional e preserva integralmente organizations", () => {
    expect(normalized).toContain("begin;");
    expect(normalized).toContain("commit;");
    expect(normalized).not.toMatch(/\b(delete\s+from|truncate(?:\s+table)?|drop\s+table|update)\s+public\.organizations\b/);
  });

  it("cria a raiz super_admins antes de torná-la autoridade única", () => {
    const createRoot = normalized.indexOf("create table if not exists public.super_admins");
    const redefineAuthority = normalized.indexOf("create or replace function public.is_platform_admin");
    expect(createRoot).toBeGreaterThanOrEqual(0);
    expect(redefineAuthority).toBeGreaterThan(createRoot);
    expect(normalized).toContain("from public.super_admins sa");
  });

  it("fecha autoelevação, ingresso por slug e finalização service-role", () => {
    expect(normalized).toContain("new.raw_user_meta_data->>'full_name'");
    expect(normalized).not.toContain("new.raw_user_meta_data->>'platform_role'");
    expect(normalized).toContain("drop function %s");
    expect(normalized).toContain("public.join_organization_by_slug(text)");
    expect(normalized).toContain("public.finalize_member_invite_activation(text,uuid)");
    expect(normalized).toContain("protect_profiles_admin_columns");
  });

  it("vincula os dois tipos de convite ao e-mail autenticado", () => {
    expect(normalized).toContain("access_invites_email_required");
    expect(normalized).toContain("access_invites_role_allowed");
    expect(normalized).toContain("caller_email <> lower(btrim(inv.email))");
    expect(normalized).toContain("v_auth_email <> lower(btrim(v_member.email))");
    expect(normalized).toContain("for update");
  });

  it("não contém seed, UUID fixo ou estrutura staging-only", () => {
    expect(normalized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
    expect(normalized).not.toContain("demo_seed");
    expect(normalized).not.toContain("worship_songs");
    expect(normalized).not.toContain("campaign_media");
    expect(normalized).not.toContain("recommendation_letters");
  });
});
