import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * AUDITORIA DE CHAMADAS (Jitsi) — antes desta migration, o nome da sala era
 * derivado apenas de organization_id + thread_id (truncados), previsível
 * para quem conhecesse esses IDs, já que meet.jit.si é um servidor público
 * sem senha/JWT de sala. Esta migration adiciona um token aleatório
 * (call_room_token) persistido por thread, usado para compor o nome real
 * da sala em JitsiCallModal.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260718110000_internal_threads_call_room_token.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);
const JITSI_MODAL_PATH = path.join(ROOT, "src", "components", "messages", "JitsiCallModal.tsx");

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration internal_threads.call_room_token", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("cria a coluna call_room_token com default aleatório (gen_random_uuid)", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    expect(sql).toContain("add column if not exists call_room_token");
    expect(sql).toContain("gen_random_uuid()");
  });

  it("é aditiva — nunca remove coluna, nunca apaga dados de negócio", () => {
    const sql = readFileSync(STAGING_PATH, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.internal_threads)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });

  it("JitsiCallModal usa call_room_token (nunca deriva a sala apenas de organizationId/threadId)", () => {
    const tsx = readFileSync(JITSI_MODAL_PATH, "utf8");
    expect(tsx).toContain("callRoomToken");
    expect(tsx).not.toMatch(/makeRoomName\(\s*organizationId\s*,\s*threadId\s*\)/);
  });
});
