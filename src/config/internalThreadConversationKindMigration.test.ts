import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE_NAME = "20260726110000_internal_thread_conversation_kind.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

describe("migration internal_thread_conversation_kind", () => {
  it("é idêntica em staging e produção", () => {
    expect(sha256(readFileSync(PRODUCTION_PATH, "utf8")))
      .toBe(sha256(readFileSync(STAGING_PATH, "utf8")));
  });

  it("separa os quatro tipos de conversa e bloqueia DM para si mesmo", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    for (const kind of ["contextual", "institutional", "staff_member", "member_direct"]) {
      expect(sql).toContain(`'${kind}'`);
    }
    expect(sql).toContain("target.user_id <> auth.uid()");
  });

  it("não concede à equipe acesso automático à conversa privada entre membros", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toMatch(/conversation_kind = 'member_direct'[\s\S]*created_by = _user_id OR target\.user_id = _user_id/);
    expect(sql).toContain("WHERE thread_data.conversation_kind <> 'member_direct'");
  });

  it("está classificada para produção", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"),
    );
    expect(manifest.production_management).toContain(FILE_NAME);
  });
});
