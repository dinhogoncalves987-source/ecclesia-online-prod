import { AdminLayout } from "@/components/AdminLayout";
import { DocumentActions } from "@/components/DocumentActions";
import { FileText, Plus, X, Calendar, Clock, User, Users, Pencil, Trash2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { canWriteSecretaria, canDeleteSchedule } from "@/lib/permissions";
import { format } from "date-fns";
import { ptBR, enUS, es, type Locale } from "date-fns/locale";

type ScheduleStatus = "rascunho" | "publicada" | "concluida";
type AssignmentStatus = "pendente" | "confirmado" | "recusado";

type Schedule = {
  id: string;
  title: string;
  description: string | null;
  schedule_date: string;
  schedule_time: string | null;
  ministry: string;
  status: ScheduleStatus;
  created_by: string | null;
};

type Assignment = {
  id: string;
  schedule_id: string;
  member_id: string;
  role: string;
  status: AssignmentStatus;
  notes: string | null;
  full_name: string;
};

type AssignmentSummary = {
  total: number;
  confirmado: number;
  pendente: number;
  recusado: number;
};

type ScheduleWithSummary = Schedule & { summary: AssignmentSummary };

type ActiveMember = { id: string; full_name: string };

const ministries = ["Louvor", "Infantil", "Mídia", "Recepção", "Intercessão", "Pregação", "Geral"];
const scheduleStatuses: ScheduleStatus[] = ["rascunho", "publicada", "concluida"];
const assignmentStatuses: AssignmentStatus[] = ["pendente", "confirmado", "recusado"];

const roleHints: Record<string, string[]> = {
  Louvor: ["Regente", "Vocal", "Teclado", "Guitarra", "Baixo", "Bateria"],
  Recepção: ["Recepção", "Estacionamento", "Café", "Direcionamento"],
  Infantil: ["Professor", "Auxiliar", "Recepção Kids", "Lanche"],
  Mídia: ["Som", "Projeção", "Transmissão", "Câmera"],
  Intercessão: ["Intercessor", "Coordenador"],
  Pregação: ["Pregador", "Leitor", "Oração"],
  Geral: ["Coordenador", "Apoio"],
};

function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function formatScheduleDate(iso: string, loc: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "dd MMM yyyy", { locale: loc });
}

function formatScheduleTime(time: string | null, iso: string): string {
  if (time) return time.slice(0, 5);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "HH:mm");
}

function dateInputFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd");
}

function buildTimestamptz(dateStr: string, timeStr: string): string {
  const time = normalizeTimeInput(timeStr) || "09:00";
  return `${dateStr}T${time}:00`;
}

function emptyForm() {
  return {
    title: "",
    schedule_date: "",
    schedule_time: "",
    ministry: "Geral",
    description: "",
    status: "rascunho" as ScheduleStatus,
  };
}

function emptyAssignmentForm() {
  return {
    member_id: "",
    role: "",
    status: "pendente" as AssignmentStatus,
    notes: "",
  };
}

function summarizeAssignments(assignments: Assignment[]): AssignmentSummary {
  return {
    total: assignments.length,
    confirmado: assignments.filter(a => a.status === "confirmado").length,
    pendente: assignments.filter(a => a.status === "pendente").length,
    recusado: assignments.filter(a => a.status === "recusado").length,
  };
}

function scheduleStatusClass(status: ScheduleStatus) {
  if (status === "publicada") return "bg-green-500/10 text-green-700";
  if (status === "concluida") return "bg-muted text-muted-foreground";
  return "bg-amber-500/10 text-amber-700";
}

function assignmentStatusClass(status: AssignmentStatus) {
  if (status === "confirmado") return "bg-green-500/10 text-green-700";
  if (status === "recusado") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700";
}

