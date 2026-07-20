import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function pairPaths(fileName: string) {
  return {
    staging: path.join(ROOT, "supabase", "migrations", fileName),
    production: path.join(ROOT, "supabase-production", "supabase", "migrations", fileName),
  };
}

describe("migration finance_accountability", () => {
  const FILE_NAME = "20260723090000_finance_accountability.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("cria as duas tabelas com RLS habilitado, policies e GRANT explícito para authenticated", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.finance_accountability_reports");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.finance_accountability_approvals");
    expect(sql).toMatch(/ALTER TABLE public\.finance_accountability_reports ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.finance_accountability_approvals ENABLE ROW LEVEL SECURITY/);
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accountability_reports TO authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accountability_approvals TO authenticated");
  });

  it("nunca restringe o papel do aprovador a um enum fixo — role é texto livre por igreja", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toMatch(/role\s+text NOT NULL/);
    expect(sql).not.toMatch(/role\s+text[^,]*CHECK/);
  });

  it("garante período único por organização (evita relatórios duplicados do mesmo período)", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS finance_accountability_reports_org_period_uidx");
  });

  it("escopa approvals via o relatório pai (sem organization_id direto na tabela filha)", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM public\.finance_accountability_reports r/);
  });

  it("reaproveita helpers de RLS existentes — nenhuma função nova de RLS criada", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.is_org_finance/);
  });

  it("é aditiva — nunca remove tabela/coluna, nunca apaga dados de negócio", () => {
    const sql = readFileSync(staging, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
