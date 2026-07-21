import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * public.internal_threads não estava na publicação supabase_realtime, e
 * public.internal_messages/internal_threads usavam REPLICA IDENTITY DEFAULT
 * (só a chave primária) — o Realtime do Supabase precisa de
 * REPLICA IDENTITY FULL para casar corretamente o `filter` (thread_id,
 * organization_id) em eventos UPDATE. Sem isso, quem estava com a conversa
 * aberta só via o tique de "entregue"/"lida" atualizar depois de sair e
 * voltar (força um novo SELECT completo), nunca em tempo real.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260725090000_internal_chat_realtime_hardening.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration internal_chat_realtime_hardening", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("adiciona internal_threads à publicação supabase_realtime de forma idempotente", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_threads");
    expect(sql).toMatch(/IF NOT EXISTS[\s\S]*pg_publication_tables[\s\S]*internal_threads/);
  });

  it("define REPLICA IDENTITY FULL em internal_messages e internal_threads", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("ALTER TABLE public.internal_messages REPLICA IDENTITY FULL");
    expect(sql).toContain("ALTER TABLE public.internal_threads REPLICA IDENTITY FULL");
  });

  it("nunca altera policies, grants ou dados de negócio existentes", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+table|truncate|delete\s+from|insert\s+into|grant\s|revoke\s|create\s+policy|drop\s+policy)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
