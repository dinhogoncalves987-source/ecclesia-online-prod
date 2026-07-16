import { AdminLayout } from "@/components/AdminLayout";
import { DocumentActions } from "@/components/DocumentActions";
import { Clock, MapPin, Plus, ChevronLeft, ChevronRight, X, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useMobileFocusScroll } from "@/hooks/useMobileFocusScroll";
import { scrollElementIntoView } from "@/lib/mobileScroll";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";
import { canWriteSecretaria, hasPermission, type AdminRole } from "@/lib/permissions";

type Event = {
  id: string;
  starts_at: string;
  title: string;
  ends_at?: string | null;
  location: string | null;
  event_type: string | null;
  description?: string | null;
  is_public?: boolean | null;
};

type EventFormState = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  color: string;
  description: string;
  isPublic: boolean;
};

const colorOptions = [
  { label: "Dourado", value: "bg-accent" },
  { label: "Azul", value: "bg-primary" },
  { label: "Verde", value: "bg-success" },
];

const SECRETARIA_EVENT_DELETE_ROLES: AdminRole[] = [
  "super_admin",
  "church_admin",
  "pastor",
  "secretary",
];

const canDeleteEvent = (role: AdminRole | null | undefined) =>
  hasPermission(role, SECRETARIA_EVENT_DELETE_ROLES);

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(month: number, year: number) {
  return new Date(year, month, 1).getDay();
}

