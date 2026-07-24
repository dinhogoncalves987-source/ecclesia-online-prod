/**
 * Configurações de Missões (OPERAÇÃO 4) — traduz "Parâmetros de Missões" +
 * "Períodos Contábeis" + "Contas Contábeis — Missões" + "Grupos Contábeis"
 * do WinTechi em UM registro organizacional de parâmetros. Os antigos
 * cadastros paralelos de contas/grupos contábeis não existem mais aqui:
 * apontamos para a conta financeira/categoria/centro de custo REAIS do
 * módulo Financeiro (contrato §6) — nenhum plano de contas duplicado.
 *
 * Contas, categorias e centros de custo são selecionados por nome a partir
 * das estruturas reais do Financeiro, respeitando finance.read; UUIDs
 * internos nunca são pedidos ao usuário.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import {
  loadMissionsFinanceOptions,
  loadMissionsSettings,
  upsertMissionsSettings,
  type MissionsFinanceOption,
  type MissionsSettingsRow,
} from "@/lib/missions/service";
import { MISSIONS_PERIODICITIES, MISSIONS_PERIODICITY_LABELS, type MissionsPeriodicity } from "@/lib/missions/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, EmptyState } from "./missoesFormHelpers";

export function MissoesSettings({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("missions.manage");
  const canViewFinance = hasCapability("finance.read");
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
  const [accounts, setAccounts] = useState<MissionsFinanceOption[]>([]);
  const [categories, setCategories] = useState<MissionsFinanceOption[]>([]);
  const [costCenters, setCostCenters] = useState<MissionsFinanceOption[]>([]);
  const [financeOptionsError, setFinanceOptionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [res, financeOptions] = await Promise.all([
      loadMissionsSettings(organizationId),
      canViewFinance
        ? loadMissionsFinanceOptions(organizationId)
        : Promise.resolve({ accounts: [], categories: [], costCenters: [], error: null }),
    ]);
    if (res.error?.includes("42P01") || res.error?.toLowerCase().includes("does not exist")) {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setLoadError(res.error);
    setAccounts(financeOptions.accounts);
    setCategories(financeOptions.categories);
    setCostCenters(financeOptions.costCenters);
    setFinanceOptionsError(financeOptions.error);
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
  }, [organizationId, canViewFinance]);

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
    const parsedDueDay = Number(installmentDueDay);
    const parsedLateAlertDays = Number(lateAlertDays);
    if (!Number.isInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 28) {
      toast.error("O dia de vencimento precisa ser um número inteiro entre 1 e 28.");
      return;
    }
    if (!Number.isInteger(parsedLateAlertDays) || parsedLateAlertDays < 0) {
      toast.error("Os dias para alerta precisam ser um número inteiro igual ou maior que zero.");
      return;
    }
    setSaving(true);
    const { error } = await upsertMissionsSettings({
      organization_id: organizationId,
      default_finance_account_id: defaultAccountId.trim() || null,
      default_account_category_id: defaultCategoryId.trim() || null,
      default_cost_center_id: defaultCostCenterId.trim() || null,
      default_periodicity: defaultPeriodicity,
      installment_due_day: parsedDueDay,
      late_alert_days: parsedLateAlertDays,
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
        {canViewFinance ? (
          <>
            {financeOptionsError && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Não foi possível carregar as opções do Financeiro. {financeOptionsError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormSelectLabeled
                label="Conta financeira padrão"
                value={defaultAccountId}
                onChange={setDefaultAccountId}
                options={accounts.map((option) => ({ value: option.id, label: option.label }))}
                placeholder="Sem conta padrão"
              />
              <FormSelectLabeled
                label="Categoria financeira padrão"
                value={defaultCategoryId}
                onChange={setDefaultCategoryId}
                options={categories.map((option) => ({ value: option.id, label: option.label }))}
                placeholder="Sem categoria padrão"
              />
              <FormSelectLabeled
                label="Centro de custo padrão"
                value={defaultCostCenterId}
                onChange={setDefaultCostCenterId}
                options={costCenters.map((option) => ({ value: option.id, label: option.label }))}
                placeholder="Sem centro de custo padrão"
              />
            </div>
          </>
        ) : (
          <EmptyState
            title="Padrões financeiros protegidos"
            description="Conta, categoria e centro de custo exigem finance.read. Os demais parâmetros de Missões continuam editáveis."
          />
        )}
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
