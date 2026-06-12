import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ACCOUNTS_PAYABLE,
  ACCOUNTS_RECEIVABLE,
  formatFinanceCurrency,
  type FinanceAccountEntry,
  type PayableReceivableStatus,
} from "@/lib/financeDemo";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

const statusClass: Record<PayableReceivableStatus, string> = {
  Pago: "bg-green-500/15 text-green-700",
  Pendente: "bg-amber-500/15 text-amber-700",
  Vencido: "bg-destructive/15 text-destructive",
  Agendado: "bg-primary/10 text-primary",
};

function AccountTable({ items, lang, t }: { items: FinanceAccountEntry[]; lang: string; t: (k: string) => string }) {
  const fmt = (v: number) => formatFinanceCurrency(v, lang);
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-muted-foreground">
            <th className="pb-2 font-medium">{t("Descrição")}</th>
            <th className="pb-2 font-medium">{t("Categoria")}</th>
            <th className="pb-2 font-medium text-right">{t("Valor")}</th>
            <th className="pb-2 font-medium">{t("Vencimento")}</th>
            <th className="pb-2 font-medium">{t("Status")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border/30">
              <td className="py-3 font-medium">{item.description}</td>
              <td className="py-3 text-muted-foreground">{item.category}</td>
              <td className="py-3 text-right tabular-nums">{fmt(item.amount)}</td>
              <td className="py-3 text-muted-foreground">
                {new Date(item.dueDate).toLocaleDateString(dateLoc, { day: "2-digit", month: "short", year: "numeric" })}
              </td>
              <td className="py-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusClass[item.status]}`}>
                  {t(item.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinanceAccounts() {
  const { t, lang } = useLanguage();
  const [subTab, setSubTab] = useState<"payable" | "receivable">("payable");

  const tabs = [
    { key: "payable" as const, label: t("Contas a pagar"), icon: ArrowUpRight },
    { key: "receivable" as const, label: t("Contas a receber"), icon: ArrowDownLeft },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        {subTab === "payable" ? (
          <AccountTable items={ACCOUNTS_PAYABLE} lang={lang} t={t} />
        ) : (
          <AccountTable items={ACCOUNTS_RECEIVABLE} lang={lang} t={t} />
        )}
      </section>
    </div>
  );
}
