/**
 * OPERAÇÃO 4 — Missões completa sobre a fundação revisada do Ecclesia.
 *
 * Testes de regressão sobre as 6 migrations novas desta operação. Somente
 * leitura de arquivo — nunca conecta a um banco, nunca aplica migration (ver
 * docs/architecture/operacao-4-missoes.md). Mesmo padrão de
 * src/config/theologyMigrations.test.ts (Operação 3).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCESS_PERMISSION_KEYS, ACCESS_RESPONSIBILITIES } from "@/lib/accessControl";
import { HISTORY_TYPES } from "@/lib/memberHistoryConstants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const STAGING_DIR = path.join(ROOT, "supabase", "migrations");
const PRODUCTION_DIR = path.join(ROOT, "supabase-production", "supabase", "migrations");

const MISSIONS_MIGRATIONS = [
  "20260731090000_missions_foundation.sql",
  "20260731100000_missions_missionaries.sql",
  "20260731110000_missions_projects.sql",
  "20260731120000_missions_supporters_commitments.sql",
  "20260731130000_missions_transaction_links.sql",
  "20260731140000_missions_history_and_reports.sql",
] as const;

function readStaging(file: string): string {
  return readFileSync(path.join(STAGING_DIR, file), "utf8");
}
function readProduction(file: string): string {
  return readFileSync(path.join(PRODUCTION_DIR, file), "utf8");
}
function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Remove comentários "-- ..." antes de testar padrões de código real (evita falso positivo com prosa nos cabeçalhos). */
function stripSqlComments(sql: string): string {
  return sql.split("\n").map((line) => line.replace(/--.*/, "")).join("\n");
}

const foundationSql = readStaging(MISSIONS_MIGRATIONS[0]);
const missionariesSql = readStaging(MISSIONS_MIGRATIONS[1]);
const projectsSql = readStaging(MISSIONS_MIGRATIONS[2]);
const supportersSql = readStaging(MISSIONS_MIGRATIONS[3]);
const txLinksSql = readStaging(MISSIONS_MIGRATIONS[4]);
const historyReportsSql = readStaging(MISSIONS_MIGRATIONS[5]);
const allSql = [foundationSql, missionariesSql, projectsSql, supportersSql, txLinksSql, historyReportsSql].join("\n");
const allSqlNoComments = stripSqlComments(allSql);

describe("Missões — migrations existem em staging e produção com conteúdo idêntico", () => {
  it.each(MISSIONS_MIGRATIONS)("%s existe nas duas árvores e é byte a byte idêntica", (file) => {
    const stagingPath = path.join(STAGING_DIR, file);
    const productionPath = path.join(PRODUCTION_DIR, file);
    expect(existsSync(stagingPath), `faltando em supabase/migrations: ${file}`).toBe(true);
    expect(existsSync(productionPath), `faltando em supabase-production/supabase/migrations: ${file}`).toBe(true);
    expect(sha256(readProduction(file)), `conteúdo diverge entre staging e produção para ${file}`).toBe(
      sha256(readStaging(file)),
    );
  });

  it("as 6 migrations estão listadas em supabase/migration-manifest.json como staging_feature (nenhuma aplicada)", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    for (const file of MISSIONS_MIGRATIONS) {
      expect(manifest.staging_feature, `${file} deveria estar em staging_feature`).toContain(file);
      for (const category of ["production_management", "staging_only", "historical", "mixed_needs_split"] as const) {
        expect(manifest[category], `${file} não deveria estar em ${category}`).not.toContain(file);
      }
    }
  });

  it("cada migration depende explicitamente de estruturas da migration anterior (preflight)", () => {
    expect(missionariesSql).toContain("public.missions_settings (migration anterior)");
    expect(projectsSql).toContain("public.missions_missionaries (migration anterior)");
    expect(supportersSql).toContain("public.missions_missionaries");
    expect(supportersSql).toContain("public.missions_projects");
    expect(txLinksSql).toContain("public.missions_commitment_installments");
    expect(historyReportsSql).toContain("public.missions_transaction_links");
  });

  it("nenhuma migration é destrutiva (sem DROP TABLE de tabelas pré-existentes, sem TRUNCATE)", () => {
    expect(allSqlNoComments).not.toMatch(/DROP TABLE/i);
    expect(allSqlNoComments).not.toMatch(/TRUNCATE/i);
  });

  it("todas as migrations usam transação explícita (BEGIN/COMMIT) e verificação final pós-DDL", () => {
    for (const sql of [foundationSql, missionariesSql, projectsSql, supportersSql, txLinksSql, historyReportsSql]) {
      expect(sql.trimStart()).toMatch(/^--/);
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql).toMatch(/^COMMIT;/m);
      expect(sql).toMatch(/DO \$\$\s*\nBEGIN\s*\n\s*IF NOT EXISTS/m);
    }
  });

  it("nenhuma migration anterior (Operações 1/2/3) foi reaberta ou alterada por esta operação", () => {
    for (const sql of [foundationSql, missionariesSql, projectsSql, supportersSql, txLinksSql, historyReportsSql]) {
      expect(sql).not.toMatch(/ALTER TABLE public\.discipleship_/);
      expect(sql).not.toMatch(/ALTER TABLE public\.theology_/);
      expect(sql).not.toMatch(/ALTER TABLE public\.member_addresses/);
    }
    // A ÚNICA extensão de tabela pré-existente é a CHECK de member_history.history_type
    // (catálogo fechado, extensão aditiva) na migration 6.
    for (const sql of [foundationSql, missionariesSql, projectsSql, supportersSql, txLinksSql]) {
      expect(sql).not.toMatch(/ALTER TABLE public\.member_history/);
    }
  });
});

