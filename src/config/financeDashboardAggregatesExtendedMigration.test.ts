import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * CORREÇÃO C3.1 — extensão de finance_dashboard_aggregates (overdue +
 * by_congregation_category). Testes puramente estáticos: leem o texto da
 * migration, nunca executam SQL nem se conectam a um banco.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const FILE_NAME = "20260814150000_finance_dashboard_aggregates_extended.sql";

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

describe("migration finance_dashboard_aggregates_extended (CORREÇÃO C3.1)", () => {
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

  it("preflight exige que a função base (20260814140000) já exista", () => {
    const sql = readSql(staging);
    expect(sql).toContain("to_regprocedure('public.finance_dashboard_aggregates(uuid, uuid[], date, date)')");
    expect(sql).toContain("aplique 20260814140000 antes desta migration");
  });

  it("usa CREATE OR REPLACE com a MESMA assinatura — não introduz novo parâmetro", () => {
    const sql = readSql(staging);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.finance_dashboard_aggregates(\n  p_organization_id uuid,\n  p_hierarchy_organization_ids uuid[] DEFAULT NULL,\n  p_date_from date DEFAULT NULL,\n  p_date_to date DEFAULT NULL\n)");
  });

  it("permanece SEM SECURITY DEFINER — RLS de is_org_finance_reader continua aplicando", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.finance_dashboard_aggregates\([\s\S]*?\nEND;\n\$\$;/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/SECURITY DEFINER/);
  });

  it("overdue é calculado sem depender de p_date_from/p_date_to — sempre 'vencido hoje'", () => {
    const sql = readSql(staging);
    const overdueMatch = sql.match(/SELECT jsonb_build_object\(\s*\n\s*'count', COUNT\(\*\),\s*\n\s*'amount', COALESCE\(SUM\(t\.amount\), 0\)\s*\n\s*\)\s*\n\s*INTO v_overdue\s*\n\s*FROM public\.transactions t\s*\n\s*WHERE[\s\S]*?;/);
    expect(overdueMatch).not.toBeNull();
    expect(overdueMatch![0]).toContain("t.status NOT IN ('Pago', 'Confirmado')");
    expect(overdueMatch![0]).toContain("t.date < CURRENT_DATE");
    expect(overdueMatch![0]).not.toMatch(/p_date_from/);
    expect(overdueMatch![0]).not.toMatch(/p_date_to/);
  });

  it("by_congregation_category agrupa por congregação + categoria + tipo, ignorando congregation_id nulo", () => {
    const sql = readSql(staging);
    expect(sql).toContain("AND t.congregation_id IS NOT NULL");
    expect(sql).toContain("GROUP BY t.congregation_id, COALESCE(t.category, 'Geral')");
  });

  it("retorna as 7 chaves esperadas — 5 originais preservadas + overdue + by_congregation_category", () => {
    const sql = readSql(staging);
    const returnMatch = sql.match(/RETURN jsonb_build_object\(\s*\n\s*'totals', v_totals,\s*\n\s*'by_category', v_by_category,\s*\n\s*'by_cost_center', v_by_cost_center,\s*\n\s*'by_month', v_by_month,\s*\n\s*'by_organization', v_by_organization,\s*\n\s*'overdue', v_overdue,\s*\n\s*'by_congregation_category', v_by_congregation_category\s*\n\s*\);/);
    expect(returnMatch).not.toBeNull();
  });

  it("nega anon e concede EXECUTE somente a authenticated (mesmo grant do arquivo base)", () => {
    const sql = readSql(staging);
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) FROM PUBLIC, anon;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.finance_dashboard_aggregates(uuid, uuid[], date, date) TO authenticated;",
    );
  });

  it("nunca faz DROP/TRUNCATE/DELETE — é puramente aditiva (CREATE OR REPLACE)", () => {
    const sql = readSql(staging).toLowerCase();
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
    expect(sql).not.toMatch(/\bcreate\s+table\b/);
  });
});
