import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkMigrationManifestGate } from "../../scripts/lib/migrationManifest.mjs";

/**
 * FASE 7 (hardening P0) — garante que `supabase/migration-manifest.json`
 * (consumido por `scripts/supabase-guard.mjs`) cobre EXATAMENTE os arquivos
 * presentes em `supabase/migrations/` — nenhum arquivo real esquecido,
 * nenhuma entrada órfã no manifesto — e que o preflight de promoção para
 * produção bloqueia corretamente quando há migration staging_feature,
 * staging_only ou mixed_needs_split pendente.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const MANIFEST_PATH = path.join(ROOT, "supabase", "migration-manifest.json");

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function loadRealMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
}

const CATEGORY_KEYS = [
  "historical",
  "production_management",
  "staging_feature",
  "staging_only",
  "mixed_needs_split",
] as const;

describe("migration-manifest.json (Fase 7 — manifesto de migrations)", () => {
  it("cobre exatamente os arquivos .sql presentes em supabase/migrations (nenhum esquecido)", () => {
    const manifest = loadManifest();
    const realFiles = new Set(loadRealMigrationFiles());
    const manifestFiles = new Set<string>();
    for (const key of CATEGORY_KEYS) {
      for (const file of manifest[key] ?? []) manifestFiles.add(file);
    }

    const missingFromManifest = [...realFiles].filter((f) => !manifestFiles.has(f));
    expect(missingFromManifest, `arquivo(s) de migration sem classificação no manifesto: ${missingFromManifest.join(", ")}`).toEqual([]);
  });

  it("não contém nenhuma entrada órfã (arquivo que não existe mais em supabase/migrations)", () => {
    const manifest = loadManifest();
    const realFiles = new Set(loadRealMigrationFiles());
    const orphans: string[] = [];
    for (const key of CATEGORY_KEYS) {
      for (const file of manifest[key] ?? []) {
        if (!realFiles.has(file)) orphans.push(`${key}/${file}`);
      }
    }
    expect(orphans, `entrada(s) órfã(s) no manifesto: ${orphans.join(", ")}`).toEqual([]);
  });

  it("não classifica o mesmo arquivo em mais de uma categoria", () => {
    const manifest = loadManifest();
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const key of CATEGORY_KEYS) {
      for (const file of manifest[key] ?? []) {
        if (seen.has(file)) duplicates.push(`${file} (${seen.get(file)} + ${key})`);
        else seen.set(file, key);
      }
    }
    expect(duplicates, `arquivo(s) classificado(s) em mais de uma categoria: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("categorias não promovíveis contêm apenas nomes de arquivo não vazios", () => {
    const manifest = loadManifest();
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split"] as const) {
      for (const file of manifest[key] ?? []) {
        expect(typeof file).toBe("string");
        expect(file.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("checkMigrationManifestGate (preflight de promoção — Fase 7)", () => {
  it("nunca bloqueia --target=staging, mesmo com migrations exclusivas/mistas", () => {
    const manifest = {
      staging_feature: ["feature.sql"],
      staging_only: ["seed.sql"],
      mixed_needs_split: ["mixed.sql"],
    };
    const result = checkMigrationManifestGate(manifest, "staging");
    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("bloqueia --target=production quando a migration é de feature mantida no staging", () => {
    const manifest = {
      staging_feature: ["20260526100000_staging_worship_tables.sql"],
      staging_only: [],
      mixed_needs_split: [],
    };
    const result = checkMigrationManifestGate(manifest, "production");
    expect(result.blocked).toBe(true);
    expect(result.reasons.join(" ")).toContain("20260526100000_staging_worship_tables.sql");
  });

  it("bloqueia --target=production quando há migration staging_only pendente", () => {
    const manifest = { staging_feature: [], staging_only: ["20260519200000_demo_seed.sql"], mixed_needs_split: [] };
    const result = checkMigrationManifestGate(manifest, "production");
    expect(result.blocked).toBe(true);
    expect(result.reasons.join(" ")).toContain("20260519200000_demo_seed.sql");
  });

  it("bloqueia --target=production quando há migration mixed_needs_split pendente", () => {
    const manifest = { staging_feature: [], staging_only: [], mixed_needs_split: ["20260526200000_staging_secretaria_rls.sql"] };
    const result = checkMigrationManifestGate(manifest, "production");
    expect(result.blocked).toBe(true);
    expect(result.reasons.join(" ")).toContain("20260526200000_staging_secretaria_rls.sql");
  });

  it("não bloqueia --target=production quando todas as categorias não promovíveis estão vazias", () => {
    const manifest = { staging_feature: [], staging_only: [], mixed_needs_split: [] };
    const result = checkMigrationManifestGate(manifest, "production");
    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("o manifesto real bloquearia produção hoje (há features, seeds e arquivos mistos pendentes)", () => {
    const manifest = loadManifest();
    const result = checkMigrationManifestGate(manifest, "production");
    // Este é o estado ESPERADO nesta fase: nenhuma migration staging-only ou
    // mista foi resolvida/dividida ainda, então a promoção real para
    // produção deve continuar bloqueada até uma ação manual futura.
    expect(result.blocked).toBe(true);
  });
});
