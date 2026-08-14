import { describe, expect, it, vi } from "vitest";
import {
  CONFIADCS_IMPORT_CHUNK_SIZE,
  IMPORT_RPC_MAX_ROWS_PER_CALL,
  runFinanceImportBatches,
  type FinanceImportChunkResult,
  type FinanceImportRunnerClient,
  type FinanceReconciliationReport,
} from "./financeImportRunner";

const okChunk = (batchId: string, size: number): FinanceImportChunkResult => ({
  batchId,
  inserted: size,
  persistedReconciled: size,
  persistedPending: 0,
  duplicate: 0,
  excludedInvalid: 0,
  failed: 0,
});

const okReport = (rowsRead: number): FinanceReconciliationReport => ({
  ok: true,
  mismatches: [],
  rowsRead,
  persistedReconciled: rowsRead,
  persistedPending: 0,
  duplicate: 0,
  excludedInvalid: 0,
  failed: 0,
  distinctLegacyRecords: rowsRead,
  entriesCount: 0,
  exitsCount: rowsRead,
  entriesAmount: 0,
  exitsAmount: 0,
  minDate: "2024-11-01",
  maxDate: "2026-08-11",
});

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ legacy_record_number: String(i + 1) }));
}

function makeHappyClient(assignedBatchId = "batch-1") {
  const importChunk = vi.fn(
    async (rows: unknown[], batchId: string | null): Promise<FinanceImportChunkResult> =>
      okChunk(batchId ?? assignedBatchId, rows.length),
  );
  const finalizeBatch = vi.fn(async () => ({ ok: true, mismatches: [] as unknown[] }));
  const fetchReconciliationReport = vi.fn(async (_batchId: string) => okReport(0));
  const client: FinanceImportRunnerClient = { importChunk, finalizeBatch, fetchReconciliationReport };
  return { client, importChunk, finalizeBatch, fetchReconciliationReport };
}

describe("runFinanceImportBatches — batch_id único por importação (item 2/3/4)", () => {
  it("reaproveita o MESMO batch_id em todos os blocos, mesmo com múltiplos blocos", async () => {
    const { client, importChunk } = makeHappyClient();
    const rows = makeRows(950); // 5 blocos de 200 + 1 de 150, com chunkSize=200
    const result = await runFinanceImportBatches(rows, client, 200);

    expect(importChunk).toHaveBeenCalledTimes(5);
    // Primeira chamada: batchId ainda não existe (null) — servidor cria o lote.
    expect(importChunk.mock.calls[0][1]).toBeNull();
    // TODAS as chamadas seguintes reutilizam o batch_id retornado na primeira.
    for (let i = 1; i < importChunk.mock.calls.length; i++) {
      expect(importChunk.mock.calls[i][1]).toBe("batch-1");
    }
    expect(result.batchId).toBe("batch-1");
    expect(new Set(result.chunkResults.map(r => r.batchId)).size).toBe(1);
  });

  it("nunca cria um lote diferente por bloco — chunkResults[*].batchId é sempre idêntico", async () => {
    const { client } = makeHappyClient("lote-unico");
    const rows = makeRows(2500);
    const result = await runFinanceImportBatches(rows, client, 1000);

    expect(result.chunkResults).toHaveLength(3); // 1000 + 1000 + 500
    const distinctBatchIds = new Set(result.chunkResults.map(r => r.batchId));
    expect(distinctBatchIds).toEqual(new Set(["lote-unico"]));
  });

  it("aborta com erro explícito se a RPC (hipoteticamente) retornar um batch_id diferente do lote em andamento", async () => {
    const importChunk = vi.fn(async (rows: unknown[], batchId: string | null) =>
      batchId === null ? okChunk("batch-A", rows.length) : okChunk("batch-B-diferente", rows.length),
    );
    const client: FinanceImportRunnerClient = {
      importChunk,
      finalizeBatch: vi.fn(async () => ({ ok: true, mismatches: [] })),
      fetchReconciliationReport: vi.fn(async () => okReport(0)),
    };

    await expect(runFinanceImportBatches(makeRows(10), client, 5)).rejects.toThrow(/batch_id/i);
  });
});

