/**
 * Configurações de Missões (OPERAÇÃO 4) — traduz "Parâmetros de Missões" +
 * "Períodos Contábeis" + "Contas Contábeis — Missões" + "Grupos Contábeis"
 * do WinTechi em UM registro organizacional de parâmetros. Os antigos
 * cadastros paralelos de contas/grupos contábeis não existem mais aqui:
 * apontamos para a conta financeira/categoria/centro de custo REAIS do
 * módulo Financeiro (contrato §6) — nenhum plano de contas duplicado.
 *
 * LIMITAÇÃO DOCUMENTADA (mesma decisão de TeologiaFinance.tsx): sem um
 * seletor visual do Financeiro nesta operação, os campos de conta/categoria/
 * centro de custo padrão são preenchidos pelo ID já conhecido no Financeiro.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { loadMissionsSettings, upsertMissionsSettings, type MissionsSettingsRow } from "@/lib/missions/service";
import { MISSIONS_PERIODICITIES, MISSIONS_PERIODICITY_LABELS, type MissionsPeriodicity } from "@/lib/missions/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, EmptyState } from "./missoesFormHelpers";

export function MissoesSettings({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("missions.manage");
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [row, setRow] = useState<MissionsSettingsRow | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [defaultCostCenterId, setDefaultCostCenterId] = useState("");
  const [defaultPeriodicity, setDefaultPeriodicity] = useState<MissionsPeriodicity>("mensal");
  const [installmentDueDay, setInstallmentDueDay] = useState("5");
  const [lateAlertDays, setLateAlertDays] = useState("5");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await loadMissionsSettings(organizationId);
    if (res.error?.includes("42P01") || res.error?.toLowerCase().includes("does not exist")) {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setLoadError(res.error);
    setRow(res.row);
    if (res.row) {
      setDefaultAccountId(res.row.default_finance_account_id ?? "");
      setDefaultCategoryId(res.row.default_account_category_id ?? "");
      setDefaultCostCenterId(res.row.default_cost_center_id ?? "");
      setDefaultPeriodicity((res.row.default_periodicity as MissionsPeriodicity) ?? "mensal");
      setInstallmentDueDay(String(res.row.installment_due_day ?? 5));
      setLateAlertDays(String(res.row.late_alert_days ?? 5));
      setNotes(res.row.notes ?? "");
    }
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando configurações…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Missões aguardando aplicação das migrations" description="A tabela missions_settings ainda não existe neste ambiente." />;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar as configurações. {loadError}
      </div>
    );
  }
  if (!canManage) {
    return <EmptyState title="Sem acesso às configurações" description="Editar parâmetros de Missões exige missions.manage." />;
  }

  const handleSave = async () => {
    setSaving(true);
    const { error } = await upsertMissionsSettings({
      organization_id: organizationId,
      default_finance_account_id: defaultAccountId.trim() || null,
      default_account_category_id: defaultCategoryId.trim() || null,
      default_cost_center_id: defaultCostCenterId.trim() || null,
      default_periodicity: defaultPeriodicity,
      installment_due_day: Number(installmentDueDay) || 5,
      late_alert_days: Number(lateAlertDays) || 5,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível salvar as configurações: ${error}`); return; }
    toast.success("Configurações de Missões salvas.");
    reload();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif flex items-center gap-2"><Settings2 size={18} /> Configurações</h2>
        <p className="text-sm text-muted-foreground">
          Parâmetros organizacionais de Missões. Conta, categoria e centro de custo padrão apontam para estruturas
          reais do Financeiro — não existe um plano de contas próprio de Missões.
        </p>
      </div>

      <div className="space-y-3 max-w-2xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormInputLabeled label="Conta financeira padrão (ID)" value={defaultAccountId} onChange={setDefaultAccountId} placeholder="UUID do Financeiro" />
          <FormInputLabeled label="Categoria financeira padrão (ID)" value={defaultCategoryId} onChange={setDefaultCategoryId} placeholder="UUID do Financeiro" />
          <FormInputLabeled label="Centro de custo padrão (ID)" value={defaultCostCenterId} onChange={setDefaultCostCenterId} placeholder="UUID do Financeiro" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormSelectLabeled label="Periodicidade padrão" value={defaultPeriodicity} onChange={(v) => setDefaultPeriodicity(v as MissionsPeriodicity)} options={MISSIONS_PERIODICITIES.map((p) => ({ value: p, label: MISSIONS_PERIODICITY_LABELS[p] }))} />
          <FormInputLabeled label="Dia de vencimento padrão" type="number" min={1} max={28} value={installmentDueDay} onChange={setInstallmentDueDay} />
          <FormInputLabeled label="Alerta de atraso (dias)" type="number" min={0} value={lateAlertDays} onChange={setLateAlertDays} />
        </div>
        <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : row ? "Atualizar configurações" : "Salvar configurações"}</Button>
      </div>
    </div>
  );
}
