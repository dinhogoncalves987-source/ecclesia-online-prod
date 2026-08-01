import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = "20260803180000_management_access_visibility_convergence.sql";

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("convergencia de visibilidade dos modulos da gestao", () => {
  it("espelha a migration byte a byte entre staging e producao", () => {
    const staging = read(`supabase/migrations/${migrationName}`);
    const production = read(`supabase-production/supabase/migrations/${migrationName}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("reconcilia somente administradores e pastores que ja possuem vinculo", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    expect(sql).toContain("FROM public.organization_users membership");
    expect(sql).toContain("membership.role IN ('admin', 'church_admin', 'pastor')");
    expect(sql).toContain("'discipleship.read'");
    expect(sql).toContain("'theology.read'");
    expect(sql).toContain("'missions.read'");
    expect(sql).not.toContain("FROM auth.users");
  });

  it("esta classificada como estrutura comum de producao", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      production_management: string[];
      staging_feature: string[];
    };
    expect(manifest.production_management).toContain(migrationName);
    expect(manifest.staging_feature).not.toContain(migrationName);
  });
});
