import { useLanguage } from "@/hooks/useLanguage";
import { AUDIT_LOG } from "@/lib/financeDemo";
import { AlertTriangle, CheckCircle2, FileText, PlusCircle, ShieldCheck } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";

const CHANGE_TYPE_COLOR: Record<string, string> = {
  "Edição manual": "bg-amber-500/15 text-amber-700",
  Inclusão: "bg-green-500/15 text-green-700",
  Aprovação: "bg-primary/10 text-primary",
  Anexo: "bg-destructive/15 text-destructive",
};

const CHANGE_TYPE_ICON: Record<string, React.ElementType> = {
  Inclusão: PlusCircle,
  Aprovação: CheckCircle2,
};

function buildAuditCSV(entries: typeof AUDIT_LOG): string {
  let csv = "Ação,Usuário,Data/Hora,Tipo de alteração,Antes,Depois,Aprovação necessária\n";
  entries.forEach(e => {
    csv += `"${e.action}","${e.user}","${e.timestamp}","${e.changeType}","${e.before}","${e.after}",${e.needsApproval ? "Sim" : "Não"}\n`;
  });
  return csv;
}

export function FinanceAudit() {
  const { t, lang } = useLanguage();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="bg-card rounded-xl shadow-executive overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h3 className="font-serif text-lg font-semibold">{t("Trilha de auditoria")}</h3>
          </div>
          <DocExportMenu
            align="end"
            items={buildFinanceExportItems({
              moduleTitle: t("Trilha de auditoria"),
              summary: `${AUDIT_LOG.length} registros de auditoria`,
              csvFn: () => buildAuditCSV(AUDIT_LOG),
              csvFilename: "auditoria.csv",
            })}
          />
        </div>

        {/* Timeline */}
        <div className="p-5">
          {AUDIT_LOG.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("Sem registro de auditoria")}</p>
          ) : (
            <ol className="relative border-l-2 border-border/50 space-y-0 ml-3">
              {AUDIT_LOG.map((entry, idx) => {
                const Icon = CHANGE_TYPE_ICON[entry.changeType] ?? FileText;
                const colorClass = CHANGE_TYPE_COLOR[entry.changeType] ?? "bg-secondary text-muted-foreground";
                const isLast = idx === AUDIT_LOG.length - 1;

                return (
                  <li key={entry.id} className={`relative pl-6 ${isLast ? "pb-0" : "pb-6"}`}>
                    {/* Timeline dot */}
                    <span className={`absolute -left-[13px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-background ${colorClass}`}>
                      <Icon size={11} />
                    </span>

                    <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-2">
                      {/* Title row */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{entry.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.user}
                            {" · "}
                            {new Date(entry.timestamp).toLocaleString(dateLoc, {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${colorClass}`}>
                            {entry.changeType}
                          </span>
                          {entry.needsApproval && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/15 text-amber-700">
                              {t("Aprovação necessária")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Before / after */}
                      {(entry.before !== "—" || entry.after !== "—") && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-background/60">
                            <p className="text-muted-foreground font-medium">{t("Antes")}</p>
                            <p className="mt-0.5">{entry.before}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-background/60">
                            <p className="text-muted-foreground font-medium">{t("Depois")}</p>
                            <p className="mt-0.5">{entry.after}</p>
                          </div>
                        </div>
                      )}

                      {/* Alert */}
                      {entry.alert && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-500/10 px-3 py-2 rounded-lg">
                          <AlertTriangle size={13} /> {t(entry.alert)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