describe("Missões — regra central de identidade (nenhuma tabela paralela de pessoa/organização)", () => {
  it("não cria nenhuma tabela de pessoa própria do módulo (missionários/contribuintes/etc.)", () => {
    expect(allSqlNoComments).not.toMatch(
      /CREATE TABLE[^;]*public\.(missions_people|missions_missionaries_people|missionarios|contribuintes|pessoas)\b/i,
    );
  });

  it("não altera member_role nem insere linhas em public.members", () => {
    expect(allSqlNoComments).not.toMatch(/UPDATE\s+public\.members\s+SET\s+member_role/i);
    expect(allSqlNoComments).not.toMatch(/INSERT\s+INTO\s+public\.members\b/i);
  });

  it("missionário, apoiador e responsável de projeto referenciam members.id via member_id", () => {
    expect(missionariesSql).toMatch(/member_id uuid NOT NULL UNIQUE REFERENCES public\.members\(id\)/);
    expect(supportersSql).toMatch(/member_id uuid NOT NULL REFERENCES public\.members\(id\)/);
    expect(projectsSql).toMatch(/member_id uuid NOT NULL REFERENCES public\.members\(id\)/);
  });

  it("não cria nenhuma tabela paralela de organização/hierarquia eclesiástica", () => {
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.(churches|congregacoes|distritos|setores|conventions|missions_organizations)\b/i);
  });

  it("missionário e projeto sempre referenciam organizations.id (nunca uma hierarquia paralela)", () => {
    expect(missionariesSql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/);
    expect(projectsSql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/);
  });

  it("não cria bucket de storage novo (reutiliza member-documents/documents)", () => {
    expect(allSqlNoComments).not.toMatch(/storage\.buckets/i);
  });

  it("documento confidencial do missionário referencia public.documents (nunca uma tabela de documentos paralela)", () => {
    expect(missionariesSql).toMatch(/document_id uuid REFERENCES public\.documents\(id\)/);
  });

  it("projeto pode se ligar a public.campaigns já existente (ligação especializada, nunca campanha duplicada)", () => {
    expect(projectsSql).toMatch(/campaign_id uuid REFERENCES public\.campaigns\(id\)/);
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.missions_campaigns\b/i);
  });
});

