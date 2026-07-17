import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * DEC-001 — "Código do Membro" (member_code): permite que cada igreja
 * preserve, ao migrar seus membros de um sistema anterior, o código/
 * matrícula que já usava. Campo opcional, único apenas dentro da mesma
 * organização quando preenchido.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real (nem de teste/
 * staging, nem de produção).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260717190000_members_add_member_code.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration members.member_code (DEC-001)", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("é aditiva e idempotente — nunca remove coluna, nunca apaga dados", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    const normalized = sql.toLowerCase();
    expect(normalized).toContain("add column if not exists member_code");
    expect(normalized).toContain("create unique index if not exists members_org_member_code_unique_idx");
    expect(normalized).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.members)\b/);
  });

  it("torna o código único apenas dentro da mesma organização, e só quando preenchido", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    const normalized = sql.toLowerCase();
    expect(normalized).toContain("on public.members (organization_id, member_code)");
    expect(normalized).toContain("where member_code is not null");
  });

  it("verifica o próprio resultado (coluna + índice) antes de concluir", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("pg_indexes");
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
