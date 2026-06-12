import { useState, useMemo } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { ACCOUNTABILITY_REPORTS, type AccountabilityStatus } from "@/lib/financeDemo";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Receipt,
  Send,
} from "lucide-react";
import type { TreasuryTransaction } from "@/lib/finance";
import { isExpense, getTransactionMonth } from "@/lib/finance";
import { FinanceReports } from "@/components/financeiro/FinanceReports";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LocalStatus = "rascunho" | "pronto" | "publicado";

const LOCAL_STATUS_CONFIG: Record<LocalStatus, { label: string; color: string; nextLabel?: string }> = {
  rascunho: {
    label: "Rascunho",
    color: "bg-secondary text-muted-foreground",
    nextLabel: "Marcar como pronto",
  },
  pronto: {
    label: "Pronto para aprovação",
    color: "bg-amber-500/15 text-amber-700",
    nextLabel: "Publicar",
  },
  publicado: {
    label: "Publicado",
    color: "bg-green-500/15 text-green-700",
  },
};

const DEMO_STATUS_CLASS: Record<AccountabilityStatus, string> = {
  "Em preparação": "bg-secondary text-muted-foreground",
  "Aguardando aprovação": "bg-amber-500/15 text-amber-700",
  Aprovado: "bg-green-500/15 text-green-700",
  Publicado: "bg-primary/10 text-primary",
};

