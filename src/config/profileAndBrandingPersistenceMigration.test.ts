import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName =
  "20260801110000_profile_and_organization_branding_persistence.sql";

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

function executableSql(sql: string) {
  return sql.replace(/^\s*--.*$/gm, "");
}

describe("persistência de perfil e identidade institucional", () => {
  it("mantém staging e espelho de produção idênticos byte a byte", () => {
    const staging = read(`supabase/migrations/${migrationName}`);
    const production = read(
      `supabase-production/supabase/migrations/${migrationName}`,
    );
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");

    expect(digest(production)).toBe(digest(staging));
  });

  it("classifica a correção essencial como production_management", () => {
    const manifest = JSON.parse(
      read("supabase/migration-manifest.json"),
    ) as Record<string, string[]>;

    expect(manifest.production_management).toContain(migrationName);
    for (const category of [
      "staging_feature",
      "staging_only",
      "mixed_needs_split",
      "historical",
    ]) {
      expect(manifest[category] ?? []).not.toContain(migrationName);
    }
  });

  it("protege a escrita do logo pela organização extraída do caminho", () => {
    const sql = executableSql(
      read(`supabase/migrations/${migrationName}`),
    );

    expect(sql).toContain("organization_asset_organization_id");
    expect(sql).toContain("split_part(COALESCE(_object_name, ''), '/', 1)");
    expect(sql).toContain("split_part(_object_name, '/', 2)");
    expect(sql).toContain("organization assets authorized insert");
    expect(sql).toContain("organization assets authorized update");
    expect(sql).toContain("organization assets authorized delete");
    expect(sql).toContain("public.can_edit_organization_profile(");
    expect(sql).toContain("auth.uid()");
    expect(sql).not.toMatch(/\bUSING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/\bWITH\s+CHECK\s*\(\s*true\s*\)/i);
  });

  it("expõe somente RPCs autenticadas com allowlist de campos", () => {
    const sql = executableSql(
      read(`supabase/migrations/${migrationName}`),
    );

    for (const functionName of [
      "save_own_profile",
      "save_own_profile_avatar",
      "save_organization_profile",
      "save_organization_logo",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?SECURITY DEFINER`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?FROM PUBLIC, anon`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([\\s\\S]*?TO authenticated`,
        ),
      );
    }

    const ownProfileBody =
      sql.match(
        /CREATE OR REPLACE FUNCTION public\.save_own_profile\([\s\S]*?\n\$\$;/,
      )?.[0] ?? "";
    expect(ownProfileBody).toContain("full_name = EXCLUDED.full_name");
    expect(ownProfileBody).toContain("phone = EXCLUDED.phone");
    expect(ownProfileBody).toContain("role_title = EXCLUDED.role_title");
    expect(ownProfileBody).not.toMatch(/\bplatform_role\s*=/);
  });

  it("faz as telas usarem as RPCs e não UPDATE direto", () => {
    const profilePage = read("src/pages/Perfil.tsx");
    const organizationPage = read("src/pages/ConfiguracaoIgreja.tsx");

    expect(profilePage).toContain('supabase.rpc("save_own_profile"');
    expect(profilePage).toContain('"save_own_profile_avatar"');
    expect(profilePage).not.toContain('.from("profiles")\n      .update(');

    expect(organizationPage).toContain(
      'supabase.rpc("save_organization_profile"',
    );
    expect(organizationPage).toContain('"save_organization_logo"');
    expect(organizationPage).not.toContain(
      '.from("organizations")\n      .update(',
    );
  });
});