describe("runFinanceImportBatches — finalize chamado exatamente uma vez (item 5)", () => {
  it("chama finalizeBatch UMA única vez após todos os blocos, nunca por bloco", async () => {
    const { client, finalizeBatch, fetchReconciliationReport } = makeHappyClient();
    const rows = makeRows(750);
    const result = await runFinanceImportBatches(rows, client, 200);

    expect(finalizeBatch).toHaveBeenCalledTimes(1);
    expect(finalizeBatch).toHaveBeenCalledWith("batch-1");
    expect(fetchReconciliationReport).toHaveBeenCalledTimes(1);
    expect(result.finalized).toBe(true);
  });

  it("com uma única linha (um único bloco), finalize ainda é chamado exatamente uma vez", async () => {
    const { client, finalizeBatch } = makeHappyClient();
    await runFinanceImportBatches(makeRows(1), client, 200);
    expect(finalizeBatch).toHaveBeenCalledTimes(1);
  });
});

describe("runFinanceImportBatches — sucesso parcial nunca aparece como sucesso (item 6/8)", () => {
  it("se um bloco no meio falhar (erro de RPC), aborta, NÃO chama finalize, e reporta o motivo real", async () => {
    const importChunk = vi.fn(async (rows: unknown[], batchId: string | null) => {
      if (batchId === null) return okChunk("batch-1", rows.length);
      return { ...okChunk("batch-1", 0), inserted: 0, errorMessage: "Erro de rede simulado" };
    });
    const finalizeBatch = vi.fn(async () => ({ ok: true, mismatches: [] }));
    const fetchReconciliationReport = vi.fn(async () => okReport(0));
    const client: FinanceImportRunnerClient = { importChunk, finalizeBatch, fetchReconciliationReport };

    const result = await runFinanceImportBatches(makeRows(30), client, 10);

    expect(result.aborted).toBe(true);
    expect(result.finalized).toBe(false);
    expect(result.abortReason).toMatch(/Erro de rede simulado/);
    expect(finalizeBatch).not.toHaveBeenCalled();
    expect(fetchReconciliationReport).not.toHaveBeenCalled();
    // O bloco 1 (bem-sucedido) ainda é reportado nos totais parciais — mas
    // isso nunca é confundido com sucesso, pois aborted=true/finalized=false.
    expect(result.totals.persistedReconciled).toBe(10);
  });

  it("se a RPC confirmar menos linhas do que o bloco enviado, trata como sucesso parcial e aborta", async () => {
    const importChunk = vi.fn(async (rows: unknown[], batchId: string | null) =>
      ({ ...okChunk(batchId ?? "batch-1", rows.length), inserted: rows.length - 1 }),
    );
    const client: FinanceImportRunnerClient = {
      importChunk,
      finalizeBatch: vi.fn(async () => ({ ok: true, mismatches: [] })),
      fetchReconciliationReport: vi.fn(async () => okReport(0)),
    };

    const result = await runFinanceImportBatches(makeRows(10), client, 10);
    expect(result.aborted).toBe(true);
    expect(result.finalized).toBe(false);
    expect(result.abortReason).toMatch(/confirmou apenas 9 de 10/);
  });

  it("quando finalize roda mas reconciled=false, o resultado nunca finge sucesso — expõe finalizeOk=false e os mismatches reais", async () => {
    const { client, finalizeBatch } = makeHappyClient();
    finalizeBatch.mockResolvedValueOnce({
      ok: false,
      mismatches: [{ check: "persisted_reconciled", actual: 100, expected: 29957 }],
    });
    const result = await runFinanceImportBatches(makeRows(100), client, 100);

    expect(result.finalized).toBe(true); // finalize FOI chamado...
    expect(result.finalizeOk).toBe(false); // ...mas não reconciliou.
    expect(result.finalizeMismatches).toEqual([
      { check: "persisted_reconciled", actual: 100, expected: 29957 },
    ]);
  });
});

