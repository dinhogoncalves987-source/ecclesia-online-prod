import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(
  ROOT,
  "supabase-production",
  "supabase",
  "migrations",
  "20260715170000_production_baseline_marker.sql",
);
const sql = readFileSync(BASELINE_PATH, "utf8");
const executableSql = sql.replace(/^\s*--.*$/gm, "");

describe("baseline isolado de produção", () => {
  it("é somente validação e não modifica schema nem dados de negócio", () => {
    expect(executableSql).toMatch(/\bDO\s+\$production_baseline\$/i);
    expect(executableSql).toMatch(/RAISE\s+EXCEPTION/i);
    expect(executableSql).not.toMatch(
      /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|MERGE|GRANT|REVOKE)\b/i,
    );
  });

  it("valida todas as garantias da reconciliação já aplicada", () => {
    for (const guarantee of [
      "public.super_admins",
      "relrowsecurity",
      "public.is_platform_admin(uuid)",
      "public.join_organization_by_slug(text)",
      "public.finalize_member_invite_activation(text,uuid)",
      "protect_profiles_admin_columns",
      "access_invites_email_required",
      "access_invites_role_allowed",
    ]) {
      expect(sql).toContain(guarantee);
    }
  });

  it("não referencia staging, seeds, projeto alheio ou quantidade de igrejas", () => {
    expect(sql).not.toContain("qkiiwopkbcslquyfhdec");
    expect(sql).not.toContain("afxaytvrmgszzigxsbcd");
    expect(sql).not.toMatch(/\bseed\b/i);
    expect(sql).not.toMatch(/organizations_preservadas|\b59\b/i);
  });
});