function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  d.setHours(d.getHours() + hours);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildIsoDateTime(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00`;
}

function resolveEventTimes(dateStr: string, startTimeRaw: string, endTimeRaw: string) {
  const startTime = normalizeTimeInput(startTimeRaw);
  if (!startTime) return null;
  const endTime = normalizeTimeInput(endTimeRaw) || addHoursToTime(startTime, 1);
  return {
    starts_at: buildIsoDateTime(dateStr, startTime),
    ends_at: buildIsoDateTime(dateStr, endTime),
  };
}

function timeFromIso(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const emptyEventForm = (): EventFormState => ({
  title: "",
  date: "",
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  color: "bg-accent",
  description: "",
  isPublic: false,
});

const monthKeys = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const dayKeys = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function Agenda() {
  const now = new Date();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole, hasCapability } = useRole();
  const canWrite = hasCapability("agenda.write") || canWriteSecretaria(canonicalRole);
  const canDelete = hasCapability("agenda.write") || canDeleteEvent(canonicalRole);

  const [agendaTab, setAgendaTab] = useState<"church" | "personal">("church");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"calendar" | "list">("list");
  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [newEvent, setNewEvent] = useState<EventFormState>(emptyEventForm());
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editForm, setEditForm] = useState<EventFormState>(emptyEventForm());
  const formRef = useMobileFocusScroll<HTMLDivElement>();
  const activeLoadRef = useRef(false);

  useEffect(() => {
    if (showForm) scrollElementIntoView(formRef.current, { block: "start", delay: 400 });
  }, [showForm, formRef]);

  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();
  const isCurrentMonth = currentMonth === todayMonth && currentYear === todayYear;
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOffset = getFirstDayOfWeek(currentMonth, currentYear);

  const reloadEvents = useCallback(async () => {
    if (!church) return;
    const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${daysInMonth}`;
    const { data, error } = await runScopedOrganizationQuery<Event[]>("events", church.id, query => {
      let q = query
        .select("*")
        .gte("starts_at", `${startDate}T00:00:00`)
        .lte("starts_at", `${endDate}T23:59:59`)
        .order("starts_at");
      if (agendaTab === "church") {
        // Agenda da Igreja: eventos públicos (is_public = true) OU criados por staff sem filtro pessoal
        q = q.eq("is_public", true);
      } else {
        // Minha Agenda: eventos privados do usuário atual
        q = q.eq("is_public", false).eq("created_by", user?.id ?? "");
      }
      return q;
    });
    if (error) {
      console.error(error);
      toast.error(t("Erro ao carregar eventos"));
      return;
    }
    setEvents(data || []);
  }, [church, currentMonth, currentYear, daysInMonth, agendaTab, user?.id, t]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (churchLoading) return;
    if (!church) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Abort any previous in-flight load to prevent race conditions
      activeLoadRef.current = true;
      await reloadEvents();
      if (cancelled) return;
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
      activeLoadRef.current = false;
    };
  }, [user, church, churchLoading, reloadEvents]);

  const getDay = (e: Event) => new Date(e.starts_at).getDate();
  const getTime = (e: Event) =>
    new Date(e.starts_at).toLocaleTimeString(
      lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR",
      { hour: "2-digit", minute: "2-digit" },
    );
  const getTimeRange = (e: Event) => {
    const start = getTime(e);
    if (e.ends_at) {
      const end = new Date(e.ends_at).toLocaleTimeString(
        lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR",
        { hour: "2-digit", minute: "2-digit" },
      );
      return `${start} – ${end}`;
    }
    return start;
  };
  const getColor = (e: Event) => e.event_type || "bg-accent";

  const sortedEvents = [...events].sort((a, b) => getDay(a) - getDay(b));
  const upcomingEvents = isCurrentMonth ? sortedEvents.filter(e => getDay(e) >= todayDay) : sortedEvents;
  const pastEvents = isCurrentMonth ? sortedEvents.filter(e => getDay(e) < todayDay) : [];
  const displayEvents = view === "list" ? [...upcomingEvents, ...pastEvents] : events;

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else setCurrentMonth(currentMonth - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else setCurrentMonth(currentMonth + 1);
    setSelectedDay(null);
  };

  const dateForDay = (day: number) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const openCreateForm = (day?: number) => {
    const d = day ?? (isCurrentMonth ? todayDay : 1);
    setSelectedDay(d);
    setNewEvent({ ...emptyEventForm(), date: dateForDay(d) });
    setShowForm(true);
  };

  const closeCreateForm = () => {
    setShowForm(false);
    setSelectedDay(null);
    setNewEvent(emptyEventForm());
  };

  const openEvent = (e: Event) => {
    setEditingEvent(e);
    setEditForm({
      title: e.title,
      date: dateFromIso(e.starts_at),
      startTime: timeFromIso(e.starts_at),
      endTime: e.ends_at ? timeFromIso(e.ends_at) : addHoursToTime(timeFromIso(e.starts_at), 1),
      location: e.location || "",
      color: e.event_type || "bg-accent",
      description: e.description || "",
      isPublic: Boolean(e.is_public),
    });
  };

  const closeEventModal = () => setEditingEvent(null);

  const addEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date || !newEvent.startTime || !user || !church) {
      toast.error(t("Erro ao salvar"), { description: t("Preencha título, data e horário inicial") });
      return;
    }
    const times = resolveEventTimes(newEvent.date, newEvent.startTime, newEvent.endTime);
    if (!times) {
      toast.error(t("Erro ao salvar"), { description: t("Horário inicial inválido") });
      return;
    }
    setSaving(true);
    const { error } = await insertWithOrganizationScope<Event>("events", church.id, {
      created_by: user.id,
      title: newEvent.title.trim(),
      starts_at: times.starts_at,
      ends_at: times.ends_at,
      location: newEvent.location.trim() || t("A definir"),
      event_type: newEvent.color,
      description: newEvent.description.trim() || null,
      // Eventos na aba "Agenda da Igreja" são públicos; "Minha Agenda" são pessoais/privados
      is_public: agendaTab === "church" ? true : false,
    });
    if (error) {
      toast.error(t("Erro ao salvar"), {
        description: String((error as { message?: string }).message || ""),
      });
      setSaving(false);
      return;
    }
    toast.success(t("Evento salvo!"));
    await reloadEvents();
    closeCreateForm();
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editingEvent || !church || !editForm.title.trim() || !editForm.date || !editForm.startTime) return;
    const times = resolveEventTimes(editForm.date, editForm.startTime, editForm.endTime);
    if (!times) {
      toast.error(t("Erro ao salvar"), { description: t("Horário inicial inválido") });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({
        title: editForm.title.trim(),
        starts_at: times.starts_at,
        ends_at: times.ends_at,
        location: editForm.location.trim() || t("A definir"),
        event_type: editForm.color,
        description: editForm.description.trim() || null,
        is_public: editForm.isPublic,
      })
      .eq("id", editingEvent.id)
      .eq("organization_id", church.id);
    if (error) {
      toast.error(t("Erro ao salvar"), { description: error.message });
      setSaving(false);
      return;
    }
    toast.success(t("Evento atualizado"));
    closeEventModal();
    await reloadEvents();
    setSaving(false);
  };

  const removeEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete || !church) return;
    if (!window.confirm(t("Remover este evento?"))) return;
    const { error } = await supabase.from("events").delete().eq("id", id).eq("organization_id", church.id);
    if (error) {
      toast.error(t("Erro ao remover evento"), { description: error.message });
      return;
    }
    toast.success(t("Evento removido"));
    if (editingEvent?.id === id) closeEventModal();
    await reloadEvents();
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEvent();
    }
  };

  const isToday = (day: number) => isCurrentMonth && day === todayDay;
  const isPast = (day: number) => new Date(currentYear, currentMonth, day) < new Date(todayYear, todayMonth, todayDay);

  const renderEventFormFields = (
    form: EventFormState,
    setForm: React.Dispatch<React.SetStateAction<EventFormState>>,
    readOnly: boolean,
  ) => (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Título do evento")}</label>
        <input
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          readOnly={readOnly}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Data")}</label>
        <input
          type="date"
          value={form.date}
          onChange={e => setForm({ ...form, date: e.target.value })}
          readOnly={readOnly}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("Horário inicial")}</label>
          <input
            type="time"
            value={form.startTime}
            onChange={e => setForm({ ...form, startTime: e.target.value })}
            readOnly={readOnly}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("Horário final")}</label>
          <input
            type="time"
            value={form.endTime}
            onChange={e => setForm({ ...form, endTime: e.target.value })}
            readOnly={readOnly}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Local")}</label>
        <input
          value={form.location}
          onChange={e => setForm({ ...form, location: e.target.value })}
          readOnly={readOnly}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Cor")}</label>
        <select
          value={form.color}
          onChange={e => setForm({ ...form, color: e.target.value })}
          disabled={readOnly}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm disabled:opacity-80"
        >
          {colorOptions.map(c => (
            <option key={c.value} value={c.value}>
              {t(c.label)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Descrição")}</label>
        <textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          readOnly={readOnly}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-y min-h-[4rem] read-only:opacity-80"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isPublic}
          onChange={e => setForm({ ...form, isPublic: e.target.checked })}
          disabled={readOnly}
          className="rounded border-border"
        />
        <span>{t("Evento público")}</span>
      </label>
    </div>
  );

  const showPageLoading = loading || churchLoading;
  const noChurchReady = !churchLoading && user && !church;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Abas Agenda da Igreja / Minha Agenda */}
        <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-fit">
          <button
            type="button"
            onClick={() => setAgendaTab("church")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${agendaTab === "church" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("Agenda da Igreja")}
          </button>
          <button
            type="button"
            onClick={() => setAgendaTab("personal")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${agendaTab === "personal" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("Minha Agenda")}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">
              {agendaTab === "church" ? t("Agenda da Igreja") : t("Minha Agenda")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(monthKeys[currentMonth])} {currentYear} · {events.length}{" "}
              {events.length !== 1 ? t("eventos") : t("evento")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-secondary/50 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "list" ? "bg-card shadow-[var(--shadow-sm)]" : "text-muted-foreground"}`}
              >
                {t("Lista")}
              </button>
              <button
                type="button"
                onClick={() => setView("calendar")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "calendar" ? "bg-card shadow-[var(--shadow-sm)]" : "text-muted-foreground"}`}
              >
                {t("Calendário")}
              </button>
            </div>
            <DocumentActions
              actions={["print", "share"]}
              shareTitle={`Agenda — ${t(monthKeys[currentMonth])} ${currentYear}`}
              shareText={`${events.length} ${events.length !== 1 ? t("eventos") : t("evento")} em ${t(monthKeys[currentMonth])} ${currentYear}`}
              size="sm"
            />
            {canWrite && (
              <button
                type="button"
                onClick={() => openCreateForm()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus size={16} strokeWidth={1.5} /> {t("Evento")}
              </button>
            )}
          </div>
        </div>

        {view === "list" && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>
            <h2 className="font-serif text-lg">
              {t(monthKeys[currentMonth])} {currentYear}
            </h2>
            <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ChevronRight size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}

        <AnimatePresence>
          {showForm && canWrite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div ref={formRef} className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">
                    {t("Novo Evento —")} {selectedDay} {t("de")} {t(monthKeys[currentMonth])}
                  </h3>
                  <button type="button" onClick={closeCreateForm} className="p-1.5 rounded-lg hover:bg-secondary">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div onKeyDown={handleFormKeyDown}>{renderEventFormFields(newEvent, setNewEvent, false)}</div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={addEvent}
                    disabled={saving}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {t("Salvar Evento")}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showPageLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : noChurchReady ? (
          <p className="text-center text-sm text-muted-foreground py-8">{t("Selecione uma organização")}</p>
        ) : view === "list" ? (
          <div className="space-y-2">
            {displayEvents.map(e => {
              const day = getDay(e);
              return (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEvent(e)}
                  onKeyDown={ev => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      openEvent(e);
                    }
                  }}
                  className={`flex items-center gap-3 p-4 bg-card rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow cursor-pointer ${isPast(day) ? "opacity-60" : ""}`}
                >
                  <div className={`w-1 h-12 ${getColor(e)} rounded-full flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{e.title}</p>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {day} {t("de")} {t(monthKeys[currentMonth])}
                        {isToday(day) ? ` (${t("Hoje")})` : isPast(day) ? ` (${t("Passado")})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} /> {getTimeRange(e)}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} /> {e.location}
                        </span>
                      )}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={ev => removeEvent(e.id, ev)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors flex-shrink-0"
                      title={t("Remover")}
                    >
                      <Trash2 size={14} className="text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })}
            {displayEvents.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhum evento neste mês.")}</p>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl shadow-executive p-5">
            <div className="flex items-center justify-between mb-4">
              <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <h2 className="font-serif text-lg">
                {t(monthKeys[currentMonth])} {currentYear}
              </h2>
              <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dayKeys.map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {t(d)}
                </div>
              ))}
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvents = events.filter(ev => getDay(ev) === day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`aspect-square p-1 rounded-lg text-center relative hover:bg-secondary/50 transition-colors text-sm ${
                      isToday(day) ? "bg-primary/5 ring-1 ring-accent font-bold" : ""
                    } ${isPast(day) ? "text-muted-foreground" : ""} ${selectedDay === day ? "bg-accent/10 ring-1 ring-accent" : ""}`}
                  >
                    {day}
                    {dayEvents.length > 0 && (
                      <div className="flex justify-center gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((ev, j) => (
                          <div key={j} className={`w-1 h-1 rounded-full ${getColor(ev)}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedDay && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">
                    {t("Eventos em")} {selectedDay} {t("de")} {t(monthKeys[currentMonth])}
                  </h3>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => openCreateForm(selectedDay)}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("Adicionar")}
                    </button>
                  )}
                </div>
                {events.filter(e => getDay(e) === selectedDay).length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("Nenhum evento neste dia.")}</p>
                ) : (
                  <div className="space-y-2">
                    {events
                      .filter(e => getDay(e) === selectedDay)
                      .map(e => (
                        <div
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openEvent(e)}
                          onKeyDown={ev => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              openEvent(e);
                            }
                          }}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-1 h-8 ${getColor(e)} rounded-full flex-shrink-0`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{e.title}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {getTimeRange(e)} · {e.location}
                              </p>
                            </div>
                          </div>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={ev => removeEvent(e.id, ev)}
                              className="p-1 rounded hover:bg-destructive/10 flex-shrink-0"
                            >
                              <Trash2 size={12} className="text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {editingEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          onClick={closeEventModal}
        >
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="event-edit-title"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="event-edit-title" className="text-lg font-serif font-bold truncate pr-2">
                {editForm.title || editingEvent.title}
              </h2>
              <button type="button" onClick={closeEventModal} className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0">
                <X size={16} />
              </button>
            </div>
            {renderEventFormFields(editForm, setEditForm, !canWrite)}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={closeEventModal}
                className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium"
              >
                {canWrite ? t("Cancelar") : t("Fechar")}
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {t("Salvar")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