export default function Escalas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole, hasCapability } = useRole();
  const canWrite = hasCapability("schedules.write") || canWriteSecretaria(canonicalRole);
  const canDelete = hasCapability("schedules.write") || canDeleteSchedule(canonicalRole);

  const [schedules, setSchedules] = useState<ScheduleWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterMinistry, setFilterMinistry] = useState("Todos");

  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null);
  const [detailAssignments, setDetailAssignments] = useState<Assignment[]>([]);
  const [detailAssignmentsLoading, setDetailAssignmentsLoading] = useState(false);
  const [detailAssignmentsError, setDetailAssignmentsError] = useState(false);
  const [detailActionError, setDetailActionError] = useState<string | null>(null);

  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;

  const fetchList = useCallback(async () => {
    if (!church) return;
    setLoading(true);
    setLoadError(false);

    const { data: scheduleRows, error: schedError } = await supabase
      .from("schedules")
      .select("id, title, description, schedule_date, schedule_time, ministry, status, created_by")
      .eq("organization_id", church.id)
      .order("schedule_date", { ascending: true });

    if (schedError) {
      setLoadError(true);
      setSchedules([]);
      setLoading(false);
      return;
    }

    const rows = (scheduleRows || []) as Schedule[];
    const ids = rows.map(r => r.id);
    const summaryBySchedule = new Map<string, AssignmentSummary>();

    if (ids.length > 0) {
      const { data: assignmentRows, error: assignError } = await (supabase as unknown as {
        from: (table: string) => ReturnType<typeof supabase.from>;
      }).from("schedule_assignments").select("schedule_id, status").in("schedule_id", ids);

      if (assignError) {
        setLoadError(true);
        setSchedules([]);
        setLoading(false);
        return;
      }

      for (const id of ids) {
        summaryBySchedule.set(id, { total: 0, confirmado: 0, pendente: 0, recusado: 0 });
      }
      for (const row of (assignmentRows || []) as { schedule_id: string; status: AssignmentStatus }[]) {
        const summary = summaryBySchedule.get(row.schedule_id);
        if (!summary) continue;
        summary.total += 1;
        if (row.status === "confirmado") summary.confirmado += 1;
        else if (row.status === "recusado") summary.recusado += 1;
        else summary.pendente += 1;
      }
    }

    setSchedules(
      rows.map(row => ({
        ...row,
        status: (row.status as ScheduleStatus) || "rascunho",
        summary: summaryBySchedule.get(row.id) || { total: 0, confirmado: 0, pendente: 0, recusado: 0 },
      })),
    );
    setLoading(false);
  }, [church]);

  const loadAssignments = useCallback(async (scheduleId: string) => {
    setDetailAssignmentsLoading(true);
    setDetailAssignmentsError(false);

    const { data, error } = await (supabase as unknown as {
      from: (table: string) => ReturnType<typeof supabase.from>;
    }).from("schedule_assignments").select("id, schedule_id, member_id, role, status, notes, members(full_name)")
      .eq("schedule_id", scheduleId)
      .order("role", { ascending: true });

    if (error) {
      setDetailAssignmentsError(true);
      setDetailAssignments([]);
      setDetailAssignmentsLoading(false);
      return;
    }

    const parsed = (data || []).map(row => {
      const member = row.members as { full_name: string } | null;
      return {
        id: row.id,
        schedule_id: row.schedule_id,
        member_id: row.member_id,
        role: row.role,
        status: row.status as AssignmentStatus,
        notes: row.notes,
        full_name: member?.full_name || t("Membro"),
      };
    });

    setDetailAssignments(parsed);
    setDetailAssignmentsLoading(false);
  }, [t]);

  const loadActiveMembers = useCallback(async () => {
    if (!church) return;
    setMembersLoading(true);
    const { data, error } = await supabase
      .from("members")
      .select("id, full_name")
      .eq("organization_id", church.id)
      .eq("status", "Ativo")
      .order("full_name");

    if (error) {
      setActiveMembers([]);
      setMembersLoading(false);
      return;
    }
    setActiveMembers((data as ActiveMember[]) || []);
    setMembersLoading(false);
  }, [church]);

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    void fetchList();
  }, [church, churchLoading, fetchList]);

  const refreshDetailIfOpen = async (scheduleId: string) => {
    if (!church || !detailSchedule || detailSchedule.id !== scheduleId) return;
    const { data } = await supabase
      .from("schedules")
      .select("id, title, description, schedule_date, schedule_time, ministry, status, created_by")
      .eq("id", scheduleId)
      .eq("organization_id", church.id)
      .maybeSingle();
    if (data) {
      const updated = { ...(data as Schedule), status: (data.status as ScheduleStatus) || "rascunho" };
      setDetailSchedule(updated);
      await loadAssignments(scheduleId);
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEditForm = (s: Schedule) => {
    if (detailSchedule) closeDetail();
    setEditingId(s.id);
    setForm({
      title: s.title,
      schedule_date: dateInputFromIso(s.schedule_date),
      schedule_time: formatScheduleTime(s.schedule_time, s.schedule_date),
      ministry: ministries.includes(s.ministry) ? s.ministry : "Geral",
      description: s.description || "",
      status: s.status,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const openDetail = (s: ScheduleWithSummary) => {
    const { summary: _s, ...schedule } = s;
    setDetailSchedule(schedule);
    setDetailActionError(null);
    setShowAddAssignment(false);
    setAssignmentForm(emptyAssignmentForm());
    void loadAssignments(s.id);
  };

  const closeDetail = () => {
    setDetailSchedule(null);
    setDetailAssignments([]);
    setDetailAssignmentsError(false);
    setDetailAssignmentsLoading(false);
    setDetailActionError(null);
    setShowAddAssignment(false);
    setAssignmentForm(emptyAssignmentForm());
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.schedule_date || !church) return;

    const time = normalizeTimeInput(form.schedule_time) || "09:00";
    const payload = {
      title: form.title.trim(),
      schedule_date: buildTimestamptz(form.schedule_date, time),
      schedule_time: time,
      ministry: form.ministry,
      description: form.description.trim() || null,
      status: form.status,
    };

    if (editingId) {
      const { error } = await supabase
        .from("schedules")
        .update(payload)
        .eq("id", editingId)
        .eq("organization_id", church.id);
      if (error) {
        toast({ title: t("Erro"), description: error.message, variant: "destructive" });
        return;
      }
      closeForm();
      toast({ title: t("Escala atualizada!") });
      await fetchList();
      void refreshDetailIfOpen(editingId);
      return;
    }

    if (!user) return;
    const { error } = await supabase.from("schedules").insert({
      ...payload,
      created_by: user.id,
      organization_id: church.id,
    });
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    closeForm();
    toast({ title: t("Escala criada!") });
    await fetchList();
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!church || !canDelete) return;
    if (!window.confirm(t("Remover esta escala?"))) return;
    const { error } = await supabase
      .from("schedules")
      .delete()
      .eq("id", id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    if (detailSchedule?.id === id) closeDetail();
    toast({ title: t("Escala removida") });
    await fetchList();
  };

  const openAddAssignment = () => {
    setAssignmentForm(emptyAssignmentForm());
    setShowAddAssignment(true);
    setDetailActionError(null);
    void loadActiveMembers();
  };

  const handleAddAssignment = async () => {
    if (!detailSchedule || !assignmentForm.member_id || !assignmentForm.role.trim()) return;
    setDetailActionError(null);

    const { error } = await (supabase as unknown as {
      from: (table: string) => ReturnType<typeof supabase.from>;
    }).from("schedule_assignments").insert({
      schedule_id: detailSchedule.id,
      member_id: assignmentForm.member_id,
      role: assignmentForm.role.trim(),
      status: assignmentForm.status,
      notes: assignmentForm.notes.trim() || null,
    });

    if (error) {
      setDetailActionError(error.message);
      return;
    }

    setShowAddAssignment(false);
    setAssignmentForm(emptyAssignmentForm());
    toast({ title: t("Escalado adicionado") });
    await loadAssignments(detailSchedule.id);
    await fetchList();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!detailSchedule || !canDelete) return;
    if (!window.confirm(t("Remover escalado"))) return;
    setDetailActionError(null);

    const { error } = await (supabase as unknown as {
      from: (table: string) => ReturnType<typeof supabase.from>;
    }).from("schedule_assignments").delete().eq("id", assignmentId);

    if (error) {
      setDetailActionError(error.message);
      return;
    }

    toast({ title: t("Escalado removido") });
    await loadAssignments(detailSchedule.id);
    await fetchList();
  };

  const handleUpdateAssignmentStatus = async (assignment: Assignment, status: AssignmentStatus) => {
    if (!detailSchedule || !canWrite) return;
    setDetailActionError(null);

    const { error } = await (supabase as unknown as {
      from: (table: string) => ReturnType<typeof supabase.from>;
    }).from("schedule_assignments").update({ status }).eq("id", assignment.id);

    if (error) {
      setDetailActionError(error.message);
      return;
    }

    toast({ title: t("Status do escalado atualizado") });
    await loadAssignments(detailSchedule.id);
    await fetchList();
  };

  const filtered = filterMinistry === "Todos"
    ? schedules
    : schedules.filter(s => s.ministry === filterMinistry);

  const renderSummary = (summary: AssignmentSummary) => {
    if (summary.total === 0) return t("Nenhum escalado");
    const parts = [
      `${summary.total} ${t("escalados")}`,
      summary.confirmado > 0 ? `${summary.confirmado} ${t("confirmados")}` : null,
      summary.pendente > 0 ? `${summary.pendente} ${t("pendentes")}` : null,
      summary.recusado > 0 ? `${summary.recusado} ${t("recusados")}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">{t("Escalas de Serviço")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Organize as escalas por ministério")}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DocumentActions
              actions={["print", "share"]}
              shareTitle={t("Escalas de Serviço")}
              shareText={t("Escalas de Serviço — Ecclesia")}
              size="sm"
            />
            {canWrite && (
              <button onClick={openCreateForm} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus size={16} /> {t("Nova Escala")}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["Todos", ...ministries].map(m => (
            <button key={m} onClick={() => setFilterMinistry(m)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMinistry === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {t(m)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">{t("Erro ao carregar escalas")}</h3>
            <button onClick={() => void fetchList()} className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
              <RefreshCw size={16} /> {t("Tentar novamente")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileText size={32} className="text-primary/60" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
              {filterMinistry === "Todos" ? t("Nenhuma escala cadastrada") : t("Nenhuma escala neste ministério")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-5">
              {filterMinistry === "Todos"
                ? t("Organize os voluntários e ministérios com escalas de serviço.")
                : t("Tente outro ministério ou crie uma nova escala.")}
            </p>
            {filterMinistry === "Todos" && canWrite && (
              <button onClick={openCreateForm} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus size={16} />{t("Criar Primeira Escala")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s, i) => (
              <motion.button
                key={s.id}
                type="button"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => openDetail(s)}
                className="w-full text-left bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center gap-4 hover:border-primary/30 transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${scheduleStatusClass(s.status)}`}>
                  <Users size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-foreground">{s.title}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${scheduleStatusClass(s.status)}`}>
                      {t(s.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {formatScheduleDate(s.schedule_date, dateLoc)}
                    </span>
                    {formatScheduleTime(s.schedule_time, s.schedule_date) && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {formatScheduleTime(s.schedule_time, s.schedule_date)}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-secondary">{t(s.ministry)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{renderSummary(s.summary)}</p>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Form criar/editar escala */}
      <AnimatePresence>
        {showForm && canWrite && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={closeForm} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
                <h2 className="text-lg font-serif font-bold mb-4">{editingId ? t("Editar Escala") : t("Nova Escala")}</h2>
                <div className="space-y-3">
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("Título (ex: Culto Domingo)")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("Data")}</label>
                      <input type="date" value={form.schedule_date} onChange={e => setForm(f => ({ ...f, schedule_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("Horário")}</label>
                      <input type="time" value={form.schedule_time} onChange={e => setForm(f => ({ ...f, schedule_time: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Ministério")}</label>
                    <div className="flex gap-2 flex-wrap">
                      {ministries.map(m => (
                        <button key={m} type="button" onClick={() => setForm(f => ({ ...f, ministry: m }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.ministry === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          {t(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Status da escala")}</label>
                    <div className="flex gap-2 flex-wrap">
                      {scheduleStatuses.map(st => (
                        <button key={st} type="button" onClick={() => setForm(f => ({ ...f, status: st }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.status === st ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          {t(st)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("Descrição")} rows={3} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none" />
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={closeForm} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">{t("Cancelar")}</button>
                  <button type="button" onClick={() => void handleSave()} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                    {editingId ? t("Salvar alterações") : t("Criar Escala")}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Detalhe da escala */}
      <AnimatePresence>
        {detailSchedule && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={closeDetail} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-lg bg-card rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-serif font-bold">{t("Detalhe da escala")}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{detailSchedule.title}</p>
                  </div>
                  <button type="button" onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${scheduleStatusClass(detailSchedule.status)}`}>{t(detailSchedule.status)}</span>
                    <span className="px-2 py-1 rounded-lg text-xs bg-secondary">{t(detailSchedule.ministry)}</span>
                  </div>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Calendar size={14} /> {formatScheduleDate(detailSchedule.schedule_date, dateLoc)}
                    {formatScheduleTime(detailSchedule.schedule_time, detailSchedule.schedule_date) && (
                      <><Clock size={14} className="ml-2" /> {formatScheduleTime(detailSchedule.schedule_time, detailSchedule.schedule_date)}</>
                    )}
                  </p>
                  {detailSchedule.description && (
                    <p className="text-muted-foreground">{detailSchedule.description}</p>
                  )}
                </div>

                {canWrite && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button type="button" onClick={() => openEditForm(detailSchedule)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium">
                      <Pencil size={14} /> {t("Editar Escala")}
                    </button>
                    <button type="button" onClick={openAddAssignment} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                      <Plus size={14} /> {t("Adicionar escalado")}
                    </button>
                    {canDelete && (
                      <button type="button" onClick={() => void handleDeleteSchedule(detailSchedule.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive text-xs font-medium">
                        <Trash2 size={14} /> {t("Excluir escala")}
                      </button>
                    )}
                  </div>
                )}

                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <User size={14} /> {t("Escalados")}
                </h3>

                {detailActionError && (
                  <p className="text-sm text-destructive mb-2">{detailActionError}</p>
                )}

                {showAddAssignment && canWrite && (
                  <div className="mb-4 p-3 rounded-xl border border-border/60 bg-secondary/30 space-y-2">
                    <select
                      value={assignmentForm.member_id}
                      onChange={e => setAssignmentForm(f => ({ ...f, member_id: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                      disabled={membersLoading}
                    >
                      <option value="">{membersLoading ? t("Carregando...") : t("Selecionar membro")}</option>
                      {activeMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.full_name}</option>
                      ))}
                    </select>
                    <input
                      list={`roles-${detailSchedule.ministry}`}
                      value={assignmentForm.role}
                      onChange={e => setAssignmentForm(f => ({ ...f, role: e.target.value }))}
                      placeholder={t("Função")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                    <datalist id={`roles-${detailSchedule.ministry}`}>
                      {(roleHints[detailSchedule.ministry] || roleHints.Geral).map(role => (
                        <option key={role} value={role} />
                      ))}
                    </datalist>
                    <div className="flex gap-2 flex-wrap">
                      {assignmentStatuses.map(st => (
                        <button key={st} type="button" onClick={() => setAssignmentForm(f => ({ ...f, status: st }))} className={`px-2 py-1 rounded-lg text-xs font-medium ${assignmentForm.status === st ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                          {t(st)}
                        </button>
                      ))}
                    </div>
                    <input
                      value={assignmentForm.notes}
                      onChange={e => setAssignmentForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder={t("Notas do escalado")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAddAssignment(false)} className="flex-1 py-2 rounded-lg bg-secondary text-xs font-medium">{t("Cancelar")}</button>
                      <button type="button" onClick={() => void handleAddAssignment()} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium">{t("Adicionar escalado")}</button>
                    </div>
                  </div>
                )}

                {detailAssignmentsLoading ? (
                  <p className="text-sm text-muted-foreground py-4">{t("Carregando...")}</p>
                ) : detailAssignmentsError ? (
                  <p className="text-sm text-destructive py-2">{t("Erro ao carregar escalados")}</p>
                ) : detailAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{t("Nenhum escalado")}</p>
                ) : (
                  <div className="space-y-2">
                    {detailAssignments.map(a => (
                      <div key={a.id} className="p-3 rounded-xl border border-border/50 bg-secondary/20">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{a.full_name}</p>
                            <p className="text-xs text-muted-foreground">{a.role}</p>
                            {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
                          </div>
                          {canDelete && (
                            <button type="button" onClick={() => void handleRemoveAssignment(a.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t("Remover escalado")}>
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        {canWrite ? (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {assignmentStatuses.map(st => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => void handleUpdateAssignmentStatus(a, st)}
                                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${a.status === st ? assignmentStatusClass(st) : "bg-secondary text-muted-foreground"}`}
                              >
                                {t(st)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${assignmentStatusClass(a.status)}`}>
                            {t(a.status)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
