import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1D-C2 — exclusão segura das importações financeiras.
 * Testes puramente estáticos: leem o texto da migration, nunca executam SQL
 * nem se conectam a um banco. Segue a mesma convenção já usada por
 * financeConfiadcsReconciliationMigration.test.ts.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const FILE_NAME = "20260814120000_finance_import_batch_deletion.sql";

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

describe("migration finance_import_batch_deletion (FASE 1D-C2)", () => {
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

  it("cria exatamente as 2 RPCs exigidas, nenhuma tabela nova, nenhuma função de permissão nova", () => {
    const sql = readSql(staging);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.delete_finance_import_batch(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reset_organization_finance_imports(");
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.is_org_finance/);
  });

  it("reaproveita is_org_finance_writer já existente — nunca inventa uma permissão nova", () => {
    const sql = readSql(staging);
    const occurrences = sql.match(/public\.is_org_finance_writer\(auth\.uid\(\),/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("as 2 RPCs são SECURITY DEFINER com search_path seguro (public, pg_temp)", () => {
    const sql = readSql(staging);
    for (const fn of ["delete_finance_import_batch", "reset_organization_finance_imports"]) {
      const regex = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${fn}\\([^)]*\\)\\s*\\nRETURNS jsonb\\s*\\nLANGUAGE plpgsql\\s*\\nSECURITY DEFINER\\s*\\nSET search_path = public, pg_temp`,
      );
      expect(sql, `${fn} não é SECURITY DEFINER com search_path seguro`).toMatch(regex);
    }
  });

  it("exige autenticação (auth.uid() IS NULL) nas 2 RPCs", () => {
    const sql = readSql(staging);
    const occurrences = sql.match(/IF auth\.uid\(\) IS NULL THEN\s*\n\s*RAISE EXCEPTION 'authentication required';/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("nega anon explicitamente e concede apenas a authenticated e service_role", () => {
    const sql = readSql(staging);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.delete_finance_import_batch(uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.delete_finance_import_batch(uuid) TO authenticated, service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reset_organization_finance_imports(uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reset_organization_finance_imports(uuid) TO authenticated, service_role;");
  });

  it("delete_finance_import_batch: lote inexistente OU de outra organização falha com a MESMA mensagem genérica — nunca revela dados", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.delete_finance_import_batch\([\s\S]*?\nEND;\n\$\$;/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(
      /IF v_org IS NULL OR NOT public\.is_org_finance_writer\(auth\.uid\(\), v_org\) THEN\s*\n\s*RAISE EXCEPTION 'import batch not found';/,
    );
    // Nenhum outro RAISE EXCEPTION diferente é usado para "não encontrado" vs.
    // "sem permissão" — a mensagem é idêntica nos dois casos (mesmo IF).
    const notFoundRaises = fnBody.match(/RAISE EXCEPTION 'import batch not found';/g) ?? [];
    expect(notFoundRaises.length).toBe(2); // guarda inicial (p_batch_id NULL) + guarda de existência/permissão
  });

  it("reset_organization_finance_imports: nunca aceita organization_id sem checar permissão explicitamente", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.reset_organization_finance_imports\([\s\S]*?\nEND;\n\$\$;/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(
      /IF NOT public\.is_org_finance_writer\(auth\.uid\(\), p_organization_id\) THEN\s*\n\s*RAISE EXCEPTION 'access denied';/,
    );
  });

  it("delete_finance_import_batch: ordem exata de exclusão — auditorias, depois linhas do lote, depois transações, depois o lote", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.delete_finance_import_batch\([\s\S]*?\nEND;\n\$\$;/);
    const fnBody = fnMatch![0];
    const idxAuditLogs = fnBody.indexOf("DELETE FROM public.finance_transaction_audit_logs");
    const idxBatchRows = fnBody.indexOf("DELETE FROM public.finance_import_batch_rows");
    const idxTransactions = fnBody.indexOf("DELETE FROM public.transactions");
    const idxBatch = fnBody.indexOf("DELETE FROM public.finance_import_batches");
    expect(idxAuditLogs).toBeGreaterThan(-1);
    expect(idxBatchRows).toBeGreaterThan(idxAuditLogs);
    expect(idxTransactions).toBeGreaterThan(idxBatchRows);
    expect(idxBatch).toBeGreaterThan(idxTransactions);
  });

  it("reset_organization_finance_imports: mesma ordem exata de exclusão", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.reset_organization_finance_imports\([\s\S]*?\nEND;\n\$\$;/);
    const fnBody = fnMatch![0];
    const idxAuditLogs = fnBody.indexOf("DELETE FROM public.finance_transaction_audit_logs");
    const idxBatchRows = fnBody.indexOf("DELETE FROM public.finance_import_batch_rows");
    const idxTransactions = fnBody.indexOf("DELETE FROM public.transactions");
    const idxBatch = fnBody.indexOf("DELETE FROM public.finance_import_batches");
    expect(idxAuditLogs).toBeGreaterThan(-1);
    expect(idxBatchRows).toBeGreaterThan(idxAuditLogs);
    expect(idxTransactions).toBeGreaterThan(idxBatchRows);
    expect(idxBatch).toBeGreaterThan(idxTransactions);
  });

  it("nunca apaga transações por organization_id isolado — sempre filtra por import_batch_id (nunca toca lançamentos manuais)", () => {
    const sql = readSql(staging);
    // Toda exclusão de transações usa import_batch_id (direta ou via ids
    // coletados a partir dele) — nunca um DELETE genérico por
    // organization_id que também apagaria lançamentos manuais.
    expect(sql).not.toMatch(/DELETE FROM public\.transactions\s*\n\s*WHERE organization_id = /);
    expect(sql).toContain("WHERE t.organization_id = p_organization_id\n    AND t.import_batch_id = ANY(COALESCE(v_batch_ids, ARRAY[]::uuid[]));");
    expect(sql).toContain("WHERE import_batch_id = p_batch_id;");
  });

  it("delete_finance_import_batch nunca remove lotes de outra organização — todo DELETE de finance_import_batches é escopado por id", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.delete_finance_import_batch\([\s\S]*?\nEND;\n\$\$;/);
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(/DELETE FROM public\.finance_import_batches\s*\n\s*WHERE id = p_batch_id;/);
  });

  it("reset_organization_finance_imports nunca remove catálogos, contas, períodos, campanhas, orçamento ou patrimônio", () => {
    const sql = readSql(staging);
    const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.reset_organization_finance_imports\([\s\S]*?\nEND;\n\$\$;/);
    const fnBody = fnMatch![0];
    for (const forbiddenTable of [
      "finance_accounts",
      "finance_account_categories",
      "finance_accounting_groups",
      "finance_document_types",
      "finance_periods",
      "finance_cost_centers",
      "organizations",
    ]) {
      expect(fnBody, `reset não deveria referenciar ${forbiddenTable}`).not.toMatch(
        new RegExp(`DELETE FROM public\\.${forbiddenTable}\\b`),
      );
    }
  });

  it("remove os registros 'fantasma' de auditoria da própria exclusão (transaction_id NULL) identificados pelo id original em old_data — nunca por janela de tempo", () => {
    const sql = readSql(staging);
    const occurrences = sql.match(
      /DELETE FROM public\.finance_transaction_audit_logs\s*\n\s*WHERE transaction_id IS NULL\s*\n\s*AND action = 'delete'\s*\n\s*AND organization_id = \w+\s*\n\s*AND \(old_data->>'id'\)::uuid = ANY\(v_transaction_ids\);/g,
    ) ?? [];
    expect(occurrences.length).toBe(2);
    expect(sql).not.toMatch(/changed_at\s*>=/);
  });

  it("nunca desabilita trigger, RLS ou auditoria — nem temporária nem permanentemente", () => {
    const sql = readSql(staging);
    expect(sql).not.toMatch(/DISABLE TRIGGER/i);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/ALTER TABLE[^;]*DISABLE/i);
  });

  it("retorna JSON com as 4 contagens exigidas nas 2 RPCs", () => {
    const sql = readSql(staging);
    for (const field of ["transactions_removed", "audit_logs_removed", "batch_rows_removed", "batches_removed"]) {
      const occurrences = sql.match(new RegExp(`'${field}',`, "g")) ?? [];
      expect(occurrences.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("é aditiva — nunca DROP TABLE, nunca TRUNCATE, nunca remove coluna", () => {
    const sql = readSql(staging).toLowerCase();
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\bdrop\s+column\b/);
  });

  it("exige preflight das dependências (finance_import_batches, finance_import_batch_rows, finance_transaction_audit_logs, is_org_finance_writer, transactions.import_batch_id)", () => {
    const sql = readSql(staging);
    expect(sql).toContain("to_regclass('public.finance_import_batches')");
    expect(sql).toContain("to_regclass('public.finance_import_batch_rows')");
    expect(sql).toContain("to_regclass('public.finance_transaction_audit_logs')");
    expect(sql).toContain("to_regprocedure('public.is_org_finance_writer(uuid, uuid)')");
    expect(sql).toContain("column_name = 'import_batch_id'");
  });
});
