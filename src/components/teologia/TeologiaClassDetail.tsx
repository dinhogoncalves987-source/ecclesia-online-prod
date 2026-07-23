/**
 * Detalhe da turma (OPERAÇÃO 3) — resumo, equipe, alunos (matrícula na
 * turma, elegibilidade de conclusão pelas unidades obrigatórias da matriz) e
 * ofertas de matéria (cada oferta abre em TeologiaOfferingDetail, onde
 * vivem sessões/frequência e avaliações/notas daquela matéria específica).
 * Todas as mutações passam pelas RPCs do banco (service.ts); este
 * componente nunca decide autorização ou estado — apenas mostra o resultado.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, X, Plus, UserPlus, BookOpen, Landmark } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  loadTheologyClass, loadTheologyProgram, loadTheologyCurriculumItems, loadTheologySubjects,
  loadTheologyStaffAssignments, assignTheologyStaff, endTheologyStaffAssignment,
  loadTheologyEnrollments, enrollMemberInTheologyClass, updateTheologyEnrollmentStatus,
  loadTheologyClassOfferings, createTheologyClassOffering, updateTheologyClassOfferingStatus,
  loadTheologyOfferingEnrollmentsForEnrollment, getTheologyMemberLabels, updateTheologyClassStatus,
  type TheologyClassRow, type TheologyProgramRow, type TheologyCurriculumItemRow, type TheologyStaffAssignmentRow,
  type TheologyEnrollmentRow, type TheologyClassOfferingRow, type TheologyOfferingEnrollmentRow, type TheologySubjectRow,
} from "@/lib/theology/service";
import {
  THEOLOGY_CLASS_STATUSES, THEOLOGY_CLASS_STATUS_LABELS, THEOLOGY_STAFF_ROLES, THEOLOGY_STAFF_ROLE_LABELS,
  THEOLOGY_ENROLLMENT_STATUS_LABELS, THEOLOGY_OFFERING_STATUS_LABELS,
  type TheologyClassStatus, type TheologyStaffRole, type TheologyEnrollmentStatus, type TheologyOfferingStatus,
} from "@/lib/theology/constants";
import {
  isValidClassStatusTransition, isValidEnrollmentStatusTransition, checkEnrollmentCompletionEligibility,
  isClassClosedForCommonLaunches, hasClassCapacity,
} from "@/lib/theology/rules";
import { FormSelectLabeled, StatusPill, EmptyState } from "./teologiaFormHelpers";
import { TeologiaMemberPicker } from "./TeologiaMemberPicker";
import { TeologiaOfferingDetail } from "./TeologiaOfferingDetail";

type TabKey = "resumo" | "equipe" | "alunos" | "ofertas";
const TABS: { key: TabKey; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "equipe", label: "Equipe" },
  { key: "alunos", label: "Alunos" },
  { key: "ofertas", label: "Ofertas de matéria" },
];

async function loadMemberNames(organizationId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await getTheologyMemberLabels(organizationId, ids);
  return new Map(rows.map((m) => [m.id, m.known_name || m.full_name]));
}

export function TeologiaClassDetail({ classId, organizationId, onClose, onChanged }: {
  classId: string;
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("resumo");
  const [loading, setLoading] = useState(true);
  const [classRow, setClassRow] = useState<TheologyClassRow | null>(null);
  const [program, setProgram] = useState<TheologyProgramRow | null>(null);
  const [curriculumItems, setCurriculumItems] = useState<TheologyCurriculumItemRow[]>([]);
  const [subjects, setSubjects] = useState<TheologySubjectRow[]>([]);
  const [staff, setStaff] = useState<TheologyStaffAssignmentRow[]>([]);
  const [enrollments, setEnrollments] = useState<TheologyEnrollmentRow[]>([]);
  const [offerings, setOfferings] = useState<TheologyClassOfferingRow[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { row: cls, error: classError } = await loadTheologyClass(classId);
    if (!cls) {
      setClassRow(null);
      setLoadError(classError ?? "Turma não encontrada.");
      setLoading(false);
      return;
    }
    setClassRow(cls);
    const [{ row: programRow }, staffRes, enrollmentsRes, offeringsRes] = await Promise.all([
      loadTheologyProgram(cls.program_id),
      loadTheologyStaffAssignments(classId),
      loadTheologyEnrollments(classId),
      loadTheologyClassOfferings(classId),
    ]);
    setProgram(programRow);
    setStaff(staffRes.rows);
    setEnrollments(enrollmentsRes.rows);
    setOfferings(offeringsRes.rows);

    const [curriculumRes, subjectsRes] = await Promise.all([
      loadTheologyCurriculumItems(cls.program_id),
      loadTheologySubjects(organizationId),
    ]);
    setCurriculumItems(curriculumRes.rows);
    setSubjects(subjectsRes.rows);

    const ids = [...new Set([...staffRes.rows.map((s) => s.member_id), ...enrollmentsRes.rows.map((e) => e.member_id)])];
    setMemberNames(await loadMemberNames(organizationId, ids));
    const firstError = [staffRes.error, enrollmentsRes.error, offeringsRes.error, curriculumRes.error, subjectsRes.error].find(Boolean);
    if (firstError) setLoadError(firstError.message);
    setLoading(false);
  }, [classId, organizationId]);

  useEffect(() => { void reloadAll(); }, [reloadAll]);

  const notifyChanged = () => { reloadAll(); onChanged(); };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark size={18} /> {classRow?.name ?? "Turma"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando turma…</div>
        ) : loadError || !classRow ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível carregar esta turma. {loadError}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "resumo" && <ResumoTab classRow={classRow} program={program} onStatusChanged={notifyChanged} />}
            {tab === "equipe" && (
              <EquipeTab classId={classId} organizationId={organizationId} staff={staff} memberNames={memberNames} onChanged={notifyChanged} />
            )}
            {tab === "alunos" && (
              <AlunosTab
                classRow={classRow}
                organizationId={organizationId}
                enrollments={enrollments}
                curriculumItems={curriculumItems}
                offerings={offerings}
                memberNames={memberNames}
                onChanged={notifyChanged}
              />
            )}
            {tab === "ofertas" && (
              <OfertasTab
                classRow={classRow}
                curriculumItems={curriculumItems}
                subjects={subjects}
                offerings={offerings}
                organizationId={organizationId}
                onChanged={notifyChanged}
              />
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}><X size={16} className="mr-1.5" /> Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Resumo ───────────────────────────────────────────────────────────────

function ResumoTab({ classRow, program, onStatusChanged }: {
  classRow: TheologyClassRow;
  program: TheologyProgramRow | null;
  onStatusChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const currentStatus = classRow.status as TheologyClassStatus;
  const nextOptions = THEOLOGY_CLASS_STATUSES.filter((s) => s !== currentStatus && isValidClassStatusTransition(currentStatus, s));

  const handleTransition = async (status: TheologyClassStatus) => {
    setSaving(true);
    const { error } = await updateTheologyClassStatus(classRow.id, status);
    setSaving(false);
    if (error) { toast.error(`Não foi possível mudar o status: ${error}`); return; }
    toast.success(`Turma agora está: ${THEOLOGY_CLASS_STATUS_LABELS[status]}`);
    onStatusChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill label={THEOLOGY_CLASS_STATUS_LABELS[currentStatus]} tone="info" />
        <span className="text-sm text-muted-foreground">Programa: {program?.name ?? "—"}</span>
      </div>
      {classRow.notes && <p className="text-sm text-muted-foreground">{classRow.notes}</p>}
      {nextOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {nextOptions.map((status) => (
            <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => handleTransition(status)}>
              {THEOLOGY_CLASS_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Equipe ───────────────────────────────────────────────────────────────

function EquipeTab({ classId, organizationId, staff, memberNames, onChanged }: {
  classId: string;
  organizationId: string;
  staff: TheologyStaffAssignmentRow[];
  memberNames: Map<string, string>;
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [role, setRole] = useState<TheologyStaffRole>("professor");

  const handleAssign = async (memberId: string) => {
    const { error } = await assignTheologyStaff({ class_id: classId, member_id: memberId, role });
    if (error) { toast.error(`Não foi possível atribuir: ${error}`); return; }
    toast.success("Atribuição registrada. Este professor só poderá operar esta turma.");
    setPickerOpen(false);
    onChanged();
  };

  const handleEnd = async (assignmentId: string) => {
    const { error } = await endTheologyStaffAssignment(assignmentId);
    if (error) { toast.error(`Não foi possível encerrar: ${error}`); return; }
    toast.success("Atribuição encerrada.");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Equipe da turma</p>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen((v) => !v)}>
          <UserPlus size={14} className="mr-1.5" /> Adicionar
        </Button>
      </div>

      {pickerOpen && (
        <div className="p-3 rounded-lg border border-border/60 space-y-2">
          <FormSelectLabeled label="Papel" value={role} onChange={(v) => setRole(v as TheologyStaffRole)} options={THEOLOGY_STAFF_ROLES.map((r) => ({ value: r, label: THEOLOGY_STAFF_ROLE_LABELS[r] }))} />
          <TeologiaMemberPicker organizationId={organizationId} onSelect={(m) => handleAssign(m.id)} />
        </div>
      )}

      {staff.length === 0 ? (
        <EmptyState title="Nenhum membro de equipe atribuído" description="Atribua coordenador, secretário e professor(es) desta turma. Um professor só poderá lançar frequência/notas nas turmas às quais estiver atribuído." />
      ) : (
        <div className="space-y-1.5">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{memberNames.get(s.member_id) ?? "Membro"}</p>
                <p className="text-xs text-muted-foreground">{THEOLOGY_STAFF_ROLE_LABELS[s.role as TheologyStaffRole]}</p>
              </div>
              <StatusPill label={s.status === "ativo" ? "Ativo" : "Encerrado"} tone={s.status === "ativo" ? "success" : "neutral"} />
              {s.status === "ativo" && <Button size="sm" variant="ghost" onClick={() => handleEnd(s.id)}>Encerrar</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Alunos (matrícula na turma + elegibilidade de conclusão) ─────────────

function AlunosTab({ classRow, organizationId, enrollments, curriculumItems, offerings, memberNames, onChanged }: {
  classRow: TheologyClassRow;
  organizationId: string;
  enrollments: TheologyEnrollmentRow[];
  curriculumItems: TheologyCurriculumItemRow[];
  offerings: TheologyClassOfferingRow[];
  memberNames: Map<string, string>;
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailEnrollmentId, setDetailEnrollmentId] = useState<string | null>(null);
  const closed = isClassClosedForCommonLaunches(classRow.status as TheologyClassStatus);
  const enrolledIds = enrollments.map((e) => e.member_id);
  const activeOrPendingCount = enrollments.filter((e) => e.status === "matriculado" || e.status === "ativo").length;
  const atCapacity = !hasClassCapacity(classRow.capacity, activeOrPendingCount);

  const handleEnroll = async (memberId: string) => {
    const status = classRow.status === "inscricoes_abertas" || classRow.status === "em_andamento" ? "matriculado" : "pendente";
    const { error } = await enrollMemberInTheologyClass(classRow.id, memberId, status);
    if (error) { toast.error(`Não foi possível matricular: ${error}`); return; }
    toast.success("Matrícula registrada.");
    setPickerOpen(false);
    onChanged();
  };

  const detailEnrollment = enrollments.find((e) => e.id === detailEnrollmentId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Alunos matriculados ({enrollments.length}{classRow.capacity ? ` / ${classRow.capacity}` : ""})</p>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen((v) => !v)} disabled={closed}>
          <UserPlus size={14} className="mr-1.5" /> Matricular
        </Button>
      </div>

      {closed && <p className="text-xs text-muted-foreground">Turma encerrada — não aceita novas matrículas.</p>}
      {!closed && atCapacity && <p className="text-xs text-amber-600">Turma na capacidade máxima — novas matrículas ficarão pendentes.</p>}

      {pickerOpen && (
        <div className="p-3 rounded-lg border border-border/60">
          <TeologiaMemberPicker organizationId={organizationId} excludeIds={enrolledIds} onSelect={(m) => handleEnroll(m.id)} />
        </div>
      )}

      {enrollments.length === 0 ? (
        <EmptyState title="Nenhum aluno matriculado ainda" description="Localize um membro já cadastrado na Secretaria e matricule-o na turma." />
      ) : (
        <div className="space-y-1.5">
          {enrollments.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{memberNames.get(e.member_id) ?? "Membro"}</p>
              </div>
              <StatusPill label={THEOLOGY_ENROLLMENT_STATUS_LABELS[e.status as TheologyEnrollmentStatus]} tone="info" />
              <Button size="sm" variant="ghost" onClick={() => setDetailEnrollmentId(e.id)}>Ver progresso</Button>
            </div>
          ))}
        </div>
      )}

      {detailEnrollment && (
        <EnrollmentDetailDialog
          enrollment={detailEnrollment}
          curriculumItems={curriculumItems}
          offerings={offerings}
          memberName={memberNames.get(detailEnrollment.member_id) ?? "Membro"}
          onClose={() => setDetailEnrollmentId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function EnrollmentDetailDialog({ enrollment, curriculumItems, offerings, memberName, onClose, onChanged }: {
  enrollment: TheologyEnrollmentRow;
  curriculumItems: TheologyCurriculumItemRow[];
  offerings: TheologyClassOfferingRow[];
  memberName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [offeringEnrollments, setOfferingEnrollments] = useState<TheologyOfferingEnrollmentRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { rows } = await loadTheologyOfferingEnrollmentsForEnrollment(enrollment.id);
      if (!cancelled) { setOfferingEnrollments(rows); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [enrollment.id]);

  const mandatoryItems = curriculumItems.filter((i) => i.is_mandatory && i.status === "ativo");
  const offeringByCurriculumItem = new Map(offerings.map((o) => [o.curriculum_item_id, o.id]));
  const bestAttemptByOffering = new Map<string, TheologyOfferingEnrollmentRow>();
  for (const oe of offeringEnrollments) {
    const existing = bestAttemptByOffering.get(oe.offering_id);
    if (!existing || oe.attempt_number > existing.attempt_number) bestAttemptByOffering.set(oe.offering_id, oe);
  }
  const mandatoryStatus = mandatoryItems.map((item) => {
    const offeringId = offeringByCurriculumItem.get(item.id);
    const attempt = offeringId ? bestAttemptByOffering.get(offeringId) : undefined;
    return { curriculumItemId: item.id, approved: attempt?.final_result === "aprovado" };
  });
  const eligibility = checkEnrollmentCompletionEligibility(mandatoryStatus);

  const currentStatus = enrollment.status as TheologyEnrollmentStatus;
  const nextOptions = (["ativo", "concluido", "reprovado", "desistente", "transferido", "cancelado"] as TheologyEnrollmentStatus[])
    .filter((s) => isValidEnrollmentStatusTransition(currentStatus, s));

  const handleTransition = async (status: TheologyEnrollmentStatus) => {
    setSaving(true);
    const { error } = await updateTheologyEnrollmentStatus({ enrollment_id: enrollment.id, status });
    setSaving(false);
    if (error) { toast.error(`Não foi possível atualizar a matrícula: ${error}`); return; }
    toast.success("Matrícula atualizada.");
    onChanged();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{memberName} — progresso na turma</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
        ) : (
          <div className="space-y-3">
            <StatusPill label={THEOLOGY_ENROLLMENT_STATUS_LABELS[currentStatus]} tone="info" />

            {mandatoryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">O programa não tem matérias obrigatórias na matriz curricular ainda.</p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium">Unidades obrigatórias ({mandatoryItems.length - eligibility.pendingMandatoryCount}/{mandatoryItems.length} aprovadas)</p>
                {eligibility.eligible ? (
                  <p className="text-sm text-emerald-600">Elegível para conclusão — todas as unidades obrigatórias estão aprovadas.</p>
                ) : (
                  eligibility.reasons.map((reason) => <p key={reason} className="text-xs text-amber-600">{reason}</p>)
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {nextOptions.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  disabled={saving || (status === "concluido" && !eligibility.eligible)}
                  onClick={() => handleTransition(status)}
                >
                  {THEOLOGY_ENROLLMENT_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ofertas de matéria ─────────────────────────────────────────────────────

function OfertasTab({ classRow, curriculumItems, subjects, offerings, organizationId, onChanged }: {
  classRow: TheologyClassRow;
  curriculumItems: TheologyCurriculumItemRow[];
  subjects: TheologySubjectRow[];
  offerings: TheologyClassOfferingRow[];
  organizationId: string;
  onChanged: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOffering, setDetailOffering] = useState<TheologyClassOfferingRow | null>(null);
  const [savingOfferingId, setSavingOfferingId] = useState<string | null>(null);
  const closed = isClassClosedForCommonLaunches(classRow.status as TheologyClassStatus);
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const curriculumItemById = new Map(curriculumItems.map((i) => [i.id, i]));
  const offeringLabel = (curriculumItemId: string) => {
    const item = curriculumItemById.get(curriculumItemId);
    return item ? (subjectNameById.get(item.subject_id) ?? "Matéria") : "Matéria";
  };
  const offeredItemIds = new Set(offerings.map((o) => o.curriculum_item_id));
  const availableItems = curriculumItems.filter((i) => i.status === "ativo" && !offeredItemIds.has(i.id));

  const handleStatus = async (offeringId: string, status: TheologyOfferingStatus) => {
    setSavingOfferingId(offeringId);
    const { error } = await updateTheologyClassOfferingStatus(offeringId, status);
    setSavingOfferingId(null);
    if (error) { toast.error(`Não foi possível atualizar a oferta: ${error}`); return; }
    toast.success(`Oferta agora está: ${THEOLOGY_OFFERING_STATUS_LABELS[status]}`);
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Ofertas de matéria nesta turma</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={closed || availableItems.length === 0}>
          <Plus size={14} className="mr-1.5" /> Nova oferta
        </Button>
      </div>
      {closed && <p className="text-xs text-muted-foreground">Turma encerrada — não aceita novas ofertas.</p>}
      {!closed && availableItems.length === 0 && curriculumItems.length > 0 && (
        <p className="text-xs text-muted-foreground">Todas as matérias da matriz já possuem oferta nesta turma.</p>
      )}

      {offerings.length === 0 ? (
        <EmptyState title="Nenhuma oferta criada ainda" description="Cada oferta representa uma matéria da matriz cursada nesta turma — abra sessões, frequência e avaliações dentro dela." />
      ) : (
        <div className="space-y-1.5">
          {offerings.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate flex items-center gap-1.5"><BookOpen size={13} className="text-muted-foreground shrink-0" /> {offeringLabel(o.curriculum_item_id)}</p>
                <p className="text-xs text-muted-foreground">{THEOLOGY_OFFERING_STATUS_LABELS[o.status as TheologyOfferingStatus]}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {o.status === "planejada" && !closed && (
                  <Button size="sm" variant="outline" disabled={savingOfferingId === o.id} onClick={() => handleStatus(o.id, "em_andamento")}>Iniciar</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetailOffering(o)}>Abrir</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateOfferingDialog classId={classRow.id} availableItems={availableItems} subjects={subjects} onClose={() => setCreateOpen(false)} onCreated={onChanged} />
      )}

      {detailOffering && (
        <TeologiaOfferingDetail
          offering={detailOffering}
          subjectName={offeringLabel(detailOffering.curriculum_item_id)}
          classRow={classRow}
          organizationId={organizationId}
          onClose={() => setDetailOffering(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function CreateOfferingDialog({ classId, availableItems, subjects, onClose, onCreated }: {
  classId: string;
  availableItems: TheologyCurriculumItemRow[];
  subjects: TheologySubjectRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [curriculumItemId, setCurriculumItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const handleSave = async () => {
    if (!curriculumItemId) { toast.error("Selecione a matéria."); return; }
    setSaving(true);
    const { error } = await createTheologyClassOffering({ class_id: classId, curriculum_item_id: curriculumItemId });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar a oferta: ${error}`); return; }
    toast.success("Oferta criada. Atribua o professor e matricule os alunos dentro dela.");
    onClose();
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova oferta de matéria</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormSelectLabeled
            label="Matéria da matriz curricular"
            value={curriculumItemId}
            onChange={setCurriculumItemId}
            required
            options={availableItems.map((i) => ({ value: i.id, label: `${i.sequence_number}. ${subjectNameById.get(i.subject_id) ?? "Matéria"}` }))}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar oferta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
