import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Send,
} from "lucide-react";
import type { TreasuryTransaction } from "@/lib/finance";
import { FinanceReports } from "@/components/financeiro/FinanceReports";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery, insertWithOrganizationScope } from "@/lib/organizationScope";
import { toast } from "sonner";
import { useFinanceDashboardAggregates } from "@/hooks/useFinanceDashboardAggregates";
import { dayBefore, monthDateRange } from "@/lib/financeDateRanges";
import { fetchDateRangeForExport, fetchPeriodReceiptsPage, reportPeriodDateRange } from "@/lib/financeMonthlyLedger";

/**
 * CORREÇÃO 2026-07-23 (Fase F — restauração do Financeiro) — os "Relatórios
 * históricos" usavam ACCOUNTABILITY_REPORTS fixo de financeDemo.ts (com
 * aprovadores fictícios "Pr. João Silva"/"Maria Santos"/"Conselho Fiscal").
 * Agora vêm de public.finance_accountability_reports +
 * finance_accountability_approvals (migration
 * 20260723090000_finance_accountability.sql). O status do "Relatório
 * mensal" no topo, que antes era só estado React local (perdido ao
 * navegar), agora também persiste na mesma tabela (period_key = mês
 * selecionado).
 *
 * CORREÇÃO 2026-08-14 (CORREÇÃO C3.1 — eliminar fetch-all) — este
 * componente recebia `transactions: TreasuryTransaction[]` (array completo
 * da organização) via prop. Agora:
 *  - a lista de meses disponíveis vem de finance_dashboard_aggregates
 *    (by_month, histórico completo, agregado);
 *  - o saldo anterior ao mês selecionado vem do mesmo RPC, com
 *    p_date_to = dia anterior ao 1º dia do mês;
 *  - entradas/saídas/contagem do mês selecionado vêm do mesmo RPC
 *    (p_date_from/p_date_to = intervalo do mês) — nunca somadas a partir
 *    de linhas cruas baixadas no navegador;
 *  - os comprovantes de cada relatório histórico só são buscados quando o
 *    relatório é aberto (nunca eagerly para todos os relatórios da lista).
 *
 * CORREÇÃO 2026-08-14 (CORREÇÃO C4 — eliminar limites silenciosos) — a
 * versão da C3.1 buscava o extrato do mês com `.limit(3000)` e os
 * comprovantes com `.limit(1000)`, tratando esses tetos como se fossem "o
 * total" — uma organização com mais dados que isso teria informação
 * truncada SEM aviso. Agora:
 *  - os comprovantes usam paginação real (`fetchPeriodReceiptsPage`, 50 por
 *    página, técnica pageSize+1), carregada só quando a seção é aberta,
 *    com "carregar mais" e aviso explícito quando há mais páginas;
 *  - a exportação CSV do mês busca a quantidade esperada previamente do
 *    RPC agregador, busca o período completo em blocos (`for` limitado por
 *    essa quantidade, nunca `while(true)`), mostra progresso e VALIDA que
 *    o total buscado é exatamente igual ao esperado antes de gerar o
 *    arquivo — qualquer divergência ou falha de bloco cancela a exportação
 *    com erro explícito, nunca um CSV parcial anunciado como completo.
 */

type AccountabilityStatus = "Em preparação" | "Aguardando aprovação" | "Aprovado" | "Publicado";

const STATUS_ORDER: AccountabilityStatus[] = ["Em preparação", "Aguardando aprovação", "Aprovado", "Publicado"];
const STATUS_NEXT_LABEL: Record<AccountabilityStatus, string | null> = {
  "Em preparação": "Marcar como pronto para aprovação",
  "Aguardando aprovação": "Aprovar",
  Aprovado: "Publicar",
  Publicado: null,
};

const STATUS_CLASS: Record<AccountabilityStatus, string> = {
  "Em preparação": "bg-secondary text-muted-foreground",
  "Aguardando aprovação": "bg-amber-500/15 text-amber-700",
  Aprovado: "bg-green-500/15 text-green-700",
  Publicado: "bg-primary/10 text-primary",
};

const DEFAULT_APPROVER_ROLES = ["Pastor responsável", "Tesoureiro", "Conselho/diretoria"];

type ReportRow = {
  id: string;
  period_key: string;
  period_label: string;
  report_type: "Mensal" | "Trimestral" | "Anual";
  status: AccountabilityStatus;
};

