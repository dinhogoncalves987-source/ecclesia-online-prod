import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1D-C3 — agregações server-side do Financeiro.
 * Testes puramente estáticos: leem o texto da migration, nunca executam SQL
 * nem se conectam a um banco.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const FILE_NAME = "20260814140000_finance_dashboard_aggregates.sql";

function pairPaths(fileName: string) {
  return {
    staging: path.join(ROOT, "supabase", "migrations", fileName),
    production: path.join(ROOT, "supabase-production", "supabase", "migrations", fileName),
  };
}
function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
function readSql(filePath: string): string {
  return readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

const { staging, production } = pairPaths(FILE_NAME);

describe("migration finance_dashboard_aggregates (FASE 1D-C3)", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });

  it("cria o índice de paginação estável (organization_id, date DESC, raw_timestamp DESC, id DESC)", () => {
    const sql = readSql(staging);
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_transactions_org_date_rawts_id\n  ON public.transactions (organization_id, date DESC, raw_timestamp DESC, id DESC);",
    );
  });

  it("cria finance_dashboard_aggregates SEM SECURITY DEFINER — RLS de sempre aplica automaticamente", () => {
    const sql = readSql(staging);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.finance_dashboard_aggregates(");
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.finance_dashboard_aggregates\([\s\S]*?\nEND;\n\$\$;/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/SECURITY DEFINER/);
  });

  it("exige autenticação e organização — nunca agrega sem escopo", () => {
    const sql = readSql(staging);
    expect(sql).toMatch(/IF auth\.uid\(\) IS NULL THEN\s*\n\s*RAISE EXCEPTION 'authentication required';/);
    expect(sql).toMatch(/IF p_organization_id IS NULL THEN\s*\n\s*RAISE EXCEPTION 'organization required';/);
  });

  it("nunca cria nem duplica função de permissão — reaproveita is_org_finance_reader (RLS existente)", () => {
    const sql = readSql(staging);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.is_org_finance/);
    expect(sql).toContain("to_regprocedure('public.is_org_finance_reader(uuid, uuid)')");
  });

  it("nega anon e concede EXECUTE somente a authenticated", () => {
    const sql = readSql(staging);
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) FROM PUBLIC, anon;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) TO authenticated;",
    );
  });

  it("retorna as 5 chaves esperadas: totals, by_category, by_cost_center, by_month, by_organization", () => {
    const sql = readSql(staging);
    const returnMatch = sql.match(/RETURN jsonb_build_object\(\s*\n\s*'totals', v_totals,\s*\n\s*'by_category', v_by_category,\s*\n\s*'by_cost_center', v_by_cost_center,\s*\n\s*'by_month', v_by_month,\s*\n\s*'by_organization', v_by_organization\s*\n\s*\);/);
    expect(returnMatch).not.toBeNull();
  });

  it("normaliza 'Saida'/'Saída' consistentemente em todas as agregações — nunca conta só uma variante", () => {
    const sql = readSql(staging);
    const occurrences = sql.match(/type IN \('Saida', 'Saída'\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
  });

  it("by_organization só agrega quando p_hierarchy_organization_ids é informado — evita consulta extra sem uso", () => {
    const sql = readSql(staging);
    expect(sql).toContain("IF p_hierarchy_organization_ids IS NOT NULL AND array_length(p_hierarchy_organization_ids, 1) > 0 THEN");
    expect(sql).toContain("v_by_organization := '[]'::jsonb;");
  });

  it("nunca faz DROP/TRUNCATE/DELETE — é puramente leitura agregada e aditiva no schema (só índice novo)", () => {
    const sql = readSql(staging).toLowerCase();
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
  });
});
