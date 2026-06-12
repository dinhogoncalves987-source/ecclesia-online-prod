import { useLanguage } from "@/hooks/useLanguage";
import { AUDIT_LOG } from "@/lib/financeDemo";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export function FinanceAudit() {
  const { t, lang } = useLanguage();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} className="text-primary" />
          <h3 className="font-serif text-lg font-semibold">{t("Trilha de auditoria")}</h3>
        </div>
        <div className="space-y-3">
          {AUDIT_LOG.map((entry) => (
            <div key={entry.id} className="p-4 rounded-lg border border-border/50 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{entry.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.user} · {new Date(entry.timestamp).toLocaleString(dateLoc, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {entry.needsApproval && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 font-medium">
                    {t("Aprovação necessária")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-secondary/40">
                  <p className="text-muted-foreground">{t("Tipo")}</p>
                  <p className="font-medium">{entry.changeType}</p>
                </div>
                <div className="p-2 rounded bg-secondary/40">
                  <p className="text-muted-foreground">{t("Antes")}</p>
                  <p className="font-medium">{entry.before}</p>
                </div>
                <div className="p-2 rounded bg-secondary/40">
                  <p className="text-muted-foreground">{t("Depois")}</p>
                  <p className="font-medium">{entry.after}</p>
                </div>
              </div>
              {entry.alert && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-500/10 px-3 py-2 rounded-lg">
                  <AlertTriangle size={14} /> {t(entry.alert)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
