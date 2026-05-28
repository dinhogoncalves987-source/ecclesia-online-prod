import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import {
  ClipboardList, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, Monitor,
} from "lucide-react";
import { toast } from "sonner";
import {
  getSetlists,
  getSetlistById,
  saveSetlist,
  deleteSetlist,
  getSongs,
  uid,
  STEP_TYPES,
  STEP_TYPE_LABELS,
  type SetlistStep,
  type SetlistStepType,
  type WorshipSetlist,
} from "@/lib/worshipStorage";

export default function RoteirosCulto() {
  const { t } = useLanguage();
  const { church } = useChurch();
  const churchId = church?.id ?? "local";

  const [setlists, setSetlists] = useState<WorshipSetlist[]>(() => getSetlists(churchId));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [steps, setSteps] = useState<SetlistStep[]>([]);

  const songs = getSongs(churchId);

  const loadSetlist = (id: string) => {
    const s = getSetlistById(churchId, id);
    if (!s) return;
    setActiveId(s.id);
    setTitle(s.title);
    setDate(s.date ?? "");
    setSteps(s.steps);
  };

  const newSetlist = () => {
    setActiveId(null);
    setTitle("");
    setDate(new Date().toISOString().slice(0, 10));
    setSteps([]);
  };

  const addStep = (type: SetlistStepType) => {
    setSteps((prev) => [
      ...prev,
      {
        id: uid(),
        type,
        title: STEP_TYPE_LABELS[type],
        content: "",
      },
    ]);
  };

  const updateStep = (id: string, patch: Partial<SetlistStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error(t("Título obrigatório"));
      return;
    }
    const saved = saveSetlist(churchId, { id: activeId ?? undefined, title, date, steps });
    setActiveId(saved.id);
    setSetlists(getSetlists(churchId));
    toast.success(t("Roteiro salvo!"));
  };

  const handleDelete = (id: string) => {
    deleteSetlist(churchId, id);
    setSetlists(getSetlists(churchId));
    if (activeId === id) newSetlist();
    toast.success(t("Removido!"));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <Link to="/admin/culto" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft size={14} /> {t("Culto & Louvor")}
          </Link>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <ClipboardList className="text-blue-500" size={26} />
            {t("Roteiros de Culto")}
          </h1>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          {/* List */}
          <div className="space-y-3">
            <button type="button" onClick={newSetlist} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
              <Plus size={16} /> {t("Novo roteiro")}
            </button>
            {setlists.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">{t("Nenhum roteiro salvo")}</p>
            ) : (
              setlists.map((s) => (
                <div
                  key={s.id}
                  className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-2 ${
                    activeId === s.id ? "border-primary bg-primary/5" : "border-border/50 bg-card"
                  }`}
                >
                  <button type="button" className="flex-1 text-left min-w-0" onClick={() => loadSetlist(s.id)}>
                    <p className="font-medium text-sm truncate">{s.title}</p>
                    {s.date && <p className="text-[10px] text-muted-foreground">{s.date}</p>}
                  </button>
                  <button type="button" onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Editor */}
          <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Título do culto")}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />

            <div className="flex flex-wrap gap-2">
              {STEP_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addStep(type)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground"
                >
                  + {STEP_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step.id} className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {STEP_TYPE_LABELS[step.type]}
                    </span>
                    <div className="flex-1" />
                    <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="p-1 disabled:opacity-30">
                      <ChevronUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="p-1 disabled:opacity-30">
                      <ChevronDown size={14} />
                    </button>
                    <button type="button" onClick={() => removeStep(step.id)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={step.title}
                    onChange={(e) => updateStep(step.id, { title: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm"
                  />
                  {step.type === "louvor" && songs.length > 0 && (
                    <select
                      value={step.songId ?? ""}
                      onChange={(e) => {
                        const songId = e.target.value || undefined;
                        const song = songs.find((s) => s.id === songId);
                        updateStep(step.id, {
                          songId,
                          title: song?.title ?? step.title,
                          content: song?.lyrics ?? step.content,
                        });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="">{t("Selecionar da biblioteca")}</option>
                      {songs.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  )}
                  <textarea
                    value={step.content}
                    onChange={(e) => updateStep(step.id, { content: e.target.value })}
                    placeholder={t("Conteúdo / letra / referência bíblica")}
                    rows={3}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm resize-y"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" onClick={handleSave} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                {t("Salvar roteiro")}
              </button>
              {activeId && steps.length > 0 && (
                <Link
                  to={`/admin/culto/telao?setlist=${activeId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 text-purple-600 text-sm font-medium"
                >
                  <Monitor size={14} /> {t("Abrir no telão")}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
