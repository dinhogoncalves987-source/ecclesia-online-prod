import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { FileText, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";
import { isExpense, type FinanceMonthlyClosing, type TreasuryTransaction } from "@/lib/finance";
import { DocumentActions } from "@/components/shared/DocumentActions";
import { downloadCSVRaw } from "@/lib/docExport";
import { useFinanceDashboardAggregates } from "@/hooks/useFinanceDashboardAggregates";
import { dayBefore, monthDateRange } from "@/lib/financeDateRanges";
import { fetchDateRangeForExport, fetchMonthLedgerPage } from "@/lib/financeMonthlyLedger";
import { toast } from "sonner";

const CURRENCY_LOCALE: Record<string, { locale: string; currency: string }> = {
  pt: { locale: "pt-BR", currency: "BRL" },
  en: { locale: "en-US", currency: "USD" },
  es: { locale: "es-MX", currency: "MXN" },
};

const makeCurrencyFormatter = (lang: string) => (v: number) => {
  const { locale, currency } = CURRENCY_LOCALE[lang] ?? CURRENCY_LOCALE.pt;
  return v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * CORREÇÃO 2026-08-14 (CORREÇÃO C3.1 — eliminar fetch-all) — recebia
 * `transactions: TreasuryTransaction[]` (array completo da organização) via
 * prop e filtrava em memória por mês. Agora:
 *  - a lista de meses disponíveis vem de finance_dashboard_aggregates
 *    (by_month, agregado);
 *  - o extrato do mês selecionado (DRE/Balancete/Fluxo/Prestação) usa uma
 *    consulta ESCOPADA por organização + intervalo de datas do mês, sempre
 *    com `.limit()`;
 *  - o saldo anterior ao mês vem do mesmo RPC agregador
 *    (p_date_to = dia anterior ao 1º dia do mês).
 */
export function FinanceReports({ reloadToken }: { reloadToken?: number }) {
  const { t, lang } = useLanguage();
  const formatCurrency = makeCurrencyFormatter(lang);
  const { user } = useAuth();
  const { church } = useChurch();
  const { hasRole, hasCapability } = useRole();
  const canWriteFinance = hasCapability("finance.approve")
    || hasRole(["super_admin", "church_admin", "tesoureiro"]);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [reportType, setReportType] = useState<"prestacao" | "dre" | "balancete" | "fluxo">("prestacao");
  const [closings, setClosings] = useState<FinanceMonthlyClosing[]>([]);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!church) return;
    const loadClosings = async () => {
      const { data } = await runScopedOrganizationQuery<FinanceMonthlyClosing[]>("finance_monthly_closings", church.id, query =>
        query.select("*").order("month", { ascending: false }),
      );
      setClosings(data || []);
    };
    loadClosings();
  }, [church]);

  const isMonthClosed = closings.some(closingItem => closingItem.month === selectedMonth);

  // Lista de meses disponíveis — agregado no servidor (histórico completo),
  // mesclado com os meses já fechados.
  const monthsAgg = useFinanceDashboardAggregates({ organizationId: church?.id, reloadToken });
  const months = useMemo(() => {
    const set = new Set<string>();
    (monthsAgg.data?.byMonth ?? []).forEach(b => { if (b.month) set.add(b.month); });
    closings.forEach(closingItem => set.add(closingItem.month));
    return [...set].sort().reverse();
  }, [monthsAgg.data, closings]);

  // Saldo anterior ao mês selecionado — agregado no servidor
  // (p_date_to = dia anterior ao 1º dia do mês).
  const monthRange = useMemo(() => monthDateRange(selectedMonth), [selectedMonth]);
  const priorAgg = useFinanceDashboardAggregates({
    organizationId: church?.id, dateTo: dayBefore(monthRange.from), reloadToken,
  });
  const saldoAnteriorAgg = (priorAgg.data?.totals.entriesAmount ?? 0) - (priorAgg.data?.totals.exitsAmount ?? 0);

  // Totais/DRE do mês — CORREÇÃO C4: antes vinham de `fetchMonthLedger`
  // (`.limit(3000)`, que truncava silenciosamente). Agora vêm inteiramente
  // do RPC agregador (byCategory), sem baixar nenhuma linha crua — a
  // contagem/soma é sempre exata, nunca capada.
  const monthAgg = useFinanceDashboardAggregates({
    organizationId: church?.id, dateFrom: monthRange.from, dateTo: monthRange.to, reloadToken,
  });
  const monthTxCount = (monthAgg.data?.totals.entriesCount ?? 0) + (monthAgg.data?.totals.exitsCount ?? 0);

  const dre = useMemo(() => {
    const receitaByCategory: Record<string, number> = {};
    const despesaByCategory: Record<string, number> = {};
    let totalReceita = 0;
    let totalDespesa = 0;

    (monthAgg.data?.byCategory ?? []).forEach(bucket => {
      if (bucket.type === "Saida") {
        despesaByCategory[bucket.category] = (despesaByCategory[bucket.category] || 0) + bucket.total;
        totalDespesa += bucket.total;
      } else {
        receitaByCategory[bucket.category] = (receitaByCategory[bucket.category] || 0) + bucket.total;
        totalReceita += bucket.total;
      }
    });

    return { receitaByCategory, despesaByCategory, totalReceita, totalDespesa, resultado: totalReceita - totalDespesa };
  }, [monthAgg.data]);

  const balancete = useMemo(() => {
    const saldoAnterior = saldoAnteriorAgg;
    const movimentacao = dre.totalReceita - dre.totalDespesa;
    return { saldoAnterior, entradas: dre.totalReceita, saidas: dre.totalDespesa, movimentacao, saldoFinal: saldoAnterior + movimentacao };
  }, [saldoAnteriorAgg, dre]);

  // ── Extrato do mês (tabela "Prestação") — CORREÇÃO C4: paginação real
  // (100/página, técnica pageSize+1) em vez de um `.limit(3000)` tratado
  // como total. Nunca carrega o mês inteiro só para desenhar a tabela.
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerRows, setLedgerRows] = useState<TreasuryTransaction[]>([]);
  const [ledgerHasNextPage, setLedgerHasNextPage] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  useEffect(() => { setLedgerPage(1); }, [selectedMonth]);
  useEffect(() => {
    let active = true;
    if (reportType !== "prestacao" || !church?.id) return;
    setLedgerLoading(true);
    fetchMonthLedgerPage(church.id, selectedMonth, ledgerPage).then(({ rows, hasNextPage, error }) => {
      if (!active) return;
      if (error) { setLedgerError(error); setLedgerRows([]); setLedgerHasNextPage(false); }
      else { setLedgerError(null); setLedgerRows(rows); setLedgerHasNextPage(hasNextPage); }
      setLedgerLoading(false);
    });
    return () => { active = false; };
  }, [reportType, church?.id, selectedMonth, ledgerPage, reloadToken]);

  // ── Fluxo de Caixa diário — precisa de granularidade por dia, que os
  // buckets agregados atuais não oferecem. Busca o mês completo SOMENTE
  // quando esta aba é aberta, de forma validada (nunca um `.limit()` fixo
  // tratado como total): a quantidade esperada vem do RPC agregador
  // (monthTxCount) e a busca é em blocos com `for`, validada ao final.
  const [fluxoRows, setFluxoRows] = useState<TreasuryTransaction[]>([]);
  const [fluxoLoading, setFluxoLoading] = useState(false);
  const [fluxoError, setFluxoError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (reportType !== "fluxo" || !church?.id || monthAgg.status !== "success") return;
    setFluxoLoading(true);
    setFluxoError(null);
    fetchDateRangeForExport(church.id, monthRange.from, monthRange.to, monthTxCount).then(({ rows, ok, error }) => {
      if (!active) return;
      if (!ok) { setFluxoError(error); setFluxoRows([]); }
      else setFluxoRows(rows);
      setFluxoLoading(false);
    });
    return () => { active = false; };
  }, [reportType, church?.id, monthRange.from, monthRange.to, monthTxCount, monthAgg.status, reloadToken]);

  const fluxoCaixa = useMemo(() => {
    const days: Record<string, { date: string; entradas: number; saidas: number }> = {};
    fluxoRows.forEach(tx => {
      if (!days[tx.date]) days[tx.date] = { date: tx.date, entradas: 0, saidas: 0 };
      if (!isExpense(tx.type)) days[tx.date].entradas += Number(tx.amount);
      else days[tx.date].saidas += Number(tx.amount);
    });
    const sorted = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
    let acc = balancete.saldoAnterior;
    return sorted.map(d => {
      acc += d.entradas - d.saidas;
      return { ...d, saldo: acc };
    });
  }, [fluxoRows, balancete.saldoAnterior]);

  // ── Exportação CSV — CORREÇÃO C4: "prestacao"/"fluxo" precisam do mês
  // completo; a quantidade esperada vem sempre do RPC agregador
  // (monthTxCount), a busca é em blocos com `for` (nunca `while(true)`) e o
  // resultado é validado antes de gerar o CSV. Qualquer divergência lança
  // erro — `useDocExport` nunca mostra "Exportado!" nesse caso (nunca um
  // CSV parcial anunciado como completo).
  const [exportProgress, setExportProgress] = useState<{ fetched: number; total: number } | null>(null);
  const buildReportCSV = async (): Promise<string> => {
    if (reportType === "dre") {
      let csv = "Categoria,Tipo,Valor\n";
      Object.entries(dre.receitaByCategory).forEach(([cat, val]) => { csv += `"${cat}",Receita,${val}\n`; });
      Object.entries(dre.despesaByCategory).forEach(([cat, val]) => { csv += `"${cat}",Despesa,${val}\n`; });
      csv += `"TOTAL RECEITAS",Receita,${dre.totalReceita}\n`;
      csv += `"TOTAL DESPESAS",Despesa,${dre.totalDespesa}\n`;
      csv += `"RESULTADO",,${dre.resultado}\n`;
      return csv;
    }
    if (reportType === "balancete") {
      let csv = "Conta,Valor\n";
      csv += `"Saldo anterior",${balancete.saldoAnterior}\n`;
      csv += `"Entradas",${balancete.entradas}\n`;
      csv += `"Saidas",${balancete.saidas}\n`;
      csv += `"Movimentacao liquida",${balancete.movimentacao}\n`;
      csv += `"Saldo final",${balancete.saldoFinal}\n`;
      return csv;
    }
    if (!church) throw new Error(t("Organização não disponível."));
    if (monthAgg.status !== "success") throw new Error(t("Aguarde o carregamento dos totais do mês antes de exportar."));

    setExportProgress({ fetched: 0, total: monthTxCount });
    try {
      const { rows, ok, error } = await fetchDateRangeForExport(
        church.id, monthRange.from, monthRange.to, monthTxCount,
        (fetched, total) => setExportProgress({ fetched, total }),
      );
      if (!ok) throw new Error(error || t("Não foi possível obter o período completo."));

      if (reportType === "fluxo") {
        const days: Record<string, { date: string; entradas: number; saidas: number }> = {};
        rows.forEach(tx => {
          if (!days[tx.date]) days[tx.date] = { date: tx.date, entradas: 0, saidas: 0 };
          if (!isExpense(tx.type)) days[tx.date].entradas += Number(tx.amount);
          else days[tx.date].saidas += Number(tx.amount);
        });
        const sorted = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
        let acc = balancete.saldoAnterior;
        let csv = "Data,Entradas,Saidas,Saldo\n";
        sorted.forEach(d => {
          acc += d.entradas - d.saidas;
          csv += `${d.date},${d.entradas},${d.saidas},${acc}\n`;
        });
        return csv;
      }

      // prestacao
      let csv = "Item,Valor\n";
      csv += `"Saldo inicial",${balancete.saldoAnterior}\n`;
      csv += `"Entradas",${balancete.entradas}\n`;
      csv += `"Saidas",${balancete.saidas}\n`;
      csv += `"Saldo final",${balancete.saldoFinal}\n`;
      csv += "\nData,Descricao,Tipo,Categoria,Forma,Valor,Status\n";
      rows.forEach(tx => {
        csv += `${tx.date},"${tx.description}",${tx.type},"${tx.category || ""}",${tx.payment_method || ""},${tx.amount},${tx.status}\n`;
      });
      return csv;
    } finally {
      setExportProgress(null);
    }
  };

  const exportReport = async () => {
    const csv = await buildReportCSV();
    downloadCSVRaw(csv, `${reportType}_${selectedMonth}.csv`);
  };

  const closeMonth = async () => {
    if (!user || !church || isMonthClosed || !canWriteFinance) return;
    setClosing(true);
    const { data, error } = await insertWithOrganizationScope<FinanceMonthlyClosing>("finance_monthly_closings", church.id, {
      month: selectedMonth,
      closed_by: user.id,
      notes: `Fechamento com saldo final ${balancete.saldoFinal}`,
    }, query => query.select().single());

    if (error) {
      toast.error(t("Erro ao fechar mês"));
    } else if (data) {
      setClosings([data, ...closings]);
      toast.success(t("Mês fechado"));
    }
    setClosing(false);
  };

  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const date = new Date(parseInt(y), parseInt(mo) - 1, 1);
    const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
    const monthName = date.toLocaleDateString(locale, { month: "short" });
    return `${monthName}/${y.slice(2)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-secondary/50 rounded-lg p-0.5">
          {(["prestacao", "dre", "balancete", "fluxo"] as const).map(r => (
            <button key={r} onClick={() => setReportType(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${reportType === r ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {r === "prestacao" ? t("Prestação") : r === "dre" ? "DRE" : r === "balancete" ? t("Balancete") : t("Fluxo de Caixa")}
            </button>
          ))}
        </div>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-input bg-background text-xs">
          {months.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
          {months.length === 0 && <option value={selectedMonth}>{formatMonth(selectedMonth)}</option>}
        </select>
        {canWriteFinance && (
          <button onClick={closeMonth} disabled={closing || isMonthClosed || monthTxCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-lg text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50">
            <Lock size={13} /> {isMonthClosed ? t("Mês fechado") : t("Fechar mês")}
          </button>
        )}
        <DocumentActions
          className="ml-auto"
          items={[
            { type: "pdf", label: "PDF" },
            { type: "csv", label: "CSV", onAction: exportReport },
          ]}
        />
      </div>

      {exportProgress && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          {t("Exportando")}… {exportProgress.fetched}/{exportProgress.total}
        </p>
      )}

      {reportType === "prestacao" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              <h3 className="font-serif text-lg font-semibold">{t("Prestação de Contas")} - {formatMonth(selectedMonth)}</h3>
              {isMonthClosed && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t("Fechado")}</span>}
            </div>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: t("Saldo inicial"), value: balancete.saldoAnterior },
                { label: t("Entradas"), value: balancete.entradas, cls: "text-success" },
                { label: t("Saídas"), value: balancete.saidas, cls: "text-destructive" },
                { label: t("Saldo final"), value: balancete.saldoFinal, cls: balancete.saldoFinal >= 0 ? "text-success" : "text-destructive" },
              ].map(item => (
                <div key={item.label} className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">{item.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${item.cls || ""}`}>{formatCurrency(item.value)}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-muted-foreground">
                    <th className="text-left py-2 font-medium">{t("Data")}</th>
                    <th className="text-left py-2 font-medium">{t("Descrição")}</th>
                    <th className="text-left py-2 font-medium">{t("Categoria")}</th>
                    <th className="text-right py-2 font-medium">{t("Valor")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerError ? (
                    <tr><td colSpan={4} className="text-center py-8 text-sm text-destructive">{ledgerError}</td></tr>
                  ) : ledgerLoading ? (
                    <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                  ) : (
                    <>
                      {ledgerRows.map(tx => (
                        <tr key={tx.id} className="border-b border-border/20">
                          <td className="py-1.5 text-xs">{tx.date}</td>
                          <td className="py-1.5 text-xs">{tx.description}</td>
                          <td className="py-1.5 text-xs">{tx.category}</td>
                          <td className={`py-1.5 text-right text-xs tabular-nums ${isExpense(tx.type) ? "text-destructive" : "text-success"}`}>
                            {isExpense(tx.type) ? "-" : "+"}{formatCurrency(Number(tx.amount))}
                          </td>
                        </tr>
                      ))}
                      {ledgerRows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {(ledgerPage > 1 || ledgerHasNextPage) && (
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                  disabled={ledgerPage === 1 || ledgerLoading}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                >
                  {t("Anterior")}
                </button>
                <span className="text-[11px] text-muted-foreground">{t("Página")} {ledgerPage}</span>
                <button
                  type="button"
                  onClick={() => setLedgerPage(p => p + 1)}
                  disabled={!ledgerHasNextPage || ledgerLoading}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40"
                >
                  {t("Próximo")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {reportType === "dre" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              <h3 className="font-serif text-lg font-semibold">{t("Demonstrativo de Resultado")} - {formatMonth(selectedMonth)}</h3>
            </div>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <tbody>
                <tr className="font-semibold text-success bg-success/5">
                  <td className="py-2 pl-2">{t("RECEITAS")}</td>
                  <td className="py-2 pr-2 text-right">{formatCurrency(dre.totalReceita)}</td>
                </tr>
                {Object.entries(dre.receitaByCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                  <tr key={cat} className="border-b border-border/20">
                    <td className="py-1.5 pl-6 text-xs">{cat}</td>
                    <td className="py-1.5 pr-2 text-right text-xs tabular-nums">{formatCurrency(val)}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-destructive bg-destructive/5">
                  <td className="py-2 pl-2">{t("DESPESAS")}</td>
                  <td className="py-2 pr-2 text-right">{formatCurrency(dre.totalDespesa)}</td>
                </tr>
                {Object.entries(dre.despesaByCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                  <tr key={cat} className="border-b border-border/20">
                    <td className="py-1.5 pl-6 text-xs">{cat}</td>
                    <td className="py-1.5 pr-2 text-right text-xs tabular-nums">{formatCurrency(val)}</td>
                  </tr>
                ))}
                <tr className={`font-bold text-base border-t-2 border-border ${dre.resultado >= 0 ? "text-success" : "text-destructive"}`}>
                  <td className="py-3 pl-2">{t("RESULTADO DO PERÍODO")}</td>
                  <td className="py-3 pr-2 text-right">{formatCurrency(dre.resultado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportType === "balancete" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">{t("Balancete")} - {formatMonth(selectedMonth)}</h3>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: t("Saldo Anterior"), value: balancete.saldoAnterior },
                { label: t("(+) Entradas no Período"), value: balancete.entradas, cls: "text-success" },
                { label: t("(-) Saídas no Período"), value: balancete.saidas, cls: "text-destructive" },
                { label: t("(=) Movimentação Líquida"), value: balancete.movimentacao, cls: balancete.movimentacao >= 0 ? "text-success" : "text-destructive" },
                { label: t("SALDO FINAL"), value: balancete.saldoFinal, cls: balancete.saldoFinal >= 0 ? "text-success" : "text-destructive" },
              ].map(row => (
                <tr key={row.label} className="border-b border-border/30">
                  <td className="py-3 font-medium">{row.label}</td>
                  <td className={`py-3 text-right font-medium tabular-nums ${row.cls || ""}`}>{formatCurrency(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportType === "fluxo" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <h3 className="font-serif text-lg font-semibold">{t("Fluxo de Caixa Diário")} - {formatMonth(selectedMonth)}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">{t("Data")}</th>
                  <th className="px-4 py-2 text-right font-medium text-success">{t("Entradas")}</th>
                  <th className="px-4 py-2 text-right font-medium text-destructive">{t("Saídas")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Saldo Acumulado")}</th>
                </tr>
              </thead>
              <tbody>
                {fluxoError ? (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-destructive">{fluxoError}</td></tr>
                ) : fluxoLoading ? (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                ) : (
                  <>
                    <tr className="border-b border-border/30 bg-secondary/20">
                      <td className="px-4 py-2 text-xs font-medium">{t("Saldo Anterior")}</td>
                      <td className="px-4 py-2 text-right text-xs">-</td>
                      <td className="px-4 py-2 text-right text-xs">-</td>
                      <td className="px-4 py-2 text-right text-xs font-medium tabular-nums">{formatCurrency(balancete.saldoAnterior)}</td>
                    </tr>
                    {fluxoCaixa.map(d => (
                      <tr key={d.date} className="border-b border-border/20 hover:bg-secondary/30">
                        <td className="px-4 py-2 text-xs tabular-nums">{d.date}</td>
                        <td className="px-4 py-2 text-right text-xs tabular-nums text-success">{d.entradas > 0 ? formatCurrency(d.entradas) : "-"}</td>
                        <td className="px-4 py-2 text-right text-xs tabular-nums text-destructive">{d.saidas > 0 ? formatCurrency(d.saidas) : "-"}</td>
                        <td className={`px-4 py-2 text-right text-xs font-medium tabular-nums ${d.saldo >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.saldo)}</td>
                      </tr>
                    ))}
                    {fluxoCaixa.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
