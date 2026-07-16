import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { canWriteWorship } from "@/lib/permissions";
import { Library, Plus, Search, Trash2, ArrowLeft, Music2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ensureWorshipLoaded,
  getSongs,
  saveSong,
  deleteSong,
  WORSHIP_ORG_NOT_READY_MSG,
  worshipLoadErrorMessage,
  type WorshipSong,
} from "@/lib/worshipStorage";

const EMPTY_FORM = { title: "", lyrics: "", key: "", category: "", notes: "" };

export default function BibliotecaMusicas() {
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole, hasCapability } = useRole();
  const organizationId = church?.id;
  const canWrite = hasCapability("worship.write") || canWriteWorship(canonicalRole);
  const orgReady = Boolean(organizationId);
  const canPersist = orgReady && !churchLoading;

  const [songs, setSongs] = useState<WorshipSong[]>([]);
  const [worshipLoading, setWorshipLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const requireOrganization = useCallback((): string | null => {
    if (organizationId) return organizationId;
    toast.error(WORSHIP_ORG_NOT_READY_MSG);
    return null;
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setSongs([]);
      setLoadFailed(false);
      setWorshipLoading(false);
      return;
    }

    setWorshipLoading(true);
    setLoadFailed(false);
    void ensureWorshipLoaded(organizationId)
      .then(() => {
        setSongs(getSongs(organizationId));
        setLoadFailed(false);
      })
      .catch((err) => {
        setLoadFailed(true);
        setSongs([]);
        toast.error(
          worshipLoadErrorMessage(err, t("Erro ao carregar músicas da biblioteca")),
        );
      })
      .finally(() => setWorshipLoading(false));
  }, [organizationId, t]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q) ||
        (s.key ?? "").toLowerCase().includes(q),
    );
  }, [songs, search]);

  const openNew = () => {
    if (churchLoading || !requireOrganization()) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (song: WorshipSong) => {
    if (!canWrite || churchLoading || !requireOrganization()) return;
    setEditingId(song.id);
    setForm({
      title: song.title,
      lyrics: song.lyrics,
      key: song.key ?? "",
      category: song.category ?? "",
      notes: song.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const orgId = requireOrganization();
    if (!orgId) return;
    if (!form.title.trim()) {
      toast.error(t("Título obrigatório"));
      return;
    }
    try {
      await saveSong(orgId, { ...form, id: editingId ?? undefined });
      setSongs(getSongs(orgId));
      setShowForm(false);
      toast.success(editingId ? t("Música atualizada!") : t("Música cadastrada!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Erro ao salvar"));
    }
  };

  const handleDelete = async (id: string) => {
    const orgId = requireOrganization();
    if (!orgId) return;
    try {
      await deleteSong(orgId, id);
      setSongs(getSongs(orgId));
      toast.success(t("Removido!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Erro ao remover"));
    }
  };

  const listLoading = churchLoading || worshipLoading;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/admin/culto" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft size={14} /> {t("Culto & Louvor")}
            </Link>
            <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
              <Library className="text-accent" size={26} />
              {t("Biblioteca de Músicas")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Cadastre hinos e músicas da sua igreja")}</p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={openNew}
              disabled={!canPersist}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
            >
              <Plus size={16} /> {t("Nova música")}
            </button>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Buscar...")}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm"
          />
        </div>

        {listLoading ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
            <Loader2 size={32} className="mx-auto text-muted-foreground animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">{t("Carregando...")}</p>
          </div>
        ) : loadFailed ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-destructive/30">
            <p className="text-sm text-destructive">{t("Não foi possível carregar as músicas. Tente atualizar a página.")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
            <Music2 size={40} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t("Nenhuma música cadastrada")}</p>
            {canWrite && (
              <button
                type="button"
                onClick={openNew}
                disabled={!canPersist}
                className="mt-4 text-sm text-accent font-medium hover:underline disabled:opacity-50 disabled:pointer-events-none"
              >
                {t("Cadastrar primeira música")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((song) => (
              <div key={song.id} className="bg-card rounded-xl border border-border/50 p-4 flex items-start gap-4">
                <div
                  className={`flex-1 min-w-0 ${canWrite ? "cursor-pointer" : ""}`}
                  onClick={() => canWrite && openEdit(song)}
                >
                  <h3 className="font-semibold text-foreground truncate">{song.title}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {song.key && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">{song.key}</span>}
                    {song.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{song.category}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 whitespace-pre-wrap">{song.lyrics}</p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleDelete(song.id)}
                    disabled={!canPersist}
                    className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {showForm && canWrite && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/40">
            <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
              <h2 className="font-serif font-bold text-lg">{editingId ? t("Editar música") : t("Nova música")}</h2>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("Título")}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder={t("Tom")}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder={t("Categoria")}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
              <textarea
                value={form.lyrics}
                onChange={(e) => setForm({ ...form, lyrics: e.target.value })}
                placeholder={t("Letra (use linha em branco entre estrofes)")}
                rows={8}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y"
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t("Observações")}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
                  {t("Cancelar")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canPersist}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {t("Salvar")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
