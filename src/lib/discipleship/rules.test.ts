/**
 * OPERAÇÃO 2 (Discipulado) — testes das regras puras de src/lib/discipleship/rules.ts.
 * Cada bloco espelha uma validação real das RPCs em
 * supabase/migrations/20260729100000_discipleship_classes_and_enrollments.sql
 * e 20260729110000_discipleship_learning_records.sql — qualquer alteração
 * aqui SEM a alteração correspondente na migration é uma regressão.
 */
import { describe, expect, it } from "vitest";
import {
  calculateAttendancePercentage,
  calculateWeightedAverageScore,
  checkCompletionEligibility,
  hasClassCapacity,
  isClassClosedForCommonLaunches,
  isEnrollmentClosed,
  isValidAssessmentScore,
  isValidClassStatusTransition,
  isValidEnrollmentStatusTransition,
} from "./rules";
import {
  DISCIPLESHIP_CLASS_STATUSES,
  DISCIPLESHIP_ENROLLMENT_STATUSES,
  type DiscipleshipAttendanceStatus,
  type DiscipleshipClassStatus,
  type DiscipleshipEnrollmentStatus,
} from "./constants";

describe("calculateAttendancePercentage", () => {
  it("retorna null quando nenhuma aula foi lançada", () => {
    expect(calculateAttendancePercentage([])).toBeNull();
    expect(calculateAttendancePercentage(["nao_lancado", "nao_lancado"])).toBeNull();
  });

  it("ignora sessões não lançadas no denominador", () => {
    const statuses: DiscipleshipAttendanceStatus[] = ["presente", "ausente", "nao_lancado"];
    expect(calculateAttendancePercentage(statuses)).toBe(50);
  });

  it("conta 'justificado' como presença (a favor do aluno)", () => {
    const statuses: DiscipleshipAttendanceStatus[] = ["presente", "justificado", "ausente", "ausente"];
    expect(calculateAttendancePercentage(statuses)).toBe(50);
  });

  it("100% quando todas as aulas lançadas são presença", () => {
    const statuses: DiscipleshipAttendanceStatus[] = ["presente", "presente", "justificado"];
    expect(calculateAttendancePercentage(statuses)).toBe(100);
  });

  it("0% quando todas as aulas lançadas são ausência", () => {
    const statuses: DiscipleshipAttendanceStatus[] = ["ausente", "ausente"];
    expect(calculateAttendancePercentage(statuses)).toBe(0);
  });
});

describe("calculateWeightedAverageScore", () => {
  it("retorna null sem nenhum resultado lançado", () => {
    expect(calculateWeightedAverageScore([])).toBeNull();
  });

  it("calcula média ponderada corretamente", () => {
    // (8*2 + 6*1) / 3 = 22/3 = 7.33
    expect(calculateWeightedAverageScore([{ score: 8, weight: 2 }, { score: 6, weight: 1 }])).toBe(7.33);
  });

  it("média simples quando todos os pesos são iguais", () => {
    expect(calculateWeightedAverageScore([{ score: 10, weight: 1 }, { score: 0, weight: 1 }])).toBe(5);
  });

  it("retorna null quando a soma dos pesos é zero (evita divisão por zero)", () => {
    expect(calculateWeightedAverageScore([{ score: 10, weight: 0 }])).toBeNull();
  });
});

describe("isValidAssessmentScore", () => {
  it("aceita nota dentro do intervalo [0, max]", () => {
    expect(isValidAssessmentScore(0, 10)).toBe(true);
    expect(isValidAssessmentScore(10, 10)).toBe(true);
    expect(isValidAssessmentScore(5.5, 10)).toBe(true);
  });

  it("rejeita nota negativa, acima do máximo, ou não finita", () => {
    expect(isValidAssessmentScore(-1, 10)).toBe(false);
    expect(isValidAssessmentScore(10.01, 10)).toBe(false);
    expect(isValidAssessmentScore(NaN, 10)).toBe(false);
    expect(isValidAssessmentScore(Infinity, 10)).toBe(false);
  });
});

