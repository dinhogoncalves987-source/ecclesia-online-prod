import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = "20260803200000_access_bootstrap_hotfix.sql";

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("hotfix do bootstrap de acesso", () => {
  it("espelha a migration byte a byte entre staging e producao", () => {
    const staging = read(`supabase/migrations/${migrationName}`);
    const production = read(`supabase-production/supabase/migrations/${migrationName}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("usa somente a fonte canonica no caminho critico do bootstrap", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    expect(sql).toContain("FROM public.organization_responsibles responsible");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_my_access_capabilities()");
    expect(sql).not.toContain("FROM public.user_roles");
    expect(sql).not.toContain("FROM public.organization_users");
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("mantem um limite de tempo no bootstrap do aplicativo", () => {
    const source = read("src/hooks/useAuthBootstrap.ts");
    expect(source).toContain("BOOTSTRAP_TIMEOUT_MS = 12_000");
    expect(source).toContain("withBootstrapTimeout(Promise.all(");
    expect(source).toContain("error instanceof BootstrapTimeoutError");
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
