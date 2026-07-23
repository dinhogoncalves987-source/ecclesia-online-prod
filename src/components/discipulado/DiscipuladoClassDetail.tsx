/**
 * Detalhe da turma (OPERAÇÃO 2) — resumo, equipe, alunos (matrícula,
 * progresso, pendências, conclusão), encontros e frequência, avaliações.
 * Todas as mutações passam pelas RPCs do banco (service.ts); este
 * componente nunca decide autorização ou estado — apenas mostra o
 * resultado e trata o erro retornado pela RPC.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, X, Plus, UserPlus, ClipboardCheck, CalendarPlus, GraduationCap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import {
  loadDiscipleshipClass, loadDiscipleshipCourseById, loadDiscipleshipStaffAssignments,
  assignDiscipleshipStaff, endDiscipleshipStaffAssignment, loadDiscipleshipEnrollments,
  enrollMemberInClass, updateDiscipleshipEnrollmentStatus, getDiscipleshipEnrollmentProgress,
  loadDiscipleshipSessions, createDiscipleshipSession, loadDiscipleshipAttendance,
  recordDiscipleshipAttendance, loadDiscipleshipAssessments, createDiscipleshipAssessment,
  loadDiscipleshipAssessmentResults, recordDiscipleshipAssessmentResult, loadDiscipleshipLessons,
  loadDiscipleshipLocations, updateDiscipleshipClassStatus, getDiscipleshipMemberLabels,
  updateDiscipleshipSessionStatus, updateDiscipleshipAssessmentStatus,
  loadDiscipleshipFollowups, createDiscipleshipFollowup,
  type DiscipleshipClassRow, type DiscipleshipCourseRow, type DiscipleshipStaffAssignmentRow,
  type DiscipleshipEnrollmentRow, type DiscipleshipSessionRow, type DiscipleshipAssessmentRow,
  type DiscipleshipLessonRow, type DiscipleshipLocationRow, type DiscipleshipFollowupRow,
} from "@/lib/discipleship/service";
import {
  DISCIPLESHIP_CLASS_STATUSES, DISCIPLESHIP_CLASS_STATUS_LABELS, DISCIPLESHIP_STAFF_ROLES,
  DISCIPLESHIP_STAFF_ROLE_LABELS, DISCIPLESHIP_ENROLLMENT_STATUS_LABELS, DISCIPLESHIP_ATTENDANCE_STATUSES,
  DISCIPLESHIP_ATTENDANCE_STATUS_LABELS, DISCIPLESHIP_ASSESSMENT_TYPES, DISCIPLESHIP_ASSESSMENT_TYPE_LABELS,
  type DiscipleshipClassStatus, type DiscipleshipStaffRole, type DiscipleshipEnrollmentStatus,
  type DiscipleshipAttendanceStatus, type DiscipleshipAssessmentType,
} from "@/lib/discipleship/constants";
import { isValidClassStatusTransition, isValidEnrollmentStatusTransition } from "@/lib/discipleship/rules";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./discipuladoFormHelpers";
import { DiscipuladoMemberPicker } from "./DiscipuladoMemberPicker";

type TabKey = "resumo" | "equipe" | "alunos" | "encontros" | "avaliacoes";
const TABS: { key: TabKey; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "equipe", label: "Equipe" },
  { key: "alunos", label: "Alunos" },
  { key: "encontros", label: "Encontros e frequência" },
  { key: "avaliacoes", label: "Avaliações" },
];

async function loadMemberNames(organizationId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await getDiscipleshipMemberLabels(organizationId, ids);
  return new Map(rows.map((m) => [m.id, m.known_name || m.full_name]));
}

export function DiscipuladoClassDetail({ classId, organizationId, onClose, onChanged }: {
  classId: string;
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("resumo");
  const [loading, setLoading] = useState(true);
  const [classRow, setClassRow] = useState<DiscipleshipClassRow | null>(null);
  const [course, setCourse] = useState<DiscipleshipCourseRow | null>(null);
  const [staff, setStaff] = useState<DiscipleshipStaffAssignmentRow[]>([]);
  const [enrollments, setEnrollments] = useState<DiscipleshipEnrollmentRow[]>([]);
  const [sessions, setSessions] = useState<DiscipleshipSessionRow[]>([]);
  const [assessments, setAssessments] = useState<DiscipleshipAssessmentRow[]>([]);
  const [lessons, setLessons] = useState<DiscipleshipLessonRow[]>([]);
  const [locations, setLocations] = useState<DiscipleshipLocationRow[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { row: cls, error: classError } = await loadDiscipleshipClass(classId);
    if (!cls) {
      setClassRow(null);
      setLoadError(classError ?? "Turma não encontrada.");
      setLoading(false);
      return;
    }
    setClassRow(cls);
    const [{ row: courseRow }, staffRes, enrollmentsRes, sessionsRes, assessmentsRes, lessonsRes, locationsRes] = await Promise.all([
      loadDiscipleshipCourseById(cls.course_id),
      loadDiscipleshipStaffAssignments(classId),
      loadDiscipleshipEnrollments(classId),
      loadDiscipleshipSessions(classId),
      loadDiscipleshipAssessments(classId),
      loadDiscipleshipLessons(cls.course_id),
      loadDiscipleshipLocations(organizationId),
    ]);
    setCourse(courseRow);
    setStaff(staffRes.rows);
    setEnrollments(enrollmentsRes.rows);
    setSessions(sessionsRes.rows);
    setAssessments(assessmentsRes.rows);
    setLessons(lessonsRes.rows);
    setLocations(locationsRes.rows);

    const ids = [...new Set([...staffRes.rows.map((s) => s.member_id), ...enrollmentsRes.rows.map((e) => e.member_id)])];
    setMemberNames(await loadMemberNames(organizationId, ids));
    const firstError = [
      staffRes.error, enrollmentsRes.error, sessionsRes.error,
      assessmentsRes.error, lessonsRes.error, locationsRes.error,
    ].find(Boolean);
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
            <GraduationCap size={18} /> {classRow?.name ?? "Turma"}
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
            {/* Abas — botões nativos, navegáveis por teclado, sem scroll horizontal obrigatório */}
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

            {tab === "resumo" && (
              <ResumoTab classRow={classRow} onStatusChanged={notifyChanged} />
            )}
            {tab === "equipe" && (
              <EquipeTab classId={classId} organizationId={organizationId} staff={staff} memberNames={memberNames} onChanged={notifyChanged} />
            )}
            {tab === "alunos" && (
              <AlunosTab
                classRow={classRow}
                course={course}
                organizationId={organizationId}
                enrollments={enrollments}
                memberNames={memberNames}
                onChanged={notifyChanged}
              />
            )}
            {tab === "encontros" && (
              <EncontrosTab
                classRow={classRow}
                lessons={lessons}
                locations={locations}
                staff={staff}
                memberNames={memberNames}
                enrollments={enrollments}
                sessions={sessions}
                onChanged={notifyChanged}
              />
            )}
            {tab === "avaliacoes" && (
              <AvaliacoesTab classRow={classRow} assessments={assessments} enrollments={enrollments} memberNames={memberNames} onChanged={notifyChanged} />
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

function ResumoTab({ classRow, onStatusChanged }: { classRow: DiscipleshipClassRow; onStatusChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const currentStatus = classRow.status as DiscipleshipClassStatus;
  const nextOptions = DISCIPLESHIP_CLASS_STATUSES.filter(
    (s) => s !== currentStatus && isValidClassStatusTransition(currentStatus, s),
  );

  const handleTransition = async (status: DiscipleshipClassStatus) => {
    setSaving(true);
    const { error } = await updateDiscipleshipClassStatus(classRow.id, status);
    setSaving(false);
    if (error) { toast.error(`Não foi possível mudar o status: ${error}`); return; }
    toast.success(`Turma agora está: ${DISCIPLESHIP_CLASS_STATUS_LABELS[status]}`);
    onStatusChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusPill label={DISCIPLESHIP_CLASS_STATUS_LABELS[currentStatus]} tone="info" />
        <span className="text-sm text-muted-foreground">
          Início: {new Date(classRow.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
          {classRow.expected_end_date ? ` · Previsão de término: ${new Date(classRow.expected_end_date + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
        </span>
      </div>
      {classRow.notes && <p className="text-sm text-muted-foreground">{classRow.notes}</p>}
      {nextOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {nextOptions.map((status) => (
            <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => handleTransition(status)}>
              {DISCIPLESHIP_CLASS_STATUS_LABELS[status]}
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
  staff: DiscipleshipStaffAssignmentRow[];
  memberNames: Map<string, string>;
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [role, setRole] = useState<DiscipleshipStaffRole>("discipulador");

  const handleAssign = async (memberId: string) => {
    const { error } = await assignDiscipleshipStaff({ class_id: classId, member_id: memberId, role });
    if (error) { toast.error(`Não foi possível atribuir: ${error}`); return; }
    toast.success("Atribuição registrada.");
    setPickerOpen(false);
    onChanged();
  };

  const handleEnd = async (assignmentId: string) => {
    const { error } = await endDiscipleshipStaffAssignment(assignmentId);
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
          <FormSelectLabeled
            label="Papel"
            value={role}
            onChange={(v) => setRole(v as DiscipleshipStaffRole)}
            options={DISCIPLESHIP_STAFF_ROLES.map((r) => ({ value: r, label: DISCIPLESHIP_STAFF_ROLE_LABELS[r] }))}
          />
          <DiscipuladoMemberPicker organizationId={organizationId} onSelect={(m) => handleAssign(m.id)} />
        </div>
      )}

      {staff.length === 0 ? (
        <EmptyState title="Nenhum membro de equipe atribuído" description="Atribua coordenador, secretário, discipulador(es) e professor(es) antes de abrir as inscrições." />
      ) : (
        <div className="space-y-1.5">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{memberNames.get(s.member_id) ?? "Membro"}</p>
                <p className="text-xs text-muted-foreground">{DISCIPLESHIP_STAFF_ROLE_LABELS[s.role as DiscipleshipStaffRole]}</p>
              </div>
              <StatusPill label={s.status === "ativo" ? "Ativo" : "Encerrado"} tone={s.status === "ativo" ? "success" : "neutral"} />
              {s.status === "ativo" && (
                <Button size="sm" variant="ghost" onClick={() => handleEnd(s.id)}>Encerrar</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Alunos (matrícula, progresso, pendências, conclusão) ─────────────────

function AlunosTab({ classRow, course, organizationId, enrollments, memberNames, onChanged }: {
  classRow: DiscipleshipClassRow;
  course: DiscipleshipCourseRow | null;
  organizationId: string;
  enrollments: DiscipleshipEnrollmentRow[];
  memberNames: Map<string, string>;
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailEnrollmentId, setDetailEnrollmentId] = useState<string | null>(null);
  const classClosed = classRow.status === "concluida" || classRow.status === "cancelada" || classRow.status === "arquivada";
  const enrolledIds = enrollments.map((e) => e.member_id);

  const handleEnroll = async (memberId: string) => {
    const status = classRow.status === "inscricoes_abertas" || classRow.status === "em_andamento" ? "matriculado" : "lista_espera";
    const { error } = await enrollMemberInClass(classRow.id, memberId, status);
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
        <Button size="sm" variant="outline" onClick={() => setPickerOpen((v) => !v)} disabled={classClosed}>
          <UserPlus size={14} className="mr-1.5" /> Matricular
        </Button>
      </div>

      {classClosed && <p className="text-xs text-muted-foreground">Turma encerrada — não aceita novas matrículas.</p>}

      {pickerOpen && (
        <div className="p-3 rounded-lg border border-border/60">
          <DiscipuladoMemberPicker organizationId={organizationId} excludeIds={enrolledIds} onSelect={(m) => handleEnroll(m.id)} />
        </div>
      )}

      {enrollments.length === 0 ? (
        <EmptyState title="Nenhum aluno matriculado ainda" description="Localize um membro e matricule-o na turma." />
      ) : (
        <div className="space-y-1.5">
          {enrollments.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{memberNames.get(e.member_id) ?? "Membro"}</p>
              </div>
              <StatusPill label={DISCIPLESHIP_ENROLLMENT_STATUS_LABELS[e.status as DiscipleshipEnrollmentStatus]} tone="info" />
              <Button size="sm" variant="ghost" onClick={() => setDetailEnrollmentId(e.id)}>Ver progresso</Button>
            </div>
          ))}
        </div>
      )}

      {detailEnrollment && course && (
        <EnrollmentDetailDialog
          enrollment={detailEnrollment}
          course={course}
          memberName={memberNames.get(detailEnrollment.member_id) ?? "Membro"}
          onClose={() => setDetailEnrollmentId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function EnrollmentDetailDialog({ enrollment, course, memberName, onClose, onChanged }: {
  enrollment: DiscipleshipEnrollmentRow;
  course: DiscipleshipCourseRow;
  memberName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { hasCapability } = useRole();
  const canOverride = hasCapability("discipleship.manage");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getDiscipleshipEnrollmentProgress>>["data"]>(null);
  const [followups, setFollowups] = useState<DiscipleshipFollowupRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followupObservation, setFollowupObservation] = useState("");
  const [followupVisibility, setFollowupVisibility] = useState<"normal" | "confidential">("normal");
  const [overrideJustification, setOverrideJustification] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      const [progressRes, followupsRes] = await Promise.all([
        getDiscipleshipEnrollmentProgress(enrollment.id),
        loadDiscipleshipFollowups(enrollment.id),
      ]);
      if (!cancelled) {
        setProgress(progressRes.data);
        setFollowups(followupsRes.rows);
        setLoadError(progressRes.error ?? followupsRes.error?.message ?? null);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [enrollment.id]);

  const attendanceEligible = !course.requires_attendance || (
    progress !== null
    && progress.total_completed_sessions > 0
    && progress.missing_attendance_records === 0
    && (progress.attendance_percentage ?? 0) >= course.minimum_attendance_percentage
  );
  const assessmentEligible = !course.requires_assessment || (
    progress !== null
    && progress.required_assessments > 0
    && progress.missing_assessment_results === 0
    && progress.average_score !== null
    && course.minimum_passing_score !== null
    && progress.average_score >= course.minimum_passing_score
  );
  const eligible = attendanceEligible && assessmentEligible;

  const currentStatus = enrollment.status as DiscipleshipEnrollmentStatus;
  const nextOptions = (["ativo", "concluido", "desistente", "transferido", "cancelado"] as DiscipleshipEnrollmentStatus[])
    .filter((s) => isValidEnrollmentStatusTransition(currentStatus, s));

  const handleTransition = async (status: DiscipleshipEnrollmentStatus, override = false) => {
    setSaving(true);
    const { error } = await updateDiscipleshipEnrollmentStatus({
      enrollment_id: enrollment.id,
      status,
      notes: override ? `Exceção registrada: ${overrideJustification}` : undefined,
      override_eligibility: override,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível atualizar a matrícula: ${error}`); return; }
    toast.success("Matrícula atualizada.");
    onChanged();
    onClose();
  };

  const handleFollowup = async () => {
    if (!followupObservation.trim()) {
      toast.error("Escreva a observação do acompanhamento.");
      return;
    }
    setSaving(true);
    const { error } = await createDiscipleshipFollowup({
      enrollment_id: enrollment.id,
      observation: followupObservation.trim(),
      visibility: followupVisibility,
    });
    setSaving(false);
    if (error) {
      toast.error(`Não foi possível registrar o acompanhamento: ${error}`);
      return;
    }
    toast.success("Acompanhamento registrado.");
    setFollowupObservation("");
    const refreshed = await loadDiscipleshipFollowups(enrollment.id);
    setFollowups(refreshed.rows);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{memberName} — progresso</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
        ) : loadError ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Não foi possível carregar o progresso: {loadError}
          </p>
        ) : (
          <div className="space-y-3">
            <StatusPill label={DISCIPLESHIP_ENROLLMENT_STATUS_LABELS[currentStatus]} tone="info" />
            {course.requires_attendance && (
              <p className="text-sm">
                Frequência: {progress?.attendance_percentage !== null && progress?.attendance_percentage !== undefined ? `${progress.attendance_percentage.toFixed(1)}%` : "sem aulas realizadas ainda"}
                {" "}(mínimo exigido: {course.minimum_attendance_percentage}%)
              </p>
            )}
            {course.requires_attendance && (progress?.missing_attendance_records ?? 0) > 0 && (
              <p className="text-xs text-amber-600">
                Há {progress?.missing_attendance_records} frequência(s) pendente(s) de lançamento.
              </p>
            )}
            {course.requires_assessment && (
              <p className="text-sm">
                Nota média normalizada (0–10): {progress?.average_score !== null && progress?.average_score !== undefined ? progress.average_score.toFixed(2) : "sem avaliações lançadas ainda"}
                {course.minimum_passing_score !== null ? ` (mínimo exigido: ${course.minimum_passing_score})` : ""}
              </p>
            )}
            {course.requires_assessment && (progress?.missing_assessment_results ?? 0) > 0 && (
              <p className="text-xs text-amber-600">
                Há {progress?.missing_assessment_results} avaliação(ões) sem nota.
              </p>
            )}

            {nextOptions.includes("concluido") && (
              <div className="p-3 rounded-lg border border-border/60 space-y-2">
                <p className="text-sm font-medium">Conclusão</p>
                {eligible ? (
                  <p className="text-sm text-emerald-600">Elegível para conclusão — cumpre as regras do curso.</p>
                ) : (
                  <div className="space-y-1.5">
                    {!attendanceEligible && <p className="text-xs text-amber-600">Frequência incompleta ou abaixo do mínimo.</p>}
                    {!assessmentEligible && <p className="text-xs text-amber-600">Avaliações incompletas ou nota abaixo do mínimo.</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving || !eligible} onClick={() => handleTransition("concluido")}>Concluir</Button>
                </div>
                {!eligible && canOverride && (
                  <div className="space-y-1.5 pt-1">
                    <FormTextareaLabeled label="Justificativa da exceção (obrigatória para concluir fora da regra)" value={overrideJustification} onChange={setOverrideJustification} rows={2} />
                    <Button size="sm" variant="outline" disabled={saving || !overrideJustification.trim()} onClick={() => handleTransition("concluido", true)}>
                      Concluir com exceção auditada
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">Acompanhamento individual</p>
              <FormTextareaLabeled
                label="Nova observação"
                value={followupObservation}
                onChange={setFollowupObservation}
                rows={3}
              />
              {hasCapability("discipleship.confidential") && (
                <FormSelectLabeled
                  label="Visibilidade"
                  value={followupVisibility}
                  onChange={(value) => setFollowupVisibility(value as "normal" | "confidential")}
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "confidential", label: "Confidencial" },
                  ]}
                />
              )}
              <Button size="sm" variant="outline" disabled={saving || !followupObservation.trim()} onClick={handleFollowup}>
                Registrar acompanhamento
              </Button>
              {followups.length > 0 && (
                <div className="space-y-1.5 border-t border-border/60 pt-2">
                  {followups.map((followup) => (
                    <div key={followup.id} className="rounded-md bg-secondary/40 p-2 text-sm">
                      <p>{followup.observation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(`${followup.occurred_at}T00:00:00`).toLocaleDateString("pt-BR")}
                        {followup.visibility === "confidential" ? " · Confidencial" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {nextOptions.filter((s) => s !== "concluido").map((status) => (
                <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => handleTransition(status)}>
                  {DISCIPLESHIP_ENROLLMENT_STATUS_LABELS[status]}
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

// ── Encontros e frequência ────────────────────────────────────────────────

function EncontrosTab({ classRow, lessons, locations, staff, memberNames, enrollments, sessions, onChanged }: {
  classRow: DiscipleshipClassRow;
  lessons: DiscipleshipLessonRow[];
  locations: DiscipleshipLocationRow[];
  staff: DiscipleshipStaffAssignmentRow[];
  memberNames: Map<string, string>;
  enrollments: DiscipleshipEnrollmentRow[];
  sessions: DiscipleshipSessionRow[];
  onChanged: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const closed = classRow.status === "concluida" || classRow.status === "cancelada" || classRow.status === "arquivada";
  const lessonTitleById = new Map(lessons.map((l) => [l.id, l.title]));

  const handleSessionStatus = async (sessionId: string, status: "realizada" | "cancelada") => {
    setSavingSessionId(sessionId);
    const { error } = await updateDiscipleshipSessionStatus(sessionId, status);
    setSavingSessionId(null);
    if (error) {
      toast.error(`Não foi possível atualizar o encontro: ${error}`);
      return;
    }
    toast.success(status === "realizada" ? "Encontro marcado como realizado." : "Encontro cancelado.");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Encontros</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={closed}>
          <CalendarPlus size={14} className="mr-1.5" /> Registrar encontro
        </Button>
      </div>
      {closed && <p className="text-xs text-muted-foreground">Turma encerrada — não aceita novos encontros.</p>}

      {sessions.length === 0 ? (
        <EmptyState title="Nenhum encontro registrado ainda" description="Registre a primeira aula para poder lançar frequência." />
      ) : (
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">
                  {new Date(s.session_date + "T00:00:00").toLocaleDateString("pt-BR")}
                  {s.lesson_id ? ` — ${lessonTitleById.get(s.lesson_id) ?? "Lição"}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.status === "agendada" ? "Agendado" : s.status === "realizada" ? "Realizado" : "Cancelado"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {s.status === "agendada" && !closed && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingSessionId === s.id}
                      onClick={() => handleSessionStatus(s.id, "realizada")}
                    >
                      Marcar realizado
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={savingSessionId === s.id}
                      onClick={() => handleSessionStatus(s.id, "cancelada")}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                {s.status === "realizada" && (
                  <Button size="sm" variant="ghost" onClick={() => setAttendanceSessionId(s.id)}>
                    <ClipboardCheck size={14} className="mr-1.5" /> Frequência
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateSessionDialog
          classId={classRow.id}
          lessons={lessons}
          locations={locations}
          staff={staff}
          memberNames={memberNames}
          onClose={() => setCreateOpen(false)}
          onCreated={onChanged}
        />
      )}

      {attendanceSessionId && (
        <AttendanceDialog
          sessionId={attendanceSessionId}
          enrollments={enrollments}
          memberNames={memberNames}
          onClose={() => setAttendanceSessionId(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function CreateSessionDialog({ classId, lessons, locations, staff, memberNames, onClose, onCreated }: {
  classId: string;
  lessons: DiscipleshipLessonRow[];
  locations: DiscipleshipLocationRow[];
  staff: DiscipleshipStaffAssignmentRow[];
  memberNames: Map<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lessonId, setLessonId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const instructors = staff.filter((s) => s.status === "ativo" && (s.role === "discipulador" || s.role === "professor"));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await createDiscipleshipSession({
      class_id: classId,
      lesson_id: lessonId || null,
      location_id: locationId || null,
      instructor_member_id: instructorId || null,
      session_date: sessionDate,
      content_covered: content.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível registrar o encontro: ${error}`); return; }
    toast.success("Encontro registrado.");
    onClose();
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar encontro</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Data" type="date" value={sessionDate} onChange={setSessionDate} required />
          <FormSelectLabeled label="Lição (opcional)" value={lessonId} onChange={setLessonId} options={lessons.map((l) => ({ value: l.id, label: `${l.sequence_number}. ${l.title}` }))} />
          <FormSelectLabeled label="Local (opcional)" value={locationId} onChange={setLocationId} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          <FormSelectLabeled
            label="Instrutor (opcional)"
            value={instructorId}
            onChange={setInstructorId}
            options={instructors.map((s) => ({ value: s.member_id, label: memberNames.get(s.member_id) ?? "Membro" }))}
          />
          <FormTextareaLabeled label="Conteúdo ministrado (opcional)" value={content} onChange={setContent} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDialog({ sessionId, enrollments, memberNames, onClose, onSaved }: {
  sessionId: string;
  enrollments: DiscipleshipEnrollmentRow[];
  memberNames: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const relevantEnrollments = useMemo(
    () => enrollments.filter((e) => e.status === "ativo" || e.status === "matriculado"),
    [enrollments],
  );
  const [statuses, setStatuses] = useState<Record<string, DiscipleshipAttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { rows } = await loadDiscipleshipAttendance(sessionId);
      if (!cancelled) {
        const initial: Record<string, DiscipleshipAttendanceStatus> = {};
        for (const e of relevantEnrollments) {
          const existing = rows.find((r) => r.enrollment_id === e.id);
          initial[e.id] = (existing?.status as DiscipleshipAttendanceStatus) ?? "nao_lancado";
        }
        setStatuses(initial);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId, relevantEnrollments]);

  const handleSave = async () => {
    setSaving(true);
    const entries = relevantEnrollments.map((e) => ({ enrollment_id: e.id, status: statuses[e.id] ?? "nao_lancado" }));
    const { error } = await recordDiscipleshipAttendance(sessionId, entries);
    setSaving(false);
    if (error) { toast.error(`Não foi possível salvar a frequência: ${error}`); return; }
    toast.success("Frequência registrada.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Lançar frequência</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
        ) : relevantEnrollments.length === 0 ? (
          <EmptyState title="Nenhum aluno ativo nesta turma" description="Matricule alunos antes de lançar frequência." />
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatuses(Object.fromEntries(relevantEnrollments.map((e) => [e.id, "presente"])))}
            >
              Marcar todos como presentes
            </Button>
            {relevantEnrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/60">
                <span className="text-sm truncate">{memberNames.get(e.member_id) ?? "Membro"}</span>
                <select
                  aria-label={`Frequência de ${memberNames.get(e.member_id) ?? "membro"}`}
                  value={statuses[e.id] ?? "nao_lancado"}
                  onChange={(ev) => setStatuses((prev) => ({ ...prev, [e.id]: ev.target.value as DiscipleshipAttendanceStatus }))}
                  className="px-2 py-1 rounded-lg border border-input bg-background text-sm"
                >
                  {DISCIPLESHIP_ATTENDANCE_STATUSES.map((s) => (
                    <option key={s} value={s}>{DISCIPLESHIP_ATTENDANCE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading || relevantEnrollments.length === 0}>{saving ? "Salvando…" : "Salvar frequência"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Avaliações ───────────────────────────────────────────────────────────

function AvaliacoesTab({ classRow, assessments, enrollments, memberNames, onChanged }: {
  classRow: DiscipleshipClassRow;
  assessments: DiscipleshipAssessmentRow[];
  enrollments: DiscipleshipEnrollmentRow[];
  memberNames: Map<string, string>;
  onChanged: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsAssessmentId, setResultsAssessmentId] = useState<string | null>(null);
  const [savingAssessmentId, setSavingAssessmentId] = useState<string | null>(null);
  const closed = classRow.status === "concluida" || classRow.status === "cancelada" || classRow.status === "arquivada";

  const handleAssessmentStatus = async (assessmentId: string, status: "aplicada" | "cancelada") => {
    setSavingAssessmentId(assessmentId);
    const { error } = await updateDiscipleshipAssessmentStatus(assessmentId, status);
    setSavingAssessmentId(null);
    if (error) {
      toast.error(`Não foi possível atualizar a avaliação: ${error}`);
      return;
    }
    toast.success(status === "aplicada" ? "Avaliação marcada como aplicada." : "Avaliação cancelada.");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Avaliações</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={closed}>
          <Plus size={14} className="mr-1.5" /> Nova avaliação
        </Button>
      </div>

      {assessments.length === 0 ? (
        <EmptyState title="Nenhuma avaliação cadastrada" description="Crie uma avaliação para lançar notas dos alunos." />
      ) : (
        <div className="space-y-1.5">
          {assessments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {DISCIPLESHIP_ASSESSMENT_TYPE_LABELS[a.assessment_type as DiscipleshipAssessmentType]}
                  {" · "}nota máx. {a.max_score}
                  {" · "}{a.status === "planejada" ? "Planejada" : a.status === "aplicada" ? "Aplicada" : "Cancelada"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {a.status === "planejada" && !closed && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingAssessmentId === a.id}
                      onClick={() => handleAssessmentStatus(a.id, "aplicada")}
                    >
                      Marcar aplicada
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={savingAssessmentId === a.id}
                      onClick={() => handleAssessmentStatus(a.id, "cancelada")}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                {a.status === "aplicada" && (
                  <Button size="sm" variant="ghost" onClick={() => setResultsAssessmentId(a.id)}>
                    Lançar notas
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateAssessmentDialog classId={classRow.id} onClose={() => setCreateOpen(false)} onCreated={onChanged} />
      )}
      {resultsAssessmentId && (
        <AssessmentResultsDialog
          assessment={assessments.find((a) => a.id === resultsAssessmentId)!}
          enrollments={enrollments}
          memberNames={memberNames}
          onClose={() => setResultsAssessmentId(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function CreateAssessmentDialog({ classId, onClose, onCreated }: { classId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [assessmentType, setAssessmentType] = useState<DiscipleshipAssessmentType>("prova");
  const [maxScore, setMaxScore] = useState("10");
  const [weight, setWeight] = useState("1");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Informe o título da avaliação"); return; }
    setSaving(true);
    const { error } = await createDiscipleshipAssessment({
      class_id: classId,
      title: title.trim(),
      assessment_type: assessmentType,
      max_score: Number(maxScore) || 10,
      weight: Number(weight) || 1,
      scheduled_at: scheduledAt || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar a avaliação: ${error}`); return; }
    toast.success("Avaliação criada.");
    onClose();
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova avaliação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Título" value={title} onChange={setTitle} required placeholder="Ex.: Avaliação da Lição 5" />
          <FormSelectLabeled label="Tipo" value={assessmentType} onChange={(v) => setAssessmentType(v as DiscipleshipAssessmentType)} options={DISCIPLESHIP_ASSESSMENT_TYPES.map((t) => ({ value: t, label: DISCIPLESHIP_ASSESSMENT_TYPE_LABELS[t] }))} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Nota máxima" type="number" min={0.01} step="0.01" value={maxScore} onChange={setMaxScore} />
            <FormInputLabeled label="Peso" type="number" min={0.01} step="0.01" value={weight} onChange={setWeight} />
          </div>
          <FormInputLabeled label="Data prevista (opcional)" type="date" value={scheduledAt} onChange={setScheduledAt} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar avaliação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssessmentResultsDialog({ assessment, enrollments, memberNames, onClose, onSaved }: {
  assessment: DiscipleshipAssessmentRow;
  enrollments: DiscipleshipEnrollmentRow[];
  memberNames: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const relevantEnrollments = enrollments.filter((e) => e.status === "ativo" || e.status === "matriculado" || e.status === "concluido");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { rows } = await loadDiscipleshipAssessmentResults(assessment.id);
      if (!cancelled) {
        const initial: Record<string, string> = {};
        for (const r of rows) initial[r.enrollment_id] = String(r.score);
        setScores(initial);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [assessment.id]);

  const handleSave = async () => {
    const entries = Object.entries(scores).filter(([, v]) => v.trim() !== "");
    const invalidEntry = entries.find(([, value]) => {
      const score = Number(value);
      return !Number.isFinite(score) || score < 0 || score > assessment.max_score;
    });
    if (invalidEntry) {
      const [enrollmentId] = invalidEntry;
      toast.error(`Nota inválida para ${memberNames.get(enrollments.find((e) => e.id === enrollmentId)?.member_id ?? "") ?? "aluno"} (deve estar entre 0 e ${assessment.max_score})`);
      return;
    }

    setSaving(true);
    const failures: string[] = [];
    for (const [enrollmentId, value] of entries) {
      const score = Number(value);
      const { error } = await recordDiscipleshipAssessmentResult({ assessment_id: assessment.id, enrollment_id: enrollmentId, score });
      if (error) failures.push(error);
    }
    setSaving(false);
    if (failures.length > 0) {
      toast.error(`Não foi possível salvar ${failures.length} nota(s): ${failures[0]}`);
      return;
    }
    toast.success("Notas salvas.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Lançar notas — {assessment.title}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
        ) : relevantEnrollments.length === 0 ? (
          <EmptyState title="Nenhum aluno elegível" description="Matricule alunos antes de lançar notas." />
        ) : (
          <div className="space-y-2">
            {relevantEnrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/60">
                <span className="text-sm truncate">{memberNames.get(e.member_id) ?? "Membro"}</span>
                <input
                  type="number"
                  min={0}
                  max={assessment.max_score}
                  step="0.01"
                  aria-label={`Nota de ${memberNames.get(e.member_id) ?? "membro"}`}
                  value={scores[e.id] ?? ""}
                  onChange={(ev) => setScores((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                  className="w-24 px-2 py-1 rounded-lg border border-input bg-background text-sm"
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading || relevantEnrollments.length === 0}>{saving ? "Salvando…" : "Salvar notas"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