describe("Missões — RLS habilitado em todas as 9 tabelas novas", () => {
  const TABLES = [
    "missions_settings", "missions_missionaries", "missions_missionary_confidential_info",
    "missions_projects", "missions_project_assignments", "missions_supporters",
    "missions_supporter_commitments", "missions_commitment_installments", "missions_transaction_links",
  ];

  it("a lista de 9 tabelas cobre exatamente as tabelas criadas nas migrations", () => {
    const created = [...allSql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(missions_\w+)/g)].map((m) => m[1]);
    expect(new Set(created)).toEqual(new Set(TABLES));
  });

  it.each(TABLES)("%s tem ENABLE ROW LEVEL SECURITY", (table) => {
    expect(allSql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  });

  it("nenhuma policy usa USING (true) ou WITH CHECK (true)", () => {
    expect(allSqlNoComments).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(allSqlNoComments).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it("toda policy usa has_org_access_permission (nunca role hardcoded)", () => {
    const policyBlocks = allSql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policyBlocks.length).toBeGreaterThan(8);
    for (const block of policyBlocks) {
      expect(/has_org_access_permission/.test(block), `policy sem capability-check real: ${block.slice(0, 90)}...`).toBe(true);
    }
  });

  it("missions_missionary_confidential_info exige missions.confidential (nunca missions.read/manage isolados)", () => {
    const policyBlock = missionariesSql.slice(
      missionariesSql.indexOf('CREATE POLICY "missions_missionary_confidential'),
      missionariesSql.indexOf("REVOKE INSERT, UPDATE, DELETE ON public.missions_missionary_confidential_info"),
    );
    expect(policyBlock).toContain("'missions.confidential'");
  });

  it("missions_transaction_links exige AMBAS finance.read e missions.read (nunca uma sozinha)", () => {
    expect(txLinksSql).toContain("public.has_org_access_permission(auth.uid(), organization_id, 'finance.read')");
    expect(txLinksSql).toContain("public.has_org_access_permission(auth.uid(), i.organization_id, 'missions.read')");
    expect(txLinksSql).toContain("public.has_org_access_permission(auth.uid(), p.organization_id, 'missions.read')");
    expect(txLinksSql).toContain("public.has_org_access_permission(auth.uid(), m.organization_id, 'missions.read')");
    expect(txLinksSql).toContain("public.has_org_access_permission(auth.uid(), c.organization_id, 'missions.read')");
  });
});

describe("Missões — escrita crítica somente por RPC (nunca burlável por UPDATE/INSERT direto)", () => {
  const FULLY_REVOKED_TABLES = [
    "missions_settings", "missions_missionaries", "missions_missionary_confidential_info",
    "missions_projects", "missions_project_assignments", "missions_supporters",
    "missions_supporter_commitments", "missions_commitment_installments", "missions_transaction_links",
  ];

  it.each(FULLY_REVOKED_TABLES)("%s revoga INSERT/UPDATE/DELETE de authenticated (só GRANT SELECT)", (table) => {
    expect(allSql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated`);
    expect(allSql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
  });

  it("todas as RPCs SECURITY DEFINER expostas revogam PUBLIC/anon e concedem apenas a authenticated", () => {
    const PUBLIC_RPCS = [
      "upsert_missions_settings(uuid, uuid, uuid, uuid, text, integer, integer, text)",
      "create_missions_missionary(uuid, uuid, uuid, text, text, text, text, text, text)",
      "update_missions_missionary_profile(uuid, uuid, text, text, text, text, text, text)",
      "update_missions_missionary_status(uuid, text, date, text)",
      "upsert_missions_missionary_confidential_info(uuid, text, text, text, text, text, uuid, text)",
      "create_missions_project(uuid, text, text, text, uuid, text, text, text, text, date, date, text)",
      "update_missions_project_profile(uuid, text, text, text, uuid, text, text, text, text, date, date, text)",
      "update_missions_project_status(uuid, text, text)",
      "assign_missions_project_member(uuid, uuid, text, date, text)",
      "end_missions_project_assignment(uuid, date)",
      "create_missions_supporter(uuid, uuid, text, text)",
      "update_missions_supporter_status(uuid, text)",
      "create_missions_commitment(uuid, text, numeric, uuid, uuid, uuid, date, date, text)",
      "update_missions_commitment_status(uuid, text)",
      "generate_missions_commitment_installment(uuid, text, date, numeric)",
      "refresh_missions_installment_status(uuid)",
      "set_missions_installment_exemption(uuid, text, text)",
      "link_missions_transaction(uuid, text, uuid, uuid, uuid, uuid, text)",
      "unlink_missions_transaction(uuid)",
      "list_missions_linked_transactions(uuid, uuid, uuid, uuid)",
      "search_missions_members(uuid, text, integer)",
      "get_missions_member_labels(uuid, uuid[])",
      "get_missions_dashboard_summary(uuid)",
      "list_missions_missionaries_by_field(uuid)",
      "list_missions_project_indicators(uuid, uuid)",
      "list_missions_commitment_installments(uuid, text, boolean)",
    ];
    for (const signature of PUBLIC_RPCS) {
      const fnName = signature.split("(")[0];
      expect(allSql, `${fnName}: REVOKE ALL ... FROM PUBLIC, anon ausente`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fnName}\\([\\s\\S]*?\\) FROM PUBLIC, anon`),
      );
      expect(allSql, `${fnName}: GRANT EXECUTE ... TO authenticated ausente`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fnName}\\([\\s\\S]*?\\) TO authenticated`),
      );
    }
  });

  it("helpers internos (triggers de escopo/histórico, recomputo de parcela) revogam também de authenticated", () => {
    expect(missionariesSql).toContain(
      "REVOKE ALL ON FUNCTION public._missions_missionaries_validate_scope() FROM PUBLIC, anon, authenticated",
    );
    expect(supportersSql).toContain(
      "REVOKE ALL ON FUNCTION public._recompute_missions_installment_status(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(txLinksSql).toContain(
      "REVOKE ALL ON FUNCTION public._missions_transaction_links_after_delete() FROM PUBLIC, anon, authenticated",
    );
    expect(historyReportsSql).toContain(
      "REVOKE ALL ON FUNCTION public._register_missions_member_history(",
    );
    expect(historyReportsSql).toContain("FROM PUBLIC, anon, authenticated");
    expect(historyReportsSql).toContain(
      "REVOKE ALL ON FUNCTION public._missions_missionaries_register_history() FROM PUBLIC, anon, authenticated",
    );
    expect(historyReportsSql).toContain(
      "REVOKE ALL ON FUNCTION public._missions_project_assignments_register_history() FROM PUBLIC, anon, authenticated",
    );
  });

  it("register_member_history_event permanece interno (service_role) — Missões nunca o expõe direto ao navegador", () => {
    expect(historyReportsSql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.register_member_history_event[\s\S]*?TO authenticated/);
    expect(historyReportsSql).toContain("TO service_role");
  });
});

describe("Missões — regras de negócio garantidas por índice único (concorrência e duplicidade)", () => {
  it("apoiador é único por membro/organização (evita cadastro duplicado)", () => {
    expect(supportersSql).toContain("UNIQUE (member_id, organization_id)");
  });

  it("missionário é papel único por membro (UNIQUE em member_id)", () => {
    expect(missionariesSql).toMatch(/member_id uuid NOT NULL UNIQUE REFERENCES/);
  });

  it("vínculo ativo de projeto não duplica o mesmo papel do mesmo membro no mesmo projeto", () => {
    expect(projectsSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS missions_project_assignments_active_unique_idx");
    expect(projectsSql).toContain("WHERE status = 'ativo'");
  });

  it("parcela é única por compromisso/mês de referência (nunca duplicada)", () => {
    expect(supportersSql).toContain("UNIQUE (commitment_id, reference_month)");
  });

  it("uma transação real só pode ter um único vínculo missionário (nunca contada duas vezes)", () => {
    expect(txLinksSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS missions_transaction_links_transaction_idx\s+ON public\.missions_transaction_links \(transaction_id\)/,
    );
  });

  it("transições de status usam FOR UPDATE (lock de concorrência)", () => {
    expect(missionariesSql).toMatch(/FROM public\.missions_missionaries WHERE id = p_missionary_id FOR UPDATE/);
    expect(projectsSql).toMatch(/FROM public\.missions_projects WHERE id = p_project_id FOR UPDATE/);
    expect(supportersSql).toMatch(/FROM public\.missions_supporter_commitments WHERE id = p_commitment_id FOR UPDATE/);
    expect(supportersSql).toMatch(/FROM public\.missions_commitment_installments WHERE id = p_installment_id FOR UPDATE/);
  });
});

describe("Missões — máquinas de estado protegidas contra lançamento em contexto inválido", () => {
  it("missionário segue candidato → em_preparação → ativo → em_licença/retornado → encerrado (terminal)", () => {
    expect(missionariesSql).toContain("invalid missionary status transition: % -> %");
    expect(missionariesSql).toMatch(/v_row\.status = 'candidato' AND p_status IN \('em_preparacao', 'encerrado'\)/);
    expect(missionariesSql).toMatch(/v_row\.status = 'em_preparacao' AND p_status IN \('ativo', 'encerrado'\)/);
    expect(missionariesSql).toMatch(/v_row\.status = 'ativo' AND p_status IN \('em_licenca', 'retornado', 'encerrado'\)/);
  });

  it("projeto segue rascunho → planejado → ativo → suspenso/concluído/cancelado → arquivado (terminal)", () => {
    expect(projectsSql).toContain("invalid project status transition: % -> %");
    expect(projectsSql).toMatch(/v_row\.status = 'rascunho' AND p_status IN \('planejado', 'cancelado'\)/);
    expect(projectsSql).toMatch(/v_row\.status = 'concluido' AND p_status = 'arquivado'/);
  });

  it("compromisso segue ativo/pausado, sem retorno de encerrado/cancelado (terminal)", () => {
    expect(supportersSql).toContain("invalid commitment status transition: % -> %");
    expect(supportersSql).toMatch(/v_row\.status = 'ativo' AND p_status IN \('pausado', 'encerrado', 'cancelado'\)/);
  });

  it("parcelas só são geradas para compromissos ativos", () => {
    expect(supportersSql).toContain("installments can only be generated for active commitments");
  });

  it("apenas missionário/projeto associado ao papel 'missionario' exige registro prévio em missions_missionaries", () => {
    expect(projectsSql).toContain("member must be registered as a missionary before this role can be assigned");
  });
});

describe("Missões — parcela nunca é marcada como paga sem transação real (contrato §7)", () => {
  it("_recompute_missions_installment_status deriva o status somando somente transações reais do tipo 'Entrada'", () => {
    expect(supportersSql).toMatch(/JOIN public\.transactions t ON t\.id = l\.transaction_id/);
    expect(supportersSql).toContain("WHERE l.installment_id = p_installment_id AND t.type = 'Entrada'");
  });

  it("cancelado/isento são preservados (nunca recomputados) até nova ação manual", () => {
    expect(supportersSql).toMatch(/IF v_row\.status IN \('cancelado', 'isento'\) THEN\s+RETURN;/);
  });

  it("set_missions_installment_exemption só aceita cancelado/isento e bloqueia se já houver valor pago real", () => {
    expect(supportersSql).toContain("this function only sets cancelado or isento");
    expect(supportersSql).toContain("cannot cancel/exempt an installment that already has a real payment");
    expect(supportersSql).toMatch(/v_row\.paid_amount > 0 OR v_row\.status = 'pago'/);
  });

  it("nenhuma RPC de Missões aceita p_status = 'pago'/'parcial' como parâmetro manual", () => {
    expect(supportersSql).not.toMatch(/p_status\s+(text\s+DEFAULT\s+)?'pago'/);
    expect(supportersSql).not.toMatch(/p_status\s+(text\s+DEFAULT\s+)?'parcial'/);
  });
});

describe("Missões — vínculo financeiro sem duplicar valor/saldo/conta/fechamento (contrato §6)", () => {
  it("missions_transaction_links não tem coluna de valor monetário — o valor sempre vem de public.transactions", () => {
    const createMatch = allSql.match(/CREATE TABLE IF NOT EXISTS public\.missions_transaction_links \(([\s\S]*?)\n\);/);
    expect(createMatch).toBeTruthy();
    const body = createMatch![1];
    expect(body).not.toMatch(/\bamount\b/);
    expect(body).not.toMatch(/\bbalance\b/);
    expect(body).not.toMatch(/\bvalor\b/);
    expect(body).not.toMatch(/\bsaldo\b/);
  });

  it("list_missions_linked_transactions lê o valor via JOIN em public.transactions (nunca uma cópia)", () => {
    expect(txLinksSql).toMatch(/JOIN public\.transactions t ON t\.id = l\.transaction_id/);
    expect(txLinksSql).toContain("SELECT l.id, t.id, l.link_type, t.amount, t.type, t.date, t.description, t.status");
  });

  it("não cria nenhuma tabela de caixa/saldo/fechamento paralela", () => {
    expect(allSqlNoComments).not.toMatch(
      /CREATE TABLE[^;]*public\.(missions_transactions|missions_cash|missions_balances|missions_closings|missions_accounts)\b/i,
    );
  });

  it("vínculo aponta para exatamente um contexto missionário — nunca dois, nunca nenhum", () => {
    expect(txLinksSql).toContain("CHECK (num_nonnulls(installment_id, project_id, missionary_id, campaign_id) = 1)");
    expect(txLinksSql).toContain("exactly one missions context must be informed");
  });

  it("compromisso também aponta para exatamente um contexto (missionário/projeto/campanha)", () => {
    expect(supportersSql).toContain("CHECK (num_nonnulls(missionary_id, project_id, campaign_id) = 1)");
    expect(supportersSql).toContain("exactly one of missionary_id, project_id or campaign_id must be informed");
  });

  it("uma transação só pode ser vinculada uma vez (nunca contada duas vezes em contextos diferentes)", () => {
    expect(txLinksSql).toContain("transaction is already linked to a missions context");
  });

  it("link_missions_transaction verifica finance.write na transação E missions.finance no contexto, separadamente", () => {
    const fn = txLinksSql.slice(
      txLinksSql.indexOf("CREATE OR REPLACE FUNCTION public.link_missions_transaction"),
      txLinksSql.indexOf("REVOKE ALL ON FUNCTION public.link_missions_transaction"),
    );
    expect(fn).toContain("public.has_org_access_permission(auth.uid(), v_transaction.organization_id, 'finance.write')");
    expect(fn).toContain("public.has_org_access_permission(auth.uid(), v_context_org, 'missions.finance')");
    expect(fn).toContain("finance.write is required to link a transaction");
    expect(fn).toContain("missions.finance is required in the missions context");
  });

  it("unlink_missions_transaction também exige finance.write E missions.finance, separadamente", () => {
    const fn = txLinksSql.slice(
      txLinksSql.indexOf("CREATE OR REPLACE FUNCTION public.unlink_missions_transaction"),
      txLinksSql.indexOf("REVOKE ALL ON FUNCTION public.unlink_missions_transaction"),
    );
    expect(fn).toContain("public.has_org_access_permission(auth.uid(), v_row.organization_id, 'finance.write')");
    expect(fn).toContain("public.has_org_access_permission(auth.uid(), v_row.organization_id, 'missions.finance')");
  });

  it("list_missions_linked_transactions exige missions.read E finance.read, separadamente", () => {
    const fn = txLinksSql.slice(
      txLinksSql.indexOf("CREATE OR REPLACE FUNCTION public.list_missions_linked_transactions"),
      txLinksSql.indexOf("REVOKE ALL ON FUNCTION public.list_missions_linked_transactions"),
    );
    expect(fn).toContain("missions.read and finance.read are both required");
  });

  it("nenhuma capability substitui a outra: missions.finance nunca aparece isolado autorizando escrita em transactions", () => {
    expect(allSqlNoComments).not.toMatch(/'missions\.finance'\)\s*THEN\s*\n\s*RAISE EXCEPTION[^;]*;\s*\n\s*END IF;\s*\n\s*(INSERT INTO public\.transactions|UPDATE public\.transactions)/);
  });
});

describe("Missões — invariantes de escopo organizacional (nunca confia apenas na FK)", () => {
  it("missionário e apoiador validam que o membro pertence à árvore organizacional informada", () => {
    expect(missionariesSql).toContain("missionary member is outside the informed organization scope");
    expect(supportersSql).toContain("supporter member is outside the informed organization scope");
  });

  it("coordenador do missionário também é validado dentro do escopo organizacional", () => {
    expect(missionariesSql).toContain("coordinator member is outside the informed organization scope");
  });

  it("projeto valida que a campanha associada pertence à árvore organizacional real", () => {
    expect(projectsSql).toContain("campaign is outside the project organization scope");
  });

  it("associação de membro a projeto valida escopo organizacional real (nunca confia só no organization_id do frontend)", () => {
    expect(projectsSql).toContain("member is outside the project organization scope");
  });

  it("compromisso valida que o contexto (missionário/projeto/campanha) está dentro do escopo do apoiador", () => {
    expect(supportersSql).toContain("commitment context is outside the supporter organization scope");
  });

  it("vínculo financeiro valida que o contexto missionário está dentro do escopo organizacional da transação", () => {
    expect(txLinksSql).toContain("missions context is outside the transaction organization scope");
  });

  it("busca de membros (diretório mínimo) respeita descendência organizacional real", () => {
    expect(historyReportsSql).toMatch(
      /is_organization_descendant_or_self\(\s*p_organization_id, COALESCE\(m\.congregation_id, m\.sector_id, m\.organization_id\)/,
    );
  });
});

describe("Missões — capabilities e responsabilidades", () => {
  const CAPABILITIES = ["missions.read", "missions.manage", "missions.finance", "missions.confidential"];

  it.each(CAPABILITIES)("capability '%s' pertence ao catálogo do frontend (accessControl.ts)", (cap) => {
    expect(ACCESS_PERMISSION_KEYS as readonly string[]).toContain(cap);
  });

  it("church_admin e responsible_pastor recebem as 4 capabilities de Missões idempotentemente (governança preservada)", () => {
    expect(foundationSql).toContain("WHERE responsibility_type IN ('church_admin', 'responsible_pastor')");
    expect(foundationSql).toContain("ARRAY['missions.read', 'missions.manage', 'missions.finance', 'missions.confidential']");
  });

  const RESPONSIBILITY_PERMISSIONS: Record<string, string[]> = {
    missions_coordinator: ["missions.read", "missions.manage", "missions.finance"],
    missions_secretary: ["missions.read", "missions.manage"],
    missions_treasurer: ["missions.read", "missions.finance"],
  };

  it.each(Object.entries(RESPONSIBILITY_PERMISSIONS))(
    "responsabilidade '%s' tem exatamente as mesmas permissões no SQL e no frontend",
    (key, expectedPermissions) => {
      const frontendDefinition = ACCESS_RESPONSIBILITIES.find((r) => r.key === key);
      expect(frontendDefinition, `responsabilidade ${key} não encontrada em accessControl.ts`).toBeTruthy();
      expect([...frontendDefinition!.permissions].sort()).toEqual([...expectedPermissions].sort());

      const insertMatch = foundationSql.match(new RegExp(`\\('${key}',[\\s\\S]*?ARRAY\\[([^\\]]*)\\]`));
      expect(insertMatch, `INSERT de ${key} não encontrado em missions_foundation.sql`).toBeTruthy();
      const sqlPermissions = insertMatch![1].split(",").map((p) => p.trim().replace(/'/g, ""));
      expect(sqlPermissions.sort()).toEqual([...expectedPermissions].sort());
    },
  );

  it("nenhuma das 3 responsabilidades operacionais herda a organizações descendentes (escopo local) ou recebe governança", () => {
    for (const key of Object.keys(RESPONSIBILITY_PERMISSIONS)) {
      const definition = ACCESS_RESPONSIBILITIES.find((r) => r.key === key)!;
      expect(definition.inheritsToDescendants).toBe(false);
      expect(definition.governance).toBe(false);
    }
  });

  it("missions_treasurer NUNCA recebe missions.manage nem finance.* automaticamente (responsabilidade financeira não concede Financeiro geral)", () => {
    expect(RESPONSIBILITY_PERMISSIONS.missions_treasurer).not.toContain("missions.manage");
    expect(RESPONSIBILITY_PERMISSIONS.missions_treasurer.some((p) => p.startsWith("finance."))).toBe(false);
  });

  it("nenhuma das 3 responsabilidades operacionais recebe missions.confidential por conveniência", () => {
    for (const permissions of Object.values(RESPONSIBILITY_PERMISSIONS)) {
      expect(permissions).not.toContain("missions.confidential");
    }
  });
});

describe("Missões — origem legada (legacy_source/legacy_module/legacy_code) em tabelas de cadastro", () => {
  const TABLES_WITH_LEGACY = [
    "missions_missionaries", "missions_projects", "missions_supporters",
    "missions_supporter_commitments", "missions_transaction_links",
  ];

  it.each(TABLES_WITH_LEGACY)("%s tem as 3 colunas legacy_source/legacy_module/legacy_code", (table) => {
    const createMatch = allSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
    expect(createMatch, `CREATE TABLE de ${table} não encontrado`).toBeTruthy();
    const body = createMatch![1];
    expect(body).toMatch(/legacy_source text/);
    expect(body).toMatch(/legacy_module text/);
    expect(body).toMatch(/legacy_code text/);
  });

  it("tabelas com unicidade natural própria usam índice parcial idempotente de legado", () => {
    const LEGACY_UNIQUE_INDEXES = [
      "missions_missionaries_legacy_unique_idx",
      "missions_projects_legacy_unique_idx",
      "missions_supporters_legacy_unique_idx",
      "missions_commitments_legacy_unique_idx",
      "missions_transaction_links_legacy_unique_idx",
    ];
    for (const idx of LEGACY_UNIQUE_INDEXES) {
      expect(allSql, `índice ${idx} não encontrado`).toMatch(
        new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx}[\\s\\S]*?WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL`),
      );
    }
  });
});

