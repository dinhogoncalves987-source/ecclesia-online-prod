import { AdminLayout } from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import {
  Plus, X, Eye, EyeOff, FileText, Video, Upload, Download,
  Calendar, Trash2, ExternalLink, ChevronDown, ChevronUp, Gavel
} from "lucide-react";

type Assembly = {
  id: string;
  church_id: string;
  user_id: string;
  title: string;
  description: string | null;
  period: string | null;
  assembly_date: string;
  youtube_url: string | null;
  is_visible: boolean;
  created_at: string;
};

type Attachment = {
  id: string;
  assembly_id: string;
  title: string;
  file_url: string | null;
  file_type: string | null;
  youtube_url: string | null;
  attachment_type: string;
  created_at: string;
};

const attachmentTypes = [
  { value: "document", label: "Documento", icon: FileText },
  { value: "minutes", label: "Ata", icon: FileText },
  { value: "report", label: "Relatório", icon: FileText },
  { value: "video", label: "Vídeo (YouTube)", icon: Video },
];

export default function AssembleiaGeral() {
  const { user } = useAuth();
  const { church, loading: churchLoading } = useChurch();
  const { isAdmin } = useRole();
  const { toast } = useToast();
  const { t, lang } = useLanguage();

  const dateLoc = lang === "en" ? enUS : lang === "es" ? es : ptBR;

  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPeriod, setFormPeriod] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formYoutube, setFormYoutube] = useState("");

  // Attachment form
  const [showAttForm, setShowAttForm] = useState<string | null>(null);
  const [attTitle, setAttTitle] = useState("");
  const [attType, setAttType] = useState("document");
  const [attYoutube, setAttYoutube] = useState("");
  const [attFile, setAttFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchAssemblies = async () => {
    if (!church) return;
    const { data } = await supabase
      .from("assemblies")
      .select("*")
      .eq("church_id", church.id)
      .order("assembly_date", { ascending: false });
    if (data) {
      // Members only see visible ones
      const filtered = isAdmin ? data : data.filter((a: any) => a.is_visible);
      setAssemblies(filtered as Assembly[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    fetchAssemblies();
  }, [church, churchLoading, isAdmin]);

  const fetchAttachments = async (assemblyId: string) => {
    const { data } = await supabase
      .from("assembly_attachments")
      .select("*")
      .eq("assembly_id", assemblyId)
      .order("created_at", { ascending: true });
    if (data) {
      setAttachments(prev => ({ ...prev, [assemblyId]: data as Attachment[] }));
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!attachments[id]) fetchAttachments(id);
    }
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !user || !church) return;
    const { error } = await supabase.from("assemblies").insert({
      user_id: user.id,
      church_id: church.id,
      title: formTitle.trim(),
      description: formDesc.trim() || null,
      period: formPeriod.trim() || null,
      assembly_date: formDate,
      youtube_url: formYoutube.trim() || null,
      is_visible: false,
    } as any);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    setFormTitle(""); setFormDesc(""); setFormPeriod(""); setFormYoutube("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setShowForm(false);
    toast({ title: t("Assembleia criada!") });
    fetchAssemblies();
  };

  const toggleVisibility = async (assembly: Assembly) => {
    await supabase
      .from("assemblies")
      .update({ is_visible: !assembly.is_visible } as any)
      .eq("id", assembly.id);
    fetchAssemblies();
  };

  const deleteAssembly = async (id: string) => {
    await supabase.from("assemblies").delete().eq("id", id);
    toast({ title: t("Assembleia removida") });
    fetchAssemblies();
  };

  const handleAddAttachment = async (assemblyId: string) => {
    if (!attTitle.trim()) return;
    setUploading(true);

    let fileUrl: string | null = null;

    if (attFile && attType !== "video") {
      const ext = attFile.name.split(".").pop();
      const path = `${church!.id}/${assemblyId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("assemblies")
        .upload(path, attFile);
      if (upErr) {
        toast({ title: t("Erro no upload"), description: upErr.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("assemblies").getPublicUrl(path);
      fileUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from("assembly_attachments").insert({
      assembly_id: assemblyId,
      title: attTitle.trim(),
      attachment_type: attType,
      file_url: fileUrl,
      file_type: attFile ? attFile.name.split(".").pop() : null,
      youtube_url: attType === "video" ? attYoutube.trim() || null : null,
    } as any);

    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Anexo adicionado!") });
      setAttTitle(""); setAttType("document"); setAttYoutube(""); setAttFile(null);
      setShowAttForm(null);
      fetchAttachments(assemblyId);
    }
    setUploading(false);
  };

  const deleteAttachment = async (att: Attachment) => {
    await supabase.from("assembly_attachments").delete().eq("id", att.id);
    fetchAttachments(att.assembly_id);
  };

  const getYoutubeEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s?]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
              <Gavel size={24} className="text-accent" />
              {t("Assembleia Geral")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Atas, relatórios e registros das assembleias da igreja")}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} /> {t("Nova Assembleia")}
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : assemblies.length === 0 ? (
          <div className="text-center py-16">
            <Gavel size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t("Nenhuma assembleia registrada")}</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">{t("Clique em 'Nova Assembleia' para começar")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {assemblies.map((assembly, i) => (
              <motion.div
                key={assembly.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden"
              >
                {/* Assembly header */}
                <div
                  className="p-4 sm:p-5 flex items-start gap-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => toggleExpand(assembly.id)}
                >
                  <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Gavel size={20} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{assembly.title}</h3>
                      {assembly.is_visible ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                          {t("Visível")}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {t("Oculta")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {format(new Date(assembly.assembly_date), "dd MMM yyyy", { locale: dateLoc })}
                      </span>
                      {assembly.period && (
                        <span className="px-2 py-0.5 rounded bg-secondary text-xs">{assembly.period}</span>
                      )}
                    </div>
                    {assembly.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{assembly.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isAdmin && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleVisibility(assembly); }}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors"
                          title={assembly.is_visible ? t("Ocultar") : t("Tornar visível")}
                        >
                          {assembly.is_visible ? <Eye size={16} className="text-green-600" /> : <EyeOff size={16} className="text-muted-foreground" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteAssembly(assembly.id); }}
                          className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    {expandedId === assembly.id ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {expandedId === assembly.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-5 pb-5 border-t border-border/50 pt-4 space-y-4">
                        {/* YouTube embed */}
                        {assembly.youtube_url && getYoutubeEmbedUrl(assembly.youtube_url) && (
                          <div className="rounded-xl overflow-hidden aspect-video bg-black">
                            <iframe
                              src={getYoutubeEmbedUrl(assembly.youtube_url)!}
                              className="w-full h-full"
                              allowFullScreen
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                          </div>
                        )}

                        {/* Attachments */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-foreground">{t("Anexos e Documentos")}</h4>
                            {isAdmin && (
                              <button
                                onClick={() => setShowAttForm(showAttForm === assembly.id ? null : assembly.id)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <Plus size={14} /> {t("Adicionar")}
                              </button>
                            )}
                          </div>

                          {/* Attachment form */}
                          <AnimatePresence>
                            {showAttForm === assembly.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mb-3"
                              >
                                <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                                  <input
                                    value={attTitle}
                                    onChange={e => setAttTitle(e.target.value)}
                                    placeholder={t("Título do anexo")}
                                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                                  />
                                  <div className="flex gap-2 flex-wrap">
                                    {attachmentTypes.map(at => (
                                      <button
                                        key={at.value}
                                        onClick={() => setAttType(at.value)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                          attType === at.value
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-background text-muted-foreground hover:text-foreground"
                                        }`}
                                      >
                                        <at.icon size={12} /> {t(at.label)}
                                      </button>
                                    ))}
                                  </div>
                                  {attType === "video" ? (
                                    <input
                                      value={attYoutube}
                                      onChange={e => setAttYoutube(e.target.value)}
                                      placeholder="https://youtube.com/watch?v=..."
                                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-sm cursor-pointer hover:bg-secondary transition-colors flex-1">
                                        <Upload size={14} className="text-muted-foreground" />
                                        <span className="text-muted-foreground truncate">
                                          {attFile ? attFile.name : t("Selecionar arquivo")}
                                        </span>
                                        <input
                                          type="file"
                                          className="hidden"
                                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.png"
                                          onChange={e => setAttFile(e.target.files?.[0] || null)}
                                        />
                                      </label>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => { setShowAttForm(null); setAttTitle(""); setAttFile(null); setAttYoutube(""); }}
                                      className="px-3 py-1.5 rounded-lg bg-background text-sm"
                                    >
                                      {t("Cancelar")}
                                    </button>
                                    <button
                                      onClick={() => handleAddAttachment(assembly.id)}
                                      disabled={uploading || !attTitle.trim()}
                                      className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                                    >
                                      {uploading ? t("Enviando...") : t("Salvar")}
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Attachment list */}
                          {(attachments[assembly.id] || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t("Nenhum anexo adicionado")}</p>
                          ) : (
                            <div className="space-y-2">
                              {(attachments[assembly.id] || []).map(att => (
                                <div
                                  key={att.id}
                                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 group"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                                    {att.attachment_type === "video" ? (
                                      <Video size={14} className="text-accent" />
                                    ) : (
                                      <FileText size={14} className="text-accent" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{att.title}</p>
                                    <p className="text-[10px] text-muted-foreground capitalize">{t(att.attachment_type)}</p>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {att.file_url && (
                                      <a
                                        href={att.file_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-lg hover:bg-background transition-colors"
                                      >
                                        <Download size={14} className="text-primary" />
                                      </a>
                                    )}
                                    {att.youtube_url && (
                                      <a
                                        href={att.youtube_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-lg hover:bg-background transition-colors"
                                      >
                                        <ExternalLink size={14} className="text-primary" />
                                      </a>
                                    )}
                                    {isAdmin && (
                                      <button
                                        onClick={() => deleteAttachment(att)}
                                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create assembly modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={() => setShowForm(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-serif font-bold">{t("Nova Assembleia")}</h2>
                  <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-secondary">
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Título")}</label>
                    <input
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder={t("Ex: Assembleia Geral Ordinária")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Período de Referência")}</label>
                    <input
                      value={formPeriod}
                      onChange={e => setFormPeriod(e.target.value)}
                      placeholder={t("Ex: 1º Trimestre 2026")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Data da Assembleia")}</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Descrição (opcional)")}</label>
                    <textarea
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      placeholder={t("Resumo da assembleia...")}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Link do YouTube (opcional)")}</label>
                    <input
                      value={formYoutube}
                      onChange={e => setFormYoutube(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg bg-secondary text-sm font-medium">
                    {t("Cancelar")}
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!formTitle.trim()}
                    className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {t("Criar Assembleia")}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
