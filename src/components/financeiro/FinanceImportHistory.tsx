/**
 * FinanceImportHistory.tsx — FASE 1D-C2: exclusão segura das importações
 * financeiras.
 *
 * Lista os lotes reais de public.finance_import_batches da organização
 * atual (nunca dados fictícios), oferece "Excluir importação" por lote e a
 * ação administrativa "Zerar dados importados" — ambas via RPC
 * SECURITY DEFINER (delete_finance_import_batch /
 * reset_organization_finance_imports), nunca por exclusão direta de
 * tabela no cliente. Nunca usa window.confirm; nunca declara sucesso antes
 * da resposta da RPC; nunca permite uma segunda exclusão enquanto outra
 * está em andamento.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, History, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import {
  RESET_IMPORTS_CONFIRMATION_PHRASE,
  createSingleFlightGuard,
  failureOutcome,
  isResetImportsPhraseConfirmed,
  mapFinanceImportBatchRow,
  parseFinanceDeletionRpcResult,
  transactionsRemovedByBatch,
  type FinanceDeletionRpcOutcome,
  type FinanceImportBatchSummary,
} from "@/lib/financeImportBatchesAdmin";

const BATCH_COLUMNS =
  "id, created_at, source_file_name, status, reconciled, rows_read, rows_persisted_reconciled, rows_persisted_pending, rows_duplicate, rows_excluded_invalid, rows_failed";

type ResetStep = "hidden" | "explain" | "confirm";

export function FinanceImportHistory({
  churchId,
  canWriteFinance,
  onChanged,
}: {
  churchId: string;
  canWriteFinance: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [batches, setBatches] = useState<FinanceImportBatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [confirmBatch, setConfirmBatch] = useState<FinanceImportBatchSummary | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteGuardRef = useRef(createSingleFlightGuard<string>());

  const [resetStep, setResetStep] = useState<ResetStep>("hidden");
  const [resetPhraseInput, setResetPhraseInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const resetGuardRef = useRef(createSingleFlightGuard<"reset">());

  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true);
    setListError(null);
    const { data, error } = await supabase
      .from("finance_import_batches")
      .select(BATCH_COLUMNS)
      .eq("organization_id", churchId)
      .order("created_at", { ascending: false });
    if (error) {
      setListError(error.message);
      setLoadingBatches(false);
      return;
    }
    setBatches((data ?? []).map(mapFinanceImportBatchRow));
    setLoadingBatches(false);
  }, [churchId]);

  useEffect(() => {
    if (expanded) fetchBatches();
  }, [expanded, fetchBatches]);

  const anyDeletionInProgress = deletingBatchId !== null || resetting;

  // ── Excluir uma importação específica ───────────────────────────────────────

  const confirmDelete = async () => {
    if (!confirmBatch || anyDeletionInProgress) return;
    const batchId = confirmBatch.id;
    setDeleteError(null);
    setDeletingBatchId(batchId);

    const result = await deleteGuardRef.current.run(batchId, async (): Promise<FinanceDeletionRpcOutcome> => {
      const { data, error } = await supabase.rpc("delete_finance_import_batch", { p_batch_id: batchId });
      if (error) {
        return failureOutcome(error.message);
      }
      return parseFinanceDeletionRpcResult(data, t("Erro ao excluir a importação."));
    });

    setDeletingBatchId(null);

    if (!result) return; // clique duplo — segunda chamada nunca disparada
    if (result.ok) {
      setConfirmBatch(null);
      setBatches(current => current.filter(b => b.id !== batchId));
      toast.success(
        t("Importação excluída: {{n}} lançamentos removidos.").replace("{{n}}", String(result.transactionsRemoved)),
      );
      await onChanged();
      await fetchBatches();
      return;
    }

    setDeleteError(result.error);
    toast.error(result.error);
  };

  // ── Zerar todos os dados importados ─────────────────────────────────────────

  const openResetFlow = () => {
    setResetError(null);
    setResetPhraseInput("");
    setResetStep("explain");
  };

  const closeResetFlow = () => {
    if (resetting) return;
    setResetStep("hidden");
    setResetPhraseInput("");
    setResetError(null);
  };

  const confirmReset = async () => {
    if (!isResetImportsPhraseConfirmed(resetPhraseInput) || anyDeletionInProgress) return;
    setResetError(null);
    setResetting(true);

    const result = await resetGuardRef.current.run("reset", async (): Promise<FinanceDeletionRpcOutcome> => {
      const { data, error } = await supabase.rpc("reset_organization_finance_imports", {
        p_organization_id: churchId,
      });
      if (error) {
        return failureOutcome(error.message);
      }
      return parseFinanceDeletionRpcResult(data, t("Erro ao zerar os dados importados."));
    });

    setResetting(false);

    if (!result) return; // clique duplo — segunda chamada nunca disparada
    if (result.ok) {
      setResetStep("hidden");
      setResetPhraseInput("");
      setBatches([]);
      toast.success(
        t("Dados importados zerados: {{n}} lançamentos removidos. Lançamentos manuais e catálogos foram preservados.")
          .replace("{{n}}", String(result.transactionsRemoved)),
      );
      await onChanged();
      await fetchBatches();
      return;
    }

    setResetError(result.error);
    toast.error(result.error);
  };

  return (
    <div className="bg-card rounded-xl shadow-executive">
      <button
        type="button"
        onClick={() => setExpanded(current => !current)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
        aria-expanded={expanded}
      >
        <span className="inline-flex items-center gap-2">
          <History size={15} strokeWidth={1.5} /> {t("Histórico de importações")}
        </span>
        <span className="text-xs text-muted-foreground">{expanded ? t("Ocultar") : t("Mostrar")}</span>
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {loadingBatches ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : listError ? (
            <p className="text-sm text-destructive">{listError}</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhuma importação registrada para esta organização.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("Data")}</th>
                    <th className="px-3 py-2 font-medium">{t("Arquivo")}</th>
                    <th className="px-3 py-2 font-medium">{t("Status")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("Lidas")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("Reconciliadas")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("Pendentes")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("Falhas")}</th>
                    <th className="px-3 py-2 font-medium text-right">{t("Ações")}</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => (
                    <tr key={batch.id} className="border-t border-border/30">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(batch.createdAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 max-w-[220px] truncate">{batch.sourceFileName || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            batch.reconciled
                              ? "bg-success/10 text-success"
                              : batch.status === "error"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-accent/10 text-accent"
                          }`}
                        >
                          {batch.reconciled ? t("Reconciliado") : t(batch.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{batch.rowsRead.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {batch.rowsPersistedReconciled.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {(batch.rowsPersistedPending + batch.rowsDuplicate + batch.rowsExcludedInvalid).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{batch.rowsFailed.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right">
                        {canWriteFinance && (
                          <button
                            type="button"
                            onClick={() => { setDeleteError(null); setConfirmBatch(batch); }}
                            disabled={anyDeletionInProgress}
                            className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40"
                            title={t("Excluir importação")}
                          >
                            <Trash2 size={13} className="text-destructive" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canWriteFinance && (
            <div className="pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={openResetFlow}
                disabled={anyDeletionInProgress}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-40"
              >
                <AlertTriangle size={13} /> {t("Zerar dados importados")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Confirmação de exclusão de UM lote (nunca window.confirm) ────────── */}
      {confirmBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-semibold">{t("Excluir importação")}</h3>
              <button
                onClick={() => { if (!deletingBatchId) setConfirmBatch(null); }}
                className="p-1.5 rounded-lg hover:bg-secondary"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("Esta ação removerá permanentemente")}{" "}
              <span className="font-semibold text-foreground">
                {transactionsRemovedByBatch(confirmBatch).toLocaleString("pt-BR")}
              </span>{" "}
              {t("lançamentos financeiros originados desta importação, além de suas linhas de auditoria e do próprio registro do lote. Lançamentos manuais e catálogos não são afetados. Esta ação não pode ser desfeita.")}
            </p>
            {deleteError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmBatch(null)}
                disabled={deletingBatchId !== null}
                className="px-4 py-2 rounded-lg text-sm bg-secondary hover:bg-secondary/80 disabled:opacity-40"
              >
                {t("Cancelar")}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingBatchId !== null}
                className="px-4 py-2 rounded-lg text-sm bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
              >
                {deletingBatchId !== null && <Loader2 size={14} className="animate-spin" />}
                {t("Confirmar exclusão")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zerar dados importados: confirmação obrigatória em 2 etapas ────────── */}
      {resetStep !== "hidden" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-semibold text-destructive">{t("Zerar dados importados")}</h3>
              <button onClick={closeResetFlow} disabled={resetting} className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            {resetStep === "explain" && (
              <>
                <div className="text-sm space-y-2">
                  <p className="text-muted-foreground">{t("Esta ação removerá permanentemente, apenas desta organização:")}</p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                    <li>{t("todos os lançamentos financeiros originados de importações de planilha")}</li>
                    <li>{t("todas as auditorias e linhas de auditoria dessas importações")}</li>
                    <li>{t("todos os lotes de importação registrados")}</li>
                  </ul>
                  <p className="text-muted-foreground">{t("Serão preservados, sem qualquer alteração:")}</p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                    <li>{t("lançamentos manuais")}</li>
                    <li>{t("catálogos financeiros (contas, períodos, grupos contábeis, categorias, tipos de documento)")}</li>
                    <li>{t("campanhas, orçamento, patrimônio e configurações")}</li>
                    <li>{t("todas as demais organizações")}</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={closeResetFlow} className="px-4 py-2 rounded-lg text-sm bg-secondary hover:bg-secondary/80">
                    {t("Cancelar")}
                  </button>
                  <button
                    onClick={() => setResetStep("confirm")}
                    className="px-4 py-2 rounded-lg text-sm bg-destructive text-destructive-foreground hover:opacity-90"
                  >
                    {t("Continuar")}
                  </button>
                </div>
              </>
            )}

            {resetStep === "confirm" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("Para confirmar, digite exatamente a frase abaixo:")}{" "}
                  <span className="font-mono font-semibold text-foreground">{RESET_IMPORTS_CONFIRMATION_PHRASE}</span>
                </p>
                <input
                  value={resetPhraseInput}
                  onChange={e => setResetPhraseInput(e.target.value)}
                  disabled={resetting}
                  placeholder={RESET_IMPORTS_CONFIRMATION_PHRASE}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-destructive"
                />
                {resetError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{resetError}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeResetFlow}
                    disabled={resetting}
                    className="px-4 py-2 rounded-lg text-sm bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                  >
                    {t("Cancelar")}
                  </button>
                  <button
                    onClick={confirmReset}
                    disabled={resetting || !isResetImportsPhraseConfirmed(resetPhraseInput)}
                    className="px-4 py-2 rounded-lg text-sm bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
                  >
                    {resetting && <Loader2 size={14} className="animate-spin" />}
                    {t("Zerar dados importados")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
