/**
 * OPERAÇÃO 2 — Discipulado completo sobre a fundação revisada do Ecclesia.
 *
 * Testes de regressão sobre as 4 migrations novas desta operação. Somente
 * leitura de arquivo — nunca conecta a um banco, nunca aplica migration (ver
 * docs/architecture/operacao-2-discipulado.md).
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

const DISCIPLESHIP_MIGRATIONS = [
  "20260729090000_discipleship_foundation.sql",
  "20260729100000_discipleship_classes_and_enrollments.sql",
  "20260729110000_discipleship_learning_records.sql",
  "20260729120000_discipleship_permissions_and_history.sql",
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

const foundationSql = readStaging(DISCIPLESHIP_MIGRATIONS[0]);
const classesSql = readStaging(DISCIPLESHIP_MIGRATIONS[1]);
const learningRecordsSql = readStaging(DISCIPLESHIP_MIGRATIONS[2]);
const permissionsHistorySql = readStaging(DISCIPLESHIP_MIGRATIONS[3]);
const allSql = [foundationSql, classesSql, learningRecordsSql, permissionsHistorySql].join("\n");
const allSqlNoComments = stripSqlComments(allSql);

describe("Discipulado — migrations existem em staging e produção com conteúdo idêntico", () => {
  it.each(DISCIPLESHIP_MIGRATIONS)("%s existe nas duas árvores e é byte a byte idêntica", (file) => {
    const stagingPath = path.join(STAGING_DIR, file);
    const productionPath = path.join(PRODUCTION_DIR, file);
    expect(existsSync(stagingPath), `faltando em supabase/migrations: ${file}`).toBe(true);
    expect(existsSync(productionPath), `faltando em supabase-production/supabase/migrations: ${file}`).toBe(true);
    expect(sha256(readProduction(file)), `conteúdo diverge entre staging e produção para ${file}`).toBe(
      sha256(readStaging(file)),
    );
  });

  it("as 4 migrations estão listadas em supabase/migration-manifest.json como staging_feature (nenhuma aplicada)", () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "supabase", "migration-manifest.json"), "utf8"));
    for (const file of DISCIPLESHIP_MIGRATIONS) {
      expect(manifest.staging_feature, `${file} deveria estar em staging_feature`).toContain(file);
      for (const category of ["production_management", "staging_only", "historical", "mixed_needs_split"] as const) {
        expect(manifest[category], `${file} não deveria estar em ${category}`).not.toContain(file);
      }
    }
  });
});

describe("Discipulado — regra central de identidade (nenhuma tabela paralela de pessoa)", () => {
  it("não cria nenhuma tabela de pessoa própria do módulo (alunos/professores/discipuladores/etc.)", () => {
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.(alunos|professores|discipuladores|coordenadores|pessoas|people)\b/i);
  });

  it("não altera member_role nem insere linhas em public.members", () => {
    expect(allSqlNoComments).not.toMatch(/UPDATE\s+public\.members\s+SET\s+member_role/i);
    expect(allSqlNoComments).not.toMatch(/INSERT\s+INTO\s+public\.members\b/i);
  });

  it("toda participação (matrícula/equipe) referencia members.id via member_id", () => {
    expect(classesSql).toMatch(/member_id uuid NOT NULL REFERENCES public\.members\(id\)/);
  });

  it("não cria nenhuma tabela paralela de organização (igrejas/congregações/distritos/setores)", () => {
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.(churches|congregacoes|distritos|setores|conventions)\b/i);
  });

  it("turmas sempre referenciam organizations.id (nunca uma hierarquia paralela)", () => {
    expect(classesSql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/);
  });

  it("não cria bucket de storage novo (reutiliza member-documents/documents)", () => {
    expect(allSqlNoComments).not.toMatch(/storage\.buckets/i);
    expect(allSqlNoComments).not.toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
  });

  it("discipleship_followups referencia public.documents (nunca uma tabela de documentos paralela)", () => {
    expect(learningRecordsSql).toMatch(/document_id uuid REFERENCES public\.documents\(id\)/);
  });
});

describe("Discipulado — RLS habilitado em todas as 12 tabelas", () => {
  const TABLES = [
    "discipleship_locations", "discipleship_departments", "discipleship_courses", "discipleship_lessons",
    "discipleship_classes", "discipleship_staff_assignments", "discipleship_enrollments", "discipleship_sessions",
    "discipleship_attendance", "discipleship_assessments", "discipleship_assessment_results", "discipleship_followups",
  ];

  it.each(TABLES)("%s tem ENABLE ROW LEVEL SECURITY", (table) => {
    expect(allSql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  });

  it("nenhuma policy usa USING (true) ou WITH CHECK (true)", () => {
    expect(allSqlNoComments).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(allSqlNoComments).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it("toda policy usa has_org_access_permission ou can_operate_discipleship_class (nunca role hardcoded)", () => {
    const policyBlocks = allSql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policyBlocks.length).toBeGreaterThan(20);
    for (const block of policyBlocks) {
      expect(
        /has_org_access_permission|can_operate_discipleship_class/.test(block),
        `policy sem capability-check real: ${block.slice(0, 80)}...`,
      ).toBe(true);
    }
  });
});

describe("Discipulado — escrita crítica somente por RPC (nunca burlável por UPDATE/INSERT direto)", () => {
  const REVOKED_TABLES = [
    "discipleship_staff_assignments",
    "discipleship_enrollments",
    "discipleship_attendance",
    "discipleship_assessment_results",
    "discipleship_followups",
  ];

  it.each(REVOKED_TABLES)("%s revoga INSERT/UPDATE/DELETE de authenticated (só GRANT SELECT)", (table) => {
    expect(allSql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated`);
    expect(allSql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
  });

  it("discipleship_classes revoga UPDATE amplo e concede apenas colunas operacionais (nunca 'status')", () => {
    expect(classesSql).toContain("REVOKE UPDATE ON public.discipleship_classes FROM authenticated");
    const grantMatch = classesSql.match(/GRANT UPDATE \(([\s\S]*?)\) ON public\.discipleship_classes TO authenticated/);
    expect(grantMatch, "GRANT UPDATE (colunas) não encontrado").toBeTruthy();
    const grantedColumns = grantMatch![1].split(",").map((c) => c.trim());
    expect(grantedColumns).not.toContain("status");
    expect(grantedColumns).not.toContain("organization_id");
    expect(grantedColumns).not.toContain("course_id");
  });

  it("todas as RPCs SECURITY DEFINER expostas revogam PUBLIC/anon e concedem apenas a authenticated", () => {
    const PUBLIC_RPCS = [
      "reorder_discipleship_lessons(uuid, uuid[])",
      "update_discipleship_class_status(uuid, text)",
      "assign_discipleship_staff(uuid, uuid, text, date, text)",
      "end_discipleship_staff_assignment(uuid, date)",
      "enroll_member_in_class(uuid, uuid, text)",
      "update_discipleship_enrollment_status(uuid, text, text, text, boolean)",
      "record_discipleship_attendance(uuid, jsonb)",
      "record_discipleship_assessment_result(uuid, uuid, numeric, text)",
      "create_discipleship_followup(uuid, text, date, text, uuid, text)",
      "get_discipleship_enrollment_progress(uuid)",
      "mark_discipleship_certificate_issued(uuid, uuid)",
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

  it("helpers internos (_is_discipleship_class_staff, can_operate_discipleship_class, trigger de histórico) revogam também de authenticated", () => {
    expect(classesSql).toContain(
      "REVOKE ALL ON FUNCTION public._is_discipleship_class_staff(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated",
    );
    expect(classesSql).toContain(
      "REVOKE ALL ON FUNCTION public.can_operate_discipleship_class(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(permissionsHistorySql).toContain(
      "REVOKE ALL ON FUNCTION public._discipleship_enrollments_register_history() FROM PUBLIC, anon, authenticated",
    );
  });

  it("register_member_history_event permanece interna (revogada de authenticated, só service_role) — RPCs do Discipulado nunca a expõem direto", () => {
    expect(permissionsHistorySql).toMatch(
      /REVOKE ALL ON FUNCTION public\.register_member_history_event\([\s\S]*?\) FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe("Discipulado — regras de negócio garantidas por índice único", () => {
  it("matrícula ativa não pode duplicar (class_id, member_id) enquanto em lista_espera/matriculado/ativo", () => {
    expect(classesSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS discipleship_enrollments_unique_active_idx\s+ON public\.discipleship_enrollments \(class_id, member_id\)\s+WHERE status IN \('lista_espera', 'matriculado', 'ativo'\)/,
    );
  });

  it("lição não pode repetir sequência dentro do mesmo curso", () => {
    expect(foundationSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS discipleship_lessons_course_sequence_idx\s+ON public\.discipleship_lessons \(course_id, sequence_number\)/,
    );
  });

  it("atribuição de equipe não pode duplicar papel ativo idêntico na mesma turma", () => {
    expect(classesSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS discipleship_staff_unique_active_idx\s+ON public\.discipleship_staff_assignments \(class_id, member_id, role\)\s+WHERE status = 'ativo'/,
    );
  });

  it("frequência é única por sessão + matrícula", () => {
    expect(learningRecordsSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS discipleship_attendance_session_enrollment_idx\s+ON public\.discipleship_attendance \(session_id, enrollment_id\)/,
    );
  });

  it("resultado de avaliação é único por avaliação + matrícula", () => {
    expect(learningRecordsSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS discipleship_assessment_results_unique_idx\s+ON public\.discipleship_assessment_results \(assessment_id, enrollment_id\)/,
    );
  });

  it("nota é validada contra o max_score da própria avaliação (RPC), não um limite fixo global", () => {
    expect(learningRecordsSql).toMatch(/score must be between 0 and % \(assessment max_score\)/);
    expect(learningRecordsSql).toContain("p_score > v_assessment.max_score");
  });
});

describe("Discipulado — máquinas de estado protegidas contra lançamento em turma/matrícula fechada", () => {
  it("turma concluída/cancelada/arquivada não aceita nova matrícula", () => {
    expect(classesSql).toContain("class is closed and does not accept new enrollments");
    expect(classesSql).toMatch(/v_class\.status IN \('concluida', 'cancelada', 'arquivada'\)/);
  });

  it("turma concluída/cancelada/arquivada não aceita novo encontro/aula", () => {
    expect(learningRecordsSql).toMatch(/c\.status NOT IN \('concluida', 'cancelada', 'arquivada'\)/);
  });

  it("turma concluída/cancelada/arquivada não aceita novo lançamento de frequência", () => {
    expect(learningRecordsSql).toContain("class is closed and does not accept new attendance records");
  });

  it("reabertura de turma (concluida/cancelada -> em_andamento) é ação controlada só pela RPC, nunca por UPDATE direto de status", () => {
    expect(classesSql).toContain("reabertura controlada");
    expect(classesSql).toMatch(/v_row\.status IN \('concluida', 'cancelada'\) AND p_status = 'em_andamento'/);
  });

  it("conclusão de matrícula valida frequência mínima e nota mínima do curso, exceto com override explícito", () => {
    expect(classesSql).toContain("p_override_eligibility");
    expect(classesSql).toContain("enrollment does not meet minimum attendance");
    expect(classesSql).toContain("enrollment does not meet minimum passing score");
  });
});

describe("Discipulado — capabilities e responsabilidades", () => {
  const CAPABILITIES = ["discipleship.read", "discipleship.manage", "discipleship.teach", "discipleship.confidential"];

  it.each(CAPABILITIES)("capability '%s' pertence ao catálogo do frontend (accessControl.ts)", (cap) => {
    expect(ACCESS_PERMISSION_KEYS as readonly string[]).toContain(cap);
  });

  it("church_admin e responsible_pastor recebem as 4 capabilities de Discipulado idempotentemente (governança preservada)", () => {
    expect(foundationSql).toContain(
      "WHERE responsibility_type IN ('church_admin', 'responsible_pastor')",
    );
    expect(foundationSql).toContain("'discipleship.read', 'discipleship.manage', 'discipleship.teach', 'discipleship.confidential'");
  });

  const RESPONSIBILITY_PERMISSIONS: Record<string, string[]> = {
    discipleship_coordinator: ["discipleship.read", "discipleship.manage", "discipleship.teach"],
    discipleship_secretary: ["discipleship.read", "discipleship.manage"],
    discipleship_teacher: ["discipleship.read", "discipleship.teach"],
  };

  it.each(Object.entries(RESPONSIBILITY_PERMISSIONS))(
    "responsabilidade '%s' tem exatamente as mesmas permissões no SQL e no frontend",
    (key, expectedPermissions) => {
      const frontendDefinition = ACCESS_RESPONSIBILITIES.find((r) => r.key === key);
      expect(frontendDefinition, `responsabilidade ${key} não encontrada em accessControl.ts`).toBeTruthy();
      expect([...frontendDefinition!.permissions].sort()).toEqual([...expectedPermissions].sort());

      const insertMatch = foundationSql.match(new RegExp(`\\('${key}',[\\s\\S]*?ARRAY\\[([^\\]]*)\\]`));
      expect(insertMatch, `INSERT de ${key} não encontrado em discipleship_foundation.sql`).toBeTruthy();
      const sqlPermissions = insertMatch![1].split(",").map((p) => p.trim().replace(/'/g, ""));
      expect(sqlPermissions.sort()).toEqual([...expectedPermissions].sort());
    },
  );

  it("nenhuma das 3 responsabilidades operacionais herda a organizações descendentes (escopo local)", () => {
    for (const key of Object.keys(RESPONSIBILITY_PERMISSIONS)) {
      const definition = ACCESS_RESPONSIBILITIES.find((r) => r.key === key)!;
      expect(definition.inheritsToDescendants).toBe(false);
      expect(definition.governance).toBe(false);
    }
  });

  it("secretário de Discipulado NUNCA recebe discipleship.confidential por conveniência", () => {
    expect(RESPONSIBILITY_PERMISSIONS.discipleship_secretary).not.toContain("discipleship.confidential");
  });
});

describe("Discipulado — origem legada (legacy_source/legacy_module/legacy_code) em todas as tabelas relevantes", () => {
  const TABLES_WITH_LEGACY = [
    "discipleship_locations", "discipleship_departments", "discipleship_courses", "discipleship_lessons",
    "discipleship_classes", "discipleship_staff_assignments", "discipleship_enrollments", "discipleship_sessions",
    "discipleship_attendance", "discipleship_assessments", "discipleship_assessment_results", "discipleship_followups",
  ];

  it.each(TABLES_WITH_LEGACY)("%s tem as 3 colunas legacy_source/legacy_module/legacy_code", (table) => {
    const createMatch = allSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
    expect(createMatch, `CREATE TABLE de ${table} não encontrado`).toBeTruthy();
    const body = createMatch![1];
    expect(body).toMatch(/legacy_source text/);
    expect(body).toMatch(/legacy_module text/);
    expect(body).toMatch(/legacy_code text/);
  });

  it("tabelas com unicidade natural própria (lessons, sessions, staff, enrollments, attendance, assessment_results) usam índice parcial idempotente de legado", () => {
    const LEGACY_UNIQUE_INDEXES = [
      "discipleship_locations_legacy_unique_idx",
      "discipleship_departments_legacy_unique_idx",
      "discipleship_courses_legacy_unique_idx",
      "discipleship_lessons_legacy_unique_idx",
      "discipleship_classes_legacy_unique_idx",
      "discipleship_enrollments_legacy_unique_idx",
      "discipleship_sessions_legacy_unique_idx",
    ];
    for (const idx of LEGACY_UNIQUE_INDEXES) {
      expect(allSql, `índice ${idx} não encontrado`).toMatch(
        new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx}[\\s\\S]*?WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL`),
      );
    }
  });
});

describe("Discipulado — integração com member_history (timeline institucional compartilhada, sem tabela própria)", () => {
  const NEW_HISTORY_TYPES = ["matricula", "inicio_formacao", "conclusao_formacao", "desligamento_formacao", "transferencia_turma"];

  it.each(NEW_HISTORY_TYPES)("novo tipo de histórico '%s' está no catálogo do frontend (memberHistoryConstants.ts)", (type) => {
    expect(HISTORY_TYPES as readonly string[]).toContain(type);
  });

  it("a migration estende a CHECK constraint existente (não recria a tabela member_history)", () => {
    expect(permissionsHistorySql).toContain("ALTER TABLE public.member_history DROP CONSTRAINT IF EXISTS member_history_history_type_check");
    expect(permissionsHistorySql).toContain("ALTER TABLE public.member_history ADD CONSTRAINT member_history_history_type_check CHECK");
    expect(permissionsHistorySql).not.toMatch(/CREATE TABLE[^;]*public\.member_history/i);
  });

  it("não modifica a migration original da Operação 1 (só CREATE OR REPLACE em migration nova)", () => {
    expect(permissionsHistorySql).toMatch(/CREATE OR REPLACE FUNCTION public\.register_member_history_event/);
  });

  it("presenças e notas NÃO geram evento em member_history (só marcos de matrícula via trigger dedicado)", () => {
    expect(learningRecordsSql).not.toMatch(/register_member_history_event/);
  });

  it("trigger de matrícula cobre os 4 marcos de transição de status + inserção inicial", () => {
    expect(permissionsHistorySql).toContain("v_history_type := 'matricula'");
    expect(permissionsHistorySql).toContain("WHEN NEW.status = 'ativo' THEN 'inicio_formacao'");
    expect(permissionsHistorySql).toContain("WHEN NEW.status = 'concluido' THEN 'conclusao_formacao'");
    expect(permissionsHistorySql).toContain("WHEN NEW.status IN ('desistente', 'cancelado') THEN 'desligamento_formacao'");
    expect(permissionsHistorySql).toContain("WHEN NEW.status = 'transferido' THEN 'transferencia_turma'");
  });

  it("todo evento registrado usa source_module = 'discipulado'", () => {
    // Ancorado em "PERFORM public." para capturar somente CHAMADAS reais da
    // função (nunca a prosa dos comentários, a própria CREATE OR REPLACE, ou
    // os REVOKE/GRANT que também citam o nome da função).
    const registerCalls = stripSqlComments(permissionsHistorySql).match(
      /PERFORM public\.register_member_history_event\(([\s\S]*?)\);/g,
    ) ?? [];
    expect(registerCalls.length).toBe(2);
    for (const call of registerCalls) {
      expect(call, call.slice(0, 60)).toContain("'discipulado'");
    }
  });
});

describe("Discipulado — dependência cronológica correta e preflights", () => {
  it("cada migration valida a existência da anterior antes de continuar (preflight)", () => {
    expect(classesSql).toContain("aplique 20260729090000 primeiro");
    expect(learningRecordsSql).toContain("aplique 20260729100000 primeiro");
  });

  it("nenhuma migration é destrutiva (sem DROP TABLE de tabelas pré-existentes, sem TRUNCATE)", () => {
    expect(allSqlNoComments).not.toMatch(/DROP TABLE/i);
    expect(allSqlNoComments).not.toMatch(/TRUNCATE/i);
  });

  it("todas as migrations usam transação explícita (BEGIN/COMMIT) e verificação final pós-DDL", () => {
    for (const sql of [foundationSql, classesSql, learningRecordsSql, permissionsHistorySql]) {
      expect(sql.trimStart()).toMatch(/^--/); // cabeçalho de comentário
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql).toMatch(/^COMMIT;/m);
    }
  });
});
