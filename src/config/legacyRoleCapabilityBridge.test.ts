import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = "20260803190000_legacy_role_capability_bridge.sql";

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("ponte entre papeis legados e capabilities", () => {
  it("espelha a migration byte a byte entre staging e producao", () => {
    const staging = read(`supabase/migrations/${migrationName}`);
    const production = read(`supabase-production/supabase/migrations/${migrationName}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("reconcilia as duas fontes de papel sem usar auth.users", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    expect(sql).toContain("FROM public.organization_users membership");
    expect(sql).toContain("FROM public.user_roles legacy_role");
    expect(sql).toContain("legacy_role.organization_id IS NOT NULL");
    expect(sql).toContain("membership.user_id = legacy_role.user_id");
    expect(sql).toContain("legacy_role.organization_id IS NULL");
    expect(sql).not.toContain("FROM auth.users");
  });

  it("alinha tanto a RPC do frontend quanto a autorizacao das RLS", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_my_access_capabilities()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.has_org_access_permission(");
    expect(sql).toContain("WHEN 'admin' THEN 'church_admin'");
    expect(sql).toContain("WHEN 'pastor' THEN 'responsible_pastor'");
  });

  it("permanece classificada como estrutura comum dos dois ambientes", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      production_management: string[];
      staging_feature: string[];
    };
    expect(manifest.production_management).toContain(migrationName);
    expect(manifest.staging_feature).not.toContain(migrationName);
  });
});
