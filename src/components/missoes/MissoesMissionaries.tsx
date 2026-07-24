/**
 * Missionários (OPERAÇÃO 4) — traduz "Missionários" do WinTechi. Vínculo
 * obrigatório com public.members (nunca uma segunda identidade humana),
 * máquina de estados validada pela RPC (candidato → em_preparação → ativo →
 * em_licença/retornado → encerrado), e separação clara entre informações
 * públicas (esta tela) e confidenciais (aba própria, exige
 * missions.confidential — nunca aberta por padrão).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Send, ShieldAlert, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import {
  loadMissionsMissionaries, createMissionsMissionary, updateMissionsMissionaryStatus,
  updateMissionsMissionaryProfile, loadMissionsMissionaryConfidentialInfo,
  upsertMissionsMissionaryConfidentialInfo, getMissionsMemberLabels,
  type MissionsMissionaryRow, type MissionsMemberLabel,
} from "@/lib/missions/service";
import {
  MISSIONS_MISSIONARY_STATUSES, MISSIONS_MISSIONARY_STATUS_LABELS, type MissionsMissionaryStatus,
} from "@/lib/missions/constants";
import { isValidMissionaryStatusTransition, isMissionaryClosed } from "@/lib/missions/rules";
import { FormInputLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./missoesFormHelpers";
import { MissoesMemberPicker } from "./MissoesMemberPicker";

const STATUS_TONE: Record<MissionsMissionaryStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  candidato: "neutral",
  em_preparacao: "info",
  ativo: "success",
  em_licenca: "warning",
  retornado: "info",
  encerrado: "neutral",
};

export function MissoesMissionaries({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("missions.manage");
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missionaries, setMissionaries] = useState<MissionsMissionaryRow[]>([]);
  const [memberLabels, setMemberLabels] = useState<Map<string, MissionsMemberLabel>>(new Map());
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<MissionsMissionaryRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await loadMissionsMissionaries(organizationId);
    if (res.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    if (res.error) {
      setLoadError(res.error.message);
      setLoading(false);
      return;
    }
    setMissionaries(res.rows);
    setModuleUnavailable(false);
    const memberIds = [...new Set(res.rows.map((m) => m.member_id))];
    if (memberIds.length > 0) {
      const labels = await getMissionsMemberLabels(organizationId, memberIds);
      setMemberLabels(new Map(labels.rows.map((m) => [m.id, m])));
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    setSelected((current) => (
      current ? missionaries.find((missionary) => missionary.id === current.id) ?? null : null
    ));
  }, [missionaries]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando missionários…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Missões aguardando aplicação das migrations" description="A tabela missions_missionaries ainda não existe neste ambiente." />;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os missionários. {loadError}
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
          <h2 className="text-lg font-serif flex items-center gap-2"><Send size={18} /> Missionários</h2>
          <p className="text-sm text-muted-foreground">
            Cada missionário é sempre uma pessoa já cadastrada na Secretaria. A situação segue uma sequência
            validada: candidato → em preparação → ativo → em licença/retornado → encerrado.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={!canManage}
          title={!canManage ? "Exige missions.manage" : undefined}
        >
          <Plus size={16} className="mr-1.5" /> Novo missionário
        </Button>
      </div>

      {missionaries.length === 0 ? (
        <EmptyState
          title="Nenhum missionário cadastrado ainda"
          description="Busque um membro já cadastrado na Secretaria para registrar sua candidatura missionária."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {missionaries.map((m) => (
            <Card key={m.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelected(m)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium truncate">{memberLabel(m.member_id)}</p>
                  <StatusPill label={MISSIONS_MISSIONARY_STATUS_LABELS[m.status as MissionsMissionaryStatus]} tone={STATUS_TONE[m.status as MissionsMissionaryStatus]} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[m.field_city, m.field_state, m.field_country].filter(Boolean).join(", ") || "Campo de atuação não informado"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateMissionaryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        onCreated={reload}
      />

      {selected && (
        <MissionaryDetailDialog
          missionary={selected}
          memberName={memberLabel(selected.member_id)}
          organizationId={organizationId}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function CreateMissionaryDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState("");
  const [fieldCountry, setFieldCountry] = useState("");
  const [fieldState, setFieldState] = useState("");
  const [fieldCity, setFieldCity] = useState("");
  const [fieldRegion, setFieldRegion] = useState("");
  const [fieldDescription, setFieldDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setMemberId(null); setMemberLabel(""); setFieldCountry(""); setFieldState(""); setFieldCity("");
    setFieldRegion(""); setFieldDescription("");
  };

  const handleSave = async () => {
    if (!memberId) { toast.error("Busque e selecione a pessoa que será cadastrada como missionário."); return; }
    setSaving(true);
    const { error } = await createMissionsMissionary({
      member_id: memberId,
      organization_id: organizationId,
      field_country: fieldCountry.trim() || null,
      field_state: fieldState.trim() || null,
      field_city: fieldCity.trim() || null,
      field_region: fieldRegion.trim() || null,
      field_description: fieldDescription.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível cadastrar o missionário: ${error}`); return; }
    toast.success("Missionário cadastrado como candidato. Acompanhe a preparação na tela de detalhe.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo missionário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!memberId ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Pessoa (obrigatório) *</p>
              <MissoesMemberPicker organizationId={organizationId} onSelect={(m) => { setMemberId(m.id); setMemberLabel(m.known_name || m.full_name); }} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/60">
              <p className="text-sm font-medium">{memberLabel}</p>
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setMemberId(null); setMemberLabel(""); }}>Trocar</button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="País de atuação" value={fieldCountry} onChange={setFieldCountry} placeholder="Ex.: Brasil" />
            <FormInputLabeled label="Estado" value={fieldState} onChange={setFieldState} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Cidade" value={fieldCity} onChange={setFieldCity} />
            <FormInputLabeled label="Região/campo" value={fieldRegion} onChange={setFieldRegion} placeholder="Ex.: Amazônia" />
          </div>
          <FormTextareaLabeled label="Descrição do campo (opcional)" value={fieldDescription} onChange={setFieldDescription} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Cadastrar missionário"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MissionaryDetailDialog({ missionary, memberName, organizationId, canManage, onClose, onChanged }: {
  missionary: MissionsMissionaryRow;
  memberName: string;
  organizationId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { hasCapability } = useRole();
  const canViewConfidential = hasCapability("missions.confidential");
  const [tab, setTab] = useState<"perfil" | "confidencial">("perfil");
  const [saving, setSaving] = useState(false);
  const [fieldCountry, setFieldCountry] = useState(missionary.field_country ?? "");
  const [fieldState, setFieldState] = useState(missionary.field_state ?? "");
  const [fieldCity, setFieldCity] = useState(missionary.field_city ?? "");
  const [fieldRegion, setFieldRegion] = useState(missionary.field_region ?? "");
  const [fieldDescription, setFieldDescription] = useState(missionary.field_description ?? "");
  const [publicNotes, setPublicNotes] = useState(missionary.public_notes ?? "");

  const currentStatus = missionary.status as MissionsMissionaryStatus;
  const closed = isMissionaryClosed(currentStatus);
  const nextOptions = MISSIONS_MISSIONARY_STATUSES.filter(
    (s) => s !== currentStatus && isValidMissionaryStatusTransition(currentStatus, s),
  );

  const handleTransition = async (status: MissionsMissionaryStatus) => {
    setSaving(true);
    const { error } = await updateMissionsMissionaryStatus({ missionary_id: missionary.id, status });
    setSaving(false);
    if (error) { toast.error(`Não foi possível mudar a situação: ${error}`); return; }
    toast.success(`Situação atualizada para: ${MISSIONS_MISSIONARY_STATUS_LABELS[status]}`);
    onChanged();
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateMissionsMissionaryProfile({
      missionary_id: missionary.id,
      field_country: fieldCountry.trim() || null,
      field_state: fieldState.trim() || null,
      field_city: fieldCity.trim() || null,
      field_region: fieldRegion.trim() || null,
      field_description: fieldDescription.trim() || null,
      public_notes: publicNotes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível salvar o perfil: ${error}`); return; }
    toast.success("Perfil do missionário atualizado.");
    onChanged();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{memberName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <StatusPill label={MISSIONS_MISSIONARY_STATUS_LABELS[currentStatus]} tone={STATUS_TONE[currentStatus]} />
            {closed && <span className="text-xs text-muted-foreground">Situação encerrada — histórico preservado.</span>}
          </div>

          {canManage && nextOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {nextOptions.map((status) => (
                <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => handleTransition(status)}>
                  {MISSIONS_MISSIONARY_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          )}

          <div className="flex gap-1.5 border-b border-border pb-2">
            <button
              type="button"
              onClick={() => setTab("perfil")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "perfil" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Perfil público
            </button>
            <button
              type="button"
              onClick={() => setTab("confidencial")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${tab === "confidencial" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <Lock size={12} /> Confidencial
            </button>
          </div>

          {tab === "perfil" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormInputLabeled label="País de atuação" value={fieldCountry} onChange={setFieldCountry} />
                <FormInputLabeled label="Estado" value={fieldState} onChange={setFieldState} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormInputLabeled label="Cidade" value={fieldCity} onChange={setFieldCity} />
                <FormInputLabeled label="Região/campo" value={fieldRegion} onChange={setFieldRegion} />
              </div>
              <FormTextareaLabeled label="Descrição do campo" value={fieldDescription} onChange={setFieldDescription} />
              <FormTextareaLabeled label="Observações públicas" value={publicNotes} onChange={setPublicNotes} />
              {canManage && (
                <Button size="sm" onClick={handleSaveProfile} disabled={saving}>{saving ? "Salvando…" : "Salvar perfil"}</Button>
              )}
            </div>
          ) : (
            <ConfidentialInfoPanel missionaryId={missionary.id} canView={canViewConfidential} canManage={canManage && canViewConfidential} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfidentialInfoPanel({ missionaryId, canView, canManage }: {
  missionaryId: string;
  canView: boolean;
  canManage: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalDocument, setPersonalDocument] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [healthNotes, setHealthNotes] = useState("");
  const [confidentialNotes, setConfidentialNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    let cancelled = false;
    loadMissionsMissionaryConfidentialInfo(missionaryId).then((res) => {
      if (cancelled) return;
      if (res.error) { setError(res.error); setLoading(false); return; }
      if (res.row) {
        setPersonalDocument(res.row.personal_document ?? "");
        setEmergencyName(res.row.emergency_contact_name ?? "");
        setEmergencyPhone(res.row.emergency_contact_phone ?? "");
        setHealthNotes(res.row.health_notes ?? "");
        setConfidentialNotes(res.row.confidential_notes ?? "");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [missionaryId, canView]);

  if (!canView) {
    return (
      <EmptyState
        title="Sem acesso a informações confidenciais"
        description="Documento pessoal, contato de emergência e observações confidenciais exigem a capability missions.confidential, concedida apenas a quem realmente precisa dessas informações."
      />
    );
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="animate-spin" size={14} /> Carregando informações confidenciais…</div>;
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar as informações confidenciais. {error}
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    const { error: saveError } = await upsertMissionsMissionaryConfidentialInfo({
      missionary_id: missionaryId,
      personal_document: personalDocument.trim() || null,
      emergency_contact_name: emergencyName.trim() || null,
      emergency_contact_phone: emergencyPhone.trim() || null,
      health_notes: healthNotes.trim() || null,
      confidential_notes: confidentialNotes.trim() || null,
    });
    setSaving(false);
    if (saveError) { toast.error(`Não foi possível salvar: ${saveError}`); return; }
    toast.success("Informações confidenciais atualizadas.");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        <p className="text-xs">Informações restritas — visíveis apenas para quem possui missions.confidential.</p>
      </div>
      <FormInputLabeled label="Documento pessoal" value={personalDocument} onChange={setPersonalDocument} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormInputLabeled label="Contato de emergência — nome" value={emergencyName} onChange={setEmergencyName} />
        <FormInputLabeled label="Contato de emergência — telefone" value={emergencyPhone} onChange={setEmergencyPhone} />
      </div>
      <FormTextareaLabeled label="Observações de saúde" value={healthNotes} onChange={setHealthNotes} />
      <FormTextareaLabeled label="Observações confidenciais" value={confidentialNotes} onChange={setConfidentialNotes} />
      {canManage && (
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar informações confidenciais"}</Button>
      )}
    </div>
  );
}
