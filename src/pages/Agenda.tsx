import { AdminLayout } from "@/components/AdminLayout";
import { Clock, MapPin, Plus, ChevronLeft, ChevronRight, X, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";

type Event = {
  id: number;
  day: number;
  month: number;
  year: number;
  title: string;
  time: string;
  location: string;
  color: string;
};

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const colorOptions = [
  { label: "Dourado", value: "bg-accent" },
  { label: "Azul", value: "bg-primary" },
  { label: "Verde", value: "bg-success" },
];

const initialEvents: Event[] = [
  { id: 1, day: 16, month: 2, year: 2026, title: "Culto de Adoração", time: "09:00 - 11:00", location: "Templo Principal", color: "bg-accent" },
  { id: 2, day: 16, month: 2, year: 2026, title: "Escola Dominical", time: "11:15 - 12:00", location: "Salas de Aula", color: "bg-primary" },
  { id: 3, day: 18, month: 2, year: 2026, title: "Reunião de Líderes", time: "19:30 - 21:00", location: "Sala de Reuniões", color: "bg-success" },
  { id: 4, day: 19, month: 2, year: 2026, title: "Estudo Bíblico", time: "20:00 - 21:30", location: "Templo Principal", color: "bg-accent" },
  { id: 5, day: 21, month: 2, year: 2026, title: "Ensaio do Louvor", time: "19:00 - 21:00", location: "Salão", color: "bg-primary" },
  { id: 6, day: 22, month: 2, year: 2026, title: "Encontro de Jovens", time: "19:00 - 21:00", location: "Salão Social", color: "bg-accent" },
  { id: 7, day: 23, month: 2, year: 2026, title: "Culto Dominical", time: "09:00 - 11:00", location: "Templo Principal", color: "bg-accent" },
  { id: 8, day: 25, month: 2, year: 2026, title: "Oração Intercessória", time: "06:00 - 07:00", location: "Capela", color: "bg-success" },
  { id: 9, day: 28, month: 2, year: 2026, title: "Culto de Sexta", time: "19:30 - 21:00", location: "Templo Principal", color: "bg-primary" },
];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(month: number, year: number) {
  return new Date(year, month, 1).getDay();
}

export default function Agenda() {
  const now = new Date();
  const [events, setEvents] = useState(initialEvents);
  const [view, setView] = useState<"calendar" | "list">("list");
  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(2); // March (0-indexed)
  const [currentYear, setCurrentYear] = useState(2026);
  const [newEvent, setNewEvent] = useState({ title: "", time: "", location: "", color: "bg-accent" });

  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();
  const isCurrentMonth = currentMonth === todayMonth && currentYear === todayYear;

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOffset = getFirstDayOfWeek(currentMonth, currentYear);

  const monthEvents = useMemo(() =>
    events.filter(e => e.month === currentMonth && e.year === currentYear),
    [events, currentMonth, currentYear]
  );

  const sortedEvents = [...monthEvents].sort((a, b) => a.day - b.day);
  const upcomingEvents = isCurrentMonth
    ? sortedEvents.filter(e => e.day >= todayDay)
    : sortedEvents;
  const pastEvents = isCurrentMonth
    ? sortedEvents.filter(e => e.day < todayDay)
    : [];
  const displayEvents = view === "list" ? [...upcomingEvents, ...pastEvents] : monthEvents;

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

  const addEvent = () => {
    if (!newEvent.title || !newEvent.time) return;
    const event: Event = {
      id: Date.now(),
      day: selectedDay || (isCurrentMonth ? todayDay : 1),
      month: currentMonth,
      year: currentYear,
      title: newEvent.title,
      time: newEvent.time,
      location: newEvent.location || "A definir",
      color: newEvent.color,
    };
    setEvents([...events, event]);
    setNewEvent({ title: "", time: "", location: "", color: "bg-accent" });
    setShowForm(false);
    setSelectedDay(null);
  };

  const removeEvent = (id: number) => {
    setEvents(events.filter(e => e.id !== id));
  };

  const openFormForDay = (day: number) => {
    setSelectedDay(day);
    setShowForm(true);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addEvent(); }
  };

  const isToday = (day: number) => isCurrentMonth && day === todayDay;
  const isPast = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    const today = new Date(todayYear, todayMonth, todayDay);
    return d < today;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Agenda</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {monthNames[currentMonth]} {currentYear} · {monthEvents.length} evento{monthEvents.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-secondary/50 rounded-lg p-0.5">
              <button
                onClick={() => setView("list")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === "list" ? "bg-card shadow-[var(--shadow-sm)]" : "text-muted-foreground"
                }`}
              >Lista</button>
              <button
                onClick={() => setView("calendar")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === "calendar" ? "bg-card shadow-[var(--shadow-sm)]" : "text-muted-foreground"
                }`}
              >Calendário</button>
            </div>
            <button
              onClick={() => { setSelectedDay(isCurrentMonth ? todayDay : 1); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={16} strokeWidth={1.5} /> Evento
            </button>
          </div>
        </div>

        {/* Month navigation (list view) */}
        {view === "list" && (
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>
            <h2 className="font-serif text-lg">{monthNames[currentMonth]} {currentYear}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ChevronRight size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* New event form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">
                    Novo Evento — {selectedDay} de {monthNames[currentMonth]}
                  </h3>
                  <button onClick={() => { setShowForm(false); setSelectedDay(null); }} className="p-1.5 rounded-lg hover:bg-secondary">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={handleFormKeyDown}>
                  <input placeholder="Título do evento" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder="Horário (ex: 09:00 - 11:00)" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder="Local" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <select value={newEvent.color} onChange={(e) => setNewEvent({ ...newEvent, color: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {colorOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <button onClick={addEvent} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    Salvar Evento
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === "list" ? (
          <div className="space-y-2">
            {displayEvents.map((e) => (
              <div key={e.id} className={`flex items-center gap-3 p-4 bg-card rounded-xl shadow-executive hover:shadow-executive-hover transition-shadow ${isPast(e.day) ? "opacity-60" : ""}`}>
                <div className={`w-1 h-12 ${e.color} rounded-full flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{e.title}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {e.day} de {monthNames[currentMonth]}
                      {isToday(e.day) ? " (Hoje)" : isPast(e.day) ? " (Passado)" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock size={12} /> {e.time}</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {e.location}</span>
                  </div>
                </div>
                <button onClick={() => removeEvent(e.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors flex-shrink-0" title="Remover">
                  <Trash2 size={14} className="text-muted-foreground" />
                </button>
              </div>
            ))}
            {displayEvents.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum evento neste mês.</p>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl shadow-executive p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <h2 className="font-serif text-lg">{monthNames[currentMonth]} {currentYear}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dayNames.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvents = monthEvents.filter((e) => e.day === day);
                return (
                  <button
                    key={day}
                    onClick={() => { setSelectedDay(day); }}
                    className={`aspect-square p-1 rounded-lg text-center relative hover:bg-secondary/50 transition-colors text-sm ${
                      isToday(day) ? "bg-primary/5 ring-1 ring-accent font-bold" : ""
                    } ${isPast(day) ? "text-muted-foreground" : ""} ${selectedDay === day ? "bg-accent/10 ring-1 ring-accent" : ""}`}
                  >
                    {day}
                    {dayEvents.length > 0 && (
                      <div className="flex justify-center gap-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((e, j) => (
                          <div key={j} className={`w-1 h-1 rounded-full ${e.color}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Day detail */}
            {selectedDay && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">
                    Eventos em {selectedDay} de {monthNames[currentMonth]}
                  </h3>
                  <button
                    onClick={() => openFormForDay(selectedDay)}
                    className="text-xs text-primary hover:underline"
                  >
                    + Adicionar
                  </button>
                </div>
                {monthEvents.filter(e => e.day === selectedDay).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
                ) : (
                  <div className="space-y-2">
                    {monthEvents.filter(e => e.day === selectedDay).map(e => (
                      <div key={e.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/30">
                        <div className="flex items-center gap-2">
                          <div className={`w-1 h-8 ${e.color} rounded-full`} />
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