describe("checkCompletionEligibility", () => {
  const baseCourse = {
    requiresAttendance: true,
    minimumAttendancePercentage: 75,
    requiresAssessment: true,
    minimumPassingScore: 6,
  };

  it("elegível quando frequência e nota atendem ao mínimo do curso", () => {
    const result = checkCompletionEligibility({
      course: baseCourse,
      attendanceStatuses: ["presente", "presente", "presente", "ausente"],
      assessmentResults: [{ score: 8, weight: 1 }],
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.attendancePercentage).toBe(75);
    expect(result.averageScore).toBe(8);
  });

  it("inelegível por frequência abaixo do mínimo", () => {
    const result = checkCompletionEligibility({
      course: baseCourse,
      attendanceStatuses: ["presente", "ausente", "ausente", "ausente"],
      assessmentResults: [{ score: 8, weight: 1 }],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Frequência"))).toBe(true);
  });

  it("inelegível por nota abaixo do mínimo", () => {
    const result = checkCompletionEligibility({
      course: baseCourse,
      attendanceStatuses: ["presente", "presente"],
      assessmentResults: [{ score: 4, weight: 1 }],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Nota média"))).toBe(true);
  });

  it("inelegível quando exige frequência mas nenhuma aula foi lançada", () => {
    const result = checkCompletionEligibility({
      course: baseCourse,
      attendanceStatuses: [],
      assessmentResults: [{ score: 8, weight: 1 }],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Nenhuma aula lançada"))).toBe(true);
  });

  it("inelegível quando exige avaliação mas nenhuma foi lançada", () => {
    const result = checkCompletionEligibility({
      course: baseCourse,
      attendanceStatuses: ["presente", "presente"],
      assessmentResults: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Nenhuma avaliação lançada"))).toBe(true);
  });

  it("não exige avaliação quando o curso não a requer, mesmo sem resultados", () => {
    const result = checkCompletionEligibility({
      course: { ...baseCourse, requiresAssessment: false, minimumPassingScore: null },
      attendanceStatuses: ["presente", "presente"],
      assessmentResults: [],
    });
    expect(result.eligible).toBe(true);
  });

  it("não exige frequência quando o curso não a requer", () => {
    const result = checkCompletionEligibility({
      course: { ...baseCourse, requiresAttendance: false },
      attendanceStatuses: [],
      assessmentResults: [{ score: 8, weight: 1 }],
    });
    expect(result.eligible).toBe(true);
  });
});

describe("isValidClassStatusTransition — espelha update_discipleship_class_status()", () => {
  const VALID: Array<[DiscipleshipClassStatus, DiscipleshipClassStatus]> = [
    ["planejamento", "inscricoes_abertas"],
    ["planejamento", "cancelada"],
    ["inscricoes_abertas", "em_andamento"],
    ["inscricoes_abertas", "cancelada"],
    ["em_andamento", "concluida"],
    ["em_andamento", "cancelada"],
    ["concluida", "em_andamento"], // reabertura controlada
    ["cancelada", "em_andamento"],
    ["concluida", "arquivada"],
    ["cancelada", "arquivada"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidClassStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado (no-op idempotente)", () => {
    for (const status of DISCIPLESHIP_CLASS_STATUSES) {
      expect(isValidClassStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita saltos de etapa (planejamento direto para em_andamento/concluida)", () => {
    expect(isValidClassStatusTransition("planejamento", "em_andamento")).toBe(false);
    expect(isValidClassStatusTransition("planejamento", "concluida")).toBe(false);
    expect(isValidClassStatusTransition("planejamento", "arquivada")).toBe(false);
  });

  it("rejeita retrocesso não controlado (inscrições abertas -> planejamento)", () => {
    expect(isValidClassStatusTransition("inscricoes_abertas", "planejamento")).toBe(false);
  });

  it("rejeita transição a partir de arquivada (estado terminal)", () => {
    for (const to of DISCIPLESHIP_CLASS_STATUSES) {
      if (to === "arquivada") continue;
      expect(isValidClassStatusTransition("arquivada", to)).toBe(false);
    }
  });
});

describe("isValidEnrollmentStatusTransition — espelha update_discipleship_enrollment_status()", () => {
  const VALID: Array<[DiscipleshipEnrollmentStatus, DiscipleshipEnrollmentStatus]> = [
    ["lista_espera", "matriculado"],
    ["lista_espera", "cancelado"],
    ["matriculado", "ativo"],
    ["matriculado", "desistente"],
    ["matriculado", "transferido"],
    ["matriculado", "cancelado"],
    ["ativo", "concluido"],
    ["ativo", "desistente"],
    ["ativo", "transferido"],
    ["ativo", "cancelado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidEnrollmentStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado", () => {
    for (const status of DISCIPLESHIP_ENROLLMENT_STATUSES) {
      expect(isValidEnrollmentStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita salto de lista_espera diretamente para ativo/concluido", () => {
    expect(isValidEnrollmentStatusTransition("lista_espera", "ativo")).toBe(false);
    expect(isValidEnrollmentStatusTransition("lista_espera", "concluido")).toBe(false);
  });

  it("rejeita qualquer transição a partir de estados encerrados (concluido/desistente/transferido/cancelado)", () => {
    for (const from of ["concluido", "desistente", "transferido", "cancelado"] as const) {
      for (const to of DISCIPLESHIP_ENROLLMENT_STATUSES) {
        if (to === from) continue;
        expect(isValidEnrollmentStatusTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("isClassClosedForCommonLaunches / isEnrollmentClosed", () => {
  it("turma fechada apenas em concluida/cancelada/arquivada", () => {
    expect(isClassClosedForCommonLaunches("concluida")).toBe(true);
    expect(isClassClosedForCommonLaunches("cancelada")).toBe(true);
    expect(isClassClosedForCommonLaunches("arquivada")).toBe(true);
    expect(isClassClosedForCommonLaunches("planejamento")).toBe(false);
    expect(isClassClosedForCommonLaunches("inscricoes_abertas")).toBe(false);
    expect(isClassClosedForCommonLaunches("em_andamento")).toBe(false);
  });

  it("matrícula encerrada apenas em concluido/desistente/transferido/cancelado", () => {
    expect(isEnrollmentClosed("concluido")).toBe(true);
    expect(isEnrollmentClosed("desistente")).toBe(true);
    expect(isEnrollmentClosed("transferido")).toBe(true);
    expect(isEnrollmentClosed("cancelado")).toBe(true);
    expect(isEnrollmentClosed("lista_espera")).toBe(false);
    expect(isEnrollmentClosed("matriculado")).toBe(false);
    expect(isEnrollmentClosed("ativo")).toBe(false);
  });
});

describe("hasClassCapacity — espelha a checagem de enroll_member_in_class()", () => {
  it("sempre tem capacidade quando capacity é null (ilimitada)", () => {
    expect(hasClassCapacity(null, 999)).toBe(true);
  });

  it("tem capacidade quando a contagem atual é menor que o limite", () => {
    expect(hasClassCapacity(10, 9)).toBe(true);
  });

  it("não tem capacidade quando a contagem atinge ou excede o limite", () => {
    expect(hasClassCapacity(10, 10)).toBe(false);
    expect(hasClassCapacity(10, 11)).toBe(false);
  });
});
