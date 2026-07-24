/**
 * Relatórios de Missões (OPERAÇÃO 4) — traduz "Relatórios do Cadastro" e
 * "Relatórios Gerenciais" do WinTechi. Todos os números vêm de RPCs
 * derivadas em tempo real (list_missions_missionaries_by_field,
 * list_missions_project_indicators, list_missions_commitment_installments)
 * — nenhuma tabela de relatório persistida, nenhum segundo motor genérico.
 * Exportação/PDF não está implementada nesta operação (ver §16 da operação
 * e docs/architecture/operacao-4-missoes.md) por falta de infraestrutura
 * compatível já revisada — documentado como extensão futura.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRole } from "@/hooks/useRole";
import {
  listMissionsMissionariesByField, listMissionsProjectIndicators, listMissionsCommitmentInstallmentsReport,
  type MissionsMissionaryByFieldRow, type MissionsProjectIndicatorRow, type MissionsCommitmentInstallmentReportRow,
} from "@/lib/missions/service";
import {
  MISSIONS_INSTALLMENT_STATUSES, MISSIONS_INSTALLMENT_STATUS_LABELS, type MissionsInstallmentStatus,
} from "@/lib/missions/constants";
import { FormSelectLabeled, FormCheckboxLabeled, StatusPill, EmptyState } from "./missoesFormHelpers";

const currency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const INSTALLMENT_STATUS_TONE: Record<MissionsInstallmentStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  previsto: "neutral",
  pendente: "info",
  parcial: "warning",
  pago: "success",
  atrasado: "danger",
  cancelado: "neutral",
  isento: "neutral",
};

export function MissoesReports({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canViewFinance = hasCapability("finance.read");
  const [view, setView] = useState<"campo" | "projetos" | "parcelas">("campo");

  useEffect(() => {
    if (!canViewFinance && view !== "campo") {
      setView("campo");
    }
  }, [canViewFinance, view]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><BarChart3 size={18} /> Relatórios</h2>
        <p className="text-sm text-muted-foreground">
          Dados derivados em tempo real das tabelas reais de Missões e do Financeiro. Exportação em PDF ainda não
          está disponível nesta operação — documentada como extensão futura.
        </p>
      </div>

      <div className="flex gap-1.5 border-b border-border pb-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { key: "campo" as const, label: "Missionários por campo" },
          ...(canViewFinance ? [
            { key: "projetos" as const, label: "Indicadores de projetos" },
            { key: "parcelas" as const, label: "Parcelas previstas × pagas" },
          ] : []),
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            aria-current={view === t.key}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "campo" && <MissionariesByFieldReport organizationId={organizationId} />}
      {canViewFinance && view === "projetos" && <ProjectIndicatorsReport organizationId={organizationId} />}
      {canViewFinance && view === "parcelas" && <InstallmentsReport organizationId={organizationId} />}
      {!canViewFinance && (
        <EmptyState
          title="Relatórios financeiros protegidos"
          description="Indicadores de valores e parcelas exigem finance.read. O relatório missionário por campo continua disponível."
        />
      )}
    </div>
  );
}

function MissionariesByFieldReport({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<MissionsMissionaryByFieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listMissionsMissionariesByField(organizationId);
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>;
  if (error) return <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o relatório. {error}</div>;
  if (rows.length === 0) return <EmptyState title="Nenhum missionário cadastrado ainda" description="Cadastre missionários com campo de atuação para ver este relatório." />;

  return (
    <div className="space-y-1.5">
      {rows.map((r, idx) => (
        <div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
          <p className="text-sm truncate">
            {[r.field_region, r.field_state, r.field_country].filter(Boolean).join(" · ") || "Campo não informado"}
          </p>
          <span className="text-sm font-medium shrink-0">{r.missionary_count}</span>
        </div>
      ))}
    </div>
  );
}

function ProjectIndicatorsReport({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<MissionsProjectIndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listMissionsProjectIndicators({ organization_id: organizationId });
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>;
  if (error) return <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o relatório. {error}</div>;
  if (rows.length === 0) return <EmptyState title="Nenhum projeto cadastrado ainda" description="Cadastre um projeto para acompanhar seus indicadores." />;

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {rows.map((r) => (
        <Card key={r.project_id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">{r.project_name}</p>
              <StatusPill label={r.project_status} tone="info" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Previsto</span>
              <span>{currency(r.expected_amount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recebido</span>
              <span>{currency(r.received_amount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Missionários ativos</span>
              <span>{r.active_missionaries}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InstallmentsReport({ organizationId }: { organizationId: string }) {
  const [statusFilter, setStatusFilter] = useState<MissionsInstallmentStatus | "">("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [rows, setRows] = useState<MissionsCommitmentInstallmentReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listMissionsCommitmentInstallmentsReport({
      organization_id: organizationId,
      status_filter: statusFilter || null,
      only_overdue: onlyOverdue,
    });
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, [organizationId, statusFilter, onlyOverdue]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormSelectLabeled
          label="Filtrar por status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as MissionsInstallmentStatus | "")}
          options={MISSIONS_INSTALLMENT_STATUSES.map((s) => ({ value: s, label: MISSIONS_INSTALLMENT_STATUS_LABELS[s] }))}
          placeholder="Todos os status"
        />
        <FormCheckboxLabeled label="Somente atrasadas" checked={onlyOverdue} onChange={setOnlyOverdue} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o relatório. {error}</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma parcela nesta seleção" description="Ajuste os filtros ou gere parcelas na aba “Apoiadores e compromissos”." />
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.installment_id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{r.supporter_member_name} · {r.context_label}</p>
                <p className="text-xs text-muted-foreground">
                  {r.reference_month} · Vence {new Date(`${r.due_date}T00:00:00`).toLocaleDateString("pt-BR")} ·
                  {" "}{currency(r.paid_amount)} / {currency(r.expected_amount)}
                </p>
              </div>
              <StatusPill
                label={MISSIONS_INSTALLMENT_STATUS_LABELS[r.status as MissionsInstallmentStatus]}
                tone={INSTALLMENT_STATUS_TONE[r.status as MissionsInstallmentStatus]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
