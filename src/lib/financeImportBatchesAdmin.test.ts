import { describe, it, expect, vi } from "vitest";
import {
  mapFinanceImportBatchRow,
  transactionsRemovedByBatch,
  parseFinanceDeletionRpcResult,
  isResetImportsPhraseConfirmed,
  RESET_IMPORTS_CONFIRMATION_PHRASE,
  createSingleFlightGuard,
} from "./financeImportBatchesAdmin";

describe("mapFinanceImportBatchRow", () => {
  it("mapeia todas as colunas reais de finance_import_batches usadas no histórico", () => {
    const batch = mapFinanceImportBatchRow({
      id: "batch-1",
      created_at: "2026-08-12T18:00:00Z",
      source_file_name: "CONFIADCS1-2-26.xlsm",
      status: "done",
      reconciled: true,
      rows_read: 29957,
      rows_persisted_reconciled: 29957,
      rows_persisted_pending: 0,
      rows_duplicate: 0,
      rows_excluded_invalid: 0,
      rows_failed: 0,
    });
    expect(batch).toEqual({
      id: "batch-1",
      createdAt: "2026-08-12T18:00:00Z",
      sourceFileName: "CONFIADCS1-2-26.xlsm",
      status: "done",
      reconciled: true,
      rowsRead: 29957,
      rowsPersistedReconciled: 29957,
      rowsPersistedPending: 0,
      rowsDuplicate: 0,
      rowsExcludedInvalid: 0,
      rowsFailed: 0,
    });
  });

  it("nunca quebra com colunas nulas/ausentes — usa defaults seguros", () => {
    const batch = mapFinanceImportBatchRow({ id: "batch-2" });
    expect(batch.sourceFileName).toBeNull();
    expect(batch.reconciled).toBe(false);
    expect(batch.rowsRead).toBe(0);
    expect(batch.status).toBe("pending");
  });
});

describe("transactionsRemovedByBatch", () => {
  it("soma reconciliadas + pendentes — nunca conta duplicadas/inválidas/falhas (nunca geraram transaction)", () => {
    const batch = mapFinanceImportBatchRow({
      id: "b",
      rows_persisted_reconciled: 100,
      rows_persisted_pending: 5,
      rows_duplicate: 3,
      rows_excluded_invalid: 2,
      rows_failed: 1,
    });
    expect(transactionsRemovedByBatch(batch)).toBe(105);
  });
});

