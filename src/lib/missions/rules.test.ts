/**
 * OPERAÇÃO 4 (Missões) — testes das regras puras de src/lib/missions/rules.ts.
 * Cada bloco espelha uma validação real das RPCs em
 * supabase/migrations/20260731100000_missions_missionaries.sql,
 * 20260731110000_missions_projects.sql,
 * 20260731120000_missions_supporters_commitments.sql e
 * 20260731130000_missions_transaction_links.sql — qualquer alteração aqui
 * SEM a alteração correspondente na migration é uma regressão.
 */
import { describe, expect, it } from "vitest";
import {
  canExemptOrCancelInstallment,
  calculateRealizationPercentage,
  deriveInstallmentStatus,
  hasExactlyOneMissionsContext,
  isCommitmentClosed,
  isInstallmentClosed,
  isMissionaryClosed,
  isProjectClosed,
  isValidCommitmentStatusTransition,
  isValidMissionaryStatusTransition,
  isValidProjectStatusTransition,
  isValidSupporterStatusTransition,
} from "./rules";
import {
  MISSIONS_COMMITMENT_STATUSES,
  MISSIONS_MISSIONARY_STATUSES,
  MISSIONS_PROJECT_STATUSES,
  MISSIONS_SUPPORTER_STATUSES,
  type MissionsCommitmentStatus,
  type MissionsMissionaryStatus,
  type MissionsProjectStatus,
  type MissionsSupporterStatus,
} from "./constants";