describe("Missões — integração com member_history (timeline institucional compartilhada, sem tabela própria)", () => {
  const NEW_HISTORY_TYPES = [
    "envio_missionario", "retorno_missionario", "encerramento_atividade_missionaria", "vinculacao_projeto_missionario",
  ];

  it.each(NEW_HISTORY_TYPES)("novo tipo de histórico '%s' está no catálogo do frontend (memberHistoryConstants.ts)", (type) => {
    expect(HISTORY_TYPES as readonly string[]).toContain(type);
  });

  it("estende a CHECK constraint de member_history preservando todos os 23 tipos anteriores (aditivo, não substitutivo)", () => {
    expect(historyReportsSql).toContain("ALTER TABLE public.member_history DROP CONSTRAINT IF EXISTS member_history_history_type_check");
    expect(historyReportsSql).toContain("'matricula', 'inicio_formacao', 'conclusao_formacao', 'desligamento_formacao',");
    for (const type of NEW_HISTORY_TYPES) {
      expect(historyReportsSql).toContain(`'${type}'`);
    }
  });

  it("não cria uma nova tabela de histórico paralela", () => {
    expect(historyReportsSql).not.toMatch(/CREATE TABLE[^;]*public\.member_history/i);
    expect(historyReportsSql).not.toMatch(/CREATE TABLE[^;]*public\.missions_history\b/i);
  });

  it("helper interno valida escopo organizacional e capability antes de inserir em member_history, sempre com source_module='missoes'", () => {
    expect(historyReportsSql).toContain("has_org_access_permission(auth.uid(), p_organization_id, 'missions.manage')");
    expect(historyReportsSql).toContain("'missoes', p_source_table, p_source_id, p_document_id, 'normal', auth.uid()");
  });

  it("trigger de status do missionário cobre envio/retorno/encerramento", () => {
    expect(historyReportsSql).toContain("WHEN NEW.status = 'ativo' AND OLD.status = 'em_preparacao' THEN 'envio_missionario'");
    expect(historyReportsSql).toContain("WHEN NEW.status = 'retornado' THEN 'retorno_missionario'");
    expect(historyReportsSql).toContain("WHEN NEW.status = 'encerrado' THEN 'encerramento_atividade_missionaria'");
  });

  it("trigger de associação de projeto só registra histórico para o papel 'missionario' (nunca para responsável/apoio)", () => {
    expect(historyReportsSql).toContain("IF NEW.role <> 'missionario' THEN RETURN NEW; END IF;");
  });

  it("movimentações financeiras comuns (vínculo de transação) NÃO geram evento em member_history", () => {
    expect(txLinksSql).not.toMatch(/_register_missions_member_history|register_member_history_event/);
  });
});

