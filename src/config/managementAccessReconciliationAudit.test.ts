import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = "20260804090000_management_access_reconciliation_audit.sql";

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

/**
 * Homologacao 20260728 (segunda rodada) — Teologia e Missoes continuavam
 * ausentes para o perfil administrativo legado mesmo depois das migrations
 * 20260803180000/190000/200000 existirem no repositorio, e nao havia como
 * confirmar via CLI/Management API (bloqueada por 401) se elas de fato
 * tinham sido aplicadas em staging. Esta migration e uma segunda camada de
 * garantia, idempotente e auditavel: reforca novamente as mesmas
 * permission_keys e reconcilia organization_responsibles com normalizacao
 * defensiva de caixa/espaco, sem jamais conceder acesso indiscriminado.
 */
describe("auditoria de reconciliacao de acesso administrativo/pastoral", () => {
  it("espelha a migration byte a byte entre staging e producao", () => {
    const staging = read(`supabase/migrations/${migrationName}`);
    const production = read(`supabase-production/supabase/migrations/${migrationName}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("permanece classificada como estrutura comum dos dois ambientes", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      production_management: string[];
      staging_feature: string[];
      mixed_needs_split: string[];
    };
    expect(manifest.production_management).toContain(migrationName);
    expect(manifest.staging_feature).not.toContain(migrationName);
    expect(manifest.mixed_needs_split).not.toContain(migrationName);
  });

  it("e idempotente: so grava/atualiza quando falta capability ou vinculo, nunca sobrescreve indiscriminadamente", () => {
    const sql = read(`supabase/migrations/${migrationName}`);

    // O UPDATE em access_responsibility_definitions só toca linhas que
    // ainda não têm as três permissões de leitura — não é um "SET" cego.
    expect(sql).toMatch(
      /UPDATE public\.access_responsibility_definitions[\s\S]*?WHERE responsibility_type IN \('church_admin', 'responsible_pastor'\)\s*\n\s*AND NOT \(/,
    );

    // O INSERT em organization_responsibles é protegido por NOT EXISTS,
    // então rodar a migration duas vezes não duplica responsabilidades.
    expect(sql).toContain("NOT EXISTS (");
    expect(sql).toMatch(/INSERT INTO public\.organization_responsibles/);
  });

  it("nunca concede acesso global: todo INSERT é condicionado a um vínculo legado existente na mesma organização", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    expect(sql).not.toMatch(/GRANT\s+.*\s+TO\s+anon/i);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/service_role/i);
    // Nenhum papel é promovido para além do catálogo oficial de responsabilidades.
    expect(sql).toContain("JOIN public.access_responsibility_definitions definition");
  });

  it("nunca bloqueia o deploy: qualquer divergência residual é só um RAISE NOTICE, não uma exceção", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    const auditBlock = sql.slice(sql.indexOf("-- 3) Auditoria"));
    expect(auditBlock).toContain("RAISE NOTICE");
    expect(auditBlock).not.toMatch(/RAISE EXCEPTION/);
  });

  it("normaliza caixa/espaço do papel legado (defesa extra em relação à 20260803190000)", () => {
    const sql = read(`supabase/migrations/${migrationName}`);
    expect(sql).toContain("btrim(lower(membership.role))");
    expect(sql).toContain("btrim(lower(legacy_role.role))");
  });
});
