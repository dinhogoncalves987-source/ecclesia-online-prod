import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";

type Transaction = {
  id: string; date: string; description: string; type: string; amount: number; status: string; category: string;
};

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RECEITA_CATS = ["Dízimo", "Oferta", "Campanha", "Doação", "Missões"];
const DESPESA_CATS = ["Aluguel", "Água/Luz", "Material", "Salário", "Manutenção", "Infraestrutura", "Eventos", "Ação Social"];

export function FinanceReports({ transactions }: { transactions: Transaction[] }) {
  const { t } = useLanguage();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [reportType, setReportType] = useState<"dre" | "balancete" | "fluxo">("dre");

  const monthTxs = useMemo(() => {
    return transactions.filter(tx => tx.date?.startsWith(selectedMonth));
  }, [transactions, selectedMonth]);

  const months = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => { if (tx.date) set.add(tx.date.substring(0, 7)); });
    return [...set].sort().reverse();
  }, [transactions]);

  // DRE
  const dre = useMemo(() => {
    const receitaByCategory: Record<string, number> = {};
    const despesaByCategory: Record<string, number> = {};
    let totalReceita = 0, totalDespesa = 0;

    monthTxs.forEach(tx => {
      const cat = tx.category || "Geral";
      const amt = Number(tx.amount);
      if (tx.type === "Entrada") {
        receitaByCategory[cat] = (receitaByCategory[cat] || 0) + amt;
        totalReceita += amt;
      } else {
        despesaByCategory[cat] = (despesaByCategory[cat] || 0) + amt;
        totalDespesa += amt;
      }
    });

    return { receitaByCategory, despesaByCategory, totalReceita, totalDespesa, resultado: totalReceita - totalDespesa };
  }, [monthTxs]);

  // Balancete
  const balancete = useMemo(() => {
    const prevTxs = transactions.filter(tx => tx.date && tx.date < selectedMonth + "-01");
    const saldoAnterior = prevTxs.reduce((s, tx) => s + Number(tx.amount) * (tx.type === "Entrada" ? 1 : -1), 0);
    const movimentacao = dre.totalReceita - dre.totalDespesa;
    return { saldoAnterior, entradas: dre.totalReceita, saidas: dre.totalDespesa, movimentacao, saldoFinal: saldoAnterior + movimentacao };
  }, [transactions, selectedMonth, dre]);

  // Fluxo de Caixa
  const fluxoCaixa = useMemo(() => {
    const days: Record<string, { date: string; entradas: number; saidas: number }> = {};
    monthTxs.forEach(tx => {
      if (!days[tx.date]) days[tx.date] = { date: tx.date, entradas: 0, saidas: 0 };
      if (tx.type === "Entrada") days[tx.date].entradas += Number(tx.amount);
      else days[tx.date].saidas += Number(tx.amount);
    });
    const sorted = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
    let acc = balancete.saldoAnterior;
    return sorted.map(d => {
      acc += d.entradas - d.saidas;
      return { ...d, saldo: acc };
    });
  }, [monthTxs, balancete.saldoAnterior]);

  const exportReport = () => {
    let csv = "";
    if (reportType === "dre") {
      csv = "Categoria,Tipo,Valor\n";
      Object.entries(dre.receitaByCategory).forEach(([cat, val]) => { csv += `"${cat}",Receita,${val}\n`; });
      Object.entries(dre.despesaByCategory).forEach(([cat, val]) => { csv += `"${cat}",Despesa,${val}\n`; });
      csv += `"TOTAL RECEITAS",Receita,${dre.totalReceita}\n`;
      csv += `"TOTAL DESPESAS",Despesa,${dre.totalDespesa}\n`;
      csv += `"RESULTADO",,${dre.resultado}\n`;
    } else if (reportType === "fluxo") {
      csv = "Data,Entradas,Saídas,Saldo\n";
      fluxoCaixa.forEach(d => { csv += `${d.date},${d.entradas},${d.saidas},${d.saldo}\n`; });
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${reportType}_${selectedMonth}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("Relatório exportado!"));
  };

  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${months[parseInt(mo) - 1]}/${y}`;
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-secondary/50 rounded-lg p-0.5">
          {(["dre", "balancete", "fluxo"] as const).map(r => (
            <button key={r} onClick={() => setReportType(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${reportType === r ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {r === "dre" ? "DRE" : r === "balancete" ? t("Balancete") : t("Fluxo de Caixa")}
            </button>
          ))}
        </div>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-input bg-background text-xs">
          {months.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
          {months.length === 0 && <option value={selectedMonth}>{formatMonth(selectedMonth)}</option>}
        </select>
        <button onClick={exportReport} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-lg text-xs font-medium hover:bg-secondary/80 transition-colors ml-auto">
          <Download size={13} /> {t("Exportar")}
        </button>
      </div>

      {/* DRE */}
      {reportType === "dre" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              <h3 className="font-serif text-lg font-semibold">{t("Demonstrativo de Resultado")} — {formatMonth(selectedMonth)}</h3>
            </div>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">{t("Conta")}</th>
                  <th className="text-right py-2 font-medium">{t("Valor")}</th>
                </tr>
              </thead>
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
                <tr className="h-3" />
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
                <tr className="h-3" />
                <tr className={`font-bold text-base border-t-2 border-border ${dre.resultado >= 0 ? "text-success" : "text-destructive"}`}>
                  <td className="py-3 pl-2">{t("RESULTADO DO PERÍODO")}</td>
                  <td className="py-3 pr-2 text-right">{formatCurrency(dre.resultado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Balancete */}
      {reportType === "balancete" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              <h3 className="font-serif text-lg font-semibold">{t("Balancete")} — {formatMonth(selectedMonth)}</h3>
            </div>
          </div>
          <div className="p-5">
            <table className="w-full text-sm">
              <tbody>
                {[
                  { label: t("Saldo Anterior"), value: balancete.saldoAnterior, cls: "" },
                  { label: t("(+) Entradas no Período"), value: balancete.entradas, cls: "text-success" },
                  { label: t("(-) Saídas no Período"), value: balancete.saidas, cls: "text-destructive" },
                  { label: t("(=) Movimentação Líquida"), value: balancete.movimentacao, cls: balancete.movimentacao >= 0 ? "text-success" : "text-destructive" },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-3 font-medium">{row.label}</td>
                    <td className={`py-3 text-right font-medium tabular-nums ${row.cls}`}>{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                <tr className={`font-bold text-base border-t-2 border-border ${balancete.saldoFinal >= 0 ? "text-success" : "text-destructive"}`}>
                  <td className="py-4">{t("SALDO FINAL")}</td>
                  <td className="py-4 text-right">{formatCurrency(balancete.saldoFinal)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("Total Lançamentos")}</p>
                <p className="text-lg font-bold">{monthTxs.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-success/10 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("Confirmados")}</p>
                <p className="text-lg font-bold text-success">{monthTxs.filter(tx => tx.status === "Confirmado" || tx.status === "Pago").length}</p>
              </div>
              <div className="p-3 rounded-lg bg-accent/10 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("Pendentes")}</p>
                <p className="text-lg font-bold text-accent">{monthTxs.filter(tx => tx.status === "Pendente").length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fluxo de Caixa */}
      {reportType === "fluxo" && (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              <h3 className="font-serif text-lg font-semibold">{t("Fluxo de Caixa Diário")} — {formatMonth(selectedMonth)}</h3>
            </div>
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
                <tr className="border-b border-border/30 bg-secondary/20">
                  <td className="px-4 py-2 text-xs font-medium">{t("Saldo Anterior")}</td>
                  <td className="px-4 py-2 text-right text-xs">-</td>
                  <td className="px-4 py-2 text-right text-xs">-</td>
                  <td className="px-4 py-2 text-right text-xs font-medium tabular-nums">{formatCurrency(balancete.saldoAnterior)}</td>
                </tr>
                {fluxoCaixa.map(d => (
                  <tr key={d.date} className="border-b border-border/20 hover:bg-secondary/30">
                    <td className="px-4 py-2 text-xs tabular-nums">{new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums text-success">{d.entradas > 0 ? formatCurrency(d.entradas) : "-"}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums text-destructive">{d.saidas > 0 ? formatCurrency(d.saidas) : "-"}</td>
                    <td className={`px-4 py-2 text-right text-xs font-medium tabular-nums ${d.saldo >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.saldo)}</td>
                  </tr>
                ))}
                {fluxoCaixa.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