describe("runFinanceImportBatches — nenhum limite silencioso de 1000 linhas (item 9)", () => {
  it("rejeita chunkSize maior que o limite da RPC ANTES de qualquer chamada", async () => {
    const { client, importChunk } = makeHappyClient();
    await expect(
      runFinanceImportBatches(makeRows(5), client, IMPORT_RPC_MAX_ROWS_PER_CALL + 1),
    ).rejects.toThrow(/excede o limite/);
    expect(importChunk).not.toHaveBeenCalled();
  });

  it("processa TODOS os blocos de um lote de 29.957 linhas — nunca para silenciosamente em 1000", async () => {
    const { client, importChunk } = makeHappyClient();
    const rows = makeRows(29957);
    const result = await runFinanceImportBatches(rows, client, CONFIADCS_IMPORT_CHUNK_SIZE);

    const expectedChunks = Math.ceil(29957 / CONFIADCS_IMPORT_CHUNK_SIZE);
    expect(importChunk).toHaveBeenCalledTimes(expectedChunks);
    expect(result.totalRowsSubmitted).toBe(29957);
    expect(result.totals.persistedReconciled).toBe(29957);
    expect(result.aborted).toBe(false);
  });

  it("o chunkSize padrão do CONFIADCS é bem menor que o limite rígido da RPC", () => {
    expect(CONFIADCS_IMPORT_CHUNK_SIZE).toBeLessThanOrEqual(IMPORT_RPC_MAX_ROWS_PER_CALL);
    expect(IMPORT_RPC_MAX_ROWS_PER_CALL).toBe(1000);
  });
});

describe("runFinanceImportBatches — resumo final vem de uma única leitura recalculada, nunca fetch-all (item 10)", () => {
  it("busca o relatório de reconciliação exatamente uma vez, com o batch_id final — nunca em loop", async () => {
    const { client, fetchReconciliationReport } = makeHappyClient();
    await runFinanceImportBatches(makeRows(400), client, 200);
    expect(fetchReconciliationReport).toHaveBeenCalledTimes(1);
    expect(fetchReconciliationReport).toHaveBeenCalledWith("batch-1");
  });

  it("nunca chama fetchReconciliationReport quando a importação foi abortada", async () => {
    const importChunk = vi.fn(async (rows: unknown[], batchId: string | null) =>
      batchId === null
        ? okChunk("batch-1", rows.length)
        : { ...okChunk("batch-1", 0), inserted: 0, errorMessage: "falhou" },
    );
    const fetchReconciliationReport = vi.fn(async () => okReport(0));
    const client: FinanceImportRunnerClient = {
      importChunk,
      finalizeBatch: vi.fn(async () => ({ ok: true, mismatches: [] })),
      fetchReconciliationReport,
    };
    await runFinanceImportBatches(makeRows(20), client, 10);
    expect(fetchReconciliationReport).not.toHaveBeenCalled();
  });
});

describe("runFinanceImportBatches — validação de parâmetros", () => {
  it("rejeita chunkSize zero ou negativo", async () => {
    const { client } = makeHappyClient();
    await expect(runFinanceImportBatches(makeRows(5), client, 0)).rejects.toThrow();
    await expect(runFinanceImportBatches(makeRows(5), client, -10)).rejects.toThrow();
  });

  it("com zero linhas, não cria lote e não chama finalize", async () => {
    const { client, importChunk, finalizeBatch } = makeHappyClient();
    const result = await runFinanceImportBatches([], client, 200);
    expect(importChunk).not.toHaveBeenCalled();
    expect(finalizeBatch).not.toHaveBeenCalled();
    expect(result.finalized).toBe(false);
    expect(result.batchId).toBe("");
  });
});
