import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { AlertTriangle, CheckCircle2, FileText, Loader2, PlusCircle, ShieldCheck, Trash2 } from "lucide-react";
import { DocExportMenu } from "@/components/shared/DocExportMenu";
import { buildFinanceExportItems } from "@/lib/docExport";
import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";

/**
 * CORREÇÃO 2026-07-20 (Fase A — restauração do Financeiro) — a trilha de
 * auditoria passou a consultar `finance_transaction_audit_logs` (populada
 * automaticamente por trigger em todo INSERT/UPDATE/DELETE de
 * `transactions` — ver supabase/migrations/20260512100000_staging_treasury_mvp.sql
 * e 20260513110000_fix_finance_audit_rls.sql). Não há mais nenhuma leitura
 * de src/lib/financeDemo.ts além do formatador de moeda (utilitário puro,
 * sem dado fictício).
 */

type AuditLogRow = {
  id: string;
  transaction_id: string | null;
  action: string;
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type AuditViewEntry = {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  changeType: string;
  before: string;
  after: string;
  needsApproval: boolean;
  alert?: string;
};

const CHANGE_TYPE_COLOR: Record<string, string> = {
  "Edição manual": "bg-amber-500/15 text-amber-700",
  Inclusão: "bg-green-500/15 text-green-700",
  Aprovação: "bg-primary/10 text-primary",
  Exclusão: "bg-destructive/15 text-destructive",
};

const CHANGE_TYPE_ICON: Record<string, React.ElementType> = {
  Inclusão: PlusCircle,
  Aprovação: CheckCircle2,
  Exclusão: Trash2,
};

// Heurística de limite para sinalizar alterações de valor sensíveis —
// mesma ordem de grandeza usada em outras telas do módulo como referência
// de "lançamento relevante"; sem tabela de limites configuráveis ainda.
const HIGH_VALUE_ALERT_THRESHOLD = 1000;

function asRecord(value: Record<string, unknown> | null): Record<string, unknown> {
  return value ?? {};
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function buildEntryFromRow(row: AuditLogRow, userName: string, lang: string): AuditViewEntry {
  const before = asRecord(row.old_data);
  const after = asRecord(row.new_data);
  const fmt = (v: number) => formatFinanceCurrency(v, lang);

  if (row.action === "insert") {
    const amount = num(after.amount);
    const category = str(after.category) ?? "—";
    const type = after.type === "Saida" || after.type === "Saída" ? "Saída" : "Entrada";
    return {
      id: row.id,
      action: "Novo lançamento",
      user: userName,
      timestamp: row.changed_at,
      changeType: "Inclusão",
      before: "—",
      after: amount !== null ? `${type} — ${category} ${fmt(amount)}` : category,
      needsApproval: false,
    };
  }

  if (row.action === "delete") {
    const amount = num(before.amount);
    const description = str(before.description) ?? str(before.category) ?? "—";
    return {
      id: row.id,
      action: "Exclusão de lançamento",
      user: userName,
      timestamp: row.changed_at,
      changeType: "Exclusão",
      before: amount !== null ? `${description} — ${fmt(amount)}` : description,
      after: "—",
      needsApproval: true,
      alert: "Lançamento excluído",
    };
  }

  // update — descobre o campo mais relevante que mudou para o título.
  const beforeAmount = num(before.amount);
  const afterAmount = num(after.amount);
  const beforeCategory = str(before.category);
  const afterCategory = str(after.category);
  const beforeStatus = str(before.status);
  const afterStatus = str(after.status);
  const beforeReceipt = str(before.receipt_url);
  const afterReceipt = str(after.receipt_url);

  if (beforeStatus !== afterStatus && afterStatus === "Pago") {
    return {
      id: row.id,
      action: "Confirmação de pagamento",
      user: userName,
      timestamp: row.changed_at,
      changeType: "Aprovação",
      before: beforeStatus ?? "—",
      after: afterStatus ?? "—",
      needsApproval: false,
    };
  }

  if (beforeAmount !== null && afterAmount !== null && beforeAmount !== afterAmount) {
    const diff = Math.abs(afterAmount - beforeAmount);
    return {
      id: row.id,
      action: "Alteração de valor",
      user: userName,
      timestamp: row.changed_at,
      changeType: "Edição manual",
      before: fmt(beforeAmount),
      after: fmt(afterAmount),
      needsApproval: diff >= HIGH_VALUE_ALERT_THRESHOLD,
      alert: diff >= HIGH_VALUE_ALERT_THRESHOLD ? "Lançamento acima de limite" : undefined,
    };
  }

  if (beforeCategory !== afterCategory) {
    return {
      id: row.id,
      action: "Alteração de categoria",
      user: userName,
      timestamp: row.changed_at,
      changeType: "Edição manual",
      before: beforeCategory ?? "—",
      after: afterCategory ?? "—",
      needsApproval: false,
    };
  }

  if (beforeReceipt !== afterReceipt && !afterReceipt) {
    return {
      id: row.id,
      action: "Remoção de comprovante",
      user: userName,
      timestamp: row.changed_at,
      changeType: "Edição manual",
      before: beforeReceipt ?? "—",
      after: "—",
      needsApproval: true,
      alert: "Comprovante ausente",
    };
  }

  return {
    id: row.id,
    action: "Atualização de lançamento",
    user: userName,
    timestamp: row.changed_at,
    changeType: "Edição manual",
    before: str(before.description) ?? "—",
    after: str(after.description) ?? "—",
    needsApproval: false,
  };
}

function buildAuditCSV(entries: AuditViewEntry[]): string {
  let csv = "Ação,Usuário,Data/Hora,Tipo de alteração,Antes,Depois,Aprovação necessária\n";
  entries.forEach(e => {
    csv += `"${e.action}","${e.user}","${e.timestamp}","${e.changeType}","${e.before}","${e.after}",${e.needsApproval ? "Sim" : "Não"}\n`;
  });
  return csv;
}

export function FinanceAudit() {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const [entries, setEntries] = useState<AuditViewEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!church) { setLoading(false); return; }
      setLoading(true);
      const { data, error } = await runScopedOrganizationQuery<AuditLogRow[]>(
        "finance_transaction_audit_logs",
        church.id,
        query => query.select("*").order("changed_at", { ascending: false }).limit(100),
      );
      if (!active) return;
      if (error) {
        console.error("[FinanceAudit] load:", error);
        setEntries([]);
        setLoading(false);
        return;
      }
      const rows = data ?? [];
      const userIds = Array.from(new Set(rows.map(r => r.changed_by).filter((id): id is string => !!id)));
      let namesById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        namesById = new Map((profiles ?? []).map(p => [p.user_id, p.full_name ?? t("Usuário")]));
      }
      const built = rows.map(row => buildEntryFromRow(row, namesById.get(row.changed_by ?? "") ?? t("Sistema"), lang));
      if (active) {
        setEntries(built);
        setLoading(false);
      }
    };
    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church?.id, lang]);

  const csvItems = useMemo(() => entries, [entries]);

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
              summary: `${csvItems.length} registros de auditoria`,
              csvFn: () => buildAuditCSV(csvItems),
              csvFilename: "auditoria.csv",
            })}
          />
        </div>

        {/* Timeline */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> {t("Carregando...")}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("Sem registro de auditoria")}</p>
          ) : (
            <ol className="relative border-l-2 border-border/50 space-y-0 ml-3">
              {entries.map((entry, idx) => {
                const Icon = CHANGE_TYPE_ICON[entry.changeType] ?? FileText;
                const colorClass = CHANGE_TYPE_COLOR[entry.changeType] ?? "bg-secondary text-muted-foreground";
                const isLast = idx === entries.length - 1;

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
                          <p className="font-semibold text-sm">{t(entry.action)}</p>
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
                            {t(entry.changeType)}
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