describe("isValidMissionaryStatusTransition — espelha update_missions_missionary_status()", () => {
  const VALID: Array<[MissionsMissionaryStatus, MissionsMissionaryStatus]> = [
    ["candidato", "em_preparacao"],
    ["candidato", "encerrado"],
    ["em_preparacao", "ativo"],
    ["em_preparacao", "encerrado"],
    ["ativo", "em_licenca"],
    ["ativo", "retornado"],
    ["ativo", "encerrado"],
    ["em_licenca", "ativo"],
    ["em_licenca", "encerrado"],
    ["retornado", "em_preparacao"],
    ["retornado", "encerrado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidMissionaryStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado (idempotente)", () => {
    for (const status of MISSIONS_MISSIONARY_STATUSES) {
      expect(isValidMissionaryStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita saltos de etapa (candidato direto para ativo)", () => {
    expect(isValidMissionaryStatusTransition("candidato", "ativo")).toBe(false);
    expect(isValidMissionaryStatusTransition("candidato", "retornado")).toBe(false);
  });

  it("rejeita qualquer transição a partir de encerrado (estado terminal)", () => {
    for (const to of MISSIONS_MISSIONARY_STATUSES) {
      if (to === "encerrado") continue;
      expect(isValidMissionaryStatusTransition("encerrado", to)).toBe(false);
    }
  });
});

describe("isMissionaryClosed", () => {
  it("apenas 'encerrado' é considerado fechado", () => {
    expect(isMissionaryClosed("encerrado")).toBe(true);
    expect(isMissionaryClosed("candidato")).toBe(false);
    expect(isMissionaryClosed("ativo")).toBe(false);
    expect(isMissionaryClosed("retornado")).toBe(false);
  });
});

describe("isValidProjectStatusTransition — espelha update_missions_project_status()", () => {
  const VALID: Array<[MissionsProjectStatus, MissionsProjectStatus]> = [
    ["rascunho", "planejado"],
    ["rascunho", "cancelado"],
    ["planejado", "ativo"],
    ["planejado", "cancelado"],
    ["ativo", "suspenso"],
    ["ativo", "concluido"],
    ["ativo", "cancelado"],
    ["suspenso", "ativo"],
    ["suspenso", "cancelado"],
    ["concluido", "arquivado"],
    ["cancelado", "arquivado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidProjectStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado", () => {
    for (const status of MISSIONS_PROJECT_STATUSES) {
      expect(isValidProjectStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita saltos de etapa (rascunho direto para ativo)", () => {
    expect(isValidProjectStatusTransition("rascunho", "ativo")).toBe(false);
    expect(isValidProjectStatusTransition("rascunho", "concluido")).toBe(false);
  });

  it("rejeita transição a partir de arquivado (estado terminal)", () => {
    for (const to of MISSIONS_PROJECT_STATUSES) {
      if (to === "arquivado") continue;
      expect(isValidProjectStatusTransition("arquivado", to)).toBe(false);
    }
  });
});

describe("isProjectClosed", () => {
  it("fechado em concluido/cancelado/arquivado", () => {
    expect(isProjectClosed("concluido")).toBe(true);
    expect(isProjectClosed("cancelado")).toBe(true);
    expect(isProjectClosed("arquivado")).toBe(true);
    expect(isProjectClosed("rascunho")).toBe(false);
    expect(isProjectClosed("ativo")).toBe(false);
  });
});

describe("isValidCommitmentStatusTransition — espelha update_missions_commitment_status()", () => {
  const VALID: Array<[MissionsCommitmentStatus, MissionsCommitmentStatus]> = [
    ["ativo", "pausado"],
    ["ativo", "encerrado"],
    ["ativo", "cancelado"],
    ["pausado", "ativo"],
    ["pausado", "encerrado"],
    ["pausado", "cancelado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidCommitmentStatusTransition(from, to)).toBe(true);
  });

  it("permite transição para o mesmo estado", () => {
    for (const status of MISSIONS_COMMITMENT_STATUSES) {
      expect(isValidCommitmentStatusTransition(status, status)).toBe(true);
    }
  });

  it("rejeita qualquer transição a partir de encerrado/cancelado (estados terminais)", () => {
    for (const from of ["encerrado", "cancelado"] as const) {
      for (const to of MISSIONS_COMMITMENT_STATUSES) {
        if (to === from) continue;
        expect(isValidCommitmentStatusTransition(from, to)).toBe(false);
      }
    }
  });
});

describe("isCommitmentClosed", () => {
  it("fechado em encerrado/cancelado", () => {
    expect(isCommitmentClosed("encerrado")).toBe(true);
    expect(isCommitmentClosed("cancelado")).toBe(true);
    expect(isCommitmentClosed("ativo")).toBe(false);
    expect(isCommitmentClosed("pausado")).toBe(false);
  });
});

describe("isValidSupporterStatusTransition — espelha update_missions_supporter_status()", () => {
  const VALID: Array<[MissionsSupporterStatus, MissionsSupporterStatus]> = [
    ["ativo", "inativo"],
    ["ativo", "encerrado"],
    ["inativo", "ativo"],
    ["inativo", "encerrado"],
  ];

  it.each(VALID)("permite %s -> %s", (from, to) => {
    expect(isValidSupporterStatusTransition(from, to)).toBe(true);
  });

  it("é idempotente para qualquer estado", () => {
    for (const status of MISSIONS_SUPPORTER_STATUSES) {
      expect(isValidSupporterStatusTransition(status, status)).toBe(true);
    }
  });

  it("mantém encerrado como estado terminal", () => {
    expect(isValidSupporterStatusTransition("encerrado", "ativo")).toBe(false);
    expect(isValidSupporterStatusTransition("encerrado", "inativo")).toBe(false);
  });
});

describe("deriveInstallmentStatus — espelha _recompute_missions_installment_status()", () => {
  it("preserva cancelado/isento sem recomputar", () => {
    expect(
      deriveInstallmentStatus({
        paidAmount: 0,
        expectedAmount: 100,
        dueDate: "2026-01-01",
        today: "2026-06-01",
        currentStatus: "cancelado",
      }),
    ).toBe("cancelado");
    expect(
      deriveInstallmentStatus({
        paidAmount: 0,
        expectedAmount: 100,
        dueDate: "2026-01-01",
        today: "2026-06-01",
        currentStatus: "isento",
      }),
    ).toBe("isento");
  });

  it("pago quando o valor recebido atinge ou supera o previsto", () => {
    expect(
      deriveInstallmentStatus({
        paidAmount: 100,
        expectedAmount: 100,
        dueDate: "2026-06-01",
        today: "2026-06-01",
        currentStatus: "previsto",
      }),
    ).toBe("pago");
  });

  it("parcial quando há valor recebido mas menor que o previsto", () => {
    expect(
      deriveInstallmentStatus({
        paidAmount: 40,
        expectedAmount: 100,
        dueDate: "2026-06-01",
        today: "2026-06-01",
        currentStatus: "previsto",
      }),
    ).toBe("parcial");
  });

  it("atrasado quando vencida sem nenhum valor recebido", () => {
    expect(
      deriveInstallmentStatus({
        paidAmount: 0,
        expectedAmount: 100,
        dueDate: "2026-01-01",
        today: "2026-06-01",
        currentStatus: "previsto",
      }),
    ).toBe("atrasado");
  });

  it("pendente quando vence hoje sem nenhum valor recebido", () => {
    expect(
      deriveInstallmentStatus({
        paidAmount: 0,
        expectedAmount: 100,
        dueDate: "2026-06-01",
        today: "2026-06-01",
        currentStatus: "previsto",
      }),
    ).toBe("pendente");
  });

  it("previsto quando ainda não venceu e sem nenhum valor recebido", () => {
    expect(
      deriveInstallmentStatus({
        paidAmount: 0,
        expectedAmount: 100,
        dueDate: "2026-12-01",
        today: "2026-06-01",
        currentStatus: "previsto",
      }),
    ).toBe("previsto");
  });
});

describe("canExemptOrCancelInstallment — espelha set_missions_installment_exemption()", () => {
  it("permite quando não há valor pago", () => {
    expect(canExemptOrCancelInstallment({ paidAmount: 0, currentStatus: "previsto" })).toBe(true);
    expect(canExemptOrCancelInstallment({ paidAmount: 0, currentStatus: "atrasado" })).toBe(true);
  });

  it("bloqueia quando já existe valor pago real — nunca cancela um recebimento real", () => {
    expect(canExemptOrCancelInstallment({ paidAmount: 50, currentStatus: "parcial" })).toBe(false);
    expect(canExemptOrCancelInstallment({ paidAmount: 100, currentStatus: "pago" })).toBe(false);
  });

  it("bloqueia quando o status atual já é 'pago', mesmo com paidAmount inconsistente", () => {
    expect(canExemptOrCancelInstallment({ paidAmount: 0, currentStatus: "pago" })).toBe(false);
  });
});

describe("isInstallmentClosed", () => {
  it("fechado em cancelado/isento", () => {
    expect(isInstallmentClosed("cancelado")).toBe(true);
    expect(isInstallmentClosed("isento")).toBe(true);
    expect(isInstallmentClosed("previsto")).toBe(false);
    expect(isInstallmentClosed("pago")).toBe(false);
  });
});

describe("hasExactlyOneMissionsContext — espelha num_nonnulls(...) = 1", () => {
  it("aceita exatamente um contexto informado", () => {
    expect(hasExactlyOneMissionsContext({ missionaryId: "m1" })).toBe(true);
    expect(hasExactlyOneMissionsContext({ projectId: "p1" })).toBe(true);
    expect(hasExactlyOneMissionsContext({ campaignId: "c1" })).toBe(true);
    expect(hasExactlyOneMissionsContext({ installmentId: "i1" })).toBe(true);
  });

  it("rejeita nenhum contexto informado", () => {
    expect(hasExactlyOneMissionsContext({})).toBe(false);
    expect(hasExactlyOneMissionsContext({ missionaryId: null, projectId: undefined, campaignId: "" })).toBe(false);
  });

  it("rejeita mais de um contexto informado", () => {
    expect(hasExactlyOneMissionsContext({ missionaryId: "m1", projectId: "p1" })).toBe(false);
    expect(
      hasExactlyOneMissionsContext({ missionaryId: "m1", projectId: "p1", campaignId: "c1", installmentId: "i1" }),
    ).toBe(false);
  });
});

describe("calculateRealizationPercentage", () => {
  it("retorna null quando não há valor previsto (evita divisão por zero)", () => {
    expect(calculateRealizationPercentage(0, 0)).toBeNull();
    expect(calculateRealizationPercentage(-10, 0)).toBeNull();
  });

  it("calcula o percentual recebido/previsto com 2 casas decimais", () => {
    expect(calculateRealizationPercentage(100, 50)).toBe(50);
    expect(calculateRealizationPercentage(300, 100)).toBe(33.33);
  });

  it("permite superar 100% quando recebido excede o previsto", () => {
    expect(calculateRealizationPercentage(100, 150)).toBe(150);
  });
});
