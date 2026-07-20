import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * BUG CRÍTICO EM PRODUÇÃO — public.profiles tem RLS habilitado e uma policy
 * correta de UPDATE para "authenticated" ("profiles users update own"), mas
 * o papel "authenticated" nunca recebeu o GRANT UPDATE de tabela
 * correspondente. Sem esse GRANT de base, o Postgres bloqueia o UPDATE ANTES
 * de avaliar a policy de RLS — "permission denied for table profiles" em
 * produção, o que explica por que nome, telefone, função e foto de perfil
 * nunca persistiam (a tela mostrava sucesso local, mas o dado não era salvo).
 *
 * Mesma classe de bug já corrigida para as tabelas de chat em
 * 20260718120000_internal_chat_missing_authenticated_grants.sql.
 *
 * Este teste é somente leitura: nunca aplica, move ou edita nenhuma
 * migration, e nunca se conecta a um banco de dados real.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const FILE_NAME = "20260720100000_profiles_missing_authenticated_update_grant.sql";
const STAGING_PATH = path.join(ROOT, "supabase", "migrations", FILE_NAME);
const PRODUCTION_PATH = path.join(ROOT, "supabase-production", "supabase", "migrations", FILE_NAME);

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

describe("migration profiles_missing_authenticated_update_grant", () => {
  it("existe, idêntica byte a byte, em staging e produção", () => {
    const stagingSql = readFileSync(STAGING_PATH, "utf8");
    const productionSql = readFileSync(PRODUCTION_PATH, "utf8");
    expect(sha256(productionSql)).toBe(sha256(stagingSql));
  });

  it("concede GRANT UPDATE apenas em public.profiles, nunca em outra tabela", () => {
    const sql = readFileSync(STAGING_PATH, "utf8");
    const executableSql = sql.replace(/^\s*--.*$/gm, "");
    expect(executableSql).toContain("GRANT UPDATE ON public.profiles TO authenticated");
    const grantMatches = executableSql.match(/GRANT\s+[\s\S]*?;/g) ?? [];
    for (const grant of grantMatches) {
      expect(grant).toContain("public.profiles");
    }
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