type ApprovalRow = {
  id: string;
  report_id: string;
  role: string;
  approver_name: string;
  done: boolean;
  decided_at: string | null;
};

const CURRENCY_LOCALE: Record<string, { locale: string; currency: string }> = {
  pt: { locale: "pt-BR", currency: "BRL" },
  en: { locale: "en-US", currency: "USD" },
  es: { locale: "es-MX", currency: "MXN" },
};

// ---------------------------------------------------------------------------
// Hook — reports + approvals reais por organização
// ---------------------------------------------------------------------------
function useAccountabilityReports(organizationId: string | undefined) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [approvalsByReport, setApprovalsByReport] = useState<Record<string, ApprovalRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!organizationId) { setReports([]); setApprovalsByReport({}); setLoading(false); return; }
      setLoading(true);
      const { data: reportRows, error: reportsError } = await runScopedOrganizationQuery<ReportRow[]>(
        "finance_accountability_reports", organizationId,
        query => query.select("id, period_key, period_label, report_type, status").order("period_key", { ascending: false }),
      );
      if (!active) return;
      if (reportsError) console.error("[FinanceAccountability] reports:", reportsError);
      const loadedReports = reportRows ?? [];
      setReports(loadedReports);

      if (loadedReports.length > 0) {
        const { data: approvalRows, error: approvalsError } = await supabase
          .from("finance_accountability_approvals")
          .select("id, report_id, role, approver_name, done, decided_at")
          .in("report_id", loadedReports.map(r => r.id))
          .order("sort_order");
        if (!active) return;
        if (approvalsError) console.error("[FinanceAccountability] approvals:", approvalsError);
        const grouped: Record<string, ApprovalRow[]> = {};
        (approvalRows ?? []).forEach(a => {
          (grouped[a.report_id] ??= []).push(a);
        });
        setApprovalsByReport(grouped);
      } else {
        setApprovalsByReport({});
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [organizationId, reloadToken]);

  return { reports, approvalsByReport, loading, reload: () => setReloadToken(k => k + 1) };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = { reloadToken?: number };

