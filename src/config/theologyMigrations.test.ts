/**
 * OPERAÇÃO 3 — Teologia completa sobre a fundação revisada do Ecclesia.
 *
 * Testes de regressão sobre as 6 migrations novas desta operação. Somente
 * leitura de arquivo — nunca conecta a um banco, nunca aplica migration (ver
 * docs/architecture/operacao-3-teologia.md). Mesmo padrão de
 * src/config/discipleshipMigrations.test.ts (Operação 2).
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

const THEOLOGY_MIGRATIONS = [
  "20260730090000_theology_foundation.sql",
  "20260730100000_theology_curriculum.sql",
  "20260730110000_theology_periods_classes_enrollments.sql",
  "20260730120000_theology_attendance_and_assessments.sql",
  "20260730130000_theology_results_history_and_documents.sql",
  "20260730140000_theology_finance_links_and_permissions.sql",
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

const foundationSql = readStaging(THEOLOGY_MIGRATIONS[0]);
const curriculumSql = readStaging(THEOLOGY_MIGRATIONS[1]);
const periodsClassesSql = readStaging(THEOLOGY_MIGRATIONS[2]);
const attendanceAssessmentsSql = readStaging(THEOLOGY_MIGRATIONS[3]);
const resultsHistorySql = readStaging(THEOLOGY_MIGRATIONS[4]);
const financeSql = readStaging(THEOLOGY_MIGRATIONS[5]);
const allSql = [
  foundationSql, curriculumSql, periodsClassesSql, attendanceAssessmentsSql, resultsHistorySql, financeSql,
].join("\n");
const allSqlNoComments = stripSqlComments(allSql);

describe("Teologia — migrations existem em staging e produção com conteúdo idêntico", () => {
  it.each(THEOLOGY_MIGRATIONS)("%s existe nas duas árvores e é byte a byte idêntica", (file) => {
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
    for (const file of THEOLOGY_MIGRATIONS) {
      expect(manifest.staging_feature, `${file} deveria estar em staging_feature`).toContain(file);
      for (const category of ["production_management", "staging_only", "historical", "mixed_needs_split"] as const) {
        expect(manifest[category], `${file} não deveria estar em ${category}`).not.toContain(file);
      }
    }
  });

  it("cada migration depende explicitamente da anterior (preflight cronológico)", () => {
    expect(curriculumSql).toContain("aplique 20260730090000 primeiro");
    expect(periodsClassesSql).toContain("aplique 20260730100000 primeiro");
    expect(attendanceAssessmentsSql).toContain("aplique 20260730110000 primeiro");
  });

  it("nenhuma migration é destrutiva (sem DROP TABLE de tabelas pré-existentes, sem TRUNCATE)", () => {
    expect(allSqlNoComments).not.toMatch(/DROP TABLE/i);
    expect(allSqlNoComments).not.toMatch(/TRUNCATE/i);
  });

  it("todas as migrations usam transação explícita (BEGIN/COMMIT) e verificação final pós-DDL", () => {
    for (const sql of [foundationSql, curriculumSql, periodsClassesSql, attendanceAssessmentsSql, resultsHistorySql, financeSql]) {
      expect(sql.trimStart()).toMatch(/^--/);
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql).toMatch(/^COMMIT;/m);
    }
  });

  it("nenhuma migration anterior (Operações 1/2) foi reaberta ou alterada por esta operação", () => {
    for (const sql of [foundationSql, curriculumSql, periodsClassesSql, attendanceAssessmentsSql, resultsHistorySql, financeSql]) {
      expect(sql).not.toMatch(/ALTER TABLE public\.discipleship_/);
      expect(sql).not.toMatch(/ALTER TABLE public\.member_addresses/);
    }
    // A ÚNICA extensão de tabela pré-existente é ADD COLUMN em theology_enrollments
    // (própria desta operação) — member_history não precisa de nova migração de
    // CHECK porque os 5 marcos genéricos já foram criados na Operação 2.
    expect(resultsHistorySql).not.toMatch(/ALTER TABLE public\.member_history/);
  });
});

describe("Teologia — regra central de identidade (nenhuma tabela paralela de pessoa/organização)", () => {
  it("não cria nenhuma tabela de pessoa própria do módulo (alunos/professores/coordenadores/etc.)", () => {
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.(theology_students|theology_teachers|theology_people|alunos|professores|pessoas)\b/i);
  });

  it("não altera member_role nem insere linhas em public.members", () => {
    expect(allSqlNoComments).not.toMatch(/UPDATE\s+public\.members\s+SET\s+member_role/i);
    expect(allSqlNoComments).not.toMatch(/INSERT\s+INTO\s+public\.members\b/i);
  });

  it("toda participação (matrícula/equipe) referencia members.id via member_id", () => {
    expect(periodsClassesSql).toMatch(/member_id uuid NOT NULL REFERENCES public\.members\(id\)/);
  });

  it("não cria nenhuma tabela paralela de organização/hierarquia eclesiástica", () => {
    expect(allSqlNoComments).not.toMatch(/CREATE TABLE[^;]*public\.(churches|congregacoes|distritos|setores|conventions|theology_organizations)\b/i);
  });

  it("núcleo de estudos e turmas sempre referenciam organizations.id (nunca uma hierarquia paralela)", () => {
    expect(foundationSql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/);
    expect(periodsClassesSql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/);
  });

  it("não cria bucket de storage novo (reutiliza member-documents/documents)", () => {
    expect(allSqlNoComments).not.toMatch(/storage\.buckets/i);
  });

  it("certificado referencia public.documents (nunca uma tabela de documentos paralela)", () => {
    expect(resultsHistorySql).toMatch(/certificate_document_id uuid REFERENCES public\.documents\(id\)/);
  });

  it("não cria discipleship_courses/discipleship_enrollments como motor acadêmico universal (namespace theology_* próprio)", () => {
    expect(allSqlNoComments).not.toMatch(/REFERENCES public\.discipleship_(courses|classes|enrollments|lessons)/);
  });
});

describe("Teologia — RLS habilitado em todas as 19 tabelas novas", () => {
  const TABLES = [
    "theology_institutes", "theology_study_centers", "theology_subjects", "theology_programs",
    "theology_curriculum_items", "theology_periods", "theology_classes", "theology_class_offerings",
    "theology_staff_assignments", "theology_enrollments", "theology_offering_enrollments",
    "theology_sessions", "theology_attendance", "theology_assessment_models",
    "theology_assessment_model_components", "theology_assessments", "theology_assessment_results",
    "theology_grade_audit_log", "theology_transaction_links",
  ];

  it("a lista de 19 tabelas cobre exatamente as tabelas criadas nas migrations", () => {
    const created = [...allSql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(theology_\w+)/g)].map((m) => m[1]);
    expect(new Set(created)).toEqual(new Set(TABLES));
  });

  it.each(TABLES)("%s tem ENABLE ROW LEVEL SECURITY", (table) => {
    expect(allSql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  });

  it("nenhuma policy usa USING (true) ou WITH CHECK (true)", () => {
    expect(allSqlNoComments).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(allSqlNoComments).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it("toda policy usa has_org_access_permission ou can_operate_theology_(class|offering) (nunca role hardcoded)", () => {
    const policyBlocks = allSql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policyBlocks.length).toBeGreaterThan(30);
    for (const block of policyBlocks) {
      expect(
        /has_org_access_permission|can_operate_theology_class|can_operate_theology_offering/.test(block),
        `policy sem capability-check real: ${block.slice(0, 90)}...`,
      ).toBe(true);
    }
  });

  it("theology_transaction_links exige AMBAS theology.read/manage e finance.read/write (nunca uma sozinha)", () => {
    expect(financeSql).toContain("public.has_org_access_permission(auth.uid(), organization_id, 'finance.read')");
    expect(financeSql).toContain("public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')");
    expect(financeSql).toContain("public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.read')");
    expect(financeSql).toContain("finance.write is required to link a transaction");
    expect(financeSql).toContain("theology.manage is required in the academic context");
  });
});

describe("Teologia — escrita crítica somente por RPC (nunca burlável por UPDATE/INSERT direto)", () => {
  const FULLY_REVOKED_TABLES = [
    "theology_staff_assignments",
    "theology_enrollments",
    "theology_offering_enrollments",
    "theology_attendance",
    "theology_assessment_results",
    "theology_grade_audit_log",
    "theology_transaction_links",
  ];

  it.each(FULLY_REVOKED_TABLES)("%s revoga INSERT/UPDATE/DELETE de authenticated (só GRANT SELECT)", (table) => {
    expect(allSql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated`);
    expect(allSql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
  });

  it("theology_periods/theology_classes/theology_class_offerings/theology_sessions/theology_assessments revogam UPDATE amplo e concedem apenas colunas operacionais (nunca 'status')", () => {
    const CASES: Array<[string, string]> = [
      ["theology_periods", periodsClassesSql],
      ["theology_classes", periodsClassesSql],
      ["theology_class_offerings", periodsClassesSql],
      ["theology_sessions", attendanceAssessmentsSql],
      ["theology_assessments", attendanceAssessmentsSql],
    ];
    for (const [table, sql] of CASES) {
      expect(sql, `${table}: REVOKE UPDATE amplo ausente`).toContain(`REVOKE UPDATE ON public.${table} FROM authenticated`);
      // Ancorado no REVOKE do MESMO table para não capturar o GRANT UPDATE de
      // outra tabela na mesma migration (a busca é não-gulosa, mas precisa
      // de um ponto de partida específico da tabela em questão).
      const grantMatch = sql.match(
        new RegExp(`REVOKE UPDATE ON public\\.${table} FROM authenticated;[\\s\\S]*?GRANT UPDATE \\(([\\s\\S]*?)\\)\\s*ON public\\.${table} TO authenticated`),
      );
      expect(grantMatch, `${table}: GRANT UPDATE (colunas) não encontrado`).toBeTruthy();
      const grantedColumns = grantMatch![1].split(",").map((c) => c.trim());
      expect(grantedColumns, `${table}: status não deveria ser diretamente gravável`).not.toContain("status");
      expect(grantedColumns, `${table}: organization_id não deveria ser diretamente gravável`).not.toContain("organization_id");
    }
  });

  it("todas as RPCs SECURITY DEFINER expostas revogam PUBLIC/anon e concedem apenas a authenticated", () => {
    const PUBLIC_RPCS = [
      "reorder_theology_curriculum_items(uuid, uuid[])",
      "update_theology_program_status(uuid, text)",
      "update_theology_period_status(uuid, text)",
      "update_theology_class_status(uuid, text)",
      "update_theology_class_offering_status(uuid, text)",
      "assign_theology_staff(uuid, uuid, text, uuid, date, text)",
      "end_theology_staff_assignment(uuid, date)",
      "enroll_member_in_theology_class(uuid, uuid, text)",
      "update_theology_enrollment_status(uuid, text, text, text, boolean)",
      "enroll_member_in_theology_offering(uuid, uuid)",
      "update_theology_offering_enrollment_status(uuid, text, numeric, text, text)",
      "update_theology_session_status(uuid, text)",
      "record_theology_attendance(uuid, jsonb)",
      "update_theology_assessment_status(uuid, text)",
      "record_theology_assessment_result(uuid, uuid, uuid, numeric, text)",
      "amend_theology_assessment_result(uuid, numeric, text)",
      "search_theology_members(uuid, text, integer)",
      "get_theology_member_labels(uuid, uuid[])",
      "mark_theology_certificate_issued(uuid, uuid)",
      "get_theology_student_transcript(uuid, uuid)",
      "list_theology_period_graduates(uuid)",
      "link_theology_transaction(uuid, text, uuid, uuid, text)",
      "list_theology_linked_transactions(uuid, uuid)",
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

  it("helpers internos (_is_theology_class_staff, can_operate_theology_class/offering, triggers de escopo) revogam também de authenticated", () => {
    expect(periodsClassesSql).toContain(
      "REVOKE ALL ON FUNCTION public._is_theology_class_staff(uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(periodsClassesSql).toContain(
      "REVOKE ALL ON FUNCTION public._is_theology_offering_staff(uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(periodsClassesSql).toContain(
      "REVOKE ALL ON FUNCTION public.can_operate_theology_class(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(periodsClassesSql).toContain(
      "REVOKE ALL ON FUNCTION public.can_operate_theology_offering(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(resultsHistorySql).toMatch(
      /REVOKE ALL ON FUNCTION public\._register_theology_member_history\([\s\S]*?\)\s*FROM PUBLIC, anon, authenticated/,
    );
    expect(resultsHistorySql).toContain(
      "REVOKE ALL ON FUNCTION public._theology_enrollments_register_history() FROM PUBLIC, anon, authenticated",
    );
    expect(attendanceAssessmentsSql).toContain(
      "REVOKE ALL ON FUNCTION public._calculate_theology_offering_enrollment_outcome(uuid)",
    );
  });

  it("register_member_history_event permanece interna — RPCs de Teologia nunca a expõem direto ao navegador", () => {
    expect(resultsHistorySql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.register_member_history_event/);
  });
});

describe("Teologia — regras de negócio garantidas por índice único (concorrência e duplicidade)", () => {
  it("matrícula na turma não pode duplicar enquanto pendente/matriculado/ativo", () => {
    expect(periodsClassesSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_enrollments_unique_active_idx\s+ON public\.theology_enrollments \(class_id, member_id\)\s+WHERE status IN \('pendente', 'matriculado', 'ativo'\)/,
    );
  });

  it("matéria não repete sequência nem se repete dentro da mesma matriz curricular", () => {
    expect(curriculumSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_curriculum_items_program_sequence_idx\s+ON public\.theology_curriculum_items \(program_id, sequence_number\)/,
    );
    expect(curriculumSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_curriculum_items_program_subject_idx\s+ON public\.theology_curriculum_items \(program_id, subject_id\)/,
    );
  });

  it("atribuição de equipe não pode duplicar papel ativo idêntico na mesma turma/oferta", () => {
    expect(periodsClassesSql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS theology_staff_unique_active_idx",
    );
    expect(periodsClassesSql).toContain("WHERE status = 'ativo'");
  });

  it("só uma tentativa aberta por vez para a mesma oferta/matrícula (repetência exige encerrar a anterior)", () => {
    expect(periodsClassesSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_offering_enrollments_open_idx\s+ON public\.theology_offering_enrollments \(offering_id, enrollment_id\)\s+WHERE status IN \('planejada', 'em_andamento'\)/,
    );
  });

  it("dois resultados finais para a mesma tentativa/componente são impossíveis (índice único)", () => {
    expect(attendanceAssessmentsSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_assessment_results_unique_idx\s+ON public\.theology_assessment_results \(assessment_id, component_id, offering_enrollment_id\)/,
    );
  });

  it("frequência é única por sessão + matrícula na oferta", () => {
    expect(attendanceAssessmentsSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_attendance_session_enrollment_idx\s+ON public\.theology_attendance \(session_id, offering_enrollment_id\)/,
    );
  });

  it("uma transação financeira só pode ter um único vínculo acadêmico (nunca contada duas vezes)", () => {
    expect(financeSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS theology_transaction_links_transaction_idx\s+ON public\.theology_transaction_links \(transaction_id\)/,
    );
  });

  it("capacidade de turma e de oferta são verificadas sob lock (FOR UPDATE)", () => {
    expect(periodsClassesSql).toMatch(/FROM public\.theology_classes WHERE id = p_class_id FOR UPDATE/);
    expect(periodsClassesSql).toMatch(/FROM public\.theology_class_offerings WHERE id = p_offering_id FOR UPDATE/);
  });

  it("reordenação da matriz usa faixa temporária positiva e rejeita ids duplicados (mesma correção do Discipulado)", () => {
    expect(curriculumSql).not.toContain("SET sequence_number = -sequence_number");
    expect(curriculumSql).toContain("SET sequence_number = sequence_number + v_offset");
    expect(curriculumSql).toContain("curriculum item id list cannot contain duplicates");
  });
});

describe("Teologia — máquinas de estado protegidas contra lançamento em contexto fechado", () => {
  it("programa é ativado/arquivado somente por RPC e a matriz publicada fica imutável", () => {
    expect(foundationSql).toContain("REVOKE UPDATE, DELETE ON public.theology_programs FROM authenticated");
    expect(curriculumSql).toContain("CREATE OR REPLACE FUNCTION public.update_theology_program_status");
    expect(curriculumSql).toContain("curriculum is locked after program activation");
    expect(curriculumSql).toContain(
      "active or archived program is immutable; create a new program version instead",
    );
  });

  it("período não pode ser encerrado com turmas ainda abertas/em andamento", () => {
    expect(periodsClassesSql).toContain("period cannot be closed while classes are still open or in progress");
  });

  it("turma não pode ser concluída com matrículas abertas, ofertas abertas ou aulas agendadas", () => {
    expect(periodsClassesSql).toContain("class cannot be concluded while enrollments are still open");
    expect(periodsClassesSql).toContain("class cannot be concluded while unit offerings are still open");
    expect(periodsClassesSql).toContain("class cannot be concluded while sessions are still scheduled");
    expect(periodsClassesSql).toContain("class cannot be concluded while assessments are still pending");
  });

  it("oferta não pode ser concluída com tentativas de aluno ainda abertas", () => {
    expect(periodsClassesSql).toContain("offering cannot be concluded while student attempts are still open");
    expect(periodsClassesSql).toContain("offering cannot be concluded while sessions are still scheduled");
    expect(periodsClassesSql).toContain("offering cannot be concluded while assessments are still pending");
  });

  it("turma/oferta fechada não aceita novos lançamentos comuns (matrícula/oferta/sessão/avaliação)", () => {
    expect(periodsClassesSql).toContain("class is closed and does not accept new enrollments");
    expect(periodsClassesSql).toContain("class is closed and does not accept offering changes");
    expect(attendanceAssessmentsSql).toContain("offering is closed and does not accept session changes");
    expect(attendanceAssessmentsSql).toContain("offering is closed and does not accept assessment changes");
  });

  it("reabertura de turma (concluida/cancelada -> em_andamento) é ação controlada só pela RPC", () => {
    expect(periodsClassesSql).toContain("reabertura controlada");
    expect(periodsClassesSql).toMatch(/v_row\.status IN \('concluida', 'cancelada'\) AND p_status = 'em_andamento'/);
  });

  it("conclusão de matrícula valida unidades obrigatórias, exceto com override explícito auditado", () => {
    expect(periodsClassesSql).toContain("p_override_eligibility");
    expect(periodsClassesSql).toContain("mandatory curriculum unit(s) not yet approved");
    expect(periodsClassesSql).toContain("only theology managers can override completion eligibility");
    expect(periodsClassesSql).toContain("override justification is required");
  });

  it("frequência só é lançada em aula realizada", () => {
    expect(attendanceAssessmentsSql).toContain("attendance can only be recorded for a completed session");
    expect(attendanceAssessmentsSql).toMatch(
      /FROM public\.theology_offering_enrollments[\s\S]*?status IN \('planejada', 'em_andamento'\)[\s\S]*?FOR UPDATE/,
    );
  });

  it("notas comuns só são lançadas em avaliação aplicada (nunca depois de publicada, sem auditoria)", () => {
    expect(attendanceAssessmentsSql).toContain("results can only be recorded for an applied (not yet published) assessment");
  });

  it("publicação de avaliação exige nota obrigatória lançada para toda tentativa aberta", () => {
    expect(attendanceAssessmentsSql).toContain("mandatory component result(s) missing for active students");
  });

  it("modelo de avaliação e seus componentes são travados (escala/nota mínima/pesos) após uso real", () => {
    expect(attendanceAssessmentsSql).toContain(
      "assessment model calculation fields are locked once used by a scheduled/applied assessment",
    );
    expect(attendanceAssessmentsSql).toContain(
      "assessment model components are locked once the model is used by a scheduled/applied assessment",
    );
  });

  it("resultado final da unidade é derivado de frequência e avaliações publicadas, nunca aceito do navegador", () => {
    expect(periodsClassesSql).toContain(
      "final grade and result are calculated from published assessments and attendance",
    );
    expect(periodsClassesSql).toContain(
      "public._calculate_theology_offering_enrollment_outcome(p_offering_enrollment_id)",
    );
    expect(attendanceAssessmentsSql).toContain(
      "CREATE OR REPLACE FUNCTION public._calculate_theology_offering_enrollment_outcome",
    );
    expect(attendanceAssessmentsSql).toContain("attendance is missing for % completed session(s)");
    expect(attendanceAssessmentsSql).toContain("cannot conclude attempt without a published assessment");
  });

  it("professor não altera matrícula administrativa nem abre tentativa de unidade", () => {
    const enrollmentStatusFn = periodsClassesSql.slice(
      periodsClassesSql.indexOf("CREATE OR REPLACE FUNCTION public.update_theology_enrollment_status"),
      periodsClassesSql.indexOf("REVOKE ALL ON FUNCTION public.update_theology_enrollment_status"),
    );
    const offeringEnrollmentFn = periodsClassesSql.slice(
      periodsClassesSql.indexOf("CREATE OR REPLACE FUNCTION public.enroll_member_in_theology_offering"),
      periodsClassesSql.indexOf("REVOKE ALL ON FUNCTION public.enroll_member_in_theology_offering"),
    );
    expect(enrollmentStatusFn).toContain("'theology.manage'");
    expect(enrollmentStatusFn).not.toContain("can_operate_theology_class");
    expect(offeringEnrollmentFn).toContain("'theology.manage'");
    expect(offeringEnrollmentFn).not.toContain("can_operate_theology_class");
  });
});

describe("Teologia — auditoria de alteração de nota (integridade acadêmica)", () => {
  it("amend_theology_assessment_result exige theology.manage e justificativa não vazia", () => {
    expect(attendanceAssessmentsSql).toContain("access denied to amend a published grade");
    expect(attendanceAssessmentsSql).toContain("justification is required to amend a grade");
    expect(attendanceAssessmentsSql).toMatch(
      /has_org_access_permission\(auth\.uid\(\), v_class\.organization_id, 'theology\.manage'\)/,
    );
    expect(attendanceAssessmentsSql).toContain(
      "only a published grade can be amended through this audited operation",
    );
  });

  it("preserva valor anterior e novo valor em theology_grade_audit_log antes do UPDATE", () => {
    expect(attendanceAssessmentsSql).toMatch(
      /INSERT INTO public\.theology_grade_audit_log \(result_id, previous_score, new_score, justification, changed_by\)/,
    );
    const amendFn = attendanceAssessmentsSql.slice(
      attendanceAssessmentsSql.indexOf("CREATE OR REPLACE FUNCTION public.amend_theology_assessment_result"),
      attendanceAssessmentsSql.indexOf("REVOKE ALL ON FUNCTION public.amend_theology_assessment_result"),
    );
    const insertIndex = amendFn.indexOf("INSERT INTO public.theology_grade_audit_log");
    const updateIndex = amendFn.indexOf("UPDATE public.theology_assessment_results SET score");
    expect(insertIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(insertIndex);
  });

  it("theology_grade_audit_log não tem policy de escrita direta (só a RPC grava)", () => {
    expect(attendanceAssessmentsSql).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.theology_grade_audit_log FROM authenticated",
    );
    expect(attendanceAssessmentsSql).not.toMatch(/CREATE POLICY[^;]*theology_grade_audit_log[^;]*FOR (INSERT|UPDATE|DELETE)/);
  });
});

describe("Teologia — invariantes de escopo organizacional (nunca confia apenas na FK)", () => {
  it("núcleo/programa validam a árvore organizacional do instituto", () => {
    expect(foundationSql).toContain("study center organization must belong to the institute organization tree");
    expect(foundationSql).toContain("program organization must belong to the institute organization tree");
  });

  it("matéria da matriz curricular deve pertencer à árvore organizacional do programa", () => {
    expect(curriculumSql).toContain("curriculum item subject must belong to the program organization tree");
  });

  it("turma valida organização do programa/período/núcleo — nunca outra denominação", () => {
    expect(periodsClassesSql).toContain("class organization must be the program organization or one of its descendants");
    expect(periodsClassesSql).toContain("class organization must be inside the period organization scope");
    expect(periodsClassesSql).toContain("class study center must belong to the class organization tree");
  });

  it("período e modelo de avaliação validam programa/instituto dentro da árvore real", () => {
    expect(periodsClassesSql).toContain("period institute must belong to the period organization tree");
    expect(attendanceAssessmentsSql).toContain(
      "assessment model organization must be inside the program organization scope",
    );
  });

  it("oferta valida que a matéria pertence à matriz do programa da turma", () => {
    expect(periodsClassesSql).toContain("offering curriculum item must belong to the class program");
  });

  it("equipe e matrícula validam que o membro está dentro do escopo organizacional da turma", () => {
    expect(periodsClassesSql).toContain("staff member is outside the class organization scope");
    expect(periodsClassesSql).toContain("member is outside the class organization scope");
  });

  it("sessão valida instrutor como equipe ativa da oferta/turma", () => {
    expect(attendanceAssessmentsSql).toContain("session instructor must be active staff for this offering or class");
  });

  it("modelo de avaliação restrito a programa não pode ser usado por outro programa", () => {
    expect(attendanceAssessmentsSql).toContain("assessment model is restricted to a different program");
  });

  it("vínculo financeiro valida escopo organizacional da matrícula/período contra a transação", () => {
    expect(financeSql).toContain("exactly one of enrollment_id or period_id must be informed");
    expect(financeSql).toContain("academic context is outside the transaction organization scope");
    expect(financeSql).toContain("JOIN public.theology_classes c ON c.id = e.class_id");
    expect(financeSql).toContain(
      "public.has_org_access_permission(auth.uid(), t.organization_id, 'finance.read')",
    );
  });
});

describe("Teologia — professor limitado às próprias atribuições (theology.teach escopado)", () => {
  it("_is_theology_class_staff e _is_theology_offering_staff checam atribuição ativa real, não a capability isolada", () => {
    expect(periodsClassesSql).toMatch(/FROM public\.theology_staff_assignments tsa\s+JOIN public\.members m ON m\.id = tsa\.member_id\s+WHERE tsa\.class_id = _class_id\s+AND tsa\.status = 'ativo'/);
  });

  it("can_operate_theology_class/offering exige theology.manage OU (theology.teach + atribuição efetiva)", () => {
    expect(periodsClassesSql).toMatch(
      /has_org_access_permission\(_user_id, _organization_id, 'theology\.manage'\)\s+OR\s+\(\s*public\.has_org_access_permission\(_user_id, _organization_id, 'theology\.teach'\)\s+AND public\._is_theology_class_staff/,
    );
  });

  it("theology.teach nunca aparece isolado autorizando emissão de certificado ou vínculo financeiro", () => {
    expect(resultsHistorySql).not.toMatch(/'theology\.teach'[\s\S]{0,80}mark_theology_certificate_issued/);
    const certFn = resultsHistorySql.slice(
      resultsHistorySql.indexOf("CREATE OR REPLACE FUNCTION public.mark_theology_certificate_issued"),
      resultsHistorySql.indexOf("REVOKE ALL ON FUNCTION public.mark_theology_certificate_issued"),
    );
    expect(certFn).toContain("'theology.manage'");
    expect(certFn).not.toContain("'theology.teach'");
  });
});

describe("Teologia — capabilities e responsabilidades", () => {
  const CAPABILITIES = ["theology.read", "theology.manage", "theology.teach", "theology.confidential"];

  it.each(CAPABILITIES)("capability '%s' pertence ao catálogo do frontend (accessControl.ts)", (cap) => {
    expect(ACCESS_PERMISSION_KEYS as readonly string[]).toContain(cap);
  });

  it("nenhuma capability inventada 'theology.finance' foi criada (financeiro usa capabilities financeiras reais)", () => {
    expect(ACCESS_PERMISSION_KEYS as readonly string[]).not.toContain("theology.finance");
    expect(allSqlNoComments).not.toMatch(/'theology\.finance'/);
  });

  it("church_admin e responsible_pastor recebem as 4 capabilities de Teologia idempotentemente (governança preservada)", () => {
    expect(foundationSql).toContain("WHERE responsibility_type IN ('church_admin', 'responsible_pastor')");
    expect(foundationSql).toContain("ARRAY['theology.read', 'theology.manage', 'theology.teach', 'theology.confidential']");
  });

  const RESPONSIBILITY_PERMISSIONS: Record<string, string[]> = {
    theology_coordinator: ["theology.read", "theology.manage", "theology.teach"],
    theology_secretary: ["theology.read", "theology.manage"],
    theology_teacher: ["theology.read", "theology.teach"],
  };

  it.each(Object.entries(RESPONSIBILITY_PERMISSIONS))(
    "responsabilidade '%s' tem exatamente as mesmas permissões no SQL e no frontend",
    (key, expectedPermissions) => {
      const frontendDefinition = ACCESS_RESPONSIBILITIES.find((r) => r.key === key);
      expect(frontendDefinition, `responsabilidade ${key} não encontrada em accessControl.ts`).toBeTruthy();
      expect([...frontendDefinition!.permissions].sort()).toEqual([...expectedPermissions].sort());

      const insertMatch = foundationSql.match(new RegExp(`\\('${key}',[\\s\\S]*?ARRAY\\[([^\\]]*)\\]`));
      expect(insertMatch, `INSERT de ${key} não encontrado em theology_foundation.sql`).toBeTruthy();
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

  it("secretário acadêmico de Teologia NUNCA recebe theology.confidential por conveniência", () => {
    expect(RESPONSIBILITY_PERMISSIONS.theology_secretary).not.toContain("theology.confidential");
  });
});

describe("Teologia — origem legada (legacy_source/legacy_module/legacy_code) em todas as tabelas relevantes", () => {
  const TABLES_WITH_LEGACY = [
    "theology_institutes", "theology_study_centers", "theology_subjects", "theology_programs",
    "theology_curriculum_items", "theology_periods", "theology_classes", "theology_class_offerings",
    "theology_staff_assignments", "theology_enrollments", "theology_sessions",
    "theology_assessment_models", "theology_transaction_links",
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
      "theology_institutes_legacy_unique_idx",
      "theology_study_centers_legacy_unique_idx",
      "theology_subjects_legacy_unique_idx",
      "theology_programs_legacy_unique_idx",
      "theology_curriculum_items_legacy_unique_idx",
      "theology_periods_legacy_unique_idx",
      "theology_classes_legacy_unique_idx",
      "theology_enrollments_legacy_unique_idx",
      "theology_sessions_legacy_unique_idx",
      "theology_assessment_models_legacy_unique_idx",
      "theology_transaction_links_legacy_unique_idx",
    ];
    for (const idx of LEGACY_UNIQUE_INDEXES) {
      expect(allSql, `índice ${idx} não encontrado`).toMatch(
        new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx}[\\s\\S]*?WHERE legacy_code IS NOT NULL AND legacy_source IS NOT NULL`),
      );
    }
  });
});

describe("Teologia — integração com member_history (timeline institucional compartilhada, sem tabela própria)", () => {
  const REUSED_HISTORY_TYPES = [
    "matricula", "inicio_formacao", "conclusao_formacao", "desligamento_formacao",
    "transferencia_turma", "certificado_emitido",
  ];

  it.each(REUSED_HISTORY_TYPES)("tipo de histórico reutilizado '%s' já está no catálogo do frontend (memberHistoryConstants.ts)", (type) => {
    expect(HISTORY_TYPES as readonly string[]).toContain(type);
  });

  it("não estende a CHECK constraint de member_history (os 5+1 marcos genéricos já existiam antes desta operação)", () => {
    expect(resultsHistorySql).not.toMatch(/ALTER TABLE public\.member_history/);
    expect(resultsHistorySql).not.toMatch(/CREATE TABLE[^;]*public\.member_history/i);
  });

  it("helper interno valida escopo organizacional e capability antes de inserir em member_history, sempre com source_module='teologia'", () => {
    expect(resultsHistorySql).toContain("can_operate_theology_class(auth.uid(), v_class.id, v_class.organization_id)");
    expect(resultsHistorySql).toContain("'teologia', 'theology_enrollments'");
  });

  it("presenças e notas NÃO geram evento em member_history (só marcos de matrícula/certificado)", () => {
    expect(attendanceAssessmentsSql).not.toMatch(/_register_theology_member_history|register_member_history_event/);
  });

  it("trigger de matrícula cobre os 4 marcos de transição de status + inserção inicial", () => {
    expect(resultsHistorySql).toContain("v_history_type := 'matricula'");
    expect(resultsHistorySql).toContain("WHEN NEW.status = 'ativo' THEN 'inicio_formacao'");
    expect(resultsHistorySql).toContain("WHEN NEW.status = 'concluido' THEN 'conclusao_formacao'");
    expect(resultsHistorySql).toContain("WHEN NEW.status IN ('reprovado', 'desistente', 'cancelado') THEN 'desligamento_formacao'");
    expect(resultsHistorySql).toContain("WHEN NEW.status = 'transferido' THEN 'transferencia_turma'");
  });

  it("certificado emitido registra o marco certificado_emitido vinculado ao documento", () => {
    expect(resultsHistorySql).toContain("'certificado_emitido', 'Certificado emitido: '");
  });
});

describe("Teologia — leituras SECURITY DEFINER preservam o escopo real por linha", () => {
  it("boletim só devolve turmas nas quais o usuário ainda possui theology.read", () => {
    const transcriptFn = resultsHistorySql.slice(
      resultsHistorySql.indexOf("CREATE OR REPLACE FUNCTION public.get_theology_student_transcript"),
      resultsHistorySql.indexOf("REVOKE ALL ON FUNCTION public.get_theology_student_transcript"),
    );
    expect(transcriptFn).toContain(
      "public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')",
    );
  });

  it("listagem financeira revalida a organização real da transação e do contexto acadêmico", () => {
    const listFn = financeSql.slice(
      financeSql.indexOf("CREATE OR REPLACE FUNCTION public.list_theology_linked_transactions"),
      financeSql.indexOf("REVOKE ALL ON FUNCTION public.list_theology_linked_transactions"),
    );
    expect(listFn).toContain(
      "public.has_org_access_permission(auth.uid(), t.organization_id, 'finance.read')",
    );
    expect(listFn).toContain(
      "public.has_org_access_permission(auth.uid(), c.organization_id, 'theology.read')",
    );
    expect(listFn).toContain(
      "public.has_org_access_permission(auth.uid(), p.organization_id, 'theology.read')",
    );
  });
});

describe("Teologia — certificado idempotente (nenhum duplo lançamento)", () => {
  it("mark_theology_certificate_issued só opera sobre matrícula concluída, valida documento na árvore organizacional e retorna sem efeito em repetição idêntica", () => {
    expect(resultsHistorySql).toContain("only concluded enrollments are eligible for a certificate");
    expect(resultsHistorySql).toContain("document not found in the class organization tree");
    expect(resultsHistorySql).toMatch(
      /IF v_row\.certificate_document_id = p_document_id AND v_row\.certificate_issued_at IS NOT NULL THEN\s+RETURN;/,
    );
  });

  it("emissão de certificado exige theology.manage (nunca delegada a theology.teach)", () => {
    const certFn = resultsHistorySql.slice(
      resultsHistorySql.indexOf("CREATE OR REPLACE FUNCTION public.mark_theology_certificate_issued"),
      resultsHistorySql.indexOf("REVOKE ALL ON FUNCTION public.mark_theology_certificate_issued"),
    );
    expect(certFn).toContain("access denied to issue certificate");
    expect(certFn).toContain("has_org_access_permission(auth.uid(), v_class.organization_id, 'theology.manage')");
  });
});

describe("Teologia — vínculo financeiro sem duplicar valor/saldo/conta/fechamento", () => {
  it("theology_transaction_links não tem coluna de valor monetário — o valor sempre vem de public.transactions", () => {
    const createMatch = allSql.match(/CREATE TABLE IF NOT EXISTS public\.theology_transaction_links \(([\s\S]*?)\n\);/);
    expect(createMatch).toBeTruthy();
    const body = createMatch![1];
    expect(body).not.toMatch(/\bamount\b/);
    expect(body).not.toMatch(/\bbalance\b/);
    expect(body).not.toMatch(/\bvalor\b/);
  });

  it("list_theology_linked_transactions lê o valor via JOIN em public.transactions (nunca uma cópia)", () => {
    expect(financeSql).toMatch(/JOIN public\.transactions t ON t\.id = l\.transaction_id/);
    expect(financeSql).toContain("SELECT l.id, t.id, l.link_type, t.amount, t.type, t.date, t.description, t.status");
  });

  it("não cria nenhuma tabela de caixa/saldo/fechamento paralela", () => {
    expect(financeSql).not.toMatch(/CREATE TABLE[^;]*public\.(theology_transactions|theology_cash|theology_balances|theology_closings)\b/i);
  });

  it("uma transação só pode ser vinculada uma vez (nunca contada duas vezes em contextos diferentes)", () => {
    expect(financeSql).toContain("transaction is already linked to an academic context");
  });
});

describe("Teologia — diretório mínimo de membros sem PII (search_theology_members/get_theology_member_labels)", () => {
  it("search_theology_members retorna somente id/full_name/known_name/member_code — nunca CPF/telefone/endereço", () => {
    const fn = resultsHistorySql.slice(
      resultsHistorySql.indexOf("CREATE OR REPLACE FUNCTION public.search_theology_members"),
      resultsHistorySql.indexOf("REVOKE ALL ON FUNCTION public.search_theology_members"),
    );
    expect(fn).toMatch(/RETURNS TABLE \(\s*id uuid,\s*full_name text,\s*known_name text,\s*member_code text\s*\)/);
    expect(fn).not.toMatch(/cpf|phone|telefone|endereco|address|birth_date|data_nascimento/i);
  });

  it("busca exige theology.read e respeita descendência organizacional (nunca lista fora do escopo)", () => {
    expect(resultsHistorySql).toContain("access denied to theology member directory");
    expect(resultsHistorySql).toMatch(/is_organization_descendant_or_self\(\s*p_organization_id,\s*COALESCE\(m\.congregation_id, m\.sector_id, m\.organization_id\)/);
  });

  it("resultado é limitado (máximo 50 por página) — nunca baixa a lista completa de membros da organização", () => {
    expect(resultsHistorySql).toContain("v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50)");
  });
});

describe("Teologia — formatura não depende automaticamente de pagamento", () => {
  it("list_theology_period_graduates deriva elegibilidade só de unidades obrigatórias/matrícula — nenhuma referência a transactions/finance", () => {
    const fn = resultsHistorySql.slice(
      resultsHistorySql.indexOf("CREATE OR REPLACE FUNCTION public.list_theology_period_graduates"),
      resultsHistorySql.indexOf("REVOKE ALL ON FUNCTION public.list_theology_period_graduates"),
    );
    expect(fn).not.toMatch(/transactions|finance_/);
    expect(fn).toContain("is_mandatory AND ci.status = 'ativo'");
  });
});
