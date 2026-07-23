import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE_NAME = "20260726090000_update_own_profile_rpc.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

describe("migration update_own_profile_rpc", () => {
  it("é idêntica em staging e produção", () => {
    expect(sha256(readFileSync(PRODUCTION_PATH, "utf8")))
      .toBe(sha256(readFileSync(STAGING_PATH, "utf8")));
  });

  it("sempre usa auth.uid e limita os campos editáveis", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toContain("ARRAY['full_name', 'phone', 'role_title', 'avatar_url']");
    expect(sql).not.toMatch(/\bplatform_role\b/);
  });

  it("não é executável por anon e está classificada para produção", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM PUBLIC, anon");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated");

    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"),
    );
    expect(manifest.production_management).toContain(FILE_NAME);
  });
});
