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

describe("migration finance_budgets", () => {
  const FILE_NAME = "20260721090000_finance_budgets.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("cria a tabela com RLS habilitado, policies e GRANT explícito para authenticated", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.finance_budgets");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/USING \(public\.is_org_finance_reader\(auth\.uid\(\), organization_id\)\)/);
    expect(sql).toMatch(/USING \(public\.is_org_finance_writer\(auth\.uid\(\), organization_id\)\)/);
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_budgets TO authenticated");
  });

  it("trata orçamento anual (period_month NULL) como valor único por organização/centro de custo/ano", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS finance_budgets_org_center_period_uidx");
    expect(sql).toContain("COALESCE(period_month, 0)");
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
