import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listEnabledModules } from "./modules";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE_VERSION = "20260715170000";

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("contrato de paridade staging/produção", () => {
  it("expõe exatamente os mesmos módulos nos dois ambientes", () => {
    expect(listEnabledModules("staging")).toEqual(listEnabledModules("production"));
  });

  it("não permite gates de ambiente no registro de módulos nem nas rotas", () => {
    const runtime = `${read("src/config/modules.ts")}\n${read("src/App.tsx")}`;
    expect(runtime).not.toContain("IS_STAGING_BUILD");
    expect(runtime).not.toMatch(/VITE_APP_ENV\s*===\s*["']staging["']/);
    expect(runtime).not.toMatch(/VITE_APP_ENV\s*===\s*["']production["']/);
  });

  it("mantém vazia a categoria de schema exclusivo de staging", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      staging_feature: string[];
      mixed_needs_split: string[];
    };
    expect(manifest.staging_feature).toEqual([]);
    expect(manifest.mixed_needs_split).toEqual([]);
  });

  it("não esconde migration nova como histórica nem leva seed ao workdir de produção", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      historical: string[];
      staging_only: string[];
    };
    const historicalAfterBaseline = manifest.historical
      .filter((file) => file.slice(0, 14) > BASELINE_VERSION);
    const seedsInProduction = manifest.staging_only
      .filter((file) =>
        existsSync(path.join(ROOT, "supabase-production", "supabase", "migrations", file)),
      );

    expect(
      historicalAfterBaseline,
      `migration nova indevidamente escondida como histórica: ${historicalAfterBaseline.join(", ")}`,
    ).toEqual([]);
    expect(
      seedsInProduction,
      `seed de teste presente no pacote de produção: ${seedsInProduction.join(", ")}`,
    ).toEqual([]);
  });

  it("espelha byte a byte toda migration estrutural posterior ao baseline", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      production_management: string[];
    };
    const missing: string[] = [];
    const divergent: string[] = [];

    for (const file of manifest.production_management) {
      if (file.slice(0, 14) <= BASELINE_VERSION) continue;

      const stagingPath = `supabase/migrations/${file}`;
      const productionPath = `supabase-production/supabase/migrations/${file}`;
      if (!existsSync(path.join(ROOT, productionPath))) {
        missing.push(file);
        continue;
      }
      if (digest(read(stagingPath)) !== digest(read(productionPath))) {
        divergent.push(file);
      }
    }

    expect(missing, `migrations estruturais sem espelho de produção: ${missing.join(", ")}`).toEqual([]);
    expect(divergent, `migrations divergentes entre ambientes: ${divergent.join(", ")}`).toEqual([]);
  });

  it("remove identificadores de sistemas anteriores do domínio canônico de membros", () => {
    const runtime = [
      read("src/pages/Membros.tsx"),
      read("src/pages/MemberProfile.tsx"),
      read("src/lib/memberSearch.ts"),
    ].join("\n");
    expect(runtime).not.toMatch(/legacy_(code|registration|source)/);
    expect(runtime).not.toMatch(/sistema\s+(antigo|anterior)|wintechi/i);

    const migration = read("supabase/migrations/20260803120000_member_schema_neutrality.sql");
    expect(migration).toContain("DROP COLUMN IF EXISTS legacy_code");
    expect(migration).toContain("DROP COLUMN IF EXISTS legacy_registration");
    expect(migration).toContain("DROP COLUMN IF EXISTS legacy_source");
    expect(digest(migration)).toBe(
      digest(read("supabase-production/supabase/migrations/20260803120000_member_schema_neutrality.sql")),
    );
  });
});
