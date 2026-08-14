/**
 * financeImportBatchesAdmin.ts
 *
 * Lógica pura (sem React, sem rede) para a FASE 1D-C2 — exclusão segura de
 * importações financeiras. Mapeia linhas de finance_import_batches para um
 * modelo de exibição, interpreta as respostas JSON das RPCs
 * delete_finance_import_batch / reset_organization_finance_imports, e
 * valida a frase de confirmação obrigatória ("ZERAR IMPORTAÇÕES") do fluxo
 * de reset. Mantida separada do componente React para ser testável sem
 * montar UI nem executar SQL.
 */

export interface FinanceImportBatchSummary {
  id: string;
  createdAt: string;
  sourceFileName: string | null;
  status: string;
  reconciled: boolean;
  rowsRead: number;
  rowsPersistedReconciled: number;
  rowsPersistedPending: number;
  rowsDuplicate: number;
  rowsExcludedInvalid: number;
  rowsFailed: number;
}

/** Linha crua vinda de supabase.from("finance_import_batches").select(...). */
export type RawFinanceImportBatchRow = Record<string, unknown>;

export function mapFinanceImportBatchRow(row: RawFinanceImportBatchRow): FinanceImportBatchSummary {
  const num = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id: String(row.id ?? ""),
    createdAt: String(row.created_at ?? ""),
    sourceFileName: typeof row.source_file_name === "string" ? row.source_file_name : null,
    status: typeof row.status === "string" ? row.status : "pending",
    reconciled: row.reconciled === true,
    rowsRead: num(row.rows_read),
    rowsPersistedReconciled: num(row.rows_persisted_reconciled),
    rowsPersistedPending: num(row.rows_persisted_pending),
    rowsDuplicate: num(row.rows_duplicate),
    rowsExcludedInvalid: num(row.rows_excluded_invalid),
    rowsFailed: num(row.rows_failed),
  };
}

/**
 * Quantidade de lançamentos que serão removidos ao excluir este lote —
 * exibida na confirmação ANTES da exclusão. Só linhas persistidas (com ou
 * sem pendência de catálogo) chegaram a gerar uma transaction; duplicadas,
 * inválidas e falhas nunca geraram nenhuma.
 */
export function transactionsRemovedByBatch(batch: FinanceImportBatchSummary): number {
  return batch.rowsPersistedReconciled + batch.rowsPersistedPending;
}

// ── Respostas das RPCs ───────────────────────────────────────────────────────

export interface FinanceDeletionCounts {
  transactionsRemoved: number;
  auditLogsRemoved: number;
  batchRowsRemoved: number;
  batchesRemoved: number;
}

/**
 * Resultado interpretado das RPCs de exclusão. Propositalmente NÃO é uma
 * união discriminada (`{ok:true;...} | {ok:false; error}`): este projeto
 * compila com `"strict": false` (tsconfig.app.json), ou seja
 * `strictNullChecks` desligado — e sem `strictNullChecks` o TypeScript não
 * estreita uniões discriminadas de forma confiável (nem mesmo com
 * `if (result.ok) {...} else {...}` simples), o que gerava falsos erros de
 * compilação em `FinanceImportHistory.tsx`. Um único formato plano, sempre
 * com todos os campos presentes, evita depender desse estreitamento: quando
 * `ok` é `false`, `error` traz a mensagem real e as contagens vêm zeradas;
 * quando `ok` é `true`, `error` é `null` e as contagens refletem o que foi
 * removido. Nunca declara sucesso quando `error` ou `ok !== true` estão
 * presentes na resposta da RPC — o chamador deve exibir o erro real, nunca
 * um sucesso falso.
 */
export interface FinanceDeletionRpcOutcome extends FinanceDeletionCounts {
  ok: boolean;
  error: string | null;
  batchId: string | null;
  organizationId: string | null;
}

function extractCounts(result: Record<string, unknown>): FinanceDeletionCounts {
  const num = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    transactionsRemoved: num(result.transactions_removed),
    auditLogsRemoved: num(result.audit_logs_removed),
    batchRowsRemoved: num(result.batch_rows_removed),
    batchesRemoved: num(result.batches_removed),
  };
}

const ZERO_COUNTS: FinanceDeletionCounts = {
  transactionsRemoved: 0,
  auditLogsRemoved: 0,
  batchRowsRemoved: 0,
  batchesRemoved: 0,
};

/** Constrói um resultado de falha completo (todas as contagens zeradas) —
 * usado tanto ao interpretar a resposta da RPC quanto pelo chamador ao
 * tratar um erro de rede/transporte (`{ error } = await supabase.rpc(...)`)
 * antes mesmo de a RPC responder. */
export function failureOutcome(error: string): FinanceDeletionRpcOutcome {
  return { ok: false, error, batchId: null, organizationId: null, ...ZERO_COUNTS };
}

/**
 * Interpreta a resposta jsonb de delete_finance_import_batch /
 * reset_organization_finance_imports. Nunca declara sucesso quando `error`
 * ou `ok !== true` estão presentes — o chamador deve exibir o erro real, não
 * um sucesso falso.
 */
export function parseFinanceDeletionRpcResult(
  data: unknown,
  fallbackErrorMessage: string,
): FinanceDeletionRpcOutcome {
  const parsed = typeof data === "string" ? safeJsonParse(data) : data;
  if (!parsed || typeof parsed !== "object") {
    return failureOutcome(fallbackErrorMessage);
  }
  const result = parsed as Record<string, unknown>;
  if (typeof result.error === "string" && result.error.length > 0) {
    return failureOutcome(result.error);
  }
  if (result.ok !== true) {
    return failureOutcome(fallbackErrorMessage);
  }
  return {
    ok: true,
    error: null,
    ...extractCounts(result),
    batchId: typeof result.batch_id === "string" ? result.batch_id : null,
    organizationId: typeof result.organization_id === "string" ? result.organization_id : null,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ── Confirmação textual obrigatória do reset ─────────────────────────────────

export const RESET_IMPORTS_CONFIRMATION_PHRASE = "ZERAR IMPORTAÇÕES";

/** A frase precisa coincidir EXATAMENTE — nunca aceita variações de caixa,
 * espaços extras ou acentuação diferente. */
export function isResetImportsPhraseConfirmed(input: string): boolean {
  return input === RESET_IMPORTS_CONFIRMATION_PHRASE;
}

// ── Guarda anti clique-duplo ──────────────────────────────────────────────────

/**
 * Garante que, para uma mesma chave (ex.: id do lote, ou "reset"), somente
 * UMA execução assíncrona esteja em andamento por vez — mesmo que o
 * chamador dispare a função duas vezes seguidas (duplo clique) antes que o
 * primeiro `disabled` do botão seja re-renderizado. A atomicidade real fica
 * no banco/RPC; esta guarda existe apenas para nunca despachar uma segunda
 * chamada de rede enquanto a primeira está em voo.
 */
export function createSingleFlightGuard<TKey extends string = string>() {
  const inFlight = new Set<TKey>();

  return {
    isRunning(key: TKey): boolean {
      return inFlight.has(key);
    },
    /** Retorna null se `key` já está em execução (nunca inicia uma segunda
     * chamada); caso contrário executa `fn` e libera a chave ao final,
     * mesmo em caso de erro. */
    async run<T>(key: TKey, fn: () => Promise<T>): Promise<T | null> {
      if (inFlight.has(key)) return null;
      inFlight.add(key);
      try {
        return await fn();
      } finally {
        inFlight.delete(key);
      }
    },
  };
}
