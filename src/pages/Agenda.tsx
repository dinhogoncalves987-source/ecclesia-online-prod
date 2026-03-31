import { AdminLayout } from "@/components/AdminLayout";
import { Clock, MapPin, Plus, ChevronLeft, ChevronRight, X, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

type Event = {
  id: string;
  event_date: string;
  title: string;
  time: string | null;
  location: string | null;
  color: string | null;
};

const colorOptions = [
  { label: "Dourado", value: "bg-accent" },
  { label: "Azul", value: "bg-primary" },
  { label: "Verde", value: "bg-success" },
];

function getDaysInMonth(month: number, year: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfWeek(month: number, year: number) { return new Date(year, month, 1).getDay(); }

const monthKeys = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const dayKeys = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function Agenda() {
  const now = new Date();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"calendar" | "list">("list");
  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [newEvent, setNewEvent] = useState({ title: "", time: "", location: "", color: "bg-accent" });

  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();
  const isCurrentMonth = currentMonth === todayMonth && currentYear === todayYear;
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOffset = getFirstDayOfWeek(currentMonth, currentYear);

  useEffect(() => {
    if (!user || !church) {
      setLoading(false);
      return;
    }
      setLoading(true);
      const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${daysInMonth}`;
      const { data, error } = await supabase.from("events").select("*")
        .eq("church_id", church.id)
        .gte("event_date", startDate).lte("event_date", endDate)
        .order("event_date");
      if (error) { console.error(error); toast.error(t("Erro ao carregar eventos")); }
      else setEvents(data || []);
      setLoading(false);
    };
    load();
  }, [user, church, currentMonth, currentYear, daysInMonth, t]);

  const getDay = (e: Event) => new Date(e.event_date + "T00:00:00").getDate();

  const sortedEvents = [...events].sort((a, b) => getDay(a) - getDay(b));
  const upcomingEvents = isCurrentMonth ? sortedEvents.filter(e => getDay(e) >= todayDay) : sortedEvents;
  const pastEvents = isCurrentMonth ? sortedEvents.filter(e => getDay(e) < todayDay) : [];
  const displayEvents = view === "list" ? [...upcomingEvents, ...pastEvents] : events;

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
    setSelectedDay(null);
  };

  const addEvent = async () => {
    if (!newEvent.title || !newEvent.time || !user || !church) return;
    const day = selectedDay || (isCurrentMonth ? todayDay : 1);
    const eventDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSaving(true);
    const { data, error } = await supabase.from("events").insert({
      user_id: user.id, church_id: church.id, title: newEvent.title, event_date: eventDate,
      time: newEvent.time, location: newEvent.location || t("A definir"), color: newEvent.color,
    }).select().single();
    if (error) { toast.error(t("Erro ao salvar")); console.error(error); }
    else { setEvents([...events, data]); toast.success(t("Evento salvo!")); }
    setNewEvent({ title: "", time: "", location: "", color: "bg-accent" });
    setShowForm(false); setSelectedDay(null); setSaving(false);
  };

  const removeEvent = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error(t("Erro ao remover evento"));
    else { setEvents(events.filter(e => e.id !== id)); toast.success(t("Evento removido")); }
  };

  const openFormForDay = (day: number) => { setSelectedDay(day); setShowForm(true); };
  const handleFormKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addEvent(); } };
  const isToday = (day: number) => isCurrentMonth && day === todayDay;
  const isPast = (day: number) => new Date(currentYear, currentMonth, day) < new Date(todayYear, todayMonth, todayDay);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Agenda")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(monthKeys[currentMonth])} {currentYear} · {events.length} {events.length !== 1 ? t("eventos") : t("evento")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-secondary/50 rounded-lg p-0.5">
              <button onClick={() => setView("list")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "list" ? "bg-card shadow-[var(--shadow-sm)]" : "text-muted-foreground"}`}>{t("Lista")}</button>
              <button onClick={() => setView("calendar")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "calendar" ? "bg-card shadow-[var(--shadow-sm)]" : "text-muted-foreground"}`}>{t("Calendário")}</button>
            </div>
            <button onClick={() => { setSelectedDay(isCurrentMonth ? todayDay : 1); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus size={16} strokeWidth={1.5} /> {t("Evento")}
            </button>
          </div>
        </div>

        {view === "list" && (
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><ChevronLeft size={18} strokeWidth={1.5} /></button>
            <h2 className="font-serif text-lg">{t(monthKeys[currentMonth])} {currentYear}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><ChevronRight size={18} strokeWidth={1.5} /></button>
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">{t("Novo Evento —")} {selectedDay} {t("de")} {t(monthKeys[currentMonth])}</h3>
                  <button onClick={() => { setShowForm(false); setSelectedDay(null); }} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} strokeWidth={1.5} /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={handleFormKeyDown}>
                  <input placeholder={t("Título do evento")} value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder={t("Horário (ex: 09:00 - 11:00)")} value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder={t("Local")} value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <select value={newEvent.color} onChange={(e) => setNewEvent({ ...newEvent, color: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {colorOptions.map(c => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <button onClick={addEvent} disabled={saving}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2">
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {t("Salvar Evento")}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : view === "list" ? (
          <div className="space-y-2">
            {displayEvents.map((e) => {
              const day = getDay(e);
              return (
                <div key={e.id} className={`flex items-center gap-3 p-4 bg-card rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow ${isPast(day) ? "opacity-60" : ""}`}>
                  <div className={`w-1 h-12 ${e.color || "bg-accent"} rounded-full flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{e.title}</p>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {day} {t("de")} {t(monthKeys[currentMonth])}
                        {isToday(day) ? ` (${t("Hoje")})` : isPast(day) ? ` (${t("Passado")})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {e.time && <span className="inline-flex items-center gap-1"><Clock size={12} /> {e.time}</span>}
                      {e.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {e.location}</span>}
                    </div>
                  </div>
                  <button onClick={() => removeEvent(e.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors flex-shrink-0" title={t("Remover")}>
                    <Trash2 size={14} className="text-muted-foreground" />
                  </button>
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
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><ChevronLeft size={18} strokeWidth={1.5} /></button>
              <h2 className="font-serif text-lg">{t(monthKeys[currentMonth])} {currentYear}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><ChevronRight size={18} strokeWidth={1.5} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dayKeys.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{t(d)}</div>
              ))}
              {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvents = events.filter((e) => getDay(e) === day);
                return (
                  <button key={day} onClick={() => setSelectedDay(day)}
                    className={`aspect-square p-1 rounded-lg text-center relative hover:bg-secondary/50 transition-colors text-sm ${
                      isToday(day) ? "bg-primary/5 ring-1 ring-accent font-bold" : ""
                    } ${isPast(day) ? "text-muted-foreground" : ""} ${selectedDay === day ? "bg-accent/10 ring-1 ring-accent" : ""}`}>
                    {day}
                    {dayEvents.length > 0 && (
                      <div className="flex justify-center gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((e, j) => (
                          <div key={j} className={`w-1 h-1 rounded-full ${e.color || "bg-accent"}`} />
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
                  <h3 className="text-sm font-medium">{t("Eventos em")} {selectedDay} {t("de")} {t(monthKeys[currentMonth])}</h3>
                  <button onClick={() => openFormForDay(selectedDay)} className="text-xs text-primary hover:underline">{t("Adicionar")}</button>
                </div>
                {events.filter(e => getDay(e) === selectedDay).length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("Nenhum evento neste dia.")}</p>
                ) : (
                  <div className="space-y-2">
                    {events.filter(e => getDay(e) === selectedDay).map(e => (
                      <div key={e.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/30">
                        <div className="flex items-center gap-2">
                          <div className={`w-1 h-8 ${e.color || "bg-accent"} rounded-full`} />
                          <div>
                            <p className="text-sm font-medium">{e.title}</p>
                            <p className="text-xs text-muted-foreground">{e.time} · {e.location}</p>
                          </div>
                        </div>
                        <button onClick={() => removeEvent(e.id)} className="p-1 rounded hover:bg-destructive/10">
                          <Trash2 size={12} className="text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}