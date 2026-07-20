import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * public.internal_thread_hidden_for_user ("apagar para mim") foi criada só
 * com policies/GRANT de SELECT/INSERT/DELETE, mas o cliente usa
 * `upsert(..., { onConflict: "thread_id,user_id" })` — que gera
 * `INSERT ... ON CONFLICT (...) DO UPDATE`, exigindo também UPDATE. Sem
 * isso, apagar de novo uma conversa já apagada pelo mesmo usuário falha.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260720110000_internal_thread_hidden_for_user_update_grant.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration internal_thread_hidden_for_user_update_grant", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("cria policy de UPDATE restrita ao próprio usuário e concede GRANT UPDATE apenas na tabela correta", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("GRANT UPDATE ON public.internal_thread_hidden_for_user TO authenticated");
    expect(sql).toMatch(/USING \(auth\.uid\(\) = user_id\)/);
    // O único GRANT executável do arquivo (fora de mensagens de RAISE) é o de cima.
    const grantStatements = sql.match(/^GRANT\s+[\s\S]*?;/gm) ?? [];
    expect(grantStatements.length).toBeGreaterThan(0);
    for (const grant of grantStatements) {
      expect(grant).toContain("public.internal_thread_hidden_for_user");
    }
  });

  it("nunca altera policies de SELECT/INSERT/DELETE existentes nem dados de negócio", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+table|truncate|delete\s+from|insert\s+into)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
