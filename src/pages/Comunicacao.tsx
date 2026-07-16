import { AdminLayout } from "@/components/AdminLayout";
import { DocumentActions } from "@/components/DocumentActions";
import { MessageSquare, Plus, X, Clock, AlertTriangle, Info, Bell, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";
import { OperationalAssistant } from "@/components/OperationalAssistant";
import { useRole } from "@/hooks/useRole";
import { canWriteSecretaria, hasPermission, type AdminRole } from "@/lib/permissions";

type Announcement = {
  id: string;
  title: string;
  content: string;
  communication_type: string | null;
  created_at: string | null;
  published_at: string | null;
  is_public: boolean | null;
  created_by: string | null;
};

type CommFormState = {
  title: string;
  content: string;
  priority: string;
  isPublic: boolean;
};

const PRIORITIES = ["Normal", "Importante", "Urgente"] as const;

const priorityConfig: Record<string, { icon: typeof Info; color: string }> = {
  Urgente: { icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
  Importante: { icon: Bell, color: "text-amber-600 bg-amber-500/10" },
  Normal: { icon: Info, color: "text-blue-600 bg-blue-500/10" },
};

const SECRETARIA_COMMUNICATION_DELETE_ROLES: AdminRole[] = [
  "super_admin",
  "church_admin",
  "pastor",
  "secretary",
];

const canWriteCommunication = (role: AdminRole | null | undefined) => canWriteSecretaria(role);

const canDeleteCommunication = (role: AdminRole | null | undefined) =>
  hasPermission(role, SECRETARIA_COMMUNICATION_DELETE_ROLES);

const emptyForm = (): CommFormState => ({
  title: "",
  content: "",
  priority: "Normal",
  isPublic: false,
});

export default function Comunicacao() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole, hasCapability } = useRole();
  const canWrite = hasCapability("communications.write") || canWriteCommunication(canonicalRole);
  const canDelete = canDeleteCommunication(canonicalRole);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createForm, setCreateForm] = useState<CommFormState>(emptyForm());
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [editForm, setEditForm] = useState<CommFormState>(emptyForm());

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;

  const displayDate = (ann: Announcement) =>
    format(new Date(ann.published_at || ann.created_at || Date.now()), "dd MMM yyyy", { locale: dateLoc });

  const loadAnnouncements = useCallback(async () => {
    if (!church) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await runScopedOrganizationQuery<Announcement[]>("communications", church.id, query =>
      query.select("*").order("published_at", { ascending: false, nullsFirst: false }),
    );
    setLoading(false);
    if (error) {
      console.error(error);
      setLoadError(true);
      setAnnouncements([]);
      toast({
        title: t("Erro"),
        description: t("Erro ao carregar comunicados"),
        variant: "destructive",
      });
      return;
    }
    setLoadError(false);
    setAnnouncements(data || []);
  }, [church, t, toast]);

  useEffect(() => {
    if (churchLoading) return;
    if (!church) {
      setAnnouncements([]);
      setLoading(false);
      setLoadError(false);
      return;
    }
    void loadAnnouncements();
  }, [church, churchLoading, loadAnnouncements]);

  const openCreateForm = () => {
    setCreateForm(emptyForm());
    setShowForm(true);
  };

  const closeCreateForm = () => {
    setShowForm(false);
    setCreateForm(emptyForm());
  };

  const openAnnouncement = (ann: Announcement) => {
    setEditingAnnouncement(ann);
    setEditForm({
      title: ann.title,
      content: ann.content,
      priority: ann.communication_type || "Normal",
      isPublic: Boolean(ann.is_public),
    });
  };

  const closeEditModal = () => setEditingAnnouncement(null);

  const handleAdd = async () => {
    if (!createForm.title.trim() || !createForm.content.trim()) {
      toast({
        title: t("Erro"),
        description: t("Preencha título e conteúdo"),
        variant: "destructive",
      });
      return;
    }
    if (!user || !church) return;
    setSaving(true);
    const { error } = await insertWithOrganizationScope("communications", church.id, {
      created_by: user.id,
      title: createForm.title.trim(),
      content: createForm.content.trim(),
      communication_type: createForm.priority,
      is_public: createForm.isPublic,
      published_at: new Date().toISOString(),
    });
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    toast({ title: t("Comunicado publicado!") });
    closeCreateForm();
    await loadAnnouncements();
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editingAnnouncement || !church) return;
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast({
        title: t("Erro"),
        description: t("Preencha título e conteúdo"),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("communications")
      .update({
        title: editForm.title.trim(),
        content: editForm.content.trim(),
        communication_type: editForm.priority,
        is_public: editForm.isPublic,
        published_at: editingAnnouncement.published_at || new Date().toISOString(),
      })
      .eq("id", editingAnnouncement.id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    toast({ title: t("Comunicado atualizado") });
    closeEditModal();
    await loadAnnouncements();
    setSaving(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete || !church) return;
    if (!window.confirm(t("Remover este comunicado?"))) return;
    const { error } = await supabase
      .from("communications")
      .delete()
      .eq("id", id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("Comunicado removido") });
    if (editingAnnouncement?.id === id) closeEditModal();
    await loadAnnouncements();
  };

  const renderFormFields = (
    form: CommFormState,
    setForm: React.Dispatch<React.SetStateAction<CommFormState>>,
    readOnly: boolean,
  ) => (
    <div className="space-y-3">
      <input
        value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })}
        placeholder={t("Título")}
        readOnly={readOnly}
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
      />
      <textarea
        value={form.content}
        onChange={e => setForm({ ...form, content: e.target.value })}
        placeholder={t("Conteúdo do comunicado")}
        rows={4}
        readOnly={readOnly}
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-y min-h-[5rem] read-only:opacity-80"
      />
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Prioridade")}</label>
        <div className="flex gap-2 flex-wrap">
          {PRIORITIES.map(p => (
            <button
              key={p}
              type="button"
              disabled={readOnly}
              onClick={() => setForm({ ...form, priority: p })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-80 ${
                form.priority === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {t(p)}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isPublic}
          onChange={e => setForm({ ...form, isPublic: e.target.checked })}
          disabled={readOnly}
          className="rounded border-border"
        />
        <span>{t("Comunicado público")}</span>
      </label>
    </div>
  );

  const showPageLoading = loading || churchLoading;
  const noChurchReady = !churchLoading && user && !church;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">{t("Comunicação")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Avisos e comunicados para a comunidade")}</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <DocumentActions
              actions={["print", "share"]}
              shareTitle={t("Comunicados")}
              shareText={t("Avisos e comunicados da comunidade")}
              size="sm"
            />
          </div>
          {canWrite && (
            <div className="flex gap-2 flex-wrap">
              <OperationalAssistant
                module="communication"
                fields={[
                  { key: "title", label: t("Título"), required: true },
                  { key: "content", label: t("Mensagem"), required: true, type: "textarea" },
                  { key: "communication_type", label: t("Prioridade"), options: [...PRIORITIES] },
                ]}
                onConfirm={async data => {
                  if (!data.title || !data.content || !user || !church) {
                    throw new Error(t("Campos obrigatórios ausentes"));
                  }
                  const { error } = await insertWithOrganizationScope("communications", church.id, {
                    created_by: user.id,
                    title: data.title.trim(),
                    content: data.content.trim(),
                    communication_type: data.communication_type || "Normal",
                    is_public: false,
                    published_at: new Date().toISOString(),
                  });
                  if (error) throw new Error(error.message);
                  await loadAnnouncements();
                  toast({ title: t("Comunicado criado!") });
                }}
                onEdit={data => {
                  setCreateForm({
                    title: data.title || "",
                    content: data.content || "",
                    priority: data.communication_type || "Normal",
                    isPublic: false,
                  });
                  setShowForm(true);
                }}
              />
              <button
                type="button"
                onClick={openCreateForm}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} /> {t("Novo Comunicado")}
              </button>
            </div>
          )}
        </div>

        {showPageLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <span>{t("Carregando...")}</span>
          </div>
        ) : noChurchReady ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("Selecione uma organização")}</p>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <AlertTriangle size={32} className="text-destructive mb-3" />
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">{t("Erro ao carregar comunicados")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">{t("Não foi possível carregar os comunicados. Tente novamente.")}</p>
            <button
              type="button"
              onClick={() => void loadAnnouncements()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              {t("Tentar novamente")}
            </button>
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare size={32} className="text-primary/60" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">{t("Nenhum comunicado publicado")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-5">
              {t("Publique avisos, informes e notícias para manter sua comunidade informada.")}
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={openCreateForm}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
                {t("Criar Comunicado")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((ann, i) => {
              const priorityValue = ann.communication_type || "Normal";
              const cfg = priorityConfig[priorityValue] || priorityConfig.Normal;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={ann.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openAnnouncement(ann)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openAnnouncement(ann);
                    }
                  }}
                  className="bg-card rounded-xl p-5 shadow-sm border border-border/50 cursor-pointer hover:border-border transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                          <Icon size={12} /> {t(priorityValue)}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock size={12} /> {displayDate(ann)}
                        </span>
                        {ann.is_public && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {t("Público")}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-foreground text-lg">{ann.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{ann.content}</p>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={e => handleDelete(ann.id, e)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                        title={t("Remover")}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && canWrite && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={closeCreateForm}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto pointer-events-auto"
                onClick={e => e.stopPropagation()}
              >
                <h2 className="text-lg font-serif font-bold mb-4">{t("Novo Comunicado")}</h2>
                {renderFormFields(createForm, setCreateForm, false)}
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={closeCreateForm} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">
                    {t("Cancelar")}
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={saving}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {t("Publicar")}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {editingAnnouncement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="comm-edit-title"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="comm-edit-title" className="text-lg font-serif font-bold truncate pr-2">
                {editForm.title || editingAnnouncement.title}
              </h2>
              <button type="button" onClick={closeEditModal} className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0">
                <X size={16} />
              </button>
            </div>
            {renderFormFields(editForm, setEditForm, !canWrite)}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={closeEditModal} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium">
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
