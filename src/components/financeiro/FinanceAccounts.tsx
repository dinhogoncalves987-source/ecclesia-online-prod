import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ACCOUNTS_PAYABLE,
  ACCOUNTS_RECEIVABLE,
  formatFinanceCurrency,
  type FinanceAccountEntry,
  type PayableReceivableStatus,
} from "@/lib/financeDemo";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { FinanceDetailModal } from "@/components/financeiro/FinanceDetailModal";

const STATUS_CLASS: Record<PayableReceivableStatus, string> = {
  Pago: "bg-green-500/15 text-green-700",
  Pendente: "bg-amber-500/15 text-amber-700",
  Vencido: "bg-destructive/15 text-destructive",
  Agendado: "bg-primary/10 text-primary",
};

function buildCSV(items: FinanceAccountEntry[]): string {
  let csv = "Descrição,Categoria,Valor,Vencimento,Status\n";
  items.forEach(item => {
    csv += `"${item.description}","${item.category}",${item.amount},${item.dueDate},"${item.status}"\n`;
  });
  return csv;
}

type Props = {
  items: FinanceAccountEntry[];
  lang: string;
  t: (k: string) => string;
  overrides: Record<string, PayableReceivableStatus>;
  onMarkPaid: (id: string) => void;
  onRowClick: (item: FinanceAccountEntry) => void;
};

