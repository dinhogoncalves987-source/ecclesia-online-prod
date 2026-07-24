/**
 * Projetos e Ações Missionárias (OPERAÇÃO 4) — traduz "Projetos em Ação" do
 * WinTechi. Cobre responsáveis/coordenadores e missionários relacionados
 * (missions_project_assignments, papel diferencia a função) e pode se
 * associar a uma campanha de arrecadação já existente (ligação
 * especializada, nunca uma segunda estrutura de campanhas).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Compass, UserPlus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import {
  loadMissionsProjects, createMissionsProject, updateMissionsProjectStatus,
  loadMissionsProjectAssignments, assignMissionsProjectMember, endMissionsProjectAssignment,
  getMissionsMemberLabels,
  type MissionsProjectRow, type MissionsProjectAssignmentRow, type MissionsMemberLabel,
} from "@/lib/missions/service";
import {
  MISSIONS_PROJECT_STATUSES, MISSIONS_PROJECT_STATUS_LABELS, type MissionsProjectStatus,
  MISSIONS_PROJECT_ASSIGNMENT_ROLES, MISSIONS_PROJECT_ASSIGNMENT_ROLE_LABELS, type MissionsProjectAssignmentRole,
} from "@/lib/missions/constants";
import { isValidProjectStatusTransition, isProjectClosed } from "@/lib/missions/rules";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./missoesFormHelpers";
import { MissoesMemberPicker } from "./MissoesMemberPicker";

const STATUS_TONE: Record<MissionsProjectStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  rascunho: "neutral",
  planejado: "info",
  ativo: "success",
  suspenso: "warning",
  concluido: "success",
  cancelado: "danger",
  arquivado: "neutral",
};

export function MissoesProjects({ organizationId }: { organizationId: string }) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("missions.manage");
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projects, setProjects] = useState<MissionsProjectRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<MissionsProjectRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await loadMissionsProjects(organizationId);
    if (res.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setLoadError(res.error?.message ?? null);
    setProjects(res.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando projetos…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Missões aguardando aplicação das migrations" description="A tabela missions_projects ainda não existe neste ambiente." />;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar os projetos. {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-serif flex items-center gap-2"><Compass size={18} /> Projetos e ações</h2>
          <p className="text-sm text-muted-foreground">
            Rascunho → planejado → ativo → concluído/cancelado → arquivado. Associe missionários e responsáveis
            depois de criar o projeto.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!canManage} title={!canManage ? "Exige missions.manage" : undefined}>
          <Plus size={16} className="mr-1.5" /> Novo projeto
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState title="Nenhum projeto cadastrado ainda" description="Crie o primeiro projeto ou ação missionária." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelected(p)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium truncate">{p.name}</p>
                  <StatusPill label={MISSIONS_PROJECT_STATUS_LABELS[p.status as MissionsProjectStatus]} tone={STATUS_TONE[p.status as MissionsProjectStatus]} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[p.field_city, p.field_state, p.field_country].filter(Boolean).join(", ") || "Localidade não informada"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organizationId} onCreated={reload} />

      {selected && (
        <ProjectDetailDialog
          project={selected}
          organizationId={organizationId}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function CreateProjectDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [fieldCountry, setFieldCountry] = useState("");
  const [fieldState, setFieldState] = useState("");
  const [fieldCity, setFieldCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setDescription(""); setObjectives(""); setFieldCountry(""); setFieldState("");
    setFieldCity(""); setStartDate(""); setEndDate("");
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do projeto."); return; }
    setSaving(true);
    const { error } = await createMissionsProject({
      organization_id: organizationId,
      name: name.trim(),
      description: description.trim() || null,
      objectives: objectives.trim() || null,
      field_country: fieldCountry.trim() || null,
      field_state: fieldState.trim() || null,
      field_city: fieldCity.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o projeto: ${error}`); return; }
    toast.success("Projeto criado em rascunho. Associe missionários e avance para “planejado” quando estiver pronto.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo projeto missionário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome do projeto" value={name} onChange={setName} required placeholder="Ex.: Missão Amazônia 2027" />
          <FormTextareaLabeled label="Descrição" value={description} onChange={setDescription} />
          <FormTextareaLabeled label="Objetivos" value={objectives} onChange={setObjectives} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormInputLabeled label="País" value={fieldCountry} onChange={setFieldCountry} />
            <FormInputLabeled label="Estado" value={fieldState} onChange={setFieldState} />
            <FormInputLabeled label="Cidade" value={fieldCity} onChange={setFieldCity} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Início previsto" type="date" value={startDate} onChange={setStartDate} />
            <FormInputLabeled label="Término previsto" type="date" value={endDate} onChange={setEndDate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar projeto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDetailDialog({ project, organizationId, canManage, onClose, onChanged }: {
  project: MissionsProjectRow;
  organizationId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<MissionsProjectAssignmentRow[]>([]);
  const [memberLabels, setMemberLabels] = useState<Map<string, MissionsMemberLabel>>(new Map());
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const currentStatus = project.status as MissionsProjectStatus;
  const closed = isProjectClosed(currentStatus);
  const nextOptions = MISSIONS_PROJECT_STATUSES.filter(
    (s) => s !== currentStatus && isValidProjectStatusTransition(currentStatus, s),
  );

  const reloadAssignments = useCallback(async () => {
    setLoadingAssignments(true);
    const res = await loadMissionsProjectAssignments(project.id);
    setAssignments(res.rows);
    setAssignError(res.error?.message ?? null);
    const memberIds = [...new Set(res.rows.map((a) => a.member_id))];
    if (memberIds.length > 0) {
      const labels = await getMissionsMemberLabels(organizationId, memberIds);
      setMemberLabels(new Map(labels.rows.map((m) => [m.id, m])));
    }
    setLoadingAssignments(false);
  }, [project.id, organizationId]);

  useEffect(() => { void reloadAssignments(); }, [reloadAssignments]);

  const handleTransition = async (status: MissionsProjectStatus) => {
    setSaving(true);
    const { error } = await updateMissionsProjectStatus({ project_id: project.id, status });
    setSaving(false);
    if (error) { toast.error(`Não foi possível mudar o status: ${error}`); return; }
    toast.success(`Projeto agora está: ${MISSIONS_PROJECT_STATUS_LABELS[status]}`);
    onChanged();
  };

  const handleEndAssignment = async (assignmentId: string) => {
    const { error } = await endMissionsProjectAssignment(assignmentId);
    if (error) { toast.error(`Não foi possível encerrar o vínculo: ${error}`); return; }
    toast.success("Vínculo encerrado.");
    reloadAssignments();
  };

  const memberLabel = (id: string) => {
    const m = memberLabels.get(id);
    return m ? (m.known_name || m.full_name) : "Membro";
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{project.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <StatusPill label={MISSIONS_PROJECT_STATUS_LABELS[currentStatus]} tone={STATUS_TONE[currentStatus]} />
            {closed && <span className="text-xs text-muted-foreground">Projeto fechado — sem novos vínculos ou lançamentos comuns.</span>}
          </div>

          {canManage && nextOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {nextOptions.map((status) => (
                <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => handleTransition(status)}>
                  {MISSIONS_PROJECT_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          )}

          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Responsáveis e missionários</p>
              {canManage && !closed && (
                <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                  <UserPlus size={14} className="mr-1.5" /> Associar pessoa
                </Button>
              )}
            </div>
            {loadingAssignments ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-3"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
            ) : assignError ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Não foi possível carregar os vínculos. {assignError}
              </div>
            ) : assignments.length === 0 ? (
              <EmptyState title="Nenhuma pessoa associada ainda" description="Associe o(s) missionário(s) e responsáveis deste projeto." />
            ) : (
              <div className="space-y-1.5">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{memberLabel(a.member_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {MISSIONS_PROJECT_ASSIGNMENT_ROLE_LABELS[a.role as MissionsProjectAssignmentRole]}
                      </p>
                    </div>
                    {a.status === "ativo" ? (
                      canManage && (
                        <Button size="sm" variant="ghost" onClick={() => handleEndAssignment(a.id)} title="Encerrar vínculo">
                          <X size={14} />
                        </Button>
                      )
                    ) : (
                      <StatusPill label="Encerrado" tone="neutral" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>

      {assignOpen && (
        <AssignMemberDialog
          projectId={project.id}
          organizationId={organizationId}
          onClose={() => setAssignOpen(false)}
          onAssigned={reloadAssignments}
        />
      )}
    </Dialog>
  );
}

function AssignMemberDialog({ projectId, organizationId, onClose, onAssigned }: {
  projectId: string;
  organizationId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState("");
  const [role, setRole] = useState<MissionsProjectAssignmentRole>("missionario");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!memberId) { toast.error("Busque e selecione a pessoa."); return; }
    setSaving(true);
    const { error } = await assignMissionsProjectMember({ project_id: projectId, member_id: memberId, role });
    setSaving(false);
    if (error) { toast.error(`Não foi possível associar: ${error}`); return; }
    toast.success("Pessoa associada ao projeto.");
    onClose();
    onAssigned();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Associar pessoa ao projeto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!memberId ? (
            <MissoesMemberPicker organizationId={organizationId} onSelect={(m) => { setMemberId(m.id); setMemberLabel(m.known_name || m.full_name); }} />
          ) : (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/60">
              <p className="text-sm font-medium">{memberLabel}</p>
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setMemberId(null); setMemberLabel(""); }}>Trocar</button>
            </div>
          )}
          <FormSelectLabeled
            label="Papel"
            value={role}
            onChange={(v) => setRole(v as MissionsProjectAssignmentRole)}
            options={MISSIONS_PROJECT_ASSIGNMENT_ROLES.map((r) => ({ value: r, label: MISSIONS_PROJECT_ASSIGNMENT_ROLE_LABELS[r] }))}
          />
          {role === "missionario" && (
            <p className="text-xs text-muted-foreground">
              A pessoa precisa já estar cadastrada como missionário (aba “Missionários”) para receber este papel.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Associando…" : "Associar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