describe("parseFinanceDeletionRpcResult", () => {
  it("interpreta sucesso de delete_finance_import_batch com todas as contagens", () => {
    const outcome = parseFinanceDeletionRpcResult(
      {
        ok: true,
        batch_id: "batch-1",
        transactions_removed: 200,
        audit_logs_removed: 400,
        batch_rows_removed: 200,
        batches_removed: 1,
      },
      "erro genérico",
    );
    expect(outcome).toEqual({
      ok: true,
      error: null,
      batchId: "batch-1",
      organizationId: null,
      transactionsRemoved: 200,
      auditLogsRemoved: 400,
      batchRowsRemoved: 200,
      batchesRemoved: 1,
    });
  });

  it("interpreta sucesso de reset_organization_finance_imports (organization_id em vez de batch_id)", () => {
    const outcome = parseFinanceDeletionRpcResult(
      {
        ok: true,
        organization_id: "org-1",
        transactions_removed: 29957,
        audit_logs_removed: 59914,
        batch_rows_removed: 29957,
        batches_removed: 3,
      },
      "erro genérico",
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.organizationId).toBe("org-1");
    expect(outcome.transactionsRemoved).toBe(29957);
  });

  it("nunca declara sucesso quando a RPC retorna { error }", () => {
    const outcome = parseFinanceDeletionRpcResult({ error: "import batch not found" }, "erro genérico");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("import batch not found");
    expect(outcome.transactionsRemoved).toBe(0);
  });

  it("nunca declara sucesso quando ok não é exatamente true", () => {
    const outcome = parseFinanceDeletionRpcResult({ ok: false }, "erro genérico");
    expect(outcome.ok).toBe(false);
  });

  it("nunca declara sucesso quando a resposta é nula/inesperada — usa a mensagem de fallback", () => {
    expect(parseFinanceDeletionRpcResult(null, "erro genérico").error).toBe("erro genérico");
    expect(parseFinanceDeletionRpcResult(null, "erro genérico").ok).toBe(false);
    expect(parseFinanceDeletionRpcResult(undefined, "erro genérico").error).toBe("erro genérico");
    expect(parseFinanceDeletionRpcResult("não é json válido {{{", "erro genérico").error).toBe("erro genérico");
  });

  it("aceita resposta serializada como string JSON (mesmo padrão de p_rows do runner de importação)", () => {
    const outcome = parseFinanceDeletionRpcResult(
      JSON.stringify({ ok: true, batch_id: "b1", transactions_removed: 1, audit_logs_removed: 2, batch_rows_removed: 1, batches_removed: 1 }),
      "erro genérico",
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("isResetImportsPhraseConfirmed", () => {
  it("exige a frase EXATA 'ZERAR IMPORTAÇÕES'", () => {
    expect(RESET_IMPORTS_CONFIRMATION_PHRASE).toBe("ZERAR IMPORTAÇÕES");
    expect(isResetImportsPhraseConfirmed("ZERAR IMPORTAÇÕES")).toBe(true);
  });

  it("rejeita qualquer variação — minúsculas, espaços extras, sem acento, incompleta", () => {
    expect(isResetImportsPhraseConfirmed("zerar importações")).toBe(false);
    expect(isResetImportsPhraseConfirmed(" ZERAR IMPORTAÇÕES")).toBe(false);
    expect(isResetImportsPhraseConfirmed("ZERAR IMPORTAÇÕES ")).toBe(false);
    expect(isResetImportsPhraseConfirmed("ZERAR IMPORTACOES")).toBe(false);
    expect(isResetImportsPhraseConfirmed("ZERAR")).toBe(false);
    expect(isResetImportsPhraseConfirmed("")).toBe(false);
  });
});

describe("createSingleFlightGuard — clique duplo gera somente uma execução", () => {
  it("a segunda chamada concorrente com a MESMA chave é ignorada (retorna null, nunca dispara fn de novo)", async () => {
    const guard = createSingleFlightGuard<string>();
    let calls = 0;
    let resolveFirst: (() => void) | undefined;
    const fn = () =>
      new Promise<string>(resolve => {
        calls += 1;
        resolveFirst = () => resolve("done");
      });

    const first = guard.run("batch-1", fn);
    expect(guard.isRunning("batch-1")).toBe(true);

    // "Duplo clique": segunda chamada disparada antes da primeira terminar.
    const second = guard.run("batch-1", fn);

    expect(calls).toBe(1);
    resolveFirst?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe("done");
    expect(secondResult).toBeNull();
    expect(guard.isRunning("batch-1")).toBe(false);
  });

  it("chaves diferentes (lotes diferentes) podem executar em paralelo sem se bloquear", async () => {
    const guard = createSingleFlightGuard<string>();
    const fn = vi.fn().mockResolvedValue("ok");
    const [a, b] = await Promise.all([guard.run("batch-1", fn), guard.run("batch-2", fn)]);
    expect(a).toBe("ok");
    expect(b).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("libera a chave mesmo quando fn rejeita — não trava permanentemente após um erro", async () => {
    const guard = createSingleFlightGuard<string>();
    await expect(guard.run("batch-1", () => Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    expect(guard.isRunning("batch-1")).toBe(false);
    // Depois do erro, uma nova tentativa para a mesma chave deve poder rodar.
    const result = await guard.run("batch-1", () => Promise.resolve("segunda tentativa"));
    expect(result).toBe("segunda tentativa");
  });
});