function AccountTable({ items, lang, t, overrides, onMarkPaid, onRowClick }: Props) {
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const getStatus = (item: FinanceAccountEntry) => overrides[item.id] ?? item.status;

  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium px-2 first:pl-0">{t("Descrição")}</th>
            <th className="pb-2 font-medium px-2">{t("Categoria")}</th>
            <th className="pb-2 font-medium text-right px-2">{t("Valor")}</th>
            <th className="pb-2 font-medium px-2">{t("Vencimento")}</th>
            <th className="pb-2 font-medium px-2">{t("Status")}</th>
            <th className="pb-2 font-medium text-right px-2">{t("Ações")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const status = getStatus(item);
            return (
              <tr
                key={item.id}
                className="border-b border-border/30 hover:bg-secondary/20 transition-colors cursor-pointer group"
                onClick={() => onRowClick(item)}
              >
                <td className="py-3 font-medium text-sm px-2 first:pl-0 group-hover:text-primary transition-colors">
                  {item.description}
                </td>
                <td className="py-3 text-muted-foreground text-xs px-2">{item.category}</td>
                <td className="py-3 text-right tabular-nums font-medium px-2">{fmt(item.amount)}</td>
                <td className="py-3 text-muted-foreground text-xs px-2">
                  {new Date(item.dueDate + "T00:00:00").toLocaleDateString(dateLoc, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="py-3 px-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLASS[status]}`}>
                    {t(status)}
                  </span>
                </td>
                <td className="py-3 text-right px-2">
                  {status !== "Pago" && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onMarkPaid(item.id); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-700 text-[10px] font-medium hover:bg-green-500/20 transition-colors"
                    >
                      <CheckCircle2 size={11} /> {t("Marcar como pago")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FinanceAccounts() {
  const { t, lang } = useLanguage();
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const [subTab, setSubTab] = useState<"payable" | "receivable">("payable");
  const [payableOverrides, setPayableOverrides] = useState<Record<string, PayableReceivableStatus>>({});
  const [receivableOverrides, setReceivableOverrides] = useState<Record<string, PayableReceivableStatus>>({});
  const [selectedEntry, setSelectedEntry] = useState<FinanceAccountEntry | null>(null);

  const markPaid = (id: string, type: "payable" | "receivable") => {
    if (type === "payable") setPayableOverrides(p => ({ ...p, [id]: "Pago" }));
    else setReceivableOverrides(p => ({ ...p, [id]: "Pago" }));
  };

  const payableSummary = useMemo(() => {
    const pending = ACCOUNTS_PAYABLE.filter(i => (payableOverrides[i.id] ?? i.status) !== "Pago");
    const overdue = ACCOUNTS_PAYABLE.filter(i => (payableOverrides[i.id] ?? i.status) === "Vencido");
    const totalPending = pending.reduce((s, i) => s + i.amount, 0);
    const totalOverdue = overdue.reduce((s, i) => s + i.amount, 0);
    return { totalPending, totalOverdue, count: pending.length };
  }, [payableOverrides]);

  const receivableSummary = useMemo(() => {
    const pending = ACCOUNTS_RECEIVABLE.filter(i => (receivableOverrides[i.id] ?? i.status) !== "Pago");
    const totalPending = pending.reduce((s, i) => s + i.amount, 0);
    return { totalPending, count: pending.length };
  }, [receivableOverrides]);

  const tabs = [
    { key: "payable" as const, label: t("Contas a pagar"), icon: ArrowUpRight },
    { key: "receivable" as const, label: t("Contas a receber"), icon: ArrowDownLeft },
  ];

  const isPayable = subTab === "payable";
  const activeOverrides = isPayable ? payableOverrides : receivableOverrides;
  const selectedStatus = selectedEntry ? (activeOverrides[selectedEntry.id] ?? selectedEntry.status) : "Pendente";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Total a pagar")}</p>
          <p className="text-xl font-semibold mt-1 tabular-nums text-destructive">{fmt(payableSummary.totalPending)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{payableSummary.count} {t("pendentes")}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Total vencido")}</p>
          <p className={`text-xl font-semibold mt-1 tabular-nums ${payableSummary.totalOverdue > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {fmt(payableSummary.totalOverdue)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("Vencidas")}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("Total a receber")}</p>
          <p className="text-xl font-semibold mt-1 tabular-nums text-success">{fmt(receivableSummary.totalPending)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{receivableSummary.count} {t("pendentes")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 flex-1 min-w-0">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = subTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSubTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                  active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>
        <DocExportMenu
          align="end"
          items={buildFinanceExportItems({
            moduleTitle: isPayable ? t("Contas a pagar") : t("Contas a receber"),
            summary: isPayable
              ? `Pendente: ${fmt(payableSummary.totalPending)} | Vencido: ${fmt(payableSummary.totalOverdue)}`
              : `A receber: ${fmt(receivableSummary.totalPending)}`,
            csvFn: () => buildCSV(isPayable ? ACCOUNTS_PAYABLE : ACCOUNTS_RECEIVABLE),
            csvFilename: `contas_${isPayable ? "pagar" : "receber"}.csv`,
          })}
        />
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        {isPayable ? (
          <AccountTable
            items={ACCOUNTS_PAYABLE}
            lang={lang}
            t={t}
            overrides={payableOverrides}
            onMarkPaid={id => markPaid(id, "payable")}
            onRowClick={setSelectedEntry}
          />
        ) : (
          <AccountTable
            items={ACCOUNTS_RECEIVABLE}
            lang={lang}
            t={t}
            overrides={receivableOverrides}
            onMarkPaid={id => markPaid(id, "receivable")}
            onRowClick={setSelectedEntry}
          />
        )}
      </section>

      {/* ── Account entry detail modal ──────────────────────────────── */}
      <FinanceDetailModal
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry?.description ?? ""}
        subtitle={isPayable ? t("Contas a pagar") : t("Contas a receber")}
        maxWidth="sm"
      >
        {selectedEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Valor")}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{fmt(selectedEntry.amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Status")}</p>
                <span className={`inline-block mt-1.5 text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${STATUS_CLASS[selectedStatus as PayableReceivableStatus] ?? ""}`}>
                  {t(selectedStatus)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Categoria")}</p>
                <p className="font-medium mt-0.5">{selectedEntry.category}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("Vencimento")}</p>
                <p className="font-medium mt-0.5">
                  {new Date(selectedEntry.dueDate + "T00:00:00").toLocaleDateString(dateLoc, {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {selectedStatus !== "Pago" && (
              <button
                type="button"
                onClick={() => {
                  markPaid(selectedEntry.id, isPayable ? "payable" : "receivable");
                  setSelectedEntry(null);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/10 text-green-700 hover:bg-green-500/20 text-sm font-medium transition-colors"
              >
                <CheckCircle2 size={16} /> {t("Marcar como pago")}
              </button>
            )}
          </div>
        )}
      </FinanceDetailModal>
    </div>
  );
}
