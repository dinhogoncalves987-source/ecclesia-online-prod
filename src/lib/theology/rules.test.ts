/**
 * OPERAÇÃO 3 (Teologia) — testes das regras puras de src/lib/theology/rules.ts.
 * Cada bloco espelha uma validação real das RPCs em
 * supabase/migrations/20260730110000_theology_periods_classes_enrollments.sql
 * e 20260730120000_theology_attendance_and_assessments.sql — qualquer
 * alteração aqui SEM a alteração correspondente na migration é uma regressão.
 */
import { describe, expect, it } from "vitest";
import {
  applyRoundingRule,
  calculateAttendancePercentage,
  calculateWeightedAverageScore,
  checkEnrollmentCompletionEligibility,
  countPendingAttendance,
  findMissingMandatoryResults,
  hasClassCapacity,
  hasOfferingCapacity,
  isClassClosedForCommonLaunches,
  isEnrollmentClosed,
  isOfferingClosed,
  isOfferingEnrollmentClosed,
  isValidAssessmentModelComponent,
  isValidAssessmentScore,
  isValidClassStatusTransition,
  isValidEnrollmentStatusTransition,
  isValidOfferingEnrollmentStatusTransition,
  isValidOfferingStatusTransition,
  isValidPeriodStatusTransition,
  nextAttemptNumber,
  sumComponentWeights,
} from "./rules";
import {
  THEOLOGY_CLASS_STATUSES,
  THEOLOGY_ENROLLMENT_STATUSES,
  THEOLOGY_OFFERING_ENROLLMENT_STATUSES,
  THEOLOGY_OFFERING_STATUSES,
  THEOLOGY_PERIOD_STATUSES,
  type TheologyAttendanceStatus,
  type TheologyClassStatus,
  type TheologyEnrollmentStatus,
  type TheologyOfferingEnrollmentStatus,
  type TheologyOfferingStatus,
  type TheologyPeriodStatus,
} from "./constants";

describe("calculateAttendancePercentage", () => {
  it("retorna null quando nenhuma aula foi lançada", () => {
    expect(calculateAttendancePercentage([])).toBeNull();
    expect(calculateAttendancePercentage(["nao_lancado", "nao_lancado"])).toBeNull();
  });

  it("ignora sessões não lançadas no denominador (nunca desaparecem, apenas não contam)", () => {
    const statuses: TheologyAttendanceStatus[] = ["presente", "ausente", "nao_lancado"];
    expect(calculateAttendancePercentage(statuses)).toBe(50);
  });

  it("conta 'justificado' como presença (a favor do aluno)", () => {
    const statuses: TheologyAttendanceStatus[] = ["presente", "justificado", "ausente", "ausente"];
    expect(calculateAttendancePercentage(statuses)).toBe(50);
  });

  it("100% quando todas as aulas lançadas são presença", () => {
    expect(calculateAttendancePercentage(["presente", "presente", "justificado"])).toBe(100);
  });

  it("0% quando todas as aulas lançadas são ausência", () => {
    expect(calculateAttendancePercentage(["ausente", "ausente"])).toBe(0);
  });
});

describe("countPendingAttendance", () => {
  it("conta apenas 'nao_lancado' como pendência", () => {
    expect(countPendingAttendance(["presente", "nao_lancado", "ausente", "nao_lancado"])).toBe(2);
    expect(countPendingAttendance(["presente", "ausente"])).toBe(0);
  });
});

describe("isValidAssessmentModelComponent", () => {
  it("aceita peso e nota máxima positivos", () => {
    expect(isValidAssessmentModelComponent({ weight: 1, maxScore: 10, isMandatory: true })).toBe(true);
  });

  it("rejeita peso ou nota máxima <= 0", () => {
    expect(isValidAssessmentModelComponent({ weight: 0, maxScore: 10, isMandatory: true })).toBe(false);
    expect(isValidAssessmentModelComponent({ weight: 1, maxScore: 0, isMandatory: true })).toBe(false);
    expect(isValidAssessmentModelComponent({ weight: -1, maxScore: 10, isMandatory: true })).toBe(false);
  });
});

