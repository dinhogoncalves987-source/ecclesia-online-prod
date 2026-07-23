/**
 * Currículo (OPERAÇÃO 3) — traduz "Instituto Teológico", "Núcleos de
 * Estudos", "Unidades de Estudos/Livros/Matérias" e "Tipos de Cursos" do
 * WinTechi para o modelo moderno: theology_institutes, theology_study_centers,
 * theology_subjects, theology_programs e a matriz curricular
 * (theology_curriculum_items) que liga programas a matérias.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Landmark, BookOpen, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  loadTheologyInstitutes, createTheologyInstitute, updateTheologyInstitute,
  loadTheologyStudyCenters, createTheologyStudyCenter,
  loadTheologySubjects, createTheologySubject,
  loadTheologyPrograms, createTheologyProgram, updateTheologyProgram, updateTheologyProgramStatus,
  loadTheologyCurriculumItems, createTheologyCurriculumItem, reorderTheologyCurriculumItems,
  type TheologyInstituteRow, type TheologyStudyCenterRow, type TheologySubjectRow,
  type TheologyProgramRow, type TheologyCurriculumItemRow,
} from "@/lib/theology/service";
import {
  THEOLOGY_PROGRAM_STATUS_LABELS, THEOLOGY_STUDY_CENTER_TYPES, THEOLOGY_STUDY_CENTER_TYPE_LABELS,
  type TheologyProgramStatus, type TheologyStudyCenterType,
} from "@/lib/theology/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, FormCheckboxLabeled, StatusPill, EmptyState } from "./teologiaFormHelpers";

const PROGRAM_STATUS_TONE: Record<TheologyProgramStatus, "neutral" | "success" | "warning"> = {
  rascunho: "neutral",
  ativo: "success",
  arquivado: "warning",
};

export function TeologiaCurriculum({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [institutes, setInstitutes] = useState<TheologyInstituteRow[]>([]);
  const [studyCenters, setStudyCenters] = useState<TheologyStudyCenterRow[]>([]);
  const [subjects, setSubjects] = useState<TheologySubjectRow[]>([]);
  const [programs, setPrograms] = useState<TheologyProgramRow[]>([]);

  const [instituteDialogOpen, setInstituteDialogOpen] = useState(false);
  const [centerDialogOpen, setCenterDialogOpen] = useState(false);
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [programDialogOpen, setProgramDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<TheologyProgramRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [institutesRes, centersRes, subjectsRes, programsRes] = await Promise.all([
      loadTheologyInstitutes(organizationId),
      loadTheologyStudyCenters(organizationId),
      loadTheologySubjects(organizationId),
      loadTheologyPrograms(organizationId),
    ]);
    if (institutesRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoadError(null);
      setLoading(false);
      return;
    }
    const firstError = [institutesRes.error, centersRes.error, subjectsRes.error, programsRes.error]
      .find(Boolean);
    setLoadError(firstError?.message ?? null);
    setInstitutes(institutesRes.rows);
    setStudyCenters(centersRes.rows);
    setSubjects(subjectsRes.rows);
    setPrograms(programsRes.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando currículo…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Teologia aguardando aplicação das migrations" description="A tabela theology_institutes ainda não existe neste ambiente." />;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar o currículo de Teologia. {loadError}
      </div>
    );
  }

  const institute = institutes[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Instituto Teológico */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif flex items-center gap-2"><Landmark size={18} /> Instituto Teológico</h2>
          {!institute && <Button size="sm" onClick={() => setInstituteDialogOpen(true)}><Plus size={16} className="mr-1.5" /> Configurar instituto</Button>}
        </div>
        {institute ? (
          <Card>
            <CardContent className="p-4 space-y-1">
              <p className="font-medium">{institute.name}</p>
              <p className="text-xs text-muted-foreground">
                Frequência mínima padrão: {institute.default_minimum_attendance_percentage}% · Nota mínima padrão: {institute.default_minimum_passing_score}
              </p>
              {institute.description && <p className="text-sm text-muted-foreground">{institute.description}</p>}
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Nenhum instituto configurado ainda" description="Configure o Instituto Teológico da sua organização antes de cadastrar núcleos e programas." />
        )}
      </div>

      {/* Núcleos de Estudos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Núcleos de Estudos ({studyCenters.length})</h3>
          <Button size="sm" variant="outline" onClick={() => setCenterDialogOpen(true)}><Plus size={16} className="mr-1.5" /> Novo núcleo</Button>
        </div>
        {studyCenters.length === 0 ? (
          <EmptyState title="Nenhum núcleo cadastrado" description="Um núcleo é um ponto operacional/acadêmico (sala, polo, sede, on-line) — não uma nova igreja." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {studyCenters.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-1">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{THEOLOGY_STUDY_CENTER_TYPE_LABELS[c.center_type as TheologyStudyCenterType]}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Matérias/Unidades curriculares */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Matérias e Unidades de Estudo ({subjects.length})</h3>
          <Button size="sm" variant="outline" onClick={() => setSubjectDialogOpen(true)}><Plus size={16} className="mr-1.5" /> Nova matéria</Button>
        </div>
        {subjects.length === 0 ? (
          <EmptyState title="Nenhuma matéria cadastrada" description="Cadastre as matérias/unidades de estudo antes de montar a matriz curricular de um programa." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjects.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-1">
                  <p className="font-medium truncate">{s.name}</p>
                  {s.workload_hours !== null && <p className="text-xs text-muted-foreground">{s.workload_hours}h</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Programas / Tipos de curso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Programas / Tipos de Curso ({programs.length})</h3>
          <Button size="sm" onClick={() => setProgramDialogOpen(true)} disabled={subjects.length === 0}>
            <Plus size={16} className="mr-1.5" /> Novo programa
          </Button>
        </div>
        {subjects.length === 0 && <p className="text-xs text-muted-foreground">Cadastre ao menos uma matéria antes de criar um programa.</p>}
        {programs.length === 0 ? (
          <EmptyState title="Nenhum programa cadastrado ainda" description="Crie o primeiro programa (ex.: Curso Básico de Teologia) e monte sua matriz curricular." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {programs.map((p) => (
              <Card key={p.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedProgram(p)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate flex items-center gap-1.5"><BookOpen size={14} className="text-muted-foreground shrink-0" /> {p.name}</p>
                    </div>
                    <StatusPill label={THEOLOGY_PROGRAM_STATUS_LABELS[p.status as TheologyProgramStatus]} tone={PROGRAM_STATUS_TONE[p.status as TheologyProgramStatus]} />
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    {p.requires_attendance && <span>Frequência mín. {p.minimum_attendance_percentage}%</span>}
                    {p.requires_assessment && p.minimum_passing_score !== null && <span>Nota mín. {p.minimum_passing_score}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <InstituteDialog open={instituteDialogOpen} onOpenChange={setInstituteDialogOpen} organizationId={organizationId} institute={institute} onSaved={reload} />
      <StudyCenterDialog open={centerDialogOpen} onOpenChange={setCenterDialogOpen} organizationId={organizationId} institute={institute} onCreated={reload} />
      <SubjectDialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen} organizationId={organizationId} onCreated={reload} />
      <ProgramDialog open={programDialogOpen} onOpenChange={setProgramDialogOpen} organizationId={organizationId} institute={institute} onCreated={reload} />

      {selectedProgram && (
        <ProgramCurriculumDialog
          program={selectedProgram}
          subjects={subjects}
          onClose={() => setSelectedProgram(null)}
          onProgramUpdated={(updated) => {
            setPrograms((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedProgram(updated);
          }}
        />
      )}
    </div>
  );
}

function InstituteDialog({ open, onOpenChange, organizationId, institute, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  institute: TheologyInstituteRow | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(institute?.name ?? "");
  const [description, setDescription] = useState(institute?.description ?? "");
  const [minAttendance, setMinAttendance] = useState(String(institute?.default_minimum_attendance_percentage ?? 75));
  const [minScore, setMinScore] = useState(String(institute?.default_minimum_passing_score ?? 7));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do instituto."); return; }
    setSaving(true);
    const result = institute
      ? await updateTheologyInstitute(institute.id, {
          name: name.trim(),
          description: description.trim() || null,
          default_minimum_attendance_percentage: Number(minAttendance) || 75,
          default_minimum_passing_score: Number(minScore) || 7,
        })
      : await createTheologyInstitute({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || null,
          default_minimum_attendance_percentage: Number(minAttendance) || 75,
          default_minimum_passing_score: Number(minScore) || 7,
        });
    setSaving(false);
    if (result.error) { toast.error(`Não foi possível salvar o instituto: ${result.error}`); return; }
    toast.success("Instituto salvo.");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{institute ? "Editar instituto" : "Configurar Instituto Teológico"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome" value={name} onChange={setName} required placeholder="Ex.: Instituto Teológico da Assembleia de Deus" />
          <FormTextareaLabeled label="Descrição (opcional)" value={description} onChange={setDescription} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Frequência mínima padrão (%)" type="number" min={0} max={100} value={minAttendance} onChange={setMinAttendance} />
            <FormInputLabeled label="Nota mínima padrão (0–10)" type="number" min={0} max={10} step="0.01" value={minScore} onChange={setMinScore} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudyCenterDialog({ open, onOpenChange, organizationId, institute, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  institute: TheologyInstituteRow | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [centerType, setCenterType] = useState<TheologyStudyCenterType>("nucleo");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do núcleo."); return; }
    setSaving(true);
    const { error } = await createTheologyStudyCenter({
      organization_id: organizationId,
      institute_id: institute?.id ?? null,
      name: name.trim(),
      center_type: centerType,
      address_text: address.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o núcleo: ${error}`); return; }
    toast.success("Núcleo criado.");
    setName(""); setAddress("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo núcleo de estudos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome" value={name} onChange={setName} required placeholder="Ex.: Núcleo Zona Norte" />
          <FormSelectLabeled label="Tipo" value={centerType} onChange={(v) => setCenterType(v as TheologyStudyCenterType)} options={THEOLOGY_STUDY_CENTER_TYPES.map((t) => ({ value: t, label: THEOLOGY_STUDY_CENTER_TYPE_LABELS[t] }))} />
          <FormInputLabeled label="Endereço ou link (opcional)" value={address} onChange={setAddress} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar núcleo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubjectDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [workloadHours, setWorkloadHours] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome da matéria."); return; }
    setSaving(true);
    const { error } = await createTheologySubject({
      organization_id: organizationId,
      code: code.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      workload_hours: workloadHours ? Number(workloadHours) : null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar a matéria: ${error}`); return; }
    toast.success("Matéria criada.");
    setName(""); setCode(""); setDescription(""); setWorkloadHours("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova matéria / unidade de estudo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome" value={name} onChange={setName} required placeholder="Ex.: Introdução à Teologia Sistemática" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Código (opcional)" value={code} onChange={setCode} />
            <FormInputLabeled label="Carga horária, em horas (opcional)" type="number" min={0} value={workloadHours} onChange={setWorkloadHours} />
          </div>
          <FormTextareaLabeled label="Descrição / material (opcional)" value={description} onChange={setDescription} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar matéria"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgramDialog({ open, onOpenChange, organizationId, institute, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  institute: TheologyInstituteRow | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requiresAttendance, setRequiresAttendance] = useState(true);
  const [minAttendance, setMinAttendance] = useState(String(institute?.default_minimum_attendance_percentage ?? 75));
  const [requiresAssessment, setRequiresAssessment] = useState(true);
  const [minScore, setMinScore] = useState(String(institute?.default_minimum_passing_score ?? 7));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do programa."); return; }
    const parsedScore = Number(minScore);
    if (requiresAssessment && (!minScore.trim() || !Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 10)) {
      toast.error("Informe a nota mínima entre 0 e 10.");
      return;
    }
    setSaving(true);
    const { error } = await createTheologyProgram({
      organization_id: organizationId,
      institute_id: institute?.id ?? null,
      name: name.trim(),
      description: description.trim() || null,
      requires_attendance: requiresAttendance,
      minimum_attendance_percentage: requiresAttendance ? Number(minAttendance) || 75 : 75,
      requires_assessment: requiresAssessment,
      minimum_passing_score: requiresAssessment ? parsedScore : null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o programa: ${error}`); return; }
    toast.success("Programa criado como rascunho. Monte a matriz curricular e depois ative-o.");
    setName(""); setDescription("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo programa de Teologia</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome do programa" value={name} onChange={setName} required placeholder="Ex.: Curso Básico de Teologia" />
          <FormTextareaLabeled label="Descrição / objetivos" value={description} onChange={setDescription} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <FormCheckboxLabeled label="Exige frequência mínima" checked={requiresAttendance} onChange={setRequiresAttendance} />
            {requiresAttendance && <FormInputLabeled label="% mínimo de frequência" type="number" min={0} value={minAttendance} onChange={setMinAttendance} />}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <FormCheckboxLabeled label="Exige avaliação" checked={requiresAssessment} onChange={setRequiresAssessment} />
            {requiresAssessment && <FormInputLabeled label="Nota mínima (escala 0–10)" type="number" min={0} max={10} step="0.01" value={minScore} onChange={setMinScore} required />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar programa"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgramCurriculumDialog({ program, subjects, onClose, onProgramUpdated }: {
  program: TheologyProgramRow;
  subjects: TheologySubjectRow[];
  onClose: () => void;
  onProgramUpdated: (program: TheologyProgramRow) => void;
}) {
  const [items, setItems] = useState<TheologyCurriculumItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectId, setSubjectId] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [adding, setAdding] = useState(false);

  const reloadItems = useCallback(async () => {
    setLoading(true);
    const { rows } = await loadTheologyCurriculumItems(program.id);
    setItems(rows);
    setLoading(false);
  }, [program.id]);

  useEffect(() => { void reloadItems(); }, [reloadItems]);

  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const usedSubjectIds = new Set(items.map((i) => i.subject_id));
  const availableSubjects = subjects.filter((s) => !usedSubjectIds.has(s.id) && s.status === "ativa");
  const curriculumLocked = program.status !== "rascunho";

  const handleAddItem = async () => {
    if (!subjectId) return;
    setAdding(true);
    const nextSequence = (items[items.length - 1]?.sequence_number ?? 0) + 1;
    const { error } = await createTheologyCurriculumItem({
      program_id: program.id,
      subject_id: subjectId,
      sequence_number: nextSequence,
      is_mandatory: mandatory,
    });
    setAdding(false);
    if (error) { toast.error(`Não foi possível adicionar a matéria: ${error}`); return; }
    setSubjectId("");
    reloadItems();
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const { error } = await reorderTheologyCurriculumItems(program.id, reordered.map((i) => i.id));
    if (error) { toast.error(`Não foi possível reordenar: ${error}`); return; }
    setItems(reordered);
  };

  const handleActivate = async () => {
    const hasMandatoryActive = items.some((i) => i.is_mandatory && i.status === "ativo");
    if (!hasMandatoryActive) { toast.error("A matriz curricular precisa de ao menos uma matéria obrigatória antes de ativar o programa."); return; }
    const { row, error } = await updateTheologyProgramStatus(program.id, "ativo");
    if (error || !row) { toast.error(`Não foi possível ativar o programa: ${error}`); return; }
    toast.success("Programa ativado — já pode ser usado em novas turmas.");
    onProgramUpdated(row);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen size={18} /> {program.name} — matriz curricular</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {program.status === "rascunho" && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary/50">
              <p className="text-sm text-muted-foreground">
                Programa em {THEOLOGY_PROGRAM_STATUS_LABELS[program.status as TheologyProgramStatus].toLowerCase()}. Ative-o para poder criar turmas.
              </p>
              <Button size="sm" variant="outline" onClick={handleActivate}>Ativar</Button>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">Matérias da matriz ({items.length})</p>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
            ) : items.length === 0 ? (
              <EmptyState title="Nenhuma matéria na matriz ainda" description="Adicione a primeira matéria abaixo." />
            ) : (
              <div className="space-y-1.5">
                {items.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border/60">
                    <GripVertical size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground w-6 shrink-0">{item.sequence_number}.</span>
                    <span className="text-sm flex-1 truncate">{subjectNameById.get(item.subject_id) ?? "Matéria"}</span>
                    {item.is_mandatory && <StatusPill label="Obrigatória" tone="info" />}
                    <div className="flex gap-1 shrink-0">
                      <button type="button" aria-label="Mover para cima" disabled={curriculumLocked || index === 0} onClick={() => moveItem(index, -1)} className="p-1 rounded hover:bg-secondary disabled:opacity-30 text-xs">↑</button>
                      <button type="button" aria-label="Mover para baixo" disabled={curriculumLocked || index === items.length - 1} onClick={() => moveItem(index, 1)} className="p-1 rounded hover:bg-secondary disabled:opacity-30 text-xs">↓</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {curriculumLocked ? (
            <p className="text-xs text-muted-foreground">
              Matriz publicada e bloqueada para preservar o histórico acadêmico. Para uma nova grade, crie uma nova versão do programa.
            </p>
          ) : availableSubjects.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {subjects.length === 0 ? "Cadastre matérias na aba Currículo antes de montar a matriz." : "Todas as matérias ativas já estão na matriz."}
            </p>
          ) : (
            <div className="space-y-2">
              <FormSelectLabeled label="Adicionar matéria" value={subjectId} onChange={setSubjectId} options={availableSubjects.map((s) => ({ value: s.id, label: s.name }))} />
              <FormCheckboxLabeled label="Matéria obrigatória para conclusão do programa" checked={mandatory} onChange={setMandatory} />
              <Button size="sm" onClick={handleAddItem} disabled={adding || !subjectId}><Plus size={16} className="mr-1.5" /> Adicionar à matriz</Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
