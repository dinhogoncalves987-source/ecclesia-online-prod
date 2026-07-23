/**
 * Cursos e Lições (OPERAÇÃO 2). "Tipos de Curso" + "Lições de Estudo" do
 * WinTechi traduzidos para um catálogo moderno: discipleship_courses
 * (regras de frequência/avaliação/conclusão) + discipleship_lessons
 * (currículo ordenado, reordenável).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, BookOpen, GripVertical, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  loadDiscipleshipCourses, createDiscipleshipCourse, updateDiscipleshipCourse,
  loadDiscipleshipLessons, createDiscipleshipLesson, reorderDiscipleshipLessons,
  loadDiscipleshipDepartments, createDiscipleshipDepartment,
  type DiscipleshipCourseRow, type DiscipleshipLessonRow, type DiscipleshipDepartmentRow,
} from "@/lib/discipleship/service";
import {
  DISCIPLESHIP_COURSE_STATUS_LABELS, type DiscipleshipCourseStatus,
} from "@/lib/discipleship/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, FormCheckboxLabeled, StatusPill, EmptyState } from "./discipuladoFormHelpers";

const STATUS_TONE: Record<DiscipleshipCourseStatus, "neutral" | "success" | "warning"> = {
  rascunho: "neutral",
  ativo: "success",
  arquivado: "warning",
};

export function DiscipuladoCourses({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [courses, setCourses] = useState<DiscipleshipCourseRow[]>([]);
  const [departments, setDepartments] = useState<DiscipleshipDepartmentRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<DiscipleshipCourseRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [coursesRes, deptRes] = await Promise.all([
      loadDiscipleshipCourses(organizationId),
      loadDiscipleshipDepartments(organizationId),
    ]);
    if (coursesRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setCourses(coursesRes.rows);
    setDepartments(deptRes.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando cursos…</div>;
  }

  if (moduleUnavailable) {
    return <EmptyState title="Discipulado aguardando aplicação das migrations" description="A tabela discipleship_courses ainda não existe neste ambiente." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-serif">Cursos e Lições</h2>
          <p className="text-sm text-muted-foreground">Monte o catálogo de programas do Discipulado e ordene as lições de cada um.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDepartmentOpen(true)}>
            <Plus size={16} className="mr-1.5" /> Novo departamento
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-1.5" /> Novo curso</Button>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          title="Nenhum curso cadastrado ainda"
          description="Crie o primeiro curso (ex.: Curso Básico de Discipulado) para depois montar suas lições e abrir turmas."
          action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-1.5" /> Criar primeiro curso</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((course) => (
            <Card key={course.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedCourse(course)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{course.name}</p>
                    {course.code && <p className="text-xs text-muted-foreground">Código: {course.code}</p>}
                  </div>
                  <StatusPill label={DISCIPLESHIP_COURSE_STATUS_LABELS[course.status as DiscipleshipCourseStatus]} tone={STATUS_TONE[course.status as DiscipleshipCourseStatus]} />
                </div>
                {course.description && <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  {course.requires_attendance && <span>Frequência mín. {course.minimum_attendance_percentage}%</span>}
                  {course.requires_assessment && course.minimum_passing_score !== null && <span>Nota mín. {course.minimum_passing_score}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateCourseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        departments={departments}
        onCreated={reload}
      />
      <CreateDepartmentDialog
        open={departmentOpen}
        onOpenChange={setDepartmentOpen}
        organizationId={organizationId}
        onCreated={reload}
      />

      {selectedCourse && (
        <CourseLessonsDialog
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onCourseUpdated={(updated) => {
            setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setSelectedCourse(updated);
          }}
        />
      )}
    </div>
  );
}

function CreateDepartmentDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do departamento.");
      return;
    }
    setSaving(true);
    const { error } = await createDiscipleshipDepartment({
      organization_id: organizationId,
      name: name.trim(),
      description: description.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(`Não foi possível criar o departamento: ${error}`);
      return;
    }
    toast.success("Departamento criado.");
    setName("");
    setDescription("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo departamento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome" value={name} onChange={setName} required placeholder="Ex.: Discipulado de novos convertidos" />
          <FormTextareaLabeled label="Descrição (opcional)" value={description} onChange={setDescription} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar departamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateCourseDialog({ open, onOpenChange, organizationId, departments, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  departments: DiscipleshipDepartmentRow[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [requiresAttendance, setRequiresAttendance] = useState(true);
  const [minAttendance, setMinAttendance] = useState("75");
  const [requiresAssessment, setRequiresAssessment] = useState(false);
  const [minScore, setMinScore] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setCode(""); setDescription(""); setDepartmentId("");
    setRequiresAttendance(true); setMinAttendance("75"); setRequiresAssessment(false); setMinScore("");
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do curso"); return; }
    const parsedMinimumScore = Number(minScore);
    if (requiresAssessment && (!minScore.trim() || !Number.isFinite(parsedMinimumScore) || parsedMinimumScore < 0 || parsedMinimumScore > 10)) {
      toast.error("Informe a nota mínima entre 0 e 10.");
      return;
    }
    setSaving(true);
    const { error } = await createDiscipleshipCourse({
      organization_id: organizationId,
      department_id: departmentId || null,
      code: code.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      requires_attendance: requiresAttendance,
      minimum_attendance_percentage: requiresAttendance ? Number(minAttendance) || 75 : 75,
      requires_assessment: requiresAssessment,
      minimum_passing_score: requiresAssessment ? parsedMinimumScore : null,
      status: "rascunho",
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o curso: ${error}`); return; }
    toast.success("Curso criado como rascunho. Adicione lições e depois ative-o.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo curso de Discipulado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome do curso" value={name} onChange={setName} required placeholder="Ex.: Curso Básico de Discipulado" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Código (opcional)" value={code} onChange={setCode} />
            <FormSelectLabeled
              label="Departamento (opcional)"
              value={departmentId}
              onChange={setDepartmentId}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <FormTextareaLabeled label="Descrição / objetivos" value={description} onChange={setDescription} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <FormCheckboxLabeled label="Exige frequência mínima" checked={requiresAttendance} onChange={setRequiresAttendance} />
            {requiresAttendance && (
              <FormInputLabeled label="% mínimo de frequência" type="number" min={0} value={minAttendance} onChange={setMinAttendance} />
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <FormCheckboxLabeled label="Exige avaliação" checked={requiresAssessment} onChange={setRequiresAssessment} />
            {requiresAssessment && (
              <FormInputLabeled label="Nota mínima (escala 0–10)" type="number" min={0} max={10} step="0.01" value={minScore} onChange={setMinScore} required />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar curso"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseLessonsDialog({ course, onClose, onCourseUpdated }: {
  course: DiscipleshipCourseRow;
  onClose: () => void;
  onCourseUpdated: (course: DiscipleshipCourseRow) => void;
}) {
  const [lessons, setLessons] = useState<DiscipleshipLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const reloadLessons = useCallback(async () => {
    setLoading(true);
    const { rows } = await loadDiscipleshipLessons(course.id);
    setLessons(rows);
    setLoading(false);
  }, [course.id]);

  useEffect(() => { void reloadLessons(); }, [reloadLessons]);

  const handleAddLesson = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const nextSequence = (lessons[lessons.length - 1]?.sequence_number ?? 0) + 1;
    const { error } = await createDiscipleshipLesson({
      course_id: course.id,
      sequence_number: nextSequence,
      title: newTitle.trim(),
    });
    setAdding(false);
    if (error) { toast.error(`Não foi possível adicionar a lição: ${error}`); return; }
    setNewTitle("");
    reloadLessons();
  };

  const moveLesson = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const reordered = [...lessons];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const { error } = await reorderDiscipleshipLessons(course.id, reordered.map((l) => l.id));
    if (error) { toast.error(`Não foi possível reordenar: ${error}`); return; }
    setLessons(reordered);
  };

  const handleActivate = async () => {
    if (lessons.length === 0) { toast.error("Adicione ao menos uma lição antes de ativar o curso"); return; }
    const { row, error } = await updateDiscipleshipCourse(course.id, { status: "ativo" });
    if (error || !row) { toast.error(`Não foi possível ativar o curso: ${error}`); return; }
    toast.success("Curso ativado — já pode ser usado em novas turmas.");
    onCourseUpdated(row);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen size={18} /> {course.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {course.status !== "ativo" && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary/50">
              <p className="text-sm text-muted-foreground">Curso em {DISCIPLESHIP_COURSE_STATUS_LABELS[course.status as DiscipleshipCourseStatus].toLowerCase()}. Ative-o para poder criar turmas.</p>
              <Button size="sm" variant="outline" onClick={handleActivate}>Ativar</Button>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">Lições ({lessons.length})</p>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
            ) : lessons.length === 0 ? (
              <EmptyState title="Nenhuma lição ainda" description="Adicione a primeira lição abaixo." />
            ) : (
              <div className="space-y-1.5">
                {lessons.map((lesson, index) => (
                  <div key={lesson.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border/60">
                    <GripVertical size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground w-6 shrink-0">{lesson.sequence_number}.</span>
                    <span className="text-sm flex-1 truncate">{lesson.title}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Mover lição ${lesson.title} para cima`}
                        disabled={index === 0}
                        onClick={() => moveLesson(index, -1)}
                        className="p-1 rounded hover:bg-secondary disabled:opacity-30 text-xs"
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Mover lição ${lesson.title} para baixo`}
                        disabled={index === lessons.length - 1}
                        onClick={() => moveLesson(index, 1)}
                        className="p-1 rounded hover:bg-secondary disabled:opacity-30 text-xs"
                      >↓</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título da nova lição"
              aria-label="Título da nova lição"
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={(e) => { if (e.key === "Enter") handleAddLesson(); }}
            />
            <Button size="sm" onClick={handleAddLesson} disabled={adding || !newTitle.trim()}>
              <Plus size={16} className="mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