export function FinanceAccountability({ reloadToken }: Props) {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { hasRole, hasCapability } = useRole();
  const canWriteFinance = hasCapability("finance.write") || hasRole(["super_admin", "church_admin", "tesoureiro"]);
  const canApprove = hasCapability("finance.approve") || hasRole(["super_admin", "church_admin", "tesoureiro"]);

  const fmt = (v: number) => {
    const { locale, currency } = CURRENCY_LOCALE[lang] ?? CURRENCY_LOCALE.pt;
    return v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const { reports, approvalsByReport, loading, reload } = useAccountabilityReports(church?.id);

  const [showReceiptsFor, setShowReceiptsFor] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [advancingMonthly, setAdvancingMonthly] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [newReportForm, setNewReportForm] = useState({ periodKey: "", periodLabel: "", reportType: "Mensal" as ReportRow["report_type"] });
  const [togglingApprovalId, setTogglingApprovalId] = useState<string | null>(null);

  // Lista de meses disponíveis — vem de finance_dashboard_aggregates
  // (by_month, histórico completo agregado), nunca de um array de
  // transações baixado no navegador.
  const monthsAgg = useFinanceDashboardAggregates({ organizationId: church?.id, reloadToken });
  const months = useMemo(() => {
    if (!monthsAgg.data) return [];
    const set = new Set(monthsAgg.data.byMonth.map(b => b.month).filter(Boolean));
    return [...set].sort().reverse();
  }, [monthsAgg.data]);

  const defaultMonth = useMemo(() => {
    if (months.length > 0) return months[0];
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [months]);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  useEffect(() => {
    if (months.length > 0 && !months.includes(selectedMonth)) setSelectedMonth(months[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  // Saldo anterior ao mês selecionado — agregado no servidor
  // (p_date_to = dia anterior ao 1º dia do mês), nunca somando o array
  // completo no navegador.
  const monthRange = useMemo(() => monthDateRange(selectedMonth), [selectedMonth]);
  const priorAgg = useFinanceDashboardAggregates({
    organizationId: church?.id, dateTo: dayBefore(monthRange.from), reloadToken,
  });
  const saldoAnterior = (priorAgg.data?.totals.entriesAmount ?? 0) - (priorAgg.data?.totals.exitsAmount ?? 0);

  // Entradas/saídas/contagem do mês selecionado — CORREÇÃO C4: antes vinha
  // de um extrato bruto limitado a 3000 linhas (`fetchMonthLedger`), que
  // truncava silenciosamente organizações com mais lançamentos que isso.
  // Agora vem do mesmo RPC agregador (p_date_from/p_date_to = intervalo do
  // mês) — a contagem é sempre exata, nunca capada.
  const monthAgg = useFinanceDashboardAggregates({
    organizationId: church?.id, dateFrom: monthRange.from, dateTo: monthRange.to, reloadToken,
  });
  const periodLoading = monthAgg.status === "loading" || monthAgg.status === "idle"
    || priorAgg.status === "loading" || priorAgg.status === "idle";
  const periodData = useMemo(() => {
    const entradas = monthAgg.data?.totals.entriesAmount ?? 0;
    const saidas = monthAgg.data?.totals.exitsAmount ?? 0;
    const txCount = (monthAgg.data?.totals.entriesCount ?? 0) + (monthAgg.data?.totals.exitsCount ?? 0);
    const saldoFinal = saldoAnterior + entradas - saidas;
    const resultado = entradas - saidas;
    return { entradas, saidas, saldoFinal, resultado, txCount };
  }, [monthAgg.data, saldoAnterior]);

  // Comprovantes do mês selecionado — CORREÇÃO C4: antes vinha de
  // `fetchPeriodReceipts(...).limit(1000)`, assumindo que 1000 era o
  // total. Agora é paginação real (50/página, técnica pageSize+1),
  // carregada só quando a seção é aberta, com "carregar mais".
  const [receiptsPage, setReceiptsPage] = useState(1);
  const [receiptsRows, setReceiptsRows] = useState<TreasuryTransaction[]>([]);
  const [receiptsHasNextPage, setReceiptsHasNextPage] = useState(false);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (showReceiptsFor !== selectedMonth || !church?.id) return;
    setReceiptsLoading(true);
    fetchPeriodReceiptsPage(church.id, monthRange.from, monthRange.to, receiptsPage).then(({ rows, hasNextPage, error }) => {
      if (!active) return;
      if (error) { setReceiptsError(error); setReceiptsRows([]); setReceiptsHasNextPage(false); }
      else { setReceiptsError(null); setReceiptsRows(rows); setReceiptsHasNextPage(hasNextPage); }
      setReceiptsLoading(false);
    });
    return () => { active = false; };
  }, [showReceiptsFor, selectedMonth, church?.id, monthRange.from, monthRange.to, receiptsPage, reloadToken]);

  // Reseta para a página 1 sempre que o mês muda ou a seção é reaberta.
  useEffect(() => { setReceiptsPage(1); }, [showReceiptsFor, selectedMonth]);

  // Exportação CSV do mês — CORREÇÃO C4: busca a quantidade EXATA esperada
  // do RPC agregador, depois busca o período completo em blocos (`for`
  // limitado por essa quantidade, nunca `while(true)`), valida ao final e
  // só então gera o CSV. Qualquer divergência/falha lança erro — o
  // chamador (useDocExport) nunca mostra "Exportado!" nesse caso.
  const [exportProgress, setExportProgress] = useState<{ fetched: number; total: number } | null>(null);
  const exportPrestacaoCSV = async (): Promise<string> => {
    if (!church) throw new Error(t("Organização não disponível."));
    const expectedTotal = periodData.txCount;
    setExportProgress({ fetched: 0, total: expectedTotal });
    try {
      const { rows, ok, error } = await fetchDateRangeForExport(
        church.id, monthRange.from, monthRange.to, expectedTotal,
        (fetched, total) => setExportProgress({ fetched, total }),
      );
      if (!ok) throw new Error(error || t("Não foi possível exportar o período completo."));
      let csv = `"Prestação de Contas — ${formatMonth(selectedMonth)}"\n\n`;
      csv += `"Saldo anterior",${saldoAnterior}\n`;
      csv += `"Entradas",${periodData.entradas}\n`;
      csv += `"Saídas",${periodData.saidas}\n`;
      csv += `"Saldo final",${periodData.saldoFinal}\n\n`;
      csv += "Data,Descrição,Tipo,Categoria,Valor,Status,Comprovante\n";
      rows.forEach(tx => {
        csv += `${tx.date},"${tx.description}",${tx.type},"${tx.category || ""}",${tx.amount},${tx.status},"${tx.receipt_url || ""}"\n`;
      });
      return csv;
    } finally {
      setExportProgress(null);
    }
  };

  // Comprovantes de um relatório histórico — buscados somente quando o
  // relatório é aberto (selectedReportId), nunca eagerly para todos os
  // relatórios da lista. CORREÇÃO C4: paginação real em vez de
  // `.limit(1000)`.
  const [selectedReportReceiptsPage, setSelectedReportReceiptsPage] = useState(1);
  const [selectedReportReceipts, setSelectedReportReceipts] = useState<TreasuryTransaction[]>([]);
  const [selectedReportReceiptsHasNextPage, setSelectedReportReceiptsHasNextPage] = useState(false);
  const [selectedReportReceiptsLoading, setSelectedReportReceiptsLoading] = useState(false);
  const [selectedReportReceiptsError, setSelectedReportReceiptsError] = useState<string | null>(null);
  useEffect(() => { setSelectedReportReceiptsPage(1); }, [selectedReportId]);
  useEffect(() => {
    let active = true;
    const report = reports.find(r => r.id === selectedReportId) ?? null;
    if (!church?.id || !report) { setSelectedReportReceipts([]); setSelectedReportReceiptsHasNextPage(false); return; }
    const range = reportPeriodDateRange(report.period_key, report.report_type);
    if (!range) { setSelectedReportReceipts([]); setSelectedReportReceiptsHasNextPage(false); return; }
    setSelectedReportReceiptsLoading(true);
    fetchPeriodReceiptsPage(church.id, range.from, range.to, selectedReportReceiptsPage).then(({ rows, hasNextPage, error }) => {
      if (!active) return;
      if (error) { setSelectedReportReceiptsError(error); setSelectedReportReceipts([]); setSelectedReportReceiptsHasNextPage(false); }
      else { setSelectedReportReceiptsError(null); setSelectedReportReceipts(rows); setSelectedReportReceiptsHasNextPage(hasNextPage); }
      setSelectedReportReceiptsLoading(false);
    });
    return () => { active = false; };
  }, [church?.id, selectedReportId, selectedReportReceiptsPage, reports]);

  // Helpers
  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const date = new Date(parseInt(y), parseInt(mo) - 1, 1);
    const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
    const name = date.toLocaleDateString(locale, { month: "long" });
    return `${name.charAt(0).toUpperCase() + name.slice(1)}/${y}`;
  };

  const monthlyReport = reports.find(r => r.period_key === selectedMonth && r.report_type === "Mensal") ?? null;
  const monthlyStatus: AccountabilityStatus = monthlyReport?.status ?? "Em preparação";
  const monthlyNextLabel = STATUS_NEXT_LABEL[monthlyStatus];

  const advanceMonthlyStatus = async () => {
    if (!church) return;
    const currentIndex = STATUS_ORDER.indexOf(monthlyStatus);
    const nextStatus = STATUS_ORDER[currentIndex + 1];
    if (!nextStatus) return;
    setAdvancingMonthly(true);
    if (monthlyReport) {
      const { error } = await supabase.from("finance_accountability_reports")
        .update({ status: nextStatus }).eq("id", monthlyReport.id);
      if (error) console.error("[FinanceAccountability] advanceMonthlyStatus (update):", error);
    } else {
      const { error } = await insertWithOrganizationScope("finance_accountability_reports", church.id, {
        period_key: selectedMonth,
        period_label: formatMonth(selectedMonth),
        report_type: "Mensal",
        status: nextStatus,
      });
      if (error) console.error("[FinanceAccountability] advanceMonthlyStatus (insert):", error);
    }
    setAdvancingMonthly(false);
    reload();
  };

  const selectedReport = reports.find(r => r.id === selectedReportId) ?? null;
  const selectedApprovals = selectedReportId ? (approvalsByReport[selectedReportId] ?? []) : [];

  const createReport = async () => {
    if (!church || !newReportForm.periodKey.trim() || !newReportForm.periodLabel.trim()) return;
    setSavingReport(true);
    const { data, error } = await insertWithOrganizationScope<{ id: string }[]>("finance_accountability_reports", church.id, {
      period_key: newReportForm.periodKey.trim(),
      period_label: newReportForm.periodLabel.trim(),
      report_type: newReportForm.reportType,
      status: "Em preparação",
    }, query => query.select("id"));
    if (error || !data?.[0]) {
      console.error("[FinanceAccountability] createReport:", error);
      toast.error(t("Não foi possível criar o relatório (talvez já exista um para esse período)."));
      setSavingReport(false);
      return;
    }
    const reportId = data[0].id;
    const { error: approvalsError } = await supabase.from("finance_accountability_approvals").insert(
      DEFAULT_APPROVER_ROLES.map((role, index) => ({
        report_id: reportId,
        role,
        approver_name: "",
        done: false,
        sort_order: index,
      })),
    );
    if (approvalsError) console.error("[FinanceAccountability] createReport approvals:", approvalsError);
    setSavingReport(false);
    toast.success(t("Relatório criado!"));
    setNewReportForm({ periodKey: "", periodLabel: "", reportType: "Mensal" });
    setShowNewReport(false);
    reload();
  };

  const toggleApproval = async (approval: ApprovalRow) => {
    setTogglingApprovalId(approval.id);
    const nextDone = !approval.done;
    const { error } = await supabase.from("finance_accountability_approvals").update({
      done: nextDone,
      decided_at: nextDone ? new Date().toISOString() : null,
    }).eq("id", approval.id);
    setTogglingApprovalId(null);
    if (error) {
      console.error("[FinanceAccountability] toggleApproval:", error);
      toast.error(t("Não foi possível atualizar o aprovador."));
      return;
    }
    reload();
  };

  const advanceReportStatus = async (report: ReportRow) => {
    const currentIndex = STATUS_ORDER.indexOf(report.status);
    const nextStatus = STATUS_ORDER[currentIndex + 1];
    if (!nextStatus) return;
    const { error } = await supabase.from("finance_accountability_reports").update({ status: nextStatus }).eq("id", report.id);
    if (error) {
      console.error("[FinanceAccountability] advanceReportStatus:", error);
      toast.error(t("Não foi possível atualizar o status."));
      return;
    }
    reload();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ── Relatório do período ─────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            <h3 className="font-serif text-lg font-semibold">{t("Relatório mensal")}</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Month selector */}
            {months.length > 0 ? (
              <select
                value={selectedMonth}
                onChange={e => {
                  setSelectedMonth(e.target.value);
                  setShowReceiptsFor(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {months.map(m => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-muted-foreground">{t("Nenhum período disponível")}</span>
            )}

            {/* Status badge */}
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${STATUS_CLASS[monthlyStatus]}`}>
              {t(monthlyStatus)}
            </span>

            {/* Export */}
            <DocExportMenu
              align="end"
              items={buildFinanceExportItems({
                moduleTitle: `${t("Prestação de Contas")} — ${formatMonth(selectedMonth)}`,
                summary: `Entradas: ${fmt(periodData.entradas)} | Saídas: ${fmt(periodData.saidas)} | Resultado: ${fmt(periodData.resultado)}`,
                csvFn: exportPrestacaoCSV,
                csvFilename: `prestacao_${selectedMonth}.csv`,
              })}
            />
          </div>
        </div>

        {exportProgress && (
          <p className="px-5 pt-2 text-[11px] text-muted-foreground">
            {t("Exportando")}… {exportProgress.fetched}/{exportProgress.total}
          </p>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
          {[
            { label: t("Saldo inicial"), value: saldoAnterior, cls: "" },
            { label: t("Entradas"), value: periodData.entradas, cls: "text-success" },
            { label: t("Saídas"), value: periodData.saidas, cls: "text-destructive" },
            {
              label: t("Resultado do período"),
              value: periodData.resultado,
              cls: periodData.resultado >= 0 ? "text-success" : "text-destructive",
            },
            {
              label: t("Saldo final"),
              value: periodData.saldoFinal,
              cls: periodData.saldoFinal >= 0 ? "text-success" : "text-destructive",
            },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-lg bg-secondary/30">
              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">{item.label}</p>
              <p className={`text-base font-bold tabular-nums mt-0.5 ${item.cls}`}>{fmt(item.value)}</p>
            </div>
          ))}
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
          <p className="text-xs text-muted-foreground flex-1">
            {periodLoading ? (
              <Loader2 size={13} className="animate-spin inline" />
            ) : (
              <>{periodData.txCount} {t("lançamentos no período")}</>
            )}
          </p>

          {/* Receipts toggle */}
          <button
            type="button"
            onClick={() => setShowReceiptsFor(v => v === selectedMonth ? null : selectedMonth)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            <Receipt size={13} />
            {showReceiptsFor === selectedMonth ? t("Ocultar comprovantes") : t("Ver comprovantes")}
            {showReceiptsFor === selectedMonth ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {/* Status advance */}
          {canWriteFinance && monthlyNextLabel && (
            <button
              type="button"
              onClick={advanceMonthlyStatus}
              disabled={advancingMonthly}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {advancingMonthly ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {t(monthlyNextLabel)}
            </button>
          )}
        </div>

        {/* Receipts accordion — paginado (50/página), carregado só ao abrir */}
        {showReceiptsFor === selectedMonth && (
          <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {t("Comprovantes do período")} — {formatMonth(selectedMonth)}
            </p>
            {receiptsError ? (
              <p className="text-sm text-destructive">{receiptsError}</p>
            ) : receiptsLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : receiptsRows.length === 0 && receiptsPage === 1 ? (
              <p className="text-sm text-muted-foreground">{t("Nenhum comprovante neste período")}</p>
            ) : (
              <>
                <div className="space-y-2">
                  {receiptsRows.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date} · {tx.category}</p>
                      </div>
                      <a
                        href={tx.receipt_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
                      >
                        <ExternalLink size={12} /> {t("Ver")}
                      </a>
                    </div>
                  ))}
                </div>
                {(receiptsPage > 1 || receiptsHasNextPage) && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setReceiptsPage(p => Math.max(1, p - 1))}
                      disabled={receiptsPage === 1 || receiptsLoading}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                    >
                      {t("Anterior")}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {t("Página")} {receiptsPage}{receiptsHasNextPage ? ` · ${t("há mais comprovantes")}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReceiptsPage(p => p + 1)}
                      disabled={!receiptsHasNextPage || receiptsLoading}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                    >
                      {t("Próximo")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Relatórios históricos (reais) ─────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <FileText size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold flex-1">{t("Relatórios históricos")}</h3>
          {canWriteFinance && (
            <button
              type="button"
              onClick={() => setShowNewReport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary/30 transition-colors"
            >
              <Plus size={13} /> {t("Novo relatório")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
          </div>
        ) : reports.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t("Nenhum relatório de prestação de contas cadastrado ainda.")}
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {reports.map(report => {
              const approvals = approvalsByReport[report.id] ?? [];
              return (
                <div
                  key={report.id}
                  className="p-5 hover:bg-secondary/10 transition-colors cursor-pointer group"
                  onClick={() => setSelectedReportId(report.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{t(report.report_type)}</p>
                      <h4 className="font-semibold text-base group-hover:text-primary transition-colors">{report.period_label}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("Ver comprovantes ao abrir")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${STATUS_CLASS[report.status]}`}>
                        {t(report.status)}
                      </span>
                      <DocExportMenu
                        align="end"
                        items={buildFinanceExportItems({
                          moduleTitle: `${t("Prestação de Contas")} — ${report.period_label}`,
                          summary: `Status: ${report.status}`,
                          csvFilename: `prestacao_${report.period_label.replace(/\s+/g, "_")}.csv`,
                        })}
                      />
                    </div>
                  </div>

                  {/* Approvers */}
                  {approvals.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {t("Aprovadores")}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {approvals.map(a => (
                          <div key={a.id} className="flex items-center gap-1.5 text-sm">
                            {a.done ? (
                              <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                            ) : (
                              <Circle size={14} className="text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="text-muted-foreground text-xs">{t(a.role)}:</span>
                            <span className="text-xs font-medium">{a.approver_name || t("Não definido")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Relatórios contábeis (dados reais) ──────────────────────── */}
      <section className="bg-card rounded-xl shadow-sm border border-border/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold">{t("Relatórios Contábeis")}</h3>
        </div>
        <FinanceReports reloadToken={reloadToken} />
      </section>

      {/* ── Historical report detail modal ──────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedReport}
        onClose={() => setSelectedReportId(null)}
        title={selectedReport?.period_label ?? ""}
        subtitle={selectedReport ? t(selectedReport.report_type) : undefined}
        maxWidth="sm"
      >
        {selectedReport && (() => {
          const receipts = selectedReportReceipts;
          const nextLabel = STATUS_NEXT_LABEL[selectedReport.status];
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${STATUS_CLASS[selectedReport.status]}`}>
                  {t(selectedReport.status)}
                </span>
                <p className="text-sm text-muted-foreground">
                  {selectedReportReceiptsLoading ? (
                    <Loader2 size={14} className="animate-spin inline" />
                  ) : selectedReportReceiptsError ? (
                    <span className="text-destructive">{selectedReportReceiptsError}</span>
                  ) : (
                    <>
                      {receipts.length} {t("comprovantes")}{selectedReportReceiptsPage > 1 ? ` (${t("página")} ${selectedReportReceiptsPage})` : ""}
                      {selectedReportReceiptsHasNextPage && ` · ${t("há mais")}`}
                    </>
                  )}
                </p>
              </div>
              {(selectedReportReceiptsPage > 1 || selectedReportReceiptsHasNextPage) && (
                <div className="flex items-center justify-between -mt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReportReceiptsPage(p => Math.max(1, p - 1))}
                    disabled={selectedReportReceiptsPage === 1 || selectedReportReceiptsLoading}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                  >
                    {t("Anterior")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReportReceiptsPage(p => p + 1)}
                    disabled={!selectedReportReceiptsHasNextPage || selectedReportReceiptsLoading}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                  >
                    {t("Próximo")}
                  </button>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t("Aprovadores")}
                </p>
                <div className="space-y-2">
                  {selectedApprovals.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 text-sm">
                      <button
                        type="button"
                        disabled={!canApprove || togglingApprovalId === a.id}
                        onClick={() => toggleApproval(a)}
                        className="flex items-center gap-2 disabled:cursor-default"
                      >
                        {togglingApprovalId === a.id ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : a.done ? (
                          <CheckCircle2 size={14} className="text-green-600" />
                        ) : (
                          <Circle size={14} className="text-muted-foreground" />
                        )}
                        <span className="font-medium">{a.approver_name || t("Não definido")}</span>
                      </button>
                      <span className="text-xs text-muted-foreground">{t(a.role)}</span>
                    </div>
                  ))}
                  {selectedApprovals.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("Nenhum aprovador cadastrado")}</p>
                  )}
                </div>
              </div>

              {canWriteFinance && nextLabel && (
                <button
                  type="button"
                  onClick={() => advanceReportStatus(selectedReport)}
                  className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {t(nextLabel)}
                </button>
              )}

              <DocExportMenu
                align="start"
                items={buildFinanceExportItems({
                  moduleTitle: `${t("Prestação de Contas")} — ${selectedReport.period_label}`,
                  summary: `${receipts.length} comprovantes | Status: ${selectedReport.status}`,
                })}
              />
            </div>
          );
        })()}
      </FinanceDetailModal>

      {/* ── New report modal ────────────────────────────────────────── */}
      <FinanceDetailModal
        open={showNewReport}
        onClose={() => setShowNewReport(false)}
        title={t("Novo relatório de prestação de contas")}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Tipo")}</label>
            <select
              value={newReportForm.reportType}
              onChange={e => setNewReportForm(f => ({ ...f, reportType: e.target.value as ReportRow["report_type"] }))}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="Mensal">{t("Mensal")}</option>
              <option value="Trimestral">{t("Trimestral")}</option>
              <option value="Anual">{t("Anual")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Identificador do período")}
            </label>
            <input
              type="text"
              value={newReportForm.periodKey}
              onChange={e => setNewReportForm(f => ({ ...f, periodKey: e.target.value }))}
              placeholder={newReportForm.reportType === "Mensal" ? "2026-05" : newReportForm.reportType === "Trimestral" ? "2026-Q1" : "2026"}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Nome de exibição")}</label>
            <input
              type="text"
              value={newReportForm.periodLabel}
              onChange={e => setNewReportForm(f => ({ ...f, periodLabel: e.target.value }))}
              placeholder={t("Ex.: Maio/2026, 1º Trimestre/2026, 2026...")}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Os aprovadores padrão (Pastor responsável, Tesoureiro, Conselho/diretoria) serão criados automaticamente — edite os nomes no detalhe do relatório.")}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewReport(false)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary/30 transition-colors"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              onClick={createReport}
              disabled={!newReportForm.periodKey.trim() || !newReportForm.periodLabel.trim() || savingReport}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingReport && <Loader2 size={14} className="animate-spin" />} {t("Criar")}
            </button>
          </div>
        </div>
      </FinanceDetailModal>
    </div>
  );
}
