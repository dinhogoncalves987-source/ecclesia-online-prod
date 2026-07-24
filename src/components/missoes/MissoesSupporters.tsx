/**
 * Apoiadores e Compromissos (OPERAÇÃO 4) — traduz "Contribuintes" +
 * "Mensalidades a Receber" do WinTechi. Compromisso é sempre um valor
 * PREVISTO com exatamente um contexto (missionário, projeto ou campanha) —
 * nunca um lançamento real. A parcela nunca é marcada como paga aqui: o
 * status vem sempre de _recompute_missions_installment_status(), disparado
 * quando uma transação real é vinculada na aba "Financeiro Missionário".
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, HeartHandshake, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import {
  loadMissionsSupporters, createMissionsSupporter, updateMissionsSupporterStatus,
  loadMissionsCommitments, createMissionsCommitment, updateMissionsCommitmentStatus,
  loadMissionsInstallments, generateMissionsCommitmentInstallment, setMissionsInstallmentExemption,
  loadMissionsMissionaries, loadMissionsProjects, loadMissionsCampaigns, getMissionsMemberLabels,
  type MissionsSupporterRow, type MissionsSupporterCommitmentRow, type MissionsCommitmentInstallmentRow,
  type MissionsMissionaryRow, type MissionsProjectRow, type MissionsMemberLabel, type MissionsCampaignRow,
} from "@/lib/missions/service";
import {
  MISSIONS_SUPPORTER_STATUSES, MISSIONS_SUPPORTER_STATUS_LABELS, type MissionsSupporterStatus,
  MISSIONS_CONTACT_PREFERENCES, MISSIONS_CONTACT_PREFERENCE_LABELS, type MissionsContactPreference,
  MISSIONS_PERIODICITIES, MISSIONS_PERIODICITY_LABELS, type MissionsPeriodicity,
  MISSIONS_COMMITMENT_STATUSES, MISSIONS_COMMITMENT_STATUS_LABELS, type MissionsCommitmentStatus,
  MISSIONS_INSTALLMENT_STATUS_LABELS, type MissionsInstallmentStatus,
} from "@/lib/missions/constants";
import {
  isValidCommitmentStatusTransition,
  isValidSupporterStatusTransition,
  isCommitmentClosed,
  canExemptOrCancelInstallment,
} from "@/lib/missions/rules";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./missoesFormHelpers";
import { MissoesMemberPicker } from "./MissoesMemberPicker";

const SUPPORTER_STATUS_TONE: Record<MissionsSupporterStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  ativo: "success",
  inativo: "warning",
  encerrado: "neutral",
};

const COMMITMENT_STATUS_TONE: Record<MissionsCommitmentStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  ativo: "success",
  pausado: "warning",
  encerrado: "neutral",
  cancelado: "danger",
};

const INSTALLMENT_STATUS_TONE: Record<MissionsInstallmentStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  previsto: "neutral",
  pendente: "info",
  parcial: "warning",
  pago: "success",
  atrasado: "danger",
  cancelado: "neutral",
  isento: "neutral",
};

const currency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function MissoesSupporters({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("missions.manage");
  const canViewFinance = hasCapability("finance.read");
  const canManageFinance = canManage
    && hasCapability("missions.finance")
    && hasCapability("finance.write");
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supporters, setSupporters] = useState<MissionsSupporterRow[]>([]);
  const [memberLabels, setMemberLabels] = useState<Map<string, MissionsMemberLabel>>(new Map());
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<MissionsSupporterRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await loadMissionsSupporters(organizationId);
    if (res.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setLoadError(res.error?.message ?? null);
    setSupporters(res.rows);
    setModuleUnavailable(false);
    const memberIds = [...new Set(res.rows.map((s) => s.member_id))];
    if (memberIds.length > 0) {
      const labels = await getMissionsMemberLabels(organizationId, memberIds);
      setMemberLabels(new Map(labels.rows.map((m) => [m.id, m])));
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    setSelected((current) => (
      current ? supporters.find((supporter) => supporter.id === current.id) ?? null : null
    ));
  }, [supporters]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando apoiadores…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Missões aguardando aplicação das migrations" description="A tabela missions_supporters ainda não existe neste ambiente." />;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os apoiadores. {loadError}
      </div>
    );
  }

  const memberLabel = (id: string) => {
    const m = memberLabels.get(id);
    return m ? (m.known_name || m.full_name) : "Membro";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-serif flex items-center gap-2"><HeartHandshake size={18} /> Apoiadores e compromissos</h2>
          <p className="text-sm text-muted-foreground">
            Um compromisso é sempre um valor previsto vinculado a um missionário, projeto ou campanha. O recebimento
            só existe quando há uma transação real no Financeiro.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!canManage} title={!canManage ? "Exige missions.manage" : undefined}>
          <Plus size={16} className="mr-1.5" /> Novo apoiador
        </Button>
      </div>

      {supporters.length === 0 ? (
        <EmptyState title="Nenhum apoiador cadastrado ainda" description="Busque um membro já cadastrado na Secretaria para registrá-lo como apoiador." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {supporters.map((s) => (
            <Card key={s.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelected(s)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium truncate">{memberLabel(s.member_id)}</p>
                  <StatusPill label={MISSIONS_SUPPORTER_STATUS_LABELS[s.status as MissionsSupporterStatus]} tone={SUPPORTER_STATUS_TONE[s.status as MissionsSupporterStatus]} />
                </div>
                <p className="text-xs text-muted-foreground">{MISSIONS_CONTACT_PREFERENCE_LABELS[s.contact_preference as MissionsContactPreference]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateSupporterDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organizationId} onCreated={reload} />

      {selected && (
        <SupporterDetailDialog
          supporter={selected}
          memberName={memberLabel(selected.member_id)}
          organizationId={organizationId}
          canManage={canManage}
          canViewFinance={canViewFinance}
          canManageFinance={canManageFinance}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function CreateSupporterDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState("");
  const [contactPreference, setContactPreference] = useState<MissionsContactPreference>("nenhum");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setMemberId(null); setMemberLabel(""); setContactPreference("nenhum"); setNotes(""); };

  const handleSave = async () => {
    if (!memberId) { toast.error("Busque e selecione a pessoa que será cadastrada como apoiadora."); return; }
    setSaving(true);
    const { error } = await createMissionsSupporter({ member_id: memberId, organization_id: organizationId, contact_preference: contactPreference, notes: notes.trim() || null });
    setSaving(false);
    if (error) { toast.error(`Não foi possível cadastrar o apoiador: ${error}`); return; }
    toast.success("Apoiador cadastrado.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo apoiador</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!memberId ? (
            <MissoesMemberPicker organizationId={organizationId} onSelect={(m) => { setMemberId(m.id); setMemberLabel(m.known_name || m.full_name); }} />
          ) : (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/60">
              <p className="text-sm font-medium">{memberLabel}</p>
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setMemberId(null); setMemberLabel(""); }}>Trocar</button>
            </div>
          )}
          <FormSelectLabeled label="Preferência de contato" value={contactPreference} onChange={(v) => setContactPreference(v as MissionsContactPreference)} options={MISSIONS_CONTACT_PREFERENCES.map((c) => ({ value: c, label: MISSIONS_CONTACT_PREFERENCE_LABELS[c] }))} />
          <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Cadastrar apoiador"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupporterDetailDialog({
  supporter,
  memberName,
  organizationId,
  canManage,
  canViewFinance,
  canManageFinance,
  onClose,
  onChanged,
}: {
  supporter: MissionsSupporterRow;
  memberName: string;
  organizationId: string;
  canManage: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [commitments, setCommitments] = useState<MissionsSupporterCommitmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createCommitmentOpen, setCreateCommitmentOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<MissionsSupporterCommitmentRow | null>(null);
  const currentStatus = supporter.status as MissionsSupporterStatus;

  const reload = useCallback(async () => {
    if (!canViewFinance) {
      setCommitments([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await loadMissionsCommitments(supporter.id);
    setCommitments(res.rows);
    setError(res.error?.message ?? null);
    setLoading(false);
  }, [supporter.id, canViewFinance]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    setSelectedCommitment((current) => (
      current ? commitments.find((commitment) => commitment.id === current.id) ?? null : null
    ));
  }, [commitments]);

  const handleStatusChange = async (status: MissionsSupporterStatus) => {
    const { error: err } = await updateMissionsSupporterStatus(supporter.id, status);
    if (err) { toast.error(`Não foi possível mudar a situação: ${err}`); return; }
    toast.success(`Situação atualizada para: ${MISSIONS_SUPPORTER_STATUS_LABELS[status]}`);
    onChanged();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{memberName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <StatusPill label={MISSIONS_SUPPORTER_STATUS_LABELS[currentStatus]} tone={SUPPORTER_STATUS_TONE[currentStatus]} />
            {canManage && (
              <div className="flex flex-wrap gap-1.5">
                {MISSIONS_SUPPORTER_STATUSES
                  .filter((status) => status !== currentStatus && isValidSupporterStatusTransition(currentStatus, status))
                  .map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => handleStatusChange(s)}>{MISSIONS_SUPPORTER_STATUS_LABELS[s]}</Button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Compromissos</p>
            {canManageFinance && currentStatus === "ativo" && (
              <Button size="sm" variant="outline" onClick={() => setCreateCommitmentOpen(true)}>
                <Plus size={14} className="mr-1.5" /> Novo compromisso
              </Button>
            )}
          </div>

          {!canViewFinance ? (
            <EmptyState
              title="Compromissos financeiros protegidos"
              description="Visualizar valores, compromissos e parcelas exige finance.read."
            />
          ) : loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-3"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar os compromissos. {error}
            </div>
          ) : commitments.length === 0 ? (
            <EmptyState title="Nenhum compromisso ainda" description="Crie um compromisso previsto vinculado a um missionário, projeto ou campanha." />
          ) : (
            <div className="space-y-1.5">
              {commitments.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCommitment(c)}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60 text-left hover:border-primary/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{currency(c.committed_amount)} · {MISSIONS_PERIODICITY_LABELS[c.periodicity as MissionsPeriodicity]}</p>
                    <p className="text-xs text-muted-foreground">Desde {new Date(`${c.start_date}T00:00:00`).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <StatusPill label={MISSIONS_COMMITMENT_STATUS_LABELS[c.status as MissionsCommitmentStatus]} tone={COMMITMENT_STATUS_TONE[c.status as MissionsCommitmentStatus]} />
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>

      {createCommitmentOpen && (
        <CreateCommitmentDialog
          supporterId={supporter.id}
          organizationId={organizationId}
          onClose={() => setCreateCommitmentOpen(false)}
          onCreated={reload}
        />
      )}
      {selectedCommitment && (
        <CommitmentDetailDialog
          commitment={selectedCommitment}
          canManage={canManageFinance}
          onClose={() => setSelectedCommitment(null)}
          onChanged={reload}
        />
      )}
    </Dialog>
  );
}

type ContextKind = "missionario" | "projeto" | "campanha";

function CreateCommitmentDialog({ supporterId, organizationId, onClose, onCreated }: {
  supporterId: string;
  organizationId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [contextKind, setContextKind] = useState<ContextKind>("missionario");
  const [missionaries, setMissionaries] = useState<MissionsMissionaryRow[]>([]);
  const [projects, setProjects] = useState<MissionsProjectRow[]>([]);
  const [campaigns, setCampaigns] = useState<MissionsCampaignRow[]>([]);
  const [memberLabels, setMemberLabels] = useState<Map<string, MissionsMemberLabel>>(new Map());
  const [missionaryId, setMissionaryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [periodicity, setPeriodicity] = useState<MissionsPeriodicity>("mensal");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [contextLoading, setContextLoading] = useState(true);
  const [contextLoadError, setContextLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setContextLoading(true);
      setContextLoadError(null);
      const [mRes, pRes, cRes] = await Promise.all([
        loadMissionsMissionaries(organizationId),
        loadMissionsProjects(organizationId),
        loadMissionsCampaigns(organizationId),
      ]);
      if (cancelled) return;
      let nextError = mRes.error?.message ?? pRes.error?.message ?? cRes.error?.message ?? null;
      setMissionaries(mRes.rows.filter((row) => ["em_preparacao", "ativo", "em_licenca"].includes(row.status)));
      setProjects(pRes.rows.filter((row) => ["planejado", "ativo", "suspenso"].includes(row.status)));
      setCampaigns(cRes.rows);
      const memberIds = [...new Set(mRes.rows.map((m) => m.member_id))];
      if (memberIds.length > 0) {
        const labels = await getMissionsMemberLabels(organizationId, memberIds);
        if (cancelled) return;
        nextError ??= labels.error?.message ?? null;
        setMemberLabels(new Map(labels.rows.map((m) => [m.id, m])));
      }
      setContextLoadError(nextError);
      setContextLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const handleSave = async () => {
    if (contextLoading) { toast.error("Aguarde o carregamento dos contextos."); return; }
    if (contextLoadError) { toast.error("Corrija o erro de carregamento antes de criar o compromisso."); return; }
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) { toast.error("Informe um valor previsto maior que zero."); return; }
    if (contextKind === "missionario" && !missionaryId) { toast.error("Selecione o missionário."); return; }
    if (contextKind === "projeto" && !projectId) { toast.error("Selecione o projeto."); return; }
    if (contextKind === "campanha" && !campaignId) { toast.error("Selecione a campanha."); return; }
    setSaving(true);
    const { error } = await createMissionsCommitment({
      supporter_id: supporterId,
      periodicity,
      committed_amount: parsedAmount,
      missionary_id: contextKind === "missionario" ? missionaryId : null,
      project_id: contextKind === "projeto" ? projectId : null,
      campaign_id: contextKind === "campanha" ? campaignId : null,
      start_date: startDate,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o compromisso: ${error}`); return; }
    toast.success("Compromisso criado. Gere as parcelas na tela de detalhe.");
    onClose();
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo compromisso</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Um compromisso aponta para exatamente um contexto — nunca dois, nunca nenhum.
          </p>
          {contextLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" size={14} /> Carregando contextos disponíveis…
            </div>
          )}
          {contextLoadError && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar os contextos do compromisso. {contextLoadError}
            </div>
          )}
          <FormSelectLabeled
            label="Contexto"
            value={contextKind}
            onChange={(v) => setContextKind(v as ContextKind)}
            options={[
              { value: "missionario", label: "Missionário" },
              { value: "projeto", label: "Projeto" },
              { value: "campanha", label: "Campanha" },
            ]}
          />
          {contextKind === "missionario" && (
            <FormSelectLabeled
              label="Missionário"
              value={missionaryId}
              onChange={setMissionaryId}
              options={missionaries.map((m) => ({ value: m.id, label: memberLabels.get(m.member_id)?.known_name || memberLabels.get(m.member_id)?.full_name || "Missionário" }))}
            />
          )}
          {contextKind === "projeto" && (
            <FormSelectLabeled label="Projeto" value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          )}
          {contextKind === "campanha" && (
            <FormSelectLabeled
              label="Campanha"
              value={campaignId}
              onChange={setCampaignId}
              options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.title }))}
              placeholder="Selecione uma campanha ativa"
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormSelectLabeled label="Periodicidade" value={periodicity} onChange={(v) => setPeriodicity(v as MissionsPeriodicity)} options={MISSIONS_PERIODICITIES.map((p) => ({ value: p, label: MISSIONS_PERIODICITY_LABELS[p] }))} />
            <FormInputLabeled label="Valor previsto (R$)" type="number" min={0.01} step="0.01" value={amount} onChange={setAmount} required />
          </div>
          <FormInputLabeled label="Início" type="date" value={startDate} onChange={setStartDate} required />
          <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || contextLoading || Boolean(contextLoadError)}>
            {saving ? "Salvando…" : "Criar compromisso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommitmentDetailDialog({ commitment, canManage, onClose, onChanged }: {
  commitment: MissionsSupporterCommitmentRow;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [installments, setInstallments] = useState<MissionsCommitmentInstallmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [exemption, setExemption] = useState<{ installmentId: string; status: "cancelado" | "isento" } | null>(null);
  const currentStatus = commitment.status as MissionsCommitmentStatus;
  const closed = isCommitmentClosed(currentStatus);
  const nextOptions = MISSIONS_COMMITMENT_STATUSES.filter((s) => s !== currentStatus && isValidCommitmentStatusTransition(currentStatus, s));

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await loadMissionsInstallments(commitment.id);
    setInstallments(res.rows);
    setError(res.error?.message ?? null);
    setLoading(false);
  }, [commitment.id]);

  useEffect(() => { void reload(); }, [reload]);

  const handleTransition = async (status: MissionsCommitmentStatus) => {
    const { error: err } = await updateMissionsCommitmentStatus(commitment.id, status);
    if (err) { toast.error(`Não foi possível mudar o status: ${err}`); return; }
    toast.success(`Compromisso agora está: ${MISSIONS_COMMITMENT_STATUS_LABELS[status]}`);
    onChanged();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Compromisso — {currency(commitment.committed_amount)}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <StatusPill label={MISSIONS_COMMITMENT_STATUS_LABELS[currentStatus]} tone={COMMITMENT_STATUS_TONE[currentStatus]} />
            {canManage && nextOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {nextOptions.map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => handleTransition(s)}>{MISSIONS_COMMITMENT_STATUS_LABELS[s]}</Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Parcelas previstas</p>
            {canManage && !closed && (
              <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)}><Plus size={14} className="mr-1.5" /> Gerar parcela</Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-3"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar as parcelas. {error}
            </div>
          ) : installments.length === 0 ? (
            <EmptyState title="Nenhuma parcela gerada ainda" description="Gere a parcela do mês de referência. O status só muda para “pago”/“parcial” quando uma transação real for vinculada." />
          ) : (
            <div className="space-y-1.5">
              {installments.map((i) => {
                const status = i.status as MissionsInstallmentStatus;
                const canExempt = canManage && canExemptOrCancelInstallment({ paidAmount: i.paid_amount, currentStatus: status });
                return (
                  <div key={i.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{i.reference_month} · {currency(i.expected_amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence {new Date(`${i.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · Recebido: {currency(i.paid_amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusPill label={MISSIONS_INSTALLMENT_STATUS_LABELS[status]} tone={INSTALLMENT_STATUS_TONE[status]} />
                      {canExempt && (
                        <Button size="sm" variant="ghost" onClick={() => setExemption({ installmentId: i.id, status: "isento" })} title="Isentar (sem valor pago)">
                          <Ban size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>

      {generateOpen && (
        <GenerateInstallmentDialog commitmentId={commitment.id} onClose={() => setGenerateOpen(false)} onGenerated={reload} />
      )}
      {exemption && (
        <InstallmentExemptionDialog
          installmentId={exemption.installmentId}
          status={exemption.status}
          onClose={() => setExemption(null)}
          onSaved={reload}
        />
      )}
    </Dialog>
  );
}

function InstallmentExemptionDialog({
  installmentId,
  status,
  onClose,
  onSaved,
}: {
  installmentId: string;
  status: "cancelado" | "isento";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!reason.trim()) {
      toast.error("Informe a justificativa da alteração.");
      return;
    }
    setSaving(true);
    const { error } = await setMissionsInstallmentExemption({
      installment_id: installmentId,
      status,
      notes: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(`Não foi possível atualizar a parcela: ${error}`);
      return;
    }
    toast.success("Parcela atualizada com justificativa.");
    onClose();
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Justificar isenção da parcela</DialogTitle></DialogHeader>
        <FormTextareaLabeled
          label="Justificativa"
          value={reason}
          onChange={setReason}
          required
          placeholder="Explique por que esta parcela será isenta."
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Confirmar isenção"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateInstallmentDialog({ commitmentId, onClose, onGenerated }: {
  commitmentId: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [referenceMonth, setReferenceMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(referenceMonth)) { toast.error("Informe um mês de referência válido."); return; }
    setSaving(true);
    const { error } = await generateMissionsCommitmentInstallment({
      commitment_id: commitmentId,
      reference_month: referenceMonth,
      due_date: dueDate,
      expected_amount: amount ? Number(amount) : undefined,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível gerar a parcela: ${error}`); return; }
    toast.success("Parcela prevista gerada.");
    onClose();
    onGenerated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerar parcela prevista</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled
            label="Mês de referência"
            type="month"
            value={referenceMonth}
            onChange={(value) => {
              setReferenceMonth(value);
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
                setDueDate(`${value}-${dueDate.slice(-2)}`);
              }
            }}
            required
          />
          <FormInputLabeled label="Vencimento" type="date" value={dueDate} onChange={setDueDate} required />
          <FormInputLabeled label="Valor previsto (opcional — usa o valor do compromisso se vazio)" type="number" min={0.01} step="0.01" value={amount} onChange={setAmount} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Gerando…" : "Gerar parcela"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
