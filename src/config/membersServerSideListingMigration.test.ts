import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * OPERAÇÃO PERFORMANCE SUPREMA — infraestrutura server-side (índices + RPC de
 * contadores) que substitui o fetch-all client-side da tela Membros.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma migration,
 * e nunca se conecta a um banco de dados real (nem de teste/staging, nem de
 * produção).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260808170000_members_server_side_listing_performance.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration members server-side listing (OPERAÇÃO PERFORMANCE SUPREMA)", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("é aditiva — nunca remove/renomeia coluna, nunca apaga dados", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    const normalized = sql.toLowerCase();
    expect(normalized).toContain("add column if not exists search_blob");
    expect(normalized).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.members)\b/);
  });

  it("cria os índices necessários para busca e escopo hierárquico sem duplicar os existentes", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain("idx_members_search_trgm");
    expect(sql).toContain("gin_trgm_ops");
    expect(sql).toContain("idx_members_org_congregation");
    expect(sql).toContain("idx_members_org_sector");
    // Todos com IF NOT EXISTS — idempotente, nunca falha por índice já existir.
    const indexStatements = sql.match(/CREATE INDEX[^;]*;/g) ?? [];
    expect(indexStatements.length).toBeGreaterThan(0);
    for (const stmt of indexStatements) {
      expect(stmt).toContain("IF NOT EXISTS");
    }
  });

  it("a RPC member_status_counts usa SECURITY INVOKER, search_path fixo e não é acessível a `public`", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.member_status_counts(");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) FROM public");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.member_status_counts(uuid, uuid[], uuid[]) TO authenticated");
  });

  it("os contadores são agregados no servidor (GROUP BY), nunca contagem linha-a-linha no cliente", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql.toUpperCase()).toContain("GROUP BY M.STATUS");
    expect(sql.toUpperCase()).toContain("COUNT(*)");
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
