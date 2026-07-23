/**
 * SpreadsheetImportModal.tsx
 * Importa planilhas CONFIADCS (.xlsm/.xlsx/.csv) usando RPC do Supabase.
 * Nunca usa supabase.from("transactions").insert().
 * Nunca exibe dados falsos/mock/demo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import { readSpreadsheet, readSheetByName } from "@/lib/importers/spreadsheetReader";
import { mapConfiadcsRows, type AuxLookup, type MappedTransaction } from "@/lib/importers/financeConfiadcsMapper";
import { buildColumnMap } from "@/lib/importers/headerNormalizer";

const BATCH_SIZE = 200;
const PREVIEW_ROWS = 20;

type Step = "file" | "preview" | "importing" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}

// ── Payload que a RPC recebe ──────────────────────────────────────────────────

function buildTxPayload(
  tx: MappedTransaction,
  organizationId: string,
  userId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    organization_id: organizationId,
    user_id: userId,
    created_by: userId,
    date: tx.date,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    description: tx.description,
    status: tx.status,
    source_module: "confiadcs_import",
    notes: tx.notes ?? null,
    account_category_id: tx.account_category_id ?? null,
    financial_account_id: tx.financial_account_id ?? null,
    // Campos ricos do CONFIADCS — antes eram calculados pelo mapper e
    // descartados aqui, perdendo grupo contábil, congregação/distrito de
    // origem, tipo de documento, beneficiário/contribuinte, coletor e
    // tesoureiro de cada lançamento importado.
    accounting_group_id: tx.accounting_group_id ?? null,
    document_type_id: tx.document_type_id ?? null,
    document_number: tx.document_number ?? null,
    congregation_id: tx.congregation_id ?? null,
    district_id: tx.district_id ?? null,
    supplier_beneficiary_name: tx.supplier_beneficiary_name ?? null,
    supplier_beneficiary_document: tx.supplier_beneficiary_document ?? null,
    contributor_name: tx.contributor_name ?? null,
    contributor_document: tx.contributor_document ?? null,
    collector_name: tx.collector_name ?? null,
    treasurer_name: tx.treasurer_name ?? null,
    period_label: tx.period_label ?? null,
    legacy_record_number: tx.legacy_record_number ?? null,
    issue_date: tx.issue_date ?? null,
    origin: tx.origin ?? "confiadcs",
  };
  // Remove campos undefined
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
}

// ── Aux data ─────────────────────────────────────────────────────────────────

async function loadAuxData(orgId: string): Promise<AuxLookup> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = async (fn: () => Promise<{ data: any[] | null }>): Promise<any[]> => {
    try { const r = await fn(); return r.data ?? []; } catch { return []; }
  };

  const [accountingGroups, accountCategories, documentTypes, financialAccounts, orgs] =
    await Promise.all([
      safe(() => supabase.from("finance_accounting_groups" as never).select("id, name, code").eq("organization_id", orgId) as never),
      safe(() => supabase.from("finance_account_categories" as never).select("id, name, code").eq("organization_id", orgId) as never),
      safe(() => supabase.from("finance_document_types" as never).select("id, name, code").eq("organization_id", orgId) as never),
      safe(() => supabase.from("finance_accounts" as never).select("id, name").eq("organization_id", orgId) as never),
      safe(() => supabase.from("organizations").select("id, name, organization_type").eq("active", true) as never),
    ]);

  const orgsArr = orgs as { id: string; name: string; organization_type: string | null }[];
  // "subsede" funciona como congregação/sub-distrito na hierarquia real da AD
  // (ex.: "Subsede Distrital Ana Rech") e precisa ser resolvível nos dois
  // sentidos; "matriz" cobre lançamentos lançados como "SEDE"/"MATRIZ"/"TODAS".
  const congregations = orgsArr.filter(
    o => o.organization_type === "congregacao" || o.organization_type === "congregação" || o.organization_type === "subsede",
  );
  const districts = orgsArr.filter(
    o =>
      o.organization_type === "setor" ||
      o.organization_type === "distrito" ||
      o.organization_type === "subsede" ||
      o.organization_type === "matriz",
  );

  return {
    accountingGroups: accountingGroups as AuxLookup["accountingGroups"],
    accountCategories: accountCategories as AuxLookup["accountCategories"],
    documentTypes: documentTypes as AuxLookup["documentTypes"],
    financialAccounts: financialAccounts as AuxLookup["financialAccounts"],
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
  const [doneResult, setDoneResult] = useState<{ success: number; failed: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [auxData, setAuxData] = useState<AuxLookup | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (open && church && !auxData) {
      loadAuxData(church.id).then(setAuxData).catch(console.error);
    }
  }, [open, church, auxData]);

  useEffect(() => {
    if (!open) {
      setStep("file"); setFile(null); setSheetNames([]); setSelectedSheet("");
      setRawRows([]); setHeaderRowIndex(0); setMapped([]); setInvalidSample([]);
      setTotalRows(0); setProgress(0); setDoneResult(null);
      setFileError(null); setImportError(null); setLoadingFile(false);
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

  const startImport = async () => {
    if (!mapped.length || !church || !user) return;
    setStep("importing");
    setProgress(0);
    setImportError(null);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const chunk = mapped.slice(i, i + BATCH_SIZE);
      const toInsert = chunk.map(tx => buildTxPayload(tx, church.id, user.id));

      if (i === 0 && import.meta.env.DEV) {
        console.log("[SpreadsheetImport] Lote 1 payload:", toInsert[0]);
      }

      const { data, error } = await supabase.rpc(
        "import_finance_transactions_bulk" as never,
        { p_rows: toInsert } as never
      );

      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || "Erro na RPC.";
        console.error("[SpreadsheetImport] Erro RPC:", error);
        setImportError(msg);
        failed += mapped.length - success;
        break;
      }

      const result = (typeof data === "string" ? JSON.parse(data) : (data ?? {})) as {
        inserted?: number;
        error?: string;
      };

      if (result.error) {
        console.error("[SpreadsheetImport] Erro retornado pela RPC:", result.error);
        setImportError(result.error);
        failed += mapped.length - success;
        break;
      }

      const inserted = Number(result?.inserted ?? 0);

      if (import.meta.env.DEV) {
        console.log(`[SpreadsheetImport] Lote ${Math.floor(i / BATCH_SIZE) + 1}: enviado=${toInsert.length} confirmado=${inserted}`);
      }

      if (inserted !== toInsert.length) {
        const msg = `O banco confirmou apenas ${inserted} de ${toInsert.length} lançamentos neste lote.`;
        console.warn("[SpreadsheetImport]", msg);
        setImportError(msg);
        success += inserted;
        failed += toInsert.length - inserted;
        break;
      }

      success += inserted;
      setProgress(Math.round(((i + chunk.length) / mapped.length) * 100));
    }

    setDoneResult({ success, failed: failed + (mapped.length - success - (failed > 0 ? 0 : 0)) });
    setStep("done");
    if (success > 0) {
      await onImported?.();
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

          {/* STEP: done */}
          {step === "done" && doneResult && (
            <div className="p-8 flex flex-col items-center gap-4 text-center">
              {importError ? (
                <>
                  <AlertCircle size={40} className="text-destructive" />
                  <p className="text-base font-semibold text-destructive">Erro na importação</p>
                  <div className="w-full text-left p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                    {importError}
                  </div>
                  {doneResult.success > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {doneResult.success.toLocaleString("pt-BR")} lançamento(s) foram salvos antes do erro.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle2 size={40} className="text-green-500" />
                  <p className="text-base font-semibold">Importação concluída</p>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {doneResult.success.toLocaleString("pt-BR")} importados
                    </span>
                    {doneResult.failed > 0 && (
                      <span className="text-destructive">{doneResult.failed.toLocaleString("pt-BR")} com erro</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
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