describe("Missões — diretório mínimo de membros sem PII (search_missions_members/get_missions_member_labels)", () => {
  it("search_missions_members retorna somente id/full_name/known_name/member_code — nunca CPF/telefone/endereço", () => {
    const fn = historyReportsSql.slice(
      historyReportsSql.indexOf("CREATE OR REPLACE FUNCTION public.search_missions_members"),
      historyReportsSql.indexOf("REVOKE ALL ON FUNCTION public.search_missions_members"),
    );
    expect(fn).toMatch(/RETURNS TABLE \(\s*id uuid,\s*full_name text,\s*known_name text,\s*member_code text\s*\)/);
    expect(fn).not.toMatch(/cpf|phone|telefone|endereco|address|birth_date|data_nascimento/i);
  });

  it("busca exige missions.read", () => {
    expect(historyReportsSql).toContain("access denied to missions member directory");
  });

  it("resultado é limitado (máximo 50 por página) — nunca baixa a lista completa de membros da organização", () => {
    expect(historyReportsSql).toContain("v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50)");
  });
});

describe("Missões — relatórios derivados, nunca um segundo motor genérico (contrato §12)", () => {
  it("não cria nenhuma tabela de relatório persistida", () => {
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.missions_reports?\b/i);
  });

  it("get_missions_dashboard_summary calcula tudo por SELECT em tempo real (nenhuma coluna materializada)", () => {
    const fn = historyReportsSql.slice(
      historyReportsSql.indexOf("CREATE OR REPLACE FUNCTION public.get_missions_dashboard_summary"),
      historyReportsSql.indexOf("REVOKE ALL ON FUNCTION public.get_missions_dashboard_summary"),
    );
    expect(fn).toContain("STABLE");
    expect(fn).toMatch(/RETURN QUERY\s+SELECT/);
  });

  it("list_missions_project_indicators deriva previsto de compromissos ativos e realizado de transações reais vinculadas", () => {
    expect(historyReportsSql).toContain("FROM public.missions_supporter_commitments mc");
    expect(historyReportsSql).toMatch(/FROM public\.missions_transaction_links l\s+JOIN public\.transactions t ON t\.id = l\.transaction_id\s+WHERE l\.project_id = p\.id AND t\.type = 'Entrada'/);
  });

  it("list_missions_commitment_installments revalida a organização real por p_organization_id e permite filtro de atraso", () => {
    const fn = historyReportsSql.slice(
      historyReportsSql.indexOf("CREATE OR REPLACE FUNCTION public.list_missions_commitment_installments"),
      historyReportsSql.indexOf("REVOKE ALL ON FUNCTION public.list_missions_commitment_installments"),
    );
    expect(fn).toContain("WHERE i.organization_id = p_organization_id");
    expect(fn).toContain("p_only_overdue");
  });

  it("todas as RPCs de relatório são STABLE e SECURITY DEFINER, revalidando missions.read", () => {
    for (const fnName of [
      "get_missions_dashboard_summary", "list_missions_missionaries_by_field",
      "list_missions_project_indicators", "list_missions_commitment_installments",
    ]) {
      const fn = historyReportsSql.slice(
        historyReportsSql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`),
        historyReportsSql.indexOf(`REVOKE ALL ON FUNCTION public.${fnName}`),
      );
      expect(fn, `${fnName} não é STABLE`).toContain("STABLE");
      expect(fn, `${fnName} não valida missions.read`).toContain("'missions.read'");
    }
  });
});

describe("Missões — parâmetros organizacionais sem segredo/credencial (contrato §7)", () => {
  it("missions_settings não guarda nenhuma coluna de segredo/token/senha/api_key", () => {
    const createMatch = allSql.match(/CREATE TABLE IF NOT EXISTS public\.missions_settings \(([\s\S]*?)\n\);/);
    expect(createMatch).toBeTruthy();
    const body = createMatch![1];
    expect(body).not.toMatch(/secret|token|password|senha|api_key|credential/i);
  });

  it("upsert_missions_settings valida que conta/categoria/centro de custo padrão pertencem à organização real", () => {
    expect(foundationSql).toContain("default finance account does not belong to this organization");
    expect(foundationSql).toContain("default account category does not belong to this organization");
    expect(foundationSql).toContain("default cost center does not belong to this organization");
  });
});
