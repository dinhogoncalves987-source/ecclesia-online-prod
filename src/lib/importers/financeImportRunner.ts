// ─────────────────────────────────────────────────────────────────────────────
// financeImportRunner.ts — FASE 1D-C1
//
// Orquestra uma importação CONFIADCS inteira (29.957 linhas em blocos de até
// 1000) garantindo:
//   1. UM único finance_import_batches por importação — o batch_id retornado
//      pela primeira chamada da RPC é reaproveitado em todos os blocos
//      seguintes, nunca um lote novo por bloco;
//   2. finalize_finance_import_batch é chamado exatamente UMA vez, somente
//      depois que TODOS os blocos foram persistidos com sucesso;
//   3. sucesso parcial nunca é promovido a "concluído": se qualquer bloco
//      falhar (erro de rede/RPC ou `inserted` menor que o esperado), a
//      importação é abortada e finalize NUNCA é chamado;
//   4. nenhum bloco pode exceder o limite de 1000 linhas da RPC (validado
//      antes de qualquer chamada) e TODOS os blocos são processados até o
//      fim — nunca um corte silencioso;
//   5. o resumo final exibido ao usuário vem de UMA leitura pontual do
//      relatório já recalculado no servidor (finance_import_batches.
//      reconciliation_report), nunca de um fetch-all das transactions no
//      cliente.
//
// Este módulo é puro (sem I/O direto) — recebe um `FinanceImportRunnerClient`
// injetado, o que permite testá-lo inteiramente com um cliente falso, sem
// tocar Supabase/rede.
// ─────────────────────────────────────────────────────────────────────────────

/** Limite rígido de linhas por chamada de import_finance_transactions_bulk
 *  (aplicado pela RPC — ver migration 20260812190000/200000). */
export const IMPORT_RPC_MAX_ROWS_PER_CALL = 1000;

/** Tamanho de bloco usado pelo cliente para a importação CONFIADCS — bem
 *  abaixo do limite da RPC para manter payloads responsivos. */
export const CONFIADCS_IMPORT_CHUNK_SIZE = 200;

export interface FinanceImportChunkResult {
  /** batch_id efetivamente usado/criado pela RPC para este bloco. */
  batchId: string;
  /** Total de linhas persistidas (reconciliadas + pendentes) neste bloco. */
  inserted: number;
  persistedReconciled: number;
  persistedPending: number;
  duplicate: number;
  excludedInvalid: number;
  failed: number;
  /** Presente quando a chamada falhou (erro de transporte ou de negócio). */
  errorMessage?: string;
  errors?: unknown;
}

