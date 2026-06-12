import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { ACCOUNTABILITY_REPORTS, type AccountabilityStatus } from "@/lib/financeDemo";
import { CheckCircle2, Circle, Download, Eye, FileText, Send } from "lucide-react";
import type { TreasuryTransaction } from "@/lib/finance";
import { FinanceReports } from "@/components/financeiro/FinanceReports";

const statusClass: Record<AccountabilityStatus, string> = {
  "Em preparação": "bg-secondary text-muted-foreground",
  "Aguardando aprovação": "bg-amber-500/15 text-amber-700",
  Aprovado: "bg-green-500/15 text-green-700",
  Publicado: "bg-primary/10 text-primary",
};

type Props = { transactions: TreasuryTransaction[] };

export function FinanceAccountability({ transactions }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const notify = (action: string) => toast({ title: action, description: t("Em breve disponível") });

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {ACCOUNTABILITY_REPORTS.map((report) => (
          <article key={report.id} className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">{t(report.type)}</p>
                <h3 className="font-serif text-lg font-semibold">{report.period}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {report.receipts} {t("comprovantes anexados")}
                </p>
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${statusClass[report.status]}`}>
                {t(report.status)}
              </span>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("Aprovadores")}</p>
              <div className="flex flex-wrap gap-3">
                {report.approvers.map((a) => (
                  <div key={a.role} className="flex items-center gap-2 text-sm">
                    {a.done ? (
                      <CheckCircle2 size={14} className="text-green-600" />
                    ) : (
                      <Circle size={14} className="text-muted-foreground" />
                    )}
                    <span>
                      <span className="text-muted-foreground">{t(a.role)}:</span> {a.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => notify(t("Gerar PDF"))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80">
                <Download size={14} /> {t("Gerar PDF")}
              </button>
              <button type="button" onClick={() => notify(t("Publicar prestação"))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20">
                <Send size={14} /> {t("Publicar prestação")}
              </button>
              <button type="button" onClick={() => notify(t("Ver comprovantes"))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80">
                <Eye size={14} /> {t("Ver comprovantes")}
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold">{t("Relatórios Contábeis")}</h3>
        </div>
        <FinanceReports transactions={transactions} />
      </section>
    </div>
  );
}
