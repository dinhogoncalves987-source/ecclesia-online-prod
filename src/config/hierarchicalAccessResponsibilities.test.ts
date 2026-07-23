import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCESS_PERMISSION_KEYS,
  ACCESS_RESPONSIBILITIES,
  ACCESS_RESPONSIBILITY_KEYS,
  mergeAccessResponsibilities,
  permissionsForResponsibilities,
} from "@/lib/accessControl";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const FILE = "20260716130000_hierarchical_access_responsibilities.sql";

const stagingSql = readFileSync(path.join(ROOT, "supabase", "migrations", FILE), "utf8");
const productionSql = readFileSync(
  path.join(ROOT, "supabase-production", "supabase", "migrations", FILE),
  "utf8",
);

// A migration acima (20260716130000) já foi promovida a production_management
// e não pode mais ser reescrita (ver supabase/migration-manifest.json). Novas
// operações modulares (Discipulado, e futuramente Teologia/Missões) inserem
// suas PRÓPRIAS linhas em access_responsibility_definitions em migrations
// posteriores e independentes, nunca reabrindo esta. A cobertura "toda
// responsabilidade do frontend existe em algum INSERT real" precisa então
// somar o texto de todas essas migrations — cada entrada abaixo corresponde a
// uma operação que estendeu o catálogo de responsabilidades.
const EXTRA_RESPONSIBILITY_MIGRATION_FILES = [
  // OPERAÇÃO 2 (Discipulado) — insere discipleship_coordinator/secretary/teacher.
  "20260729090000_discipleship_foundation.sql",
  // OPERAÇÃO 3 (Teologia) — insere theology_coordinator/secretary/teacher.
  "20260730090000_theology_foundation.sql",
];
const extraResponsibilitySql = EXTRA_RESPONSIBILITY_MIGRATION_FILES
  .map((file) => readFileSync(path.join(ROOT, "supabase", "migrations", file), "utf8"))
  .join("\n");
const allResponsibilitySql = stagingSql + "\n" + extraResponsibilitySql;

describe("arquitetura hierárquica de acessos", () => {
  it("mantém a migration de teste/staging e produção idêntica byte a byte", () => {
    expect(stagingSql).toBe(productionSql);
    expect(createHash("sha256").update(stagingSql).digest("hex"))
      .toBe(createHash("sha256").update(productionSql).digest("hex"));
  });

  it("não modifica a função eclesiástica do membro", () => {
    expect(stagingSql).not.toMatch(/UPDATE\s+public\.members\s+SET\s+member_role/i);
    expect(stagingSql).not.toMatch(/INSERT\s+INTO\s+public\.members/i);
  });

  it("preserva o papel-base ao reativar organization_users", () => {
    const helper = stagingSql.slice(
      stagingSql.indexOf("CREATE OR REPLACE FUNCTION public._apply_organization_responsibilities"),
      stagingSql.indexOf("REVOKE ALL ON FUNCTION public._apply_organization_responsibilities"),
    );
    expect(helper).toContain("DO UPDATE SET is_active = true, updated_at = now()");
    expect(helper).not.toMatch(/DO UPDATE SET[^;]*role\s*=/s);
  });

  it("revoga escrita direta e expõe concessão somente por RPC", () => {
    expect(stagingSql).toContain(
      "REVOKE ALL ON public.organization_responsibles FROM PUBLIC, anon",
    );
    expect(stagingSql).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.organization_responsibles FROM authenticated",
    );
    expect(stagingSql).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.organization_users FROM anon, authenticated",
    );
    expect(stagingSql).toContain("admin_set_organization_responsibilities");
    expect(stagingSql).toContain("can_manage_access_for_organization");
    expect(stagingSql).toContain("access_authority_organization");
  });

  it("substitui a unicidade histórica por pessoa, unidade e responsabilidade", () => {
    expect(stagingSql).toContain("DROP INDEX IF EXISTS public.idx_org_resp_unique_active");
    expect(stagingSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS organization_responsibles_one_active\s+ON public\.organization_responsibles\(organization_id, user_id, responsibility_type\)/,
    );
  });

  it("remove as policies legadas permissivas da tabela de responsabilidades", () => {
    for (const action of ["read", "insert", "update", "delete"]) {
      expect(stagingSql).toContain(
        `DROP POLICY IF EXISTS "responsibles ${action}" ON public.organization_responsibles`,
      );
    }
  });

  it("bloqueia concessão de governo pelo gestor do mesmo nível", () => {
    expect(stagingSql).toContain("local manager cannot grant governance responsibility at the same level");
    expect(stagingSql).toContain("definition.is_governance");
  });

  it("cobre exatamente as responsabilidades declaradas no frontend", () => {
    expect(ACCESS_RESPONSIBILITIES).toHaveLength(ACCESS_RESPONSIBILITY_KEYS.length);
    for (const key of ACCESS_RESPONSIBILITY_KEYS) {
      expect(allResponsibilitySql).toContain(`('${key}',`);
    }
  });

  it("toda permissão de responsabilidade pertence ao catálogo", () => {
    const valid = new Set<string>(ACCESS_PERMISSION_KEYS);
    for (const responsibility of ACCESS_RESPONSIBILITIES) {
      for (const permission of responsibility.permissions) {
        expect(valid.has(permission), `${responsibility.key}/${permission}`).toBe(true);
      }
    }
  });

  it("responsabilidades acumulam permissões sem trocar identidade", () => {
    const permissions = permissionsForResponsibilities(["member_manager", "gatekeeper"]);
    expect(permissions.has("members.write")).toBe(true);
    expect(permissions.has("gatekeeper.use")).toBe(true);
    expect(permissions.has("finance.write")).toBe(false);
  });

  it("uma nova concessão preserva as responsabilidades já existentes", () => {
    expect([
      ...mergeAccessResponsibilities(["member_manager"], ["gatekeeper"]),
    ].sort()).toEqual(["gatekeeper", "member_manager"]);
  });

  it("líder e co-líder administram somente o próprio grupo", () => {
    expect(stagingSql).toContain("CREATE OR REPLACE FUNCTION public.can_manage_group");
    expect(stagingSql).toContain("membership.group_id = _group_id");
    expect(stagingSql).toContain("membership.role IN ('leader', 'co_leader')");
  });

  it("convites de membro e externos carregam responsabilidades cumulativas", () => {
    expect(stagingSql).toMatch(/ALTER TABLE public\.access_invites[\s\S]*responsibility_types/);
    expect(stagingSql).toMatch(/ALTER TABLE public\.member_invites[\s\S]*target_organization_id/);
    expect(stagingSql).toContain("admin_create_member_access_invite");
    expect(stagingSql).toContain("admin_create_external_access_invite");
    expect(stagingSql).toContain("Preserva convites administrativos antigos");
    expect(stagingSql).not.toMatch(/WHEN 'member' THEN 'member_manager'/);
  });
});
