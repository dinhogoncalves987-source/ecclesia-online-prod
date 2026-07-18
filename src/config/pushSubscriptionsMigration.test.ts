import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function pairPaths(fileName: string) {
  return {
    staging: path.join(ROOT, "supabase", "migrations", fileName),
    production: path.join(ROOT, "supabase-production", "supabase", "migrations", fileName),
  };
}

describe("migration push_subscriptions", () => {
  const FILE_NAME = "20260718130000_push_subscriptions.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("cria a tabela com RLS habilitado e policies restritas ao próprio usuário", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.push_subscriptions");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/USING \(auth\.uid\(\) = user_id\)/);
  });

  it("é aditiva — nunca remove tabela/coluna, nunca apaga dados de negócio", () => {
    const sql = readFileSync(staging, "utf8").toLowerCase();
    expect(sql).not.toMatch(/\b(drop\s+column|drop\s+table|truncate|delete\s+from|update\s+public\.)\b/);
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});

describe("migration internal_thread_notification_recipients", () => {
  const FILE_NAME = "20260718140000_internal_thread_notification_recipients.sql";
  const { staging, production } = pairPaths(FILE_NAME);

  it("existe, idêntica byte a byte, em staging e produção", () => {
    expect(sha256(readFileSync(production, "utf8"))).toBe(sha256(readFileSync(staging, "utf8")));
  });

  it("cria uma função SECURITY DEFINER somente leitura (nunca insere/atualiza/apaga)", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.internal_thread_notification_recipients");
    expect(sql).toContain("SECURITY DEFINER");
    const executableSql = sql.replace(/^\s*--.*$/gm, "").toLowerCase();
    expect(executableSql).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|drop\s+table)\b/);
  });

  it("nunca retorna o próprio remetente como destinatário", () => {
    const sql = readFileSync(staging, "utf8");
    expect(sql).toContain("c.user_id IS DISTINCT FROM _sender_user_id");
  });

  it("está classificada em migration-manifest.json como production_management", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    expect(manifest.production_management).toContain(FILE_NAME);
    for (const key of ["staging_feature", "staging_only", "mixed_needs_split", "historical"] as const) {
      expect(manifest[key] ?? []).not.toContain(FILE_NAME);
    }
  });
});