const CURRENCY_LOCALE: Record<string, { locale: string; currency: string }> = {
  pt: { locale: "pt-BR", currency: "BRL" },
  en: { locale: "en-US", currency: "USD" },
  es: { locale: "es-MX", currency: "MXN" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = { transactions: TreasuryTransaction[] };

export function FinanceAccountability({ transactions }: Props) {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => {
    const { locale, currency } = CURRENCY_LOCALE[lang] ?? CURRENCY_LOCALE.pt;
    return v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Local state — resets on navigation (acceptable for demo)
  const [statuses, setStatuses] = useState<Record<string, LocalStatus>>({});
  const [showReceiptsFor, setShowReceiptsFor] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<typeof ACCOUNTABILITY_REPORTS[number] | null>(null);

  // Month list from real transactions
  const months = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => { if (tx.date) set.add(getTransactionMonth(tx.date)); });
    return [...set].sort().reverse();
  }, [transactions]);

  const defaultMonth = useMemo(() => {
    if (months.length > 0) return months[0];
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [months]);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  // Period-specific derived data
  const periodData = useMemo(() => {
    const txs = transactions.filter(tx => tx.date?.startsWith(selectedMonth));
    const prevTxs = transactions.filter(tx => tx.date && tx.date < selectedMonth + "-01");
    const saldoAnterior = prevTxs.reduce(
      (s, tx) => s + Number(tx.amount) * (isExpense(tx.type) ? -1 : 1),
      0,
    );
    const entradas = txs.filter(tx => !isExpense(tx.type)).reduce((s, tx) => s + Number(tx.amount), 0);
    const saidas = txs.filter(tx => isExpense(tx.type)).reduce((s, tx) => s + Number(tx.amount), 0);
    const saldoFinal = saldoAnterior + entradas - saidas;
    const resultado = entradas - saidas;
    const receipts = txs.filter(tx => tx.receipt_url);
    return { txs, saldoAnterior, entradas, saidas, saldoFinal, resultado, receipts };
  }, [transactions, selectedMonth]);

  // Helpers
  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const date = new Date(parseInt(y), parseInt(mo) - 1, 1);
    const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
    const name = date.toLocaleDateString(locale, { month: "long" });
    return `${name.charAt(0).toUpperCase() + name.slice(1)}/${y}`;
  };

  const getStatus = (month: string): LocalStatus => statuses[month] ?? "rascunho";

  const advanceStatus = (month: string) => {
    const cur = getStatus(month);
    if (cur === "publicado") return;
    setStatuses(prev => ({ ...prev, [month]: cur === "rascunho" ? "pronto" : "publicado" }));
  };

  const buildPrestacaoCSV = () => {
    const { txs, saldoAnterior, entradas, saidas, saldoFinal } = periodData;
    let csv = `"Prestação de Contas — ${formatMonth(selectedMonth)}"\n\n`;
    csv += `"Saldo anterior",${saldoAnterior}\n`;
    csv += `"Entradas",${entradas}\n`;
    csv += `"Saídas",${saidas}\n`;
    csv += `"Saldo final",${saldoFinal}\n\n`;
    csv += "Data,Descrição,Tipo,Categoria,Valor,Status,Comprovante\n";
    txs.forEach(tx => {
      csv += `${tx.date},"${tx.description}",${tx.type},"${tx.category || ""}",${tx.amount},${tx.status},"${tx.receipt_url || ""}"\n`;
    });
    return csv;
  };

  const status = getStatus(selectedMonth);
  const statusCfg = LOCAL_STATUS_CONFIG[status];

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
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${statusCfg.color}`}>
              {t(statusCfg.label)}
            </span>

            {/* Export */}
            <DocExportMenu
              align="end"
              items={buildFinanceExportItems({
                moduleTitle: `${t("Prestação de Contas")} — ${formatMonth(selectedMonth)}`,
                summary: `Entradas: ${fmt(periodData.entradas)} | Saídas: ${fmt(periodData.saidas)} | Resultado: ${fmt(periodData.resultado)}`,
                csvFn: buildPrestacaoCSV,
                csvFilename: `prestacao_${selectedMonth}.csv`,
              })}
            />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
          {[
            { label: t("Saldo inicial"), value: periodData.saldoAnterior, cls: "" },
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
            {periodData.txs.length} {t("lançamentos no período")}
            {periodData.receipts.length > 0 && (
              <> · {periodData.receipts.length} {t("comprovantes")}</>
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
          {status !== "publicado" && statusCfg.nextLabel && (
            <button
              type="button"
              onClick={() => advanceStatus(selectedMonth)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Send size={13} />
              {t(statusCfg.nextLabel)}
            </button>
          )}
        </div>

        {/* Receipts accordion */}
        {showReceiptsFor === selectedMonth && (
          <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {t("Comprovantes do período")} — {formatMonth(selectedMonth)}
            </p>
            {periodData.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Nenhum comprovante neste período")}</p>
            ) : (
              <div className="space-y-2">
                {periodData.receipts.map(tx => (
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
            )}
          </div>
        )}
      </section>

      {/* ── Relatórios históricos (demo estruturada) ────────────────── */}
      <section className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <FileText size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold">{t("Relatórios históricos")}</h3>
        </div>
        <div className="divide-y divide-border/40">
          {ACCOUNTABILITY_REPORTS.map(report => (
            <div
              key={report.id}
              className="p-5 hover:bg-secondary/10 transition-colors cursor-pointer group"
              onClick={() => setSelectedReport(report)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t(report.type)}</p>
                  <h4 className="font-semibold text-base group-hover:text-primary transition-colors">{report.period}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {report.receipts} {t("comprovantes")}
                  </p>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${DEMO_STATUS_CLASS[report.status]}`}>
                    {t(report.status)}
                  </span>
                  <DocExportMenu
                    align="end"
                    items={buildFinanceExportItems({
                      moduleTitle: `${t("Prestação de Contas")} — ${report.period}`,
                      summary: `${report.receipts} comprovantes | Status: ${report.status}`,
                      csvFilename: `prestacao_${report.period.replace(/\s+/g, "_")}.csv`,
                    })}
                  />
                </div>
              </div>

              {/* Approvers */}
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {t("Aprovadores")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {report.approvers.map(a => (
                    <div key={a.role} className="flex items-center gap-1.5 text-sm">
                      {a.done ? (
                        <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle size={14} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-muted-foreground text-xs">{t(a.role)}:</span>
                      <span className="text-xs font-medium">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Relatórios contábeis (dados reais) ──────────────────────── */}
      <section className="bg-card rounded-xl shadow-sm border border-border/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold">{t("Relatórios Contábeis")}</h3>
        </div>
        <FinanceReports transactions={transactions} />
      </section>

      {/* ── Historical report detail modal ──────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title={selectedReport?.period ?? ""}
        subtitle={selectedReport ? t(selectedReport.type) : undefined}
        maxWidth="sm"
      >
        {selectedReport && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${DEMO_STATUS_CLASS[selectedReport.status]}`}>
                {t(selectedReport.status)}
              </span>
              <p className="text-sm text-muted-foreground">
                {selectedReport.receipts} {t("comprovantes")}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {t("Aprovadores")}
              </p>
              <div className="space-y-2">
                {selectedReport.approvers.map(a => (
                  <div key={a.role} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 text-sm">
                    <div className="flex items-center gap-2">
                      {a.done ? (
                        <CheckCircle2 size={14} className="text-green-600" />
                      ) : (
                        <Circle size={14} className="text-muted-foreground" />
                      )}
                      <span className="font-medium">{a.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{t(a.role)}</span>
                  </div>
                ))}
              </div>
            </div>

            <DocExportMenu
              align="start"
              items={buildFinanceExportItems({
                moduleTitle: `${t("Prestação de Contas")} — ${selectedReport.period}`,
                summary: `${selectedReport.receipts} comprovantes | Status: ${selectedReport.status}`,
              })}
            />
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
