import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260715130000_harden_platform_role_escalation.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const match = sql.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^]*?AS \\$\\$([^]*?)\\$\\$;`, "i"),
  );
  if (!match) throw new Error(`função ${name} não encontrada na migration`);
  return match[1];
}

describe("platform-role hardening migration", () => {
  it("uses only super_admins as the root authority", () => {
    const body = functionBody("is_platform_admin");
    expect(body).toContain("public.super_admins");
    expect(body).not.toContain("public.profiles");
    expect(body).not.toContain("public.user_roles");
  });

  it("removes every known legacy role-mutation policy", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can insert roles"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can update roles"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can delete roles"');
    expect(sql).toContain('DROP POLICY IF EXISTS "user roles platform admins manage"');
  });

  it("does not let the finance helper trust profile or legacy role values", () => {
    const body = functionBody("is_platform_finance_admin");
    expect(body).toContain("public.is_platform_admin");
    expect(body).not.toContain("platform_role");
    expect(body).not.toContain("user_roles");
  });
});
