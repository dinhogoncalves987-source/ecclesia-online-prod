/**
 * Turmas (OPERAÇÃO 2) — coortes de um curso. Lista + criação aqui; o
 * detalhe completo (equipe, alunos, encontros, frequência, avaliações,
 * progresso, pendências, conclusão) vive em DiscipuladoClassDetail.tsx.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Users, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  loadDiscipleshipClasses, createDiscipleshipClass, loadDiscipleshipCourses, loadDiscipleshipLocations,
  createDiscipleshipLocation,
  type DiscipleshipClassRow, type DiscipleshipCourseRow, type DiscipleshipLocationRow,
} from "@/lib/discipleship/service";
import {
  DISCIPLESHIP_CLASS_STATUS_LABELS, DISCIPLESHIP_MODALITIES, DISCIPLESHIP_MODALITY_LABELS,
  DISCIPLESHIP_LOCATION_TYPES, DISCIPLESHIP_LOCATION_TYPE_LABELS,
  type DiscipleshipClassStatus, type DiscipleshipModality, type DiscipleshipLocationType,
} from "@/lib/discipleship/constants";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./discipuladoFormHelpers";
import { DiscipuladoClassDetail } from "./DiscipuladoClassDetail";

const STATUS_TONE: Record<DiscipleshipClassStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  planejamento: "neutral",
  inscricoes_abertas: "info",
  em_andamento: "success",
  concluida: "success",
  cancelada: "danger",
  arquivada: "neutral",
};

export function DiscipuladoClasses({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [classes, setClasses] = useState<DiscipleshipClassRow[]>([]);
  const [courses, setCourses] = useState<DiscipleshipCourseRow[]>([]);
  const [locations, setLocations] = useState<DiscipleshipLocationRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [classesRes, coursesRes, locationsRes] = await Promise.all([
      loadDiscipleshipClasses(organizationId),
      loadDiscipleshipCourses(organizationId),
      loadDiscipleshipLocations(organizationId),
    ]);
    if (classesRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoading(false);
      return;
    }
    setClasses(classesRes.rows);
    setCourses(coursesRes.rows);
    setLocations(locationsRes.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
  const activeCourses = courses.filter((course) => course.status === "ativo");

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando turmas…</div>;
  }

  if (moduleUnavailable) {
    return <EmptyState title="Discipulado aguardando aplicação das migrations" description="A tabela discipleship_classes ainda não existe neste ambiente." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-serif">Turmas</h2>
          <p className="text-sm text-muted-foreground">Crie turmas a partir de um curso ativo, monte a equipe e abra inscrições.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setLocationOpen(true)}>
            <Plus size={16} className="mr-1.5" /> Novo local
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={activeCourses.length === 0}>
            <Plus size={16} className="mr-1.5" /> Nova turma
          </Button>
        </div>
      </div>

      {activeCourses.length === 0 && (
        <EmptyState title="Nenhum curso ativo" description="Ative um curso na aba “Cursos e Lições” antes de criar uma turma." />
      )}

      {classes.length === 0 ? (
        activeCourses.length > 0 && (
          <EmptyState
            title="Nenhuma turma criada ainda"
            description="Crie a primeira turma para começar a matricular alunos."
            action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-1.5" /> Criar primeira turma</Button>}
          />
        )
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {classes.map((cls) => (
            <Card key={cls.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedClassId(cls.id)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{cls.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{courseNameById.get(cls.course_id) ?? "Curso"}</p>
                  </div>
                  <StatusPill label={DISCIPLESHIP_CLASS_STATUS_LABELS[cls.status as DiscipleshipClassStatus]} tone={STATUS_TONE[cls.status as DiscipleshipClassStatus]} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users size={12} /> {cls.capacity ? `Capacidade: ${cls.capacity}` : "Sem limite de capacidade"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Início: {new Date(cls.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateClassDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        courses={activeCourses}
        locations={locations}
        onCreated={reload}
      />
      <CreateLocationDialog
        open={locationOpen}
        onOpenChange={setLocationOpen}
        organizationId={organizationId}
        onCreated={reload}
      />

      {selectedClassId && (
        <DiscipuladoClassDetail
          classId={selectedClassId}
          organizationId={organizationId}
          onClose={() => setSelectedClassId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function CreateLocationDialog({ open, onOpenChange, organizationId, onCreated }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<DiscipleshipLocationType>("sala");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do local.");
      return;
    }
    setSaving(true);
    const { error } = await createDiscipleshipLocation({
      organization_id: organizationId,
      name: name.trim(),
      location_type: locationType,
      address_text: address.trim() || null,
      capacity: capacity ? Number(capacity) : null,
    });
    setSaving(false);
    if (error) {
      toast.error(`Não foi possível criar o local: ${error}`);
      return;
    }
    toast.success("Local criado.");
    setName("");
    setAddress("");
    setCapacity("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo local de aula</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome" value={name} onChange={setName} required placeholder="Ex.: Sala 2 — Templo sede" />
          <FormSelectLabeled
            label="Tipo"
            value={locationType}
            onChange={(value) => setLocationType(value as DiscipleshipLocationType)}
            options={DISCIPLESHIP_LOCATION_TYPES.map((type) => ({ value: type, label: DISCIPLESHIP_LOCATION_TYPE_LABELS[type] }))}
          />
          <FormInputLabeled label="Endereço ou link (opcional)" value={address} onChange={setAddress} />
          <FormInputLabeled label="Capacidade (opcional)" type="number" min={1} value={capacity} onChange={setCapacity} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar local"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateClassDialog({ open, onOpenChange, organizationId, courses, locations, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  courses: DiscipleshipCourseRow[];
  locations: DiscipleshipLocationRow[];
  onCreated: () => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [capacity, setCapacity] = useState("");
  const [modality, setModality] = useState<DiscipleshipModality>("presencial");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCourseId(""); setName(""); setLocationId(""); setCapacity(""); setModality("presencial"); setNotes("");
  };

  const handleSave = async () => {
    if (!courseId) { toast.error("Selecione o curso"); return; }
    if (!name.trim()) { toast.error("Informe o nome da turma"); return; }
    setSaving(true);
    const { error } = await createDiscipleshipClass({
      course_id: courseId,
      organization_id: organizationId,
      location_id: locationId || null,
      name: name.trim(),
      start_date: startDate,
      capacity: capacity ? Number(capacity) : null,
      modality,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar a turma: ${error}`); return; }
    toast.success("Turma criada em planejamento. Monte a equipe e depois abra as inscrições.");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova turma</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormSelectLabeled label="Curso" value={courseId} onChange={setCourseId} required options={courses.map((c) => ({ value: c.id, label: c.name }))} />
          <FormInputLabeled label="Nome da turma" value={name} onChange={setName} required placeholder="Ex.: Turma 2026.2 — Manhã" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Data de início" type="date" value={startDate} onChange={setStartDate} required />
            <FormInputLabeled label="Capacidade (opcional)" type="number" min={1} value={capacity} onChange={setCapacity} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormSelectLabeled
              label="Modalidade"
              value={modality}
              onChange={(v) => setModality(v as DiscipleshipModality)}
              options={DISCIPLESHIP_MODALITIES.map((m) => ({ value: m, label: DISCIPLESHIP_MODALITY_LABELS[m] }))}
            />
            <FormSelectLabeled label="Local (opcional)" value={locationId} onChange={setLocationId} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
          <FormTextareaLabeled label="Observações" value={notes} onChange={setNotes} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar turma"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
