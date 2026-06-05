import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { canWriteWorship } from "@/lib/permissions";
import {
  ClipboardList, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, Monitor, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ensureWorshipLoaded,
  getSetlists,
  getSetlistById,
  saveSetlist,
  deleteSetlist,
  getSongs,
  uid,
  STEP_TYPES,
  STEP_TYPE_LABELS,
  WORSHIP_ORG_NOT_READY_MSG,
  worshipLoadErrorMessage,
  type SetlistStep,
  type SetlistStepType,
  type WorshipSetlist,
} from "@/lib/worshipStorage";

export default function RoteirosCulto() {
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole } = useRole();
  const organizationId = church?.id;
  const canWrite = canWriteWorship(canonicalRole);
  const canPersist = Boolean(organizationId) && !churchLoading;

  const [setlists, setSetlists] = useState<WorshipSetlist[]>([]);
  const [songs, setSongs] = useState<ReturnType<typeof getSongs>>([]);
  const [worshipLoading, setWorshipLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [steps, setSteps] = useState<SetlistStep[]>([]);
  const stepElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollToStepIdRef = useRef<string | null>(null);

  const requireOrganization = useCallback((): string | null => {
    if (organizationId) return organizationId;
    toast.error(WORSHIP_ORG_NOT_READY_MSG);
    return null;
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setSetlists([]);
      setSongs([]);
      setLoadFailed(false);
      setWorshipLoading(false);
      return;
    }

    setWorshipLoading(true);
    setLoadFailed(false);
    void ensureWorshipLoaded(organizationId)
      .then(() => {
        setSetlists(getSetlists(organizationId));
        setSongs(getSongs(organizationId));
        setLoadFailed(false);
      })
      .catch((err) => {
        setLoadFailed(true);
        setSetlists([]);
        setSongs([]);
        toast.error(
          worshipLoadErrorMessage(err, t("Erro ao carregar roteiros de culto")),
        );
      })
      .finally(() => setWorshipLoading(false));
  }, [organizationId, t]);

  const loadSetlist = (id: string) => {
    const orgId = organizationId;
    if (!orgId) return;
    const s = getSetlistById(orgId, id);
    if (!s) return;
    setActiveId(s.id);
    setTitle(s.title);
    setDate(s.date ?? "");
    setSteps(s.steps);
  };

  const newSetlist = () => {
    if (churchLoading || !requireOrganization()) return;
    setActiveId(null);
    setTitle("");
    setDate(new Date().toISOString().slice(0, 10));
    setSteps([]);
  };

  const addStep = (type: SetlistStepType) => {
    const newId = uid();
    scrollToStepIdRef.current = newId;
    setSteps((prev) => [
      ...prev,
      {
        id: newId,
        type,
        title: STEP_TYPE_LABELS[type],
        content: "",
      },
    ]);
  };

  useEffect(() => {
    const stepId = scrollToStepIdRef.current;
    if (!stepId) return;

    const scrollToNewStep = () => {
      const node = stepElementRefs.current.get(stepId);
      if (!node) return false;

      scrollToStepIdRef.current = null;
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const titleInput = node.querySelector<HTMLInputElement>("input");
      titleInput?.focus({ preventScroll: true });
      return true;
    };

    if (scrollToNewStep()) return;

    requestAnimationFrame(() => {
      if (!scrollToNewStep()) {
        requestAnimationFrame(scrollToNewStep);
      }
    });
  }, [steps]);

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

  const handleSave = async () => {
    const orgId = requireOrganization();
    if (!orgId) return;
    if (!title.trim()) {
      toast.error(t("Título obrigatório"));
      return;
    }
    try {
      const saved = await saveSetlist(orgId, { id: activeId ?? undefined, title, date, steps });
      setActiveId(saved.id);
      setSetlists(getSetlists(orgId));
      toast.success(t("Roteiro salvo!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Erro ao salvar"));
    }
  };

  const handleDelete = async (id: string) => {
    const orgId = requireOrganization();
    if (!orgId) return;
    try {
      await deleteSetlist(orgId, id);
      setSetlists(getSetlists(orgId));
      if (activeId === id) newSetlist();
      toast.success(t("Removido!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Erro ao remover"));
    }
  };

  const listLoading = churchLoading || worshipLoading;

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

        {loadFailed && (
          <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            {t("Não foi possível carregar os roteiros. Tente atualizar a página.")}
          </p>
        )}

        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-3">
            {canWrite && (
              <button
                type="button"
                onClick={newSetlist}
                disabled={!canPersist}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus size={16} /> {t("Novo roteiro")}
              </button>
            )}

            {listLoading ? (
              <div className="text-center py-6">
                <Loader2 size={24} className="mx-auto text-muted-foreground animate-spin" />
              </div>
            ) : setlists.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {loadFailed ? t("Falha ao carregar") : t("Nenhum roteiro salvo")}
              </p>
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
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      disabled={!canPersist}
                      className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="bg-card rounded-2xl border border-border/50 p-5 flex flex-col gap-4 min-h-0">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Título do culto")}
              readOnly={!canWrite}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium shrink-0 read-only:opacity-80"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              readOnly={!canWrite}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-border bg-background text-sm shrink-0 read-only:opacity-80"
            />

            {canWrite && (
              <div
                className="sticky top-0 z-10 -mx-5 px-5 py-2 bg-card border-b border-border/50 shrink-0"
                role="toolbar"
                aria-label={t("Adicionar etapa")}
              >
                <div className="flex flex-wrap gap-2">
                  {STEP_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addStep(type)}
                      disabled={!canPersist}
                      className="text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50"
                    >
                      + {STEP_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 overflow-y-auto min-h-0 max-h-[min(70vh,calc(100dvh-18rem))] pr-0.5">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  ref={(node) => {
                    if (node) stepElementRefs.current.set(step.id, node);
                    else stepElementRefs.current.delete(step.id);
                  }}
                  className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-2 scroll-mt-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {STEP_TYPE_LABELS[step.type]}
                    </span>
                    <div className="flex-1" />
                    {canWrite && (
                      <>
                        <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="p-1 disabled:opacity-30">
                          <ChevronUp size={14} />
                        </button>
                        <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="p-1 disabled:opacity-30">
                          <ChevronDown size={14} />
                        </button>
                        <button type="button" onClick={() => removeStep(step.id)} className="p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                  <input
                    value={step.title}
                    onChange={(e) => updateStep(step.id, { title: e.target.value })}
                    readOnly={!canWrite}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm read-only:opacity-80"
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
                      disabled={!canWrite}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm disabled:opacity-80"
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
                    readOnly={!canWrite}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm resize-y read-only:opacity-80"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 shrink-0">
              {canWrite && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canPersist}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {t("Salvar roteiro")}
                </button>
              )}
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
