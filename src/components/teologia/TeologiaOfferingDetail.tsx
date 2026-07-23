/**
 * Detalhe da oferta de matéria (OPERAÇÃO 3) — traduz "Manutenção de Listas
 * para Frequência e Avaliação" e "Frequência e Avaliação — Lançamentos de
 * Notas — Mod01/Mod02/Mod03" do WinTechi: UMA tela por oferta, com sessões
 * (aulas), frequência e avaliações usando modelos configuráveis (nunca três
 * telas fixas). Matrícula por oferta (tentativas/repetência) também vive
 * aqui, pois é o nível em que a repetência realmente ocorre.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, X, Plus, UserPlus, ClipboardCheck, CalendarPlus, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import {
  loadTheologyOfferingEnrollments, enrollMemberInTheologyOffering, updateTheologyOfferingEnrollmentStatus,
  loadTheologySessions, createTheologySession, updateTheologySessionStatus,
  loadTheologyAttendance, recordTheologyAttendance,
  loadTheologyAssessmentModels, loadTheologyAssessmentModelComponents,
  loadTheologyAssessments, createTheologyAssessment, updateTheologyAssessmentStatus,
  loadTheologyAssessmentResults, recordTheologyAssessmentResult, amendTheologyAssessmentResult,
  getTheologyMemberLabels, loadTheologyStaffAssignments, loadTheologyEnrollments,
  type TheologyClassRow, type TheologyClassOfferingRow, type TheologyOfferingEnrollmentRow,
  type TheologySessionRow, type TheologyAssessmentModelRow, type TheologyAssessmentModelComponentRow,
  type TheologyAssessmentRow, type TheologyAssessmentResultRow, type TheologyStaffAssignmentRow,
} from "@/lib/theology/service";
import {
  THEOLOGY_OFFERING_ENROLLMENT_STATUS_LABELS, THEOLOGY_ATTENDANCE_STATUSES, THEOLOGY_ATTENDANCE_STATUS_LABELS,
  THEOLOGY_ASSESSMENT_TYPES, THEOLOGY_ASSESSMENT_TYPE_LABELS,
  type TheologyAttendanceStatus, type TheologyOfferingEnrollmentStatus, type TheologyAssessmentType,
  type TheologyOfferingStatus,
} from "@/lib/theology/constants";
import {
  isValidOfferingEnrollmentStatusTransition, isOfferingClosed, hasOfferingCapacity,
} from "@/lib/theology/rules";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, StatusPill, EmptyState } from "./teologiaFormHelpers";
import { TeologiaMemberPicker } from "./TeologiaMemberPicker";

type TabKey = "alunos" | "aulas" | "avaliacoes";
const TABS: { key: TabKey; label: string }[] = [
  { key: "alunos", label: "Alunos na matéria" },
  { key: "aulas", label: "Aulas e frequência" },
  { key: "avaliacoes", label: "Avaliações e notas" },
];

export function TeologiaOfferingDetail({ offering, subjectName, classRow, organizationId, onClose, onChanged }: {
  offering: TheologyClassOfferingRow;
  subjectName: string;
  classRow: TheologyClassRow;
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("alunos");
  const [loading, setLoading] = useState(true);
  const [offeringEnrollments, setOfferingEnrollments] = useState<TheologyOfferingEnrollmentRow[]>([]);
  const [sessions, setSessions] = useState<TheologySessionRow[]>([]);
  const [assessments, setAssessments] = useState<TheologyAssessmentRow[]>([]);
  const [staff, setStaff] = useState<TheologyStaffAssignmentRow[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [memberIdByEnrollmentId, setMemberIdByEnrollmentId] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const closed = isOfferingClosed(offering.status as TheologyOfferingStatus);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    const [enrollmentsRes, sessionsRes, assessmentsRes, staffRes, classEnrollmentsRes] = await Promise.all([
      loadTheologyOfferingEnrollments(offering.id),
      loadTheologySessions(offering.id),
      loadTheologyAssessments(offering.id),
      loadTheologyStaffAssignments(classRow.id),
      loadTheologyEnrollments(classRow.id),
    ]);
    setOfferingEnrollments(enrollmentsRes.rows);
    setSessions(sessionsRes.rows);
    setAssessments(assessmentsRes.rows);
    setStaff(staffRes.rows);
    const enrollmentMemberMap = new Map(classEnrollmentsRes.rows.map((e) => [e.id, e.member_id]));
    setMemberIdByEnrollmentId(enrollmentMemberMap);

    const memberIds = [...new Set([
      ...staffRes.rows.map((s) => s.member_id),
      ...sessionsRes.rows.map((s) => s.instructor_member_id).filter((id): id is string => !!id),
      ...classEnrollmentsRes.rows.map((e) => e.member_id),
    ])];
    if (memberIds.length > 0) {
      const { rows } = await getTheologyMemberLabels(organizationId, memberIds);
      setMemberNames(new Map(rows.map((m) => [m.id, m.known_name || m.full_name])));
    }
    const firstError = [enrollmentsRes.error, sessionsRes.error, assessmentsRes.error, staffRes.error, classEnrollmentsRes.error].find(Boolean);
    setLoadError(firstError?.message ?? null);
    setLoading(false);
  }, [offering.id, classRow.id, organizationId]);

  useEffect(() => { void reloadAll(); }, [reloadAll]);

  const notifyChanged = () => { reloadAll(); onChanged(); };
  const instructors = staff.filter((s) => s.status === "ativo" && (s.role === "professor" || s.role === "auxiliar"));
  const studentNameByEnrollmentId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [enrollmentId, memberId] of memberIdByEnrollmentId) {
      map.set(enrollmentId, memberNames.get(memberId) ?? "Aluno");
    }
    return map;
  }, [memberIdByEnrollmentId, memberNames]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen size={18} /> {subjectName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando oferta…</div>
        ) : loadError ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível carregar esta oferta. {loadError}
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

            {tab === "alunos" && (
              <AlunosOfertaTab
                offering={offering}
                organizationId={organizationId}
                offeringEnrollments={offeringEnrollments}
                memberIdByEnrollmentId={memberIdByEnrollmentId}
                studentNameByEnrollmentId={studentNameByEnrollmentId}
                closed={closed}
                onChanged={notifyChanged}
              />
            )}
            {tab === "aulas" && (
              <AulasTab
                offering={offering}
                sessions={sessions}
                instructors={instructors}
                memberNames={memberNames}
                offeringEnrollments={offeringEnrollments}
                studentNameByEnrollmentId={studentNameByEnrollmentId}
                closed={closed}
                onChanged={notifyChanged}
              />
            )}
            {tab === "avaliacoes" && (
              <AvaliacoesOfertaTab
                offering={offering}
                organizationId={organizationId}
                assessments={assessments}
                offeringEnrollments={offeringEnrollments}
                studentNameByEnrollmentId={studentNameByEnrollmentId}
                closed={closed}
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

// ── Alunos matriculados na matéria (tentativas/repetência) ──────────────

function AlunosOfertaTab({ offering, organizationId, offeringEnrollments, memberIdByEnrollmentId, studentNameByEnrollmentId, closed, onChanged }: {
  offering: TheologyClassOfferingRow;
  organizationId: string;
  offeringEnrollments: TheologyOfferingEnrollmentRow[];
  memberIdByEnrollmentId: Map<string, string>;
  studentNameByEnrollmentId: Map<string, string>;
  closed: boolean;
  onChanged: () => void;
}) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("theology.manage");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const memberIdByClassEnrollmentId = memberIdByEnrollmentId;
  const openAttemptsCount = offeringEnrollments.filter((oe) => oe.status === "planejada" || oe.status === "em_andamento").length;
  const atCapacity = !hasOfferingCapacity(offering.capacity, openAttemptsCount);
  const enrolledMemberIds = new Set(
    offeringEnrollments
      .filter((oe) => oe.status !== "cancelada")
      .map((oe) => memberIdByClassEnrollmentId.get(oe.enrollment_id))
      .filter((id): id is string => !!id),
  );
  const classEnrollmentIdByMember = new Map([...memberIdByClassEnrollmentId.entries()].map(([enrollmentId, memberId]) => [memberId, enrollmentId]));

  const handleEnroll = async (memberId: string) => {
    const classEnrollmentId = classEnrollmentIdByMember.get(memberId);
    if (!classEnrollmentId) {
      toast.error("Este membro precisa estar matriculado na turma antes de ser matriculado nesta matéria.");
      return;
    }
    setSaving(true);
    const { error } = await enrollMemberInTheologyOffering(classEnrollmentId, offering.id);
    setSaving(false);
    if (error) { toast.error(`Não foi possível matricular na matéria: ${error}`); return; }
    toast.success("Matrícula na matéria registrada.");
    setPickerOpen(false);
    onChanged();
  };

  const handleTransition = async (oe: TheologyOfferingEnrollmentRow, status: TheologyOfferingEnrollmentStatus) => {
    const { error } = await updateTheologyOfferingEnrollmentStatus({ offering_enrollment_id: oe.id, status });
    if (error) { toast.error(`Não foi possível atualizar: ${error}`); return; }
    toast.success("Atualizado.");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Alunos nesta matéria ({offeringEnrollments.length}{offering.capacity ? ` / ${offering.capacity}` : ""})</p>
        <Button size="sm" variant="outline" onClick={() => setPickerOpen((v) => !v)} disabled={closed || !canManage}>
          <UserPlus size={14} className="mr-1.5" /> Matricular
        </Button>
      </div>
      {closed && <p className="text-xs text-muted-foreground">Oferta encerrada — não aceita novas matrículas.</p>}
      {!closed && atCapacity && <p className="text-xs text-amber-600">Matéria na capacidade máxima.</p>}

      {pickerOpen && (
        <div className="p-3 rounded-lg border border-border/60">
          <p className="text-xs text-muted-foreground mb-2">Apenas alunos já matriculados nesta turma aparecem aqui.</p>
          <TeologiaMemberPicker organizationId={organizationId} excludeIds={[...enrolledMemberIds]} onSelect={(m) => handleEnroll(m.id)} />
        </div>
      )}

      {offeringEnrollments.length === 0 ? (
        <EmptyState title="Nenhum aluno matriculado nesta matéria ainda" description="Matricule um aluno já matriculado na turma." />
      ) : (
        <div className="space-y-1.5">
          {offeringEnrollments.map((oe) => {
            const nextOptions = (["em_andamento", "concluida", "cancelada"] as TheologyOfferingEnrollmentStatus[])
              .filter((s) => isValidOfferingEnrollmentStatusTransition(oe.status as TheologyOfferingEnrollmentStatus, s));
            return (
              <div key={oe.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
                <div className="min-w-0">
                  <p className="text-sm truncate">{studentNameByEnrollmentId.get(oe.enrollment_id) ?? "Aluno"}</p>
                  <p className="text-xs text-muted-foreground">
                    Tentativa {oe.attempt_number}
                    {oe.final_grade !== null ? ` · Nota final: ${oe.final_grade}` : ""}
                  </p>
                </div>
                <StatusPill label={THEOLOGY_OFFERING_ENROLLMENT_STATUS_LABELS[oe.status as TheologyOfferingEnrollmentStatus]} tone="info" />
                {canManage && <div className="flex gap-1">
                  {nextOptions.map((s) => (
                    <Button key={s} size="sm" variant="ghost" disabled={saving} onClick={() => handleTransition(oe, s)}>
                      {s === "concluida" ? "Calcular e concluir" : THEOLOGY_OFFERING_ENROLLMENT_STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Aulas e frequência ─────────────────────────────────────────────────

function AulasTab({ offering, sessions, instructors, memberNames, offeringEnrollments, studentNameByEnrollmentId, closed, onChanged }: {
  offering: TheologyClassOfferingRow;
  sessions: TheologySessionRow[];
  instructors: TheologyStaffAssignmentRow[];
  memberNames: Map<string, string>;
  offeringEnrollments: TheologyOfferingEnrollmentRow[];
  studentNameByEnrollmentId: Map<string, string>;
  closed: boolean;
  onChanged: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);

  const handleSessionStatus = async (sessionId: string, status: "realizada" | "cancelada") => {
    setSavingSessionId(sessionId);
    const { error } = await updateTheologySessionStatus(sessionId, status);
    setSavingSessionId(null);
    if (error) { toast.error(`Não foi possível atualizar a aula: ${error}`); return; }
    toast.success(status === "realizada" ? "Aula marcada como realizada." : "Aula cancelada.");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Aulas</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={closed}>
          <CalendarPlus size={14} className="mr-1.5" /> Registrar aula
        </Button>
      </div>
      {closed && <p className="text-xs text-muted-foreground">Matéria encerrada — não aceita novas aulas.</p>}

      {sessions.length === 0 ? (
        <EmptyState title="Nenhuma aula registrada ainda" description="Registre a primeira aula para poder lançar frequência." />
      ) : (
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">
                  {new Date(`${s.session_date}T00:00:00`).toLocaleDateString("pt-BR")}
                  {s.instructor_member_id ? ` — ${memberNames.get(s.instructor_member_id) ?? "Professor"}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.status === "agendada" ? "Agendada" : s.status === "realizada" ? "Realizada" : "Cancelada"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {s.status === "agendada" && !closed && (
                  <>
                    <Button size="sm" variant="outline" disabled={savingSessionId === s.id} onClick={() => handleSessionStatus(s.id, "realizada")}>Marcar realizada</Button>
                    <Button size="sm" variant="ghost" disabled={savingSessionId === s.id} onClick={() => handleSessionStatus(s.id, "cancelada")}>Cancelar</Button>
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
        <CreateSessionDialog offeringId={offering.id} instructors={instructors} memberNames={memberNames} onClose={() => setCreateOpen(false)} onCreated={onChanged} />
      )}
      {attendanceSessionId && (
        <AttendanceDialog sessionId={attendanceSessionId} offeringEnrollments={offeringEnrollments} studentNameByEnrollmentId={studentNameByEnrollmentId} onClose={() => setAttendanceSessionId(null)} onSaved={onChanged} />
      )}
    </div>
  );
}

function CreateSessionDialog({ offeringId, instructors, memberNames, onClose, onCreated }: {
  offeringId: string;
  instructors: TheologyStaffAssignmentRow[];
  memberNames: Map<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [instructorId, setInstructorId] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await createTheologySession({
      offering_id: offeringId,
      instructor_member_id: instructorId || null,
      session_date: sessionDate,
      content_covered: content.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível registrar a aula: ${error}`); return; }
    toast.success("Aula registrada.");
    onClose();
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar aula</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Data" type="date" value={sessionDate} onChange={setSessionDate} required />
          <FormSelectLabeled label="Professor (opcional)" value={instructorId} onChange={setInstructorId} options={instructors.map((s) => ({ value: s.member_id, label: memberNames.get(s.member_id) ?? "Membro" }))} />
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

function AttendanceDialog({ sessionId, offeringEnrollments, studentNameByEnrollmentId, onClose, onSaved }: {
  sessionId: string;
  offeringEnrollments: TheologyOfferingEnrollmentRow[];
  studentNameByEnrollmentId: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const relevant = useMemo(() => offeringEnrollments.filter((oe) => oe.status === "em_andamento" || oe.status === "planejada"), [offeringEnrollments]);
  const [statuses, setStatuses] = useState<Record<string, TheologyAttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { rows } = await loadTheologyAttendance(sessionId);
      if (!cancelled) {
        const initial: Record<string, TheologyAttendanceStatus> = {};
        for (const oe of relevant) {
          const existing = rows.find((r) => r.offering_enrollment_id === oe.id);
          initial[oe.id] = (existing?.status as TheologyAttendanceStatus) ?? "nao_lancado";
        }
        setStatuses(initial);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId, relevant]);

  const handleSave = async () => {
    setSaving(true);
    const entries = relevant.map((oe) => ({ offering_enrollment_id: oe.id, status: statuses[oe.id] ?? "nao_lancado" }));
    const { error } = await recordTheologyAttendance(sessionId, entries);
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
        ) : relevant.length === 0 ? (
          <EmptyState title="Nenhum aluno ativo nesta matéria" description="Matricule alunos na matéria antes de lançar frequência." />
        ) : (
          <div className="space-y-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setStatuses(Object.fromEntries(relevant.map((oe) => [oe.id, "presente"])))}>
              Marcar todos como presentes
            </Button>
            {relevant.map((oe) => (
              <div key={oe.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/60">
                <span className="text-sm truncate">Tentativa {oe.attempt_number} — {studentNameByEnrollmentId.get(oe.enrollment_id) ?? "Aluno"}</span>
                <select
                  aria-label="Situação de frequência"
                  value={statuses[oe.id] ?? "nao_lancado"}
                  onChange={(ev) => setStatuses((prev) => ({ ...prev, [oe.id]: ev.target.value as TheologyAttendanceStatus }))}
                  className="px-2 py-1 rounded-lg border border-input bg-background text-sm"
                >
                  {THEOLOGY_ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{THEOLOGY_ATTENDANCE_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading || relevant.length === 0}>{saving ? "Salvando…" : "Salvar frequência"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Avaliações e notas (modelos configuráveis — substituem Mod01/02/03) ──

function AvaliacoesOfertaTab({ offering, organizationId, assessments, offeringEnrollments, studentNameByEnrollmentId, closed, onChanged }: {
  offering: TheologyClassOfferingRow;
  organizationId: string;
  assessments: TheologyAssessmentRow[];
  offeringEnrollments: TheologyOfferingEnrollmentRow[];
  studentNameByEnrollmentId: Map<string, string>;
  closed: boolean;
  onChanged: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsAssessmentId, setResultsAssessmentId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [models, setModels] = useState<TheologyAssessmentModelRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadTheologyAssessmentModels(organizationId).then((res) => { if (!cancelled) setModels(res.rows); });
    return () => { cancelled = true; };
  }, [organizationId]);

  const handleStatus = async (
    assessmentId: string,
    status: "agendada" | "aplicada" | "publicada" | "cancelada",
  ) => {
    setSavingId(assessmentId);
    const { error } = await updateTheologyAssessmentStatus(assessmentId, status);
    setSavingId(null);
    if (error) { toast.error(`Não foi possível atualizar a avaliação: ${error}`); return; }
    toast.success("Avaliação atualizada.");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Avaliações</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={closed || models.length === 0}>
          <Plus size={14} className="mr-1.5" /> Nova avaliação
        </Button>
      </div>
      {models.length === 0 && (
        <p className="text-xs text-amber-600">Nenhum modelo de avaliação configurado ainda — crie um na aba “Configurações”.</p>
      )}

      {assessments.length === 0 ? (
        <EmptyState title="Nenhuma avaliação cadastrada" description="Crie uma avaliação a partir de um modelo configurável para lançar notas dos alunos." />
      ) : (
        <div className="space-y-1.5">
          {assessments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
              <div className="min-w-0">
                <p className="text-sm truncate">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {THEOLOGY_ASSESSMENT_TYPE_LABELS[a.assessment_type as TheologyAssessmentType]}
                  {" · "}{a.status === "rascunho" ? "Rascunho" : a.status === "agendada" ? "Agendada" : a.status === "aplicada" ? "Aplicada" : a.status === "publicada" ? "Publicada" : "Cancelada"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {a.status === "rascunho" && !closed && (
                  <Button size="sm" variant="outline" disabled={savingId === a.id} onClick={() => handleStatus(a.id, "agendada")}>Agendar</Button>
                )}
                {a.status === "agendada" && !closed && (
                  <Button size="sm" variant="outline" disabled={savingId === a.id} onClick={() => handleStatus(a.id, "aplicada")}>Marcar aplicada</Button>
                )}
                {a.status === "aplicada" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setResultsAssessmentId(a.id)}>Lançar notas</Button>
                    <Button size="sm" variant="outline" disabled={savingId === a.id} onClick={() => handleStatus(a.id, "publicada")}>Publicar</Button>
                  </>
                )}
                {a.status === "publicada" && (
                  <Button size="sm" variant="ghost" onClick={() => setResultsAssessmentId(a.id)}>Ver notas</Button>
                )}
                {(a.status === "rascunho" || a.status === "agendada") && !closed && (
                  <Button size="sm" variant="ghost" disabled={savingId === a.id} onClick={() => handleStatus(a.id, "cancelada")}>Cancelar</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateAssessmentDialog offeringId={offering.id} models={models} onClose={() => setCreateOpen(false)} onCreated={onChanged} />
      )}
      {resultsAssessmentId && (
        <AssessmentResultsDialog
          assessment={assessments.find((a) => a.id === resultsAssessmentId)!}
          offeringEnrollments={offeringEnrollments}
          studentNameByEnrollmentId={studentNameByEnrollmentId}
          onClose={() => setResultsAssessmentId(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function CreateAssessmentDialog({ offeringId, models, onClose, onCreated }: {
  offeringId: string;
  models: TheologyAssessmentModelRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [modelId, setModelId] = useState("");
  const [title, setTitle] = useState("");
  const [assessmentType, setAssessmentType] = useState<TheologyAssessmentType>("prova");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!modelId) { toast.error("Selecione o modelo de avaliação."); return; }
    if (!title.trim()) { toast.error("Informe o título da avaliação."); return; }
    setSaving(true);
    const { error } = await createTheologyAssessment({
      offering_id: offeringId,
      model_id: modelId,
      title: title.trim(),
      assessment_type: assessmentType,
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
          <FormSelectLabeled label="Modelo de avaliação" value={modelId} onChange={setModelId} required options={models.map((m) => ({ value: m.id, label: m.name }))} />
          <FormInputLabeled label="Título" value={title} onChange={setTitle} required placeholder="Ex.: Avaliação da Unidade 3" />
          <FormSelectLabeled label="Tipo" value={assessmentType} onChange={(v) => setAssessmentType(v as TheologyAssessmentType)} options={THEOLOGY_ASSESSMENT_TYPES.map((t) => ({ value: t, label: THEOLOGY_ASSESSMENT_TYPE_LABELS[t] }))} />
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

function AssessmentResultsDialog({ assessment, offeringEnrollments, studentNameByEnrollmentId, onClose, onSaved }: {
  assessment: TheologyAssessmentRow;
  offeringEnrollments: TheologyOfferingEnrollmentRow[];
  studentNameByEnrollmentId: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasCapability } = useRole();
  const canManage = hasCapability("theology.manage");
  const published = assessment.status === "publicada";
  const editable = assessment.status === "aplicada" || (published && canManage);
  const relevant = offeringEnrollments.filter((oe) => (
    oe.status === "em_andamento" || (published && oe.status === "concluida")
  ));
  const [components, setComponents] = useState<TheologyAssessmentModelComponentRow[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({}); // key: `${componentId}:${offeringEnrollmentId}`
  const [initialScores, setInitialScores] = useState<Record<string, string>>({});
  const [resultsByKey, setResultsByKey] = useState<Record<string, TheologyAssessmentResultRow>>({});
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [componentsRes, resultsRes] = await Promise.all([
        loadTheologyAssessmentModelComponents(assessment.model_id),
        loadTheologyAssessmentResults(assessment.id),
      ]);
      if (!cancelled) {
        setComponents(componentsRes.rows);
        const initial: Record<string, string> = {};
        const indexed: Record<string, TheologyAssessmentResultRow> = {};
        for (const r of resultsRes.rows) {
          const key = `${r.component_id}:${r.offering_enrollment_id}`;
          initial[key] = String(r.score);
          indexed[key] = r;
        }
        setScores(initial);
        setInitialScores(initial);
        setResultsByKey(indexed);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [assessment.id, assessment.model_id]);

  const handleSave = async () => {
    if (!editable) return;
    if (published && !justification.trim()) {
      toast.error("Informe a justificativa para alterar uma nota publicada.");
      return;
    }

    setSaving(true);
    const failures: string[] = [];
    for (const [key, value] of Object.entries(scores)) {
      if (value.trim() === "") continue;
      if (published && value === initialScores[key]) continue;
      const [componentId, offeringEnrollmentId] = key.split(":");
      const score = Number(value);
      if (!Number.isFinite(score) || score < 0) { failures.push("nota inválida"); continue; }
      const existingResult = resultsByKey[key];
      const { error } = published
        ? existingResult
          ? await amendTheologyAssessmentResult({
              result_id: existingResult.id,
              new_score: score,
              justification: justification.trim(),
            })
          : { error: "não é possível acrescentar uma nota depois da publicação" }
        : await recordTheologyAssessmentResult({
            assessment_id: assessment.id,
            component_id: componentId,
            offering_enrollment_id: offeringEnrollmentId,
            score,
          });
      if (error) failures.push(error);
    }
    setSaving(false);
    if (failures.length > 0) { toast.error(`Não foi possível salvar ${failures.length} nota(s): ${failures[0]}`); return; }
    toast.success("Notas salvas.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>{published ? "Notas publicadas" : "Lançar notas"} — {assessment.title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
        ) : relevant.length === 0 ? (
          <EmptyState title="Nenhum aluno elegível" description="Matricule alunos na matéria antes de lançar notas." />
        ) : components.length === 0 ? (
          <EmptyState title="Este modelo não tem componentes cadastrados" description="Adicione componentes ao modelo de avaliação em Configurações." />
        ) : (
          <div className="space-y-3">
            {relevant.map((oe) => (
              <div key={oe.id} className="p-2.5 rounded-lg border border-border/60 space-y-1.5">
                <p className="text-sm font-medium truncate">{studentNameByEnrollmentId.get(oe.enrollment_id) ?? "Aluno"} <span className="text-xs text-muted-foreground">(tentativa {oe.attempt_number})</span></p>
                {components.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">{c.name}{c.is_mandatory ? " *" : ""} (máx. {c.max_score})</span>
                    <input
                      type="number"
                      min={0}
                      max={c.max_score}
                      step="0.01"
                      aria-label={`Nota de ${c.name}`}
                      value={scores[`${c.id}:${oe.id}`] ?? ""}
                      onChange={(ev) => setScores((prev) => ({ ...prev, [`${c.id}:${oe.id}`]: ev.target.value }))}
                      disabled={!editable || (published && !resultsByKey[`${c.id}:${oe.id}`])}
                      className="w-20 px-2 py-1 rounded-lg border border-input bg-background text-sm"
                    />
                  </div>
                ))}
              </div>
            ))}
            {published && canManage && (
              <FormTextareaLabeled
                label="Justificativa obrigatória para alterar nota publicada"
                value={justification}
                onChange={setJustification}
                required
              />
            )}
            {published && !canManage && (
              <p className="text-xs text-muted-foreground">
                Notas publicadas são somente leitura. Apenas a gestão de Teologia pode corrigi-las, sempre com justificativa e auditoria.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{editable ? "Cancelar" : "Fechar"}</Button>
          {editable && (
            <Button
              onClick={handleSave}
              disabled={saving || loading || relevant.length === 0 || components.length === 0}
            >
              {saving ? "Salvando…" : published ? "Salvar correção auditada" : "Salvar notas"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
