import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * BUG CRÍTICO EM PRODUÇÃO — internal_threads/internal_messages/
 * internal_message_attachments têm RLS habilitado e policies corretas para
 * "authenticated" (20260609100000_staging_internal_messages.sql), mas nunca
 * receberam o GRANT de tabela correspondente. Sem esse GRANT de base, o
 * Postgres bloqueia a consulta ANTES de avaliar qualquer policy de RLS —
 * "permission denied for table internal_messages"/"internal_threads" em
 * produção, independente de qualquer correção de Realtime/status/presença.
 *
 * A correção ampla (20260717180000_fix_missing_authenticated_grants.sql,
 * 43 tabelas) está bloqueada em produção pelo próprio preflight, porque
 * public.administrative_requests tem uma policy sem "TO authenticated"
 * explícito — módulo fora do escopo desta tarefa (Chat/Perfil/Chamadas).
 * Esta migration é a correção restrita, só para as 3 tabelas de chat.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260718120000_internal_chat_missing_authenticated_grants.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration internal_chat_missing_authenticated_grants", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("concede GRANT apenas nas 3 tabelas de chat, nunca em administrative_requests ou outra tabela alheia", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    // Remove linhas de comentário (podem citar administrative_requests só como
    // explicação textual do bloqueio) — o que importa é o SQL executável.
    const executableSql = sql.replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("public.internal_threads");
    expect(sql).toContain("public.internal_messages");
    expect(sql).toContain("public.internal_message_attachments");
    expect(executableSql).not.toContain("administrative_requests");
    expect(executableSql).not.toMatch(/GRANT[\s\S]*?public\.user_roles/);
  });

  it("nunca altera nenhuma policy de RLS existente nem dados de negócio", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(create\s+policy|drop\s+policy|alter\s+policy|drop\s+table|truncate|delete\s+from|insert\s+into|update\s+public\.)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
