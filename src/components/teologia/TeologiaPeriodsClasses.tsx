/**
 * Períodos e Turmas (OPERAÇÃO 3) — traduz "Manutenção de Listas para
 * Frequência e Avaliação" do WinTechi: aqui se cria o período letivo, a
 * turma (a partir de um programa ATIVO) e depois se entra no detalhe da
 * turma (equipe, alunos, ofertas de matéria) em TeologiaClassDetail.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, CalendarRange, Users2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  loadTheologyPeriods, createTheologyPeriod, updateTheologyPeriodStatus,
  loadTheologyClasses, createTheologyClass, loadTheologyPrograms, loadTheologyStudyCenters,
  type TheologyPeriodRow, type TheologyClassRow, type TheologyProgramRow, type TheologyStudyCenterRow,
} from "@/lib/theology/service";
import {
  THEOLOGY_PERIOD_STATUSES, THEOLOGY_PERIOD_STATUS_LABELS,
  THEOLOGY_CLASS_STATUS_LABELS, THEOLOGY_MODALITIES, THEOLOGY_MODALITY_LABELS,
  type TheologyPeriodStatus, type TheologyClassStatus, type TheologyModality,
} from "@/lib/theology/constants";
import { isValidPeriodStatusTransition } from "@/lib/theology/rules";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./teologiaFormHelpers";
import { TeologiaClassDetail } from "./TeologiaClassDetail";

const PERIOD_STATUS_TONE: Record<TheologyPeriodStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  planejamento: "neutral",
  inscricoes_abertas: "info",
  em_andamento: "success",
  encerrado: "warning",
  cancelado: "danger",
  arquivado: "neutral",
};

const CLASS_STATUS_TONE: Record<TheologyClassStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  planejamento: "neutral",
  inscricoes_abertas: "info",
  em_andamento: "success",
  concluida: "success",
  cancelada: "danger",
  arquivada: "neutral",
};

export function TeologiaPeriodsClasses({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [periods, setPeriods] = useState<TheologyPeriodRow[]>([]);
  const [classes, setClasses] = useState<TheologyClassRow[]>([]);
  const [programs, setPrograms] = useState<TheologyProgramRow[]>([]);
  const [studyCenters, setStudyCenters] = useState<TheologyStudyCenterRow[]>([]);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | "all">("all");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [periodsRes, classesRes, programsRes, centersRes] = await Promise.all([
      loadTheologyPeriods(organizationId),
      loadTheologyClasses(organizationId),
      loadTheologyPrograms(organizationId),
      loadTheologyStudyCenters(organizationId),
    ]);
    if (periodsRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setPeriods(periodsRes.rows);
    setClasses(classesRes.rows);
    setPrograms(programsRes.rows);
    setStudyCenters(centersRes.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando períodos e turmas…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Teologia aguardando aplicação das migrations" description="A tabela theology_periods ainda não existe neste ambiente." />;
  }

  const activePrograms = programs.filter((p) => p.status === "ativo");
  const periodNameById = new Map(periods.map((p) => [p.id, p.name]));
  const visibleClasses = selectedPeriodId === "all" ? classes : classes.filter((c) => c.period_id === selectedPeriodId);

  return (
    <div className="space-y-6">
      {/* Períodos letivos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif flex items-center gap-2"><CalendarRange size={18} /> Períodos letivos</h2>
          <Button size="sm" variant="outline" onClick={() => setPeriodDialogOpen(true)}><Plus size={16} className="mr-1.5" /> Novo período</Button>
        </div>
        {periods.length === 0 ? (
          <EmptyState title="Nenhum período letivo criado ainda" description="Crie o primeiro período letivo para poder abrir turmas." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {periods.map((period) => (
              <PeriodCard key={period.id} period={period} onChanged={reload} />
            ))}
          </div>
        )}
      </div>

      {/* Turmas */}
      <div className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-serif flex items-center gap-2"><Users2 size={18} /> Turmas</h2>
          <div className="flex flex-wrap items-end gap-2">
            <FormSelectLabeled
              label="Filtrar por período"
              value={selectedPeriodId === "all" ? "" : selectedPeriodId}
              onChange={(v) => setSelectedPeriodId(v || "all")}
              options={periods.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Todos os períodos"
            />
            <Button size="sm" onClick={() => setClassDialogOpen(true)} disabled={activePrograms.length === 0 || periods.length === 0}>
              <Plus size={16} className="mr-1.5" /> Nova turma
            </Button>
          </div>
        </div>

        {periods.length === 0 && <p className="text-xs text-muted-foreground">Crie um período letivo antes de criar uma turma.</p>}
        {periods.length > 0 && activePrograms.length === 0 && (
          <p className="text-xs text-muted-foreground">Ative um programa na aba “Currículo” antes de criar uma turma.</p>
        )}

        {visibleClasses.length === 0 ? (
          <EmptyState title="Nenhuma turma nesta seleção" description="Crie uma turma a partir de um programa ativo e um período letivo." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleClasses.map((cls) => (
              <Card key={cls.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedClassId(cls.id)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{cls.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{periodNameById.get(cls.period_id) ?? "Período"}</p>
                    </div>
                    <StatusPill label={THEOLOGY_CLASS_STATUS_LABELS[cls.status as TheologyClassStatus]} tone={CLASS_STATUS_TONE[cls.status as TheologyClassStatus]} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cls.capacity ? `Capacidade: ${cls.capacity}` : "Sem limite de capacidade"} · {THEOLOGY_MODALITY_LABELS[cls.modality as TheologyModality]}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreatePeriodDialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen} organizationId={organizationId} onCreated={reload} />
      <CreateClassDialog
        open={classDialogOpen}
        onOpenChange={setClassDialogOpen}
        organizationId={organizationId}
        periods={periods}
        programs={activePrograms}
        studyCenters={studyCenters}
        onCreated={reload}
      />

      {selectedClassId && (
        <TeologiaClassDetail
          classId={selectedClassId}
          organizationId={organizationId}
          onClose={() => setSelectedClassId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function PeriodCard({ period, onChanged }: { period: TheologyPeriodRow; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const currentStatus = period.status as TheologyPeriodStatus;
  const nextOptions = THEOLOGY_PERIOD_STATUSES.filter((s) => s !== currentStatus && isValidPeriodStatusTransition(currentStatus, s));

  const handleTransition = async (status: TheologyPeriodStatus) => {
    setSaving(true);
    const { error } = await updateTheologyPeriodStatus(period.id, status);
    setSaving(false);
    if (error) { toast.error(`Não foi possível mudar o status do período: ${error}`); return; }
    toast.success(`Período agora está: ${THEOLOGY_PERIOD_STATUS_LABELS[status]}`);
    onChanged();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium truncate">{period.name}</p>
          <StatusPill label={THEOLOGY_PERIOD_STATUS_LABELS[currentStatus]} tone={PERIOD_STATUS_TONE[currentStatus]} />
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(`${period.start_date}T00:00:00`).toLocaleDateString("pt-BR")}
          {period.end_date ? ` – ${new Date(`${period.end_date}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
        </p>
        {nextOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {nextOptions.map((status) => (
              <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => handleTransition(status)}>
                {THEOLOGY_PERIOD_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreatePeriodDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do período."); return; }
    setSaving(true);
    const { error } = await createTheologyPeriod({
      organization_id: organizationId,
      name: name.trim(),
      start_date: startDate,
      end_date: endDate || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o período: ${error}`); return; }
    toast.success("Período letivo criado em planejamento.");
    setName(""); setEndDate(""); setNotes("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo período letivo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome do período" value={name} onChange={setName} required placeholder="Ex.: 2026.2" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Início" type="date" value={startDate} onChange={setStartDate} required />
            <FormInputLabeled label="Término previsto (opcional)" type="date" value={endDate} onChange={setEndDate} />
          </div>
          <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar período"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateClassDialog({ open, onOpenChange, organizationId, periods, programs, studyCenters, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  periods: TheologyPeriodRow[];
  programs: TheologyProgramRow[];
  studyCenters: TheologyStudyCenterRow[];
  onCreated: () => void;
}) {
  const [periodId, setPeriodId] = useState("");
  const [programId, setProgramId] = useState("");
  const [studyCenterId, setStudyCenterId] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [modality, setModality] = useState<TheologyModality>("presencial");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPeriodId(""); setProgramId(""); setStudyCenterId(""); setName(""); setCapacity(""); setModality("presencial"); setNotes("");
  };

  const handleSave = async () => {
    if (!periodId) { toast.error("Selecione o período letivo."); return; }
    if (!programId) { toast.error("Selecione o programa."); return; }
    if (!name.trim()) { toast.error("Informe o nome da turma."); return; }
    setSaving(true);
    const { error } = await createTheologyClass({
      period_id: periodId,
      program_id: programId,
      organization_id: organizationId,
      study_center_id: studyCenterId || null,
      name: name.trim(),
      capacity: capacity ? Number(capacity) : null,
      modality,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar a turma: ${error}`); return; }
    toast.success("Turma criada em planejamento. Monte a equipe, as ofertas de matéria e depois abra as inscrições.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova turma</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormSelectLabeled label="Período letivo" value={periodId} onChange={setPeriodId} required options={periods.map((p) => ({ value: p.id, label: p.name }))} />
          <FormSelectLabeled label="Programa" value={programId} onChange={setProgramId} required options={programs.map((p) => ({ value: p.id, label: p.name }))} />
          <FormInputLabeled label="Nome da turma" value={name} onChange={setName} required placeholder="Ex.: Turma 2026.2 — Noite" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Capacidade (opcional)" type="number" min={1} value={capacity} onChange={setCapacity} />
            <FormSelectLabeled label="Modalidade" value={modality} onChange={(v) => setModality(v as TheologyModality)} options={THEOLOGY_MODALITIES.map((m) => ({ value: m, label: THEOLOGY_MODALITY_LABELS[m] }))} />
          </div>
          <FormSelectLabeled label="Núcleo de estudos (opcional)" value={studyCenterId} onChange={setStudyCenterId} options={studyCenters.map((c) => ({ value: c.id, label: c.name }))} />
          <FormTextareaLabeled label="Observações (opcional)" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar turma"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