export interface FinanceReconciliationReport {
  ok: boolean;
  mismatches: unknown[];
  rowsRead: number;
  persistedReconciled: number;
  persistedPending: number;
  duplicate: number;
  excludedInvalid: number;
  failed: number;
  distinctLegacyRecords: number;
  entriesCount: number;
  exitsCount: number;
  entriesAmount: number;
  exitsAmount: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface FinanceImportRunnerClient {
  /**
   * Envia um único bloco (<= IMPORT_RPC_MAX_ROWS_PER_CALL linhas) via
   * import_finance_transactions_bulk. `batchId` é `null` apenas na primeira
   * chamada — o cliente real deve repassar `p_import_batch_id: batchId`
   * quando não for null, para que o servidor reutilize o mesmo lote.
   */
  importChunk: (rows: unknown[], batchId: string | null) => Promise<FinanceImportChunkResult>;
  /** Chama finalize_finance_import_batch(p_batch_id). */
  finalizeBatch: (batchId: string) => Promise<{ ok: boolean; mismatches: unknown[] }>;
  /** Lê o relatório já recalculado no servidor (uma única linha). */
  fetchReconciliationReport: (batchId: string) => Promise<FinanceReconciliationReport | null>;
}

export interface FinanceImportRunResult {
  batchId: string;
  chunkResults: FinanceImportChunkResult[];
  totalRowsSubmitted: number;
  /** Soma dos contadores de todos os blocos (visão imediata/progresso —
   *  NUNCA usada como declaração final de sucesso; ver `reconciliationReport`
   *  para os números recalculados a partir do que está persistido). */
  totals: {
    inserted: number;
    persistedReconciled: number;
    persistedPending: number;
    duplicate: number;
    excludedInvalid: number;
    failed: number;
  };
  /** true quando a importação foi interrompida antes de processar todos os
   *  blocos (erro de RPC ou confirmação parcial de um bloco). Nesse caso
   *  `finalized` é sempre false — sucesso parcial nunca é finalizado. */
  aborted: boolean;
  abortReason?: string;
  /** true somente quando finalize_finance_import_batch foi efetivamente
   *  chamado (uma única vez, após todos os blocos terem sido persistidos). */
  finalized: boolean;
  finalizeOk?: boolean;
  finalizeMismatches?: unknown[];
  reconciliationReport?: FinanceReconciliationReport | null;
}

function sumChunkTotals(chunkResults: FinanceImportChunkResult[]): FinanceImportRunResult["totals"] {
  return chunkResults.reduce(
    (acc, r) => ({
      inserted: acc.inserted + r.inserted,
      persistedReconciled: acc.persistedReconciled + r.persistedReconciled,
      persistedPending: acc.persistedPending + r.persistedPending,
      duplicate: acc.duplicate + r.duplicate,
      excludedInvalid: acc.excludedInvalid + r.excludedInvalid,
      failed: acc.failed + r.failed,
    }),
    { inserted: 0, persistedReconciled: 0, persistedPending: 0, duplicate: 0, excludedInvalid: 0, failed: 0 },
  );
}

/**
 * Executa uma importação CONFIADCS completa: divide `rows` em blocos de
 * `chunkSize`, reaproveita o mesmo batch_id em todos eles, e — somente se
 * TODOS os blocos forem persistidos com sucesso — chama finalize UMA única
 * vez e busca o relatório de reconciliação recalculado.
 */
export async function runFinanceImportBatches(
  rows: unknown[],
  client: FinanceImportRunnerClient,
  chunkSize: number = CONFIADCS_IMPORT_CHUNK_SIZE,
): Promise<FinanceImportRunResult> {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`chunkSize inválido: ${chunkSize}. Deve ser um inteiro positivo.`);
  }
  if (chunkSize > IMPORT_RPC_MAX_ROWS_PER_CALL) {
    throw new Error(
      `chunkSize (${chunkSize}) excede o limite de ${IMPORT_RPC_MAX_ROWS_PER_CALL} linhas por chamada da RPC import_finance_transactions_bulk.`,
    );
  }

  let batchId: string | null = null;
  const chunkResults: FinanceImportChunkResult[] = [];
  let aborted = false;
  let abortReason: string | undefined;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result = await client.importChunk(chunk, batchId);

    if (batchId === null) {
      batchId = result.batchId;
    } else if (result.batchId && result.batchId !== batchId) {
      // Nunca deve acontecer com um cliente real (a RPC ecoa o mesmo
      // batch_id quando p_import_batch_id é informado) — mas se acontecer,
      // abortamos explicitamente em vez de silenciosamente fragmentar a
      // importação em múltiplos lotes.
      throw new Error(
        `A RPC retornou batch_id ${result.batchId}, diferente do lote em andamento ${batchId} — importação abortada para nunca criar lotes duplicados.`,
      );
    }

    chunkResults.push(result);

    const chunkOk = !result.errorMessage && result.inserted === chunk.length;
    if (!chunkOk) {
      aborted = true;
      abortReason = result.errorMessage
        ?? `O banco confirmou apenas ${result.inserted} de ${chunk.length} lançamentos neste bloco.`;
      break;
    }
  }

  const totals = sumChunkTotals(chunkResults);

  if (batchId === null) {
    return {
      batchId: "",
      chunkResults,
      totalRowsSubmitted: rows.length,
      totals,
      aborted: true,
      abortReason: "Nenhuma linha foi enviada — nenhum lote de importação foi criado.",
      finalized: false,
    };
  }

  if (aborted) {
    // Sucesso parcial NUNCA é declarado concluído: finalize não é chamado.
    return {
      batchId,
      chunkResults,
      totalRowsSubmitted: rows.length,
      totals,
      aborted: true,
      abortReason,
      finalized: false,
    };
  }

  const finalizeResult = await client.finalizeBatch(batchId);
  const reconciliationReport = await client.fetchReconciliationReport(batchId);

  return {
    batchId,
    chunkResults,
    totalRowsSubmitted: rows.length,
    totals,
    aborted: false,
    finalized: true,
    finalizeOk: finalizeResult.ok,
    finalizeMismatches: finalizeResult.mismatches,
    reconciliationReport,
  };
}