describe("sumComponentWeights", () => {
  it("soma os pesos com 2 casas decimais", () => {
    expect(
      sumComponentWeights([
        { weight: 0.3, maxScore: 10, isMandatory: true },
        { weight: 0.7, maxScore: 10, isMandatory: true },
      ]),
    ).toBe(1);
  });
});

describe("calculateWeightedAverageScore — normalização de escalas diferentes", () => {
  it("retorna null sem nenhum resultado lançado", () => {
    expect(calculateWeightedAverageScore([])).toBeNull();
  });

  it("calcula média ponderada normalizada para escala 0-10 quando todos os componentes usam a mesma escala", () => {
    // (8*2 + 6*1) / 3 = 22/3 = 7.33
    expect(
      calculateWeightedAverageScore([
        { score: 8, weight: 2, maxScore: 10 },
        { score: 6, weight: 1, maxScore: 10 },
      ]),
    ).toBe(7.33);
  });

  it("normaliza corretamente quando componentes têm escalas diferentes", () => {
    // componente 1: 8/10 -> 8.0 (escala 0-10); componente 2: 40/100 -> 4.0 (normalizado para 0-10)
    // média ponderada igual peso: (8 + 4) / 2 = 6
    expect(
      calculateWeightedAverageScore([
        { score: 8, weight: 1, maxScore: 10 },
        { score: 40, weight: 1, maxScore: 100 },
      ]),
    ).toBe(6);
  });

  it("retorna null quando a soma dos pesos é zero (evita divisão por zero)", () => {
    expect(calculateWeightedAverageScore([{ score: 10, weight: 0, maxScore: 10 }])).toBeNull();
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

describe("applyRoundingRule", () => {
  it("nenhum: não altera a nota", () => {
    expect(applyRoundingRule(7.4, "nenhum")).toBe(7.4);
  });
  it("padrao: arredondamento matemático padrão", () => {
    expect(applyRoundingRule(7.5, "padrao")).toBe(8);
    expect(applyRoundingRule(7.4, "padrao")).toBe(7);
  });
  it("para_cima: sempre arredonda para cima", () => {
    expect(applyRoundingRule(7.1, "para_cima")).toBe(8);
  });
  it("para_baixo: sempre arredonda para baixo", () => {
    expect(applyRoundingRule(7.9, "para_baixo")).toBe(7);
  });
});

describe("findMissingMandatoryResults — espelha a checagem de publicação em update_theology_assessment_status()", () => {
  it("nenhuma pendência quando todos os componentes obrigatórios têm resultado para todas as tentativas abertas", () => {
    const recorded = new Set(["comp1:oe1", "comp2:oe1"]);
    expect(findMissingMandatoryResults(["comp1", "comp2"], ["oe1"], recorded)).toHaveLength(0);
  });

  it("aponta a combinação componente/tentativa faltante", () => {
    const recorded = new Set(["comp1:oe1"]);
    const pending = findMissingMandatoryResults(["comp1", "comp2"], ["oe1"], recorded);
    expect(pending).toEqual([{ componentId: "comp2", offeringEnrollmentId: "oe1" }]);
  });

  it("verifica todas as tentativas abertas, não só a primeira", () => {
    const recorded = new Set(["comp1:oe1"]);
    const pending = findMissingMandatoryResults(["comp1"], ["oe1", "oe2"], recorded);
    expect(pending).toEqual([{ componentId: "comp1", offeringEnrollmentId: "oe2" }]);
  });
});

describe("checkEnrollmentCompletionEligibility — espelha update_theology_enrollment_status() sem override", () => {
  it("elegível quando todas as unidades obrigatórias estão aprovadas", () => {
    const result = checkEnrollmentCompletionEligibility([
      { curriculumItemId: "a", approved: true },
      { curriculumItemId: "b", approved: true },
    ]);
    expect(result.eligible).toBe(true);
    expect(result.pendingMandatoryCount).toBe(0);
  });

  it("inelegível com unidades obrigatórias pendentes", () => {
    const result = checkEnrollmentCompletionEligibility([
      { curriculumItemId: "a", approved: true },
      { curriculumItemId: "b", approved: false },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.pendingMandatoryCount).toBe(1);
    expect(result.reasons[0]).toContain("1 unidade curricular");
  });

  it("elegível com lista vazia (nenhuma unidade obrigatória no programa)", () => {
    expect(checkEnrollmentCompletionEligibility([]).eligible).toBe(true);
  });
});

describe("isValidPeriodStatusTransition — espelha update_theology_period_status()", () => {
  const VALID: Array<[TheologyPeriodStatus, TheologyPeriodStatus]> = [
    ["planejamento", "inscricoes_abertas"],
    ["planejamento", "cancelado"],
    ["inscricoes_abertas", "em_andamento"],
    ["inscricoes_abertas", "cancelado"],
    ["em_andamento", "encerrado"],
    ["em_andamento", "cancelado"],
    ["encerrado", "arquivado"],
    ["cancelado", "arquivado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidPeriodStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado (idempotente)", () => {
    for (const status of THEOLOGY_PERIOD_STATUSES) {
      expect(isValidPeriodStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita saltos de etapa", () => {
    expect(isValidPeriodStatusTransition("planejamento", "em_andamento")).toBe(false);
    expect(isValidPeriodStatusTransition("planejamento", "encerrado")).toBe(false);
  });

  it("rejeita transição a partir de arquivado (estado terminal)", () => {
    for (const to of THEOLOGY_PERIOD_STATUSES) {
      if (to === "arquivado") continue;
      expect(isValidPeriodStatusTransition("arquivado", to)).toBe(false);
    }
  });
});

describe("isValidClassStatusTransition — espelha update_theology_class_status()", () => {
  const VALID: Array<[TheologyClassStatus, TheologyClassStatus]> = [
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

  it("permite transição para o mesmo estado", () => {
    for (const status of THEOLOGY_CLASS_STATUSES) {
      expect(isValidClassStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita saltos de etapa (planejamento direto para em_andamento/concluida)", () => {
    expect(isValidClassStatusTransition("planejamento", "em_andamento")).toBe(false);
    expect(isValidClassStatusTransition("planejamento", "concluida")).toBe(false);
    expect(isValidClassStatusTransition("planejamento", "arquivada")).toBe(false);
  });

  it("rejeita transição a partir de arquivada (estado terminal)", () => {
    for (const to of THEOLOGY_CLASS_STATUSES) {
      if (to === "arquivada") continue;
      expect(isValidClassStatusTransition("arquivada", to)).toBe(false);
    }
  });
});

describe("isValidOfferingStatusTransition — espelha update_theology_class_offering_status()", () => {
  const VALID: Array<[TheologyOfferingStatus, TheologyOfferingStatus]> = [
    ["planejada", "em_andamento"],
    ["planejada", "cancelada"],
    ["em_andamento", "concluida"],
    ["em_andamento", "cancelada"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidOfferingStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado", () => {
    for (const status of THEOLOGY_OFFERING_STATUSES) {
      expect(isValidOfferingStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita transição a partir de estados terminais", () => {
    expect(isValidOfferingStatusTransition("concluida", "em_andamento")).toBe(false);
    expect(isValidOfferingStatusTransition("cancelada", "em_andamento")).toBe(false);
  });
});

describe("isValidEnrollmentStatusTransition — espelha update_theology_enrollment_status()", () => {
  const VALID: Array<[TheologyEnrollmentStatus, TheologyEnrollmentStatus]> = [
    ["pendente", "matriculado"],
    ["pendente", "cancelado"],
    ["matriculado", "ativo"],
    ["matriculado", "desistente"],
    ["matriculado", "transferido"],
    ["matriculado", "cancelado"],
    ["ativo", "concluido"],
    ["ativo", "reprovado"],
    ["ativo", "desistente"],
    ["ativo", "transferido"],
    ["ativo", "cancelado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidEnrollmentStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado", () => {
    for (const status of THEOLOGY_ENROLLMENT_STATUSES) {
      expect(isValidEnrollmentStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita salto de pendente diretamente para ativo/concluido", () => {
    expect(isValidEnrollmentStatusTransition("pendente", "ativo")).toBe(false);
    expect(isValidEnrollmentStatusTransition("pendente", "concluido")).toBe(false);
  });

  it("rejeita qualquer transição a partir de estados encerrados", () => {
    for (const from of ["concluido", "reprovado", "desistente", "transferido", "cancelado"] as const) {
      for (const to of THEOLOGY_ENROLLMENT_STATUSES) {
        if (to === from) continue;
        expect(isValidEnrollmentStatusTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("isValidOfferingEnrollmentStatusTransition — espelha update_theology_offering_enrollment_status()", () => {
  const VALID: Array<[TheologyOfferingEnrollmentStatus, TheologyOfferingEnrollmentStatus]> = [
    ["planejada", "em_andamento"],
    ["planejada", "cancelada"],
    ["em_andamento", "concluida"],
    ["em_andamento", "cancelada"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidOfferingEnrollmentStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado", () => {
    for (const status of THEOLOGY_OFFERING_ENROLLMENT_STATUSES) {
      expect(isValidOfferingEnrollmentStatusTransition(status, status)).toBe(true);
    }
  });
});

describe("isClassClosedForCommonLaunches / isOfferingClosed / isEnrollmentClosed / isOfferingEnrollmentClosed", () => {
  it("turma fechada apenas em concluida/cancelada/arquivada", () => {
    expect(isClassClosedForCommonLaunches("concluida")).toBe(true);
    expect(isClassClosedForCommonLaunches("cancelada")).toBe(true);
    expect(isClassClosedForCommonLaunches("arquivada")).toBe(true);
    expect(isClassClosedForCommonLaunches("planejamento")).toBe(false);
    expect(isClassClosedForCommonLaunches("em_andamento")).toBe(false);
  });

  it("oferta fechada apenas em concluida/cancelada", () => {
    expect(isOfferingClosed("concluida")).toBe(true);
    expect(isOfferingClosed("cancelada")).toBe(true);
    expect(isOfferingClosed("planejada")).toBe(false);
    expect(isOfferingClosed("em_andamento")).toBe(false);
  });

  it("matrícula na turma encerrada em concluido/reprovado/desistente/transferido/cancelado", () => {
    expect(isEnrollmentClosed("concluido")).toBe(true);
    expect(isEnrollmentClosed("reprovado")).toBe(true);
    expect(isEnrollmentClosed("desistente")).toBe(true);
    expect(isEnrollmentClosed("transferido")).toBe(true);
    expect(isEnrollmentClosed("cancelado")).toBe(true);
    expect(isEnrollmentClosed("pendente")).toBe(false);
    expect(isEnrollmentClosed("matriculado")).toBe(false);
    expect(isEnrollmentClosed("ativo")).toBe(false);
  });

  it("tentativa por oferta encerrada em concluida/cancelada", () => {
    expect(isOfferingEnrollmentClosed("concluida")).toBe(true);
    expect(isOfferingEnrollmentClosed("cancelada")).toBe(true);
    expect(isOfferingEnrollmentClosed("planejada")).toBe(false);
    expect(isOfferingEnrollmentClosed("em_andamento")).toBe(false);
  });
});

describe("hasClassCapacity / hasOfferingCapacity", () => {
  it("sempre tem capacidade quando capacity é null (ilimitada)", () => {
    expect(hasClassCapacity(null, 999)).toBe(true);
    expect(hasOfferingCapacity(null, 999)).toBe(true);
  });

  it("tem capacidade quando a contagem atual é menor que o limite", () => {
    expect(hasClassCapacity(10, 9)).toBe(true);
    expect(hasOfferingCapacity(5, 4)).toBe(true);
  });

  it("não tem capacidade quando a contagem atinge ou excede o limite", () => {
    expect(hasClassCapacity(10, 10)).toBe(false);
    expect(hasClassCapacity(10, 11)).toBe(false);
    expect(hasOfferingCapacity(5, 5)).toBe(false);
  });
});

describe("nextAttemptNumber — espelha v_next_attempt em enroll_member_in_theology_offering()", () => {
  it("primeira tentativa quando não há tentativas anteriores", () => {
    expect(nextAttemptNumber([])).toBe(1);
  });

  it("incrementa a partir da maior tentativa anterior", () => {
    expect(nextAttemptNumber([1])).toBe(2);
    expect(nextAttemptNumber([1, 2, 3])).toBe(4);
    expect(nextAttemptNumber([1, 3])).toBe(4);
  });
});
