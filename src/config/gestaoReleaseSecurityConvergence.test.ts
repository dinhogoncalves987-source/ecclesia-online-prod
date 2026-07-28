import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName =
  "20260803130000_gestao_release_security_convergence.sql";

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

function executableSql(sql: string) {
  return sql.replace(/^\s*--.*$/gm, "");
}

describe("convergência de segurança da Gestão", () => {
  const staging = read(`supabase/migrations/${migrationName}`);
  const sql = executableSql(staging);

  it("mantém a mesma estrutura em staging e produção", () => {
    const production = read(
      `supabase-production/supabase/migrations/${migrationName}`,
    );
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");

    expect(digest(production)).toBe(digest(staging));
  });

  it("classifica a migration como estrutura compartilhada de produção", () => {
    const manifest = JSON.parse(
      read("supabase/migration-manifest.json"),
    ) as Record<string, string[]>;

    expect(manifest.production_management).toContain(migrationName);
    expect(manifest.staging_feature).not.toContain(migrationName);
    expect(manifest.staging_only).not.toContain(migrationName);
  });

  it("separa diretório operacional da ficha sensível do membro", () => {
    expect(sql).toContain("'members.sensitive.read'");
    expect(sql).toContain("CREATE OR REPLACE VIEW public.member_directory");
    expect(sql).toContain('CREATE POLICY "members sensitive capability select"');
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "members org members read"',
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Authenticated users can view all members"',
    );
    expect(sql).not.toMatch(
      /CREATE POLICY "members sensitive capability select"[\s\S]*?USING\s*\(\s*true\s*\)/i,
    );
  });

  it("remove as policies históricas permissivas de Gestão", () => {
    for (const policy of [
      "Auth users can view documents",
      "Users can view church documents",
      "Users can insert church documents",
      "Authenticated users can view all events",
      "Users can view church events",
      "Users can insert church events",
      "Auth users can view schedules",
      "Users can view church schedules",
      "Users can insert church schedules",
      "Users can view visible assemblies or own church",
      "Admins can insert assemblies",
      "Admins can update own church assemblies",
      "Admins can delete own assemblies",
      "Users can view assembly attachments",
      "Admins can insert attachments",
      "Admins can delete attachments",
      "assemblies storage staff insert",
      "assemblies storage staff update",
      "assemblies storage staff delete",
      "Auth users can upload avatars",
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}"`);
    }
  });

  it("isola arquivos privados e valida a ordem dos horários", () => {
    expect(sql).toContain(
      "WHERE id IN ('assemblies', 'member-documents')",
    );
    expect(sql).toContain("SET public = false");
    expect(sql).toContain('CREATE POLICY "avatars scoped insert"');
    expect(sql).toContain('CREATE POLICY "assemblies storage scoped select"');
    expect(sql).toContain("events_time_order_check");
    expect(sql).toContain("ends_at IS NULL OR ends_at > starts_at");
  });
});
