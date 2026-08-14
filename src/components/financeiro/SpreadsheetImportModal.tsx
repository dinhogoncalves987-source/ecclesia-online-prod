/**
 * SpreadsheetImportModal.tsx
 * Importa planilhas CONFIADCS (.xlsm/.xlsx/.csv) usando RPC do Supabase.
 * Nunca usa supabase.from("transactions").insert().
 * Nunca exibe dados falsos/mock/demo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import { readSpreadsheet, readSheetByName } from "@/lib/importers/spreadsheetReader";
import { mapConfiadcsRows, type AuxLookup, type MappedTransaction } from "@/lib/importers/financeConfiadcsMapper";
import { buildFinanceImportPayload } from "@/lib/importers/financeImportPayload";
import { buildColumnMap } from "@/lib/importers/headerNormalizer";
import { getOrganizationScopeIds } from "@/lib/organizationScope";
import {
  CONFIADCS_IMPORT_CHUNK_SIZE,
  runFinanceImportBatches,
  type FinanceImportChunkResult,
  type FinanceImportRunnerClient,
  type FinanceImportRunResult,
  type FinanceReconciliationReport,
} from "@/lib/importers/financeImportRunner";

const BATCH_SIZE = CONFIADCS_IMPORT_CHUNK_SIZE;
const PREVIEW_ROWS = 20;

type Step = "file" | "preview" | "importing" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}

// ── Aux data ─────────────────────────────────────────────────────────────────

async function loadAuxData(orgId: string): Promise<AuxLookup> {
  const scopeIds = await getOrganizationScopeIds(orgId);
  const [accountingGroupsResult, accountCategoriesResult, documentTypesResult, financialAccountsResult, orgsResult] =
    await Promise.all([
      supabase
        .from("finance_accounting_groups")
        .select("id, name, code")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${orgId}`),
      supabase
        .from("finance_account_categories")
        .select("id, name, code")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("finance_document_types")
        .select("id, name, code")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${orgId}`),
      supabase
        .from("finance_accounts")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("organizations")
        .select("id, name, organization_type")
        .in("id", scopeIds)
        .eq("active", true),
    ]);

  const failedLookup = [
    accountingGroupsResult,
    accountCategoriesResult,
    documentTypesResult,
    financialAccountsResult,
    orgsResult,
  ].find(result => result.error);
  if (failedLookup?.error) {
    throw new Error(`Não foi possível carregar as referências financeiras: ${failedLookup.error.message}`);
  }

  const orgsArr = (orgsResult.data ?? []) as { id: string; name: string; organization_type: string | null }[];
  const congregations = orgsArr.filter(o => o.organization_type === "congregacao" || o.organization_type === "congregação");
  const districts = orgsArr.filter(o =>
    o.organization_type === "setor"
    || o.organization_type === "distrito"
    || o.organization_type === "subdistrito"
    || o.organization_type === "subsede"
  );

  return {
    accountingGroups: (accountingGroupsResult.data ?? []) as AuxLookup["accountingGroups"],
    accountCategories: (accountCategoriesResult.data ?? []) as AuxLookup["accountCategories"],
    documentTypes: (documentTypesResult.data ?? []) as AuxLookup["documentTypes"],
    financialAccounts: (financialAccountsResult.data ?? []) as AuxLookup["financialAccounts"],
    congregations,
    districts,
  };
}

// ── Componente ────────────────────────────────────────────────────────────────

export function SpreadsheetImportModal({ open, onClose, onImported }: Props) {
  const { church } = useChurch();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapped, setMapped] = useState<MappedTransaction[]>([]);
  const [invalidSample, setInvalidSample] = useState<{ rowIndex: number; reason: string }[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [progress, setProgress] = useState(0);
  const [runResult, setRunResult] = useState<FinanceImportRunResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [auxError, setAuxError] = useState<string | null>(null);
  const [auxData, setAuxData] = useState<AuxLookup | null>(null);
  const [auxOrganizationId, setAuxOrganizationId] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (open && church && auxOrganizationId !== church.id) {
      setAuxError(null);
      setAuxData(null);
      loadAuxData(church.id)
        .then(data => {
          setAuxData(data);
          setAuxOrganizationId(church.id);
        })
        .catch(error => setAuxError(error instanceof Error ? error.message : "Erro ao carregar referências financeiras."));
    }
  }, [open, church, auxOrganizationId]);

  useEffect(() => {
    if (!open) {
      setStep("file"); setFile(null); setSheetNames([]); setSelectedSheet("");
      setRawRows([]); setHeaderRowIndex(0); setMapped([]); setInvalidSample([]);
      setTotalRows(0); setProgress(0); setRunResult(null);
      setFileError(null); setImportError(null); setAuxError(null); setLoadingFile(false);
      setAuxData(null); setAuxOrganizationId(null);
    }
  }, [open]);

  const processRows = useCallback(
    (rows: string[][], hIdx: number, aux: AuxLookup) => {
      const headerRow = rows[hIdx] ?? [];
      const dataRows = rows.slice(hIdx + 1).filter(r => r.some(c => String(c ?? "").trim()));
      const result = mapConfiadcsRows(headerRow, dataRows, aux, hIdx + 1);
      setMapped(result.valid);
      setTotalRows(dataRows.length);
      setInvalidSample(result.invalid.slice(0, 10).map(r => ({ rowIndex: r.rowIndex, reason: r.reason })));
      setStep("preview");
    },
    []
  );

  const handleFile = useCallback(async (f: File) => {
    setFileError(null);
    setLoadingFile(true);
    try {
      const result = await readSpreadsheet(f);
      setFile(f);
      setSheetNames(result.sheetNames);
      setSelectedSheet(result.selectedSheet);
      setRawRows(result.rows);
      setHeaderRowIndex(result.headerRowIndex);
      const aux = auxData ?? await loadAuxData(church!.id);
      if (!auxData) setAuxData(aux);
      processRows(result.rows, result.headerRowIndex, aux);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Erro ao ler arquivo.");
    } finally {
      setLoadingFile(false);
    }
  }, [auxData, church, processRows]);

  const handleSheetChange = async (name: string) => {
    if (!file || !auxData) return;
    setSelectedSheet(name);
    try {
      const { rows, headerRowIndex: hIdx } = await readSheetByName(file, name);
      setRawRows(rows); setHeaderRowIndex(hIdx);
      processRows(rows, hIdx, auxData);
    } catch (err) { console.error(err); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ── Import via RPC ──────────────────────────────────────────────────────────
  // Uma importação inteira (até 29.957 linhas, em blocos de BATCH_SIZE) usa
  // um ÚNICO finance_import_batches: o batch_id retornado pelo primeiro
  // bloco é reaproveitado em todos os blocos seguintes (nunca um lote por
  // bloco), e finalize_finance_import_batch só é chamado UMA vez, somente
  // depois que TODOS os blocos foram persistidos com sucesso. Sucesso
  // parcial nunca é declarado concluído — ver runFinanceImportBatches.

  function parseRpcJson(data: unknown): Record<string, unknown> {
    return (typeof data === "string" ? JSON.parse(data) : (data ?? {})) as Record<string, unknown>;
  }

  function buildSupabaseImportClient(): FinanceImportRunnerClient {
    return {
      importChunk: async (rows, batchId): Promise<FinanceImportChunkResult> => {
        const { data, error } = await supabase.rpc("import_finance_transactions_bulk", {
          p_rows: rows as Json,
          p_import_batch_id: batchId ?? undefined,
        });

        if (error) {
          const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || "Erro na RPC.";
          return {
            batchId: batchId ?? "",
            inserted: 0, persistedReconciled: 0, persistedPending: 0,
            duplicate: 0, excludedInvalid: 0, failed: rows.length,
            errorMessage: msg,
          };
        }

        const result = parseRpcJson(data);
        if (typeof result.error === "string") {
          return {
            batchId: batchId ?? String(result.batch_id ?? ""),
            inserted: 0, persistedReconciled: 0, persistedPending: 0,
            duplicate: 0, excludedInvalid: 0, failed: rows.length,
            errorMessage: result.error,
          };
        }

        return {
          batchId: String(result.batch_id ?? batchId ?? ""),
          inserted: Number(result.inserted ?? 0),
          persistedReconciled: Number(result.persisted_reconciled ?? 0),
          persistedPending: Number(result.persisted_pending ?? 0),
          duplicate: Number(result.duplicate ?? 0),
          excludedInvalid: Number(result.excluded_invalid ?? 0),
          failed: Number(result.failed ?? 0),
          errors: result.errors,
        };
      },
      finalizeBatch: async (batchId) => {
        const { data, error } = await supabase.rpc("finalize_finance_import_batch", { p_batch_id: batchId });
        if (error) {
          throw new Error(
            [error.message, error.details, error.hint].filter(Boolean).join(" | ") || "Erro ao finalizar a importação.",
          );
        }
        const result = parseRpcJson(data);
        return { ok: Boolean(result.ok), mismatches: Array.isArray(result.mismatches) ? result.mismatches : [] };
      },
      // Uma única leitura pontual do relatório já recalculado no servidor a
      // partir do que está efetivamente persistido — nunca um fetch-all das
      // transações no cliente.
      fetchReconciliationReport: async (batchId): Promise<FinanceReconciliationReport | null> => {
        const { data, error } = await supabase
          .from("finance_import_batches")
          .select("reconciled, reconciliation_report")
          .eq("id", batchId)
          .maybeSingle();
        if (error || !data?.reconciliation_report) return null;
        const report = data.reconciliation_report as Record<string, unknown>;
        return {
          ok: Boolean(report.ok),
          mismatches: Array.isArray(report.mismatches) ? report.mismatches : [],
          rowsRead: Number(report.rows_read ?? 0),
          persistedReconciled: Number(report.persisted_reconciled ?? 0),
          persistedPending: Number(report.persisted_pending ?? 0),
          duplicate: Number(report.duplicate ?? 0),
          excludedInvalid: Number(report.excluded_invalid ?? 0),
          failed: Number(report.failed ?? 0),
          distinctLegacyRecords: Number(report.distinct_legacy_records ?? 0),
          entriesCount: Number(report.entries_count ?? 0),
          exitsCount: Number(report.exits_count ?? 0),
          entriesAmount: Number(report.entries_amount ?? 0),
          exitsAmount: Number(report.exits_amount ?? 0),
          minDate: (report.min_date as string) ?? null,
          maxDate: (report.max_date as string) ?? null,
        };
      },
    };
  }

  const startImport = async () => {
    if (!mapped.length || !church || !user) return;
    setStep("importing");
    setProgress(0);
    setImportError(null);
    setRunResult(null);

    const payloads = mapped.map(tx => buildFinanceImportPayload(tx, church.id, user.id));
    const baseClient = buildSupabaseImportClient();
    let processedRows = 0;
    const trackingClient: FinanceImportRunnerClient = {
      ...baseClient,
      importChunk: async (rows, batchId) => {
        const result = await baseClient.importChunk(rows, batchId);
        processedRows += rows.length;
        setProgress(Math.round((processedRows / payloads.length) * 100));
        return result;
      },
    };

    try {
      const result = await runFinanceImportBatches(payloads, trackingClient, BATCH_SIZE);
      setRunResult(result);
      if (result.aborted) {
        setImportError(result.abortReason ?? "A importação foi interrompida antes de processar todas as linhas.");
      } else if (result.finalizeOk === false) {
        setImportError(
          "A reconciliação final não confirmou os números do contrato oficial da planilha — a importação NÃO pode ser considerada concluída. Veja os detalhes abaixo.",
        );
      }
      setStep("done");
      const persisted = result.totals.persistedReconciled + result.totals.persistedPending;
      if (persisted > 0) {
        await onImported?.();
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erro inesperado durante a importação.");
      setStep("done");
    }
  };

  if (!open) return null;

  // ── Preview ────────────────────────────────────────────────────────────────
  const headerCells = rawRows[headerRowIndex] ?? [];
  const previewData = rawRows.slice(headerRowIndex + 1, headerRowIndex + 1 + PREVIEW_ROWS);
  const colMap = buildColumnMap(headerCells);
  const recognizedKeys = new Set(colMap.keys());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-serif text-base font-semibold">Importar lançamentos</h2>
              <p className="text-xs text-muted-foreground">
                Selecione a planilha financeira, confira a prévia e importe as linhas válidas.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <X size={16} />
          </button>
        </div>

        {auxError && (
          <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {auxError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* STEP: file */}
          {step === "file" && (
            <div className="p-6 space-y-4">
              <div
                className="border-2 border-dashed border-border/60 rounded-xl p-10 text-center hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
              >
                {loadingFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={28} className="animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Lendo arquivo…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={28} className="text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p>
                      <p className="text-xs text-muted-foreground mt-1">Aceita .xlsm, .xlsx e .csv</p>
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {fileError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP: preview */}
          {step === "preview" && (
            <div className="p-6 space-y-4">
              {/* Aba selector */}
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Aba:</span>
                  <div className="relative">
                    <select
                      value={selectedSheet}
                      onChange={e => handleSheetChange(e.target.value)}
                      className="pl-3 pr-8 py-1.5 rounded-lg border border-input bg-background text-xs appearance-none"
                    >
                      {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="px-3 py-1.5 rounded-lg bg-secondary">
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium">{totalRows.toLocaleString("pt-BR")}</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400">
                  <span>Válidas: </span><span className="font-medium">{mapped.length.toLocaleString("pt-BR")}</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive">
                  <span>Inválidas: </span><span className="font-medium">{(totalRows - mapped.length).toLocaleString("pt-BR")}</span>
                </div>
              </div>

              {/* Colunas reconhecidas */}
              <div className="text-xs text-muted-foreground">
                Colunas reconhecidas: {recognizedKeys.size > 0
                  ? Array.from(recognizedKeys).join(", ")
                  : <span className="text-destructive">nenhuma — verifique o cabeçalho da planilha</span>}
              </div>

              {/* Amostra inválidas */}
              {invalidSample.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
                  <p className="font-medium text-amber-600 dark:text-amber-400">Amostra de linhas inválidas:</p>
                  {invalidSample.map((r, i) => (
                    <p key={i} className="text-muted-foreground">Linha {r.rowIndex}: {r.reason}</p>
                  ))}
                </div>
              )}

              {/* Prévia da tabela */}
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="text-xs w-full">
                  <thead className="bg-secondary/50">
                    <tr>
                      {headerCells.slice(0, 12).map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, ri) => (
                      <tr key={ri} className="border-t border-border/30 hover:bg-secondary/30">
                        {row.slice(0, 12).map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 whitespace-nowrap max-w-[120px] truncate">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {mapped.length === 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>Nenhuma linha válida encontrada. Verifique se a aba correta está selecionada e se o cabeçalho foi detectado.</span>
                </div>
              )}
            </div>
          )}

          {/* STEP: importing */}
          {step === "importing" && (
            <div className="p-8 flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm font-medium">Importando lançamentos…</p>
              <div className="w-full max-w-xs bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{progress}% concluído</p>
            </div>
          )}

          {/* STEP: done — resumo final da reconciliação (nunca declara sucesso
              quando a importação foi abortada ou finalize não reconciliou) */}
          {step === "done" && runResult && (() => {
            const report = runResult.reconciliationReport;
            const fullyReconciled = !runResult.aborted && runResult.finalized && runResult.finalizeOk === true && report?.ok === true;
            const fmtInt = (n: number) => n.toLocaleString("pt-BR");
            const fmtCurrency = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

            return (
              <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center">
                {fullyReconciled ? (
                  <>
                    <CheckCircle2 size={40} className="text-green-500" />
                    <p className="text-base font-semibold">Importação concluída e reconciliada</p>
                  </>
                ) : (
                  <>
                    <AlertCircle size={40} className="text-destructive" />
                    <p className="text-base font-semibold text-destructive">
                      {runResult.aborted ? "Importação interrompida — NÃO concluída" : "Reconciliação final não confirmada"}
                    </p>
                  </>
                )}

                {importError && (
                  <div className="w-full text-left p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                    {importError}
                  </div>
                )}

                {/* Resumo — sempre a partir de números recalculados no servidor
                    quando disponíveis (report), nunca inventados no cliente. */}
                <div className="w-full text-left rounded-xl border border-border/50 divide-y divide-border/50 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4">
                    <span className="text-muted-foreground">Linhas lidas</span>
                    <span className="text-right font-medium tabular-nums">{fmtInt(report?.rowsRead ?? runResult.totalRowsSubmitted)}</span>

                    <span className="text-muted-foreground">Persistidas e reconciliadas</span>
                    <span className="text-right font-medium tabular-nums text-green-600 dark:text-green-400">
                      {fmtInt(report?.persistedReconciled ?? runResult.totals.persistedReconciled)}
                    </span>

                    <span className="text-muted-foreground">Persistidas pendentes</span>
                    <span className={`text-right font-medium tabular-nums ${(report?.persistedPending ?? runResult.totals.persistedPending) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {fmtInt(report?.persistedPending ?? runResult.totals.persistedPending)}
                    </span>

                    <span className="text-muted-foreground">Duplicadas</span>
                    <span className={`text-right font-medium tabular-nums ${(report?.duplicate ?? runResult.totals.duplicate) > 0 ? "text-destructive" : ""}`}>
                      {fmtInt(report?.duplicate ?? runResult.totals.duplicate)}
                    </span>

                    <span className="text-muted-foreground">Inválidas</span>
                    <span className={`text-right font-medium tabular-nums ${(report?.excludedInvalid ?? runResult.totals.excludedInvalid) > 0 ? "text-destructive" : ""}`}>
                      {fmtInt(report?.excludedInvalid ?? runResult.totals.excludedInvalid)}
                    </span>

                    <span className="text-muted-foreground">Falhas</span>
                    <span className={`text-right font-medium tabular-nums ${(report?.failed ?? runResult.totals.failed) > 0 ? "text-destructive" : ""}`}>
                      {fmtInt(report?.failed ?? runResult.totals.failed)}
                    </span>
                  </div>

                  {report && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4">
                      <span className="text-muted-foreground">Entradas</span>
                      <span className="text-right font-medium tabular-nums">{fmtInt(report.entriesCount)} · {fmtCurrency(report.entriesAmount)}</span>

                      <span className="text-muted-foreground">Saídas</span>
                      <span className="text-right font-medium tabular-nums">{fmtInt(report.exitsCount)} · {fmtCurrency(report.exitsAmount)}</span>

                      <span className="text-muted-foreground">Período</span>
                      <span className="text-right font-medium tabular-nums">{fmtDate(report.minDate)} — {fmtDate(report.maxDate)}</span>
                    </div>
                  )}
                </div>

                {!fullyReconciled && report && report.mismatches.length > 0 && (
                  <div className="w-full text-left rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
                    <p className="font-medium text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                      <AlertTriangle size={12} /> Divergências encontradas na reconciliação final:
                    </p>
                    {report.mismatches.map((m, i) => (
                      <p key={i} className="text-muted-foreground font-mono">{JSON.stringify(m)}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50">
          {step === "file" && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-secondary hover:bg-secondary/80 transition-colors">
              Cancelar
            </button>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("file")} className="px-4 py-2 rounded-lg text-sm bg-secondary hover:bg-secondary/80 transition-colors">
                Voltar
              </button>
              <button
                onClick={startImport}
                disabled={mapped.length === 0}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Importar {mapped.length.toLocaleString("pt-BR")} lançamentos
              </button>
            </>
          )}
          {step === "done" && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
