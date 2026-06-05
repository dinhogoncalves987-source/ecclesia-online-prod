import { AdminLayout } from "@/components/AdminLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { triggerShare } from "@/lib/share";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import {
  Plus, X, Eye, EyeOff, FileText, Video, Upload, Download,
  Calendar, Trash2, ExternalLink, Gavel, Copy, Share2, Pencil, ChevronRight
} from "lucide-react";

type Assembly = {
  id: string;
  organization_id: string;
  created_by: string | null;
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

const SECTION_HEADER_RE = /^(CONVOCAÇÃO|PAUTA|DECISÕES(?:\s+REGISTRADAS)?)\s*:?\s*$/i;

const ATTACHMENT_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp";

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || name;
}

function DescriptionContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="rounded-xl bg-secondary/30 p-4">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (SECTION_HEADER_RE.test(trimmed)) {
          return (
            <p
              key={i}
              className="text-xs font-semibold uppercase tracking-wide text-foreground mt-4 first:mt-0"
            >
              {trimmed.replace(/:$/, "")}
            </p>
          );
        }
        if (line === "") return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-sm text-muted-foreground whitespace-pre-wrap">
            {line}
          </p>
        );
      })}
    </div>
  );
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailAssembly, setDetailAssembly] = useState<Assembly | null>(null);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});

  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPeriod, setFormPeriod] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formYoutube, setFormYoutube] = useState("");
  const [formIsVisible, setFormIsVisible] = useState(false);

  const [showAttForm, setShowAttForm] = useState(false);
  const [attTitle, setAttTitle] = useState("");
  const [attType, setAttType] = useState("document");
  const [attYoutube, setAttYoutube] = useState("");
  const [attFile, setAttFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const formModalRef = useRef<HTMLDivElement>(null);
  const formScrollRef = useRef<HTMLDivElement>(null);

  const scrollFormIntoView = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      formModalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (formScrollRef.current) formScrollRef.current.scrollTop = 0;
    }, 0);
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const timer = setTimeout(scrollFormIntoView, 50);
    return () => clearTimeout(timer);
  }, [showForm, scrollFormIntoView]);

  const resolveAttTitle = () =>
    attTitle.trim() || (attFile ? titleFromFileName(attFile.name) : "");

  const canSubmitAttachment = () => {
    if (uploading) return false;
    const title = resolveAttTitle();
    if (!title) return false;
    if (attType === "video") return !!attYoutube.trim();
    return !!attFile;
  };

  const fetchAssemblies = async () => {
    if (!church) return;
    const { data } = await supabase
      .from("assemblies")
      .select("*")
      .eq("organization_id", church.id)
      .order("assembly_date", { ascending: false });
    if (data) {
      const filtered = isAdmin ? data : data.filter((a: Assembly) => a.is_visible);
      setAssemblies(filtered as Assembly[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (churchLoading) return;
    if (!church) { setLoading(false); return; }
    fetchAssemblies();
  }, [church, churchLoading, isAdmin]);

  useEffect(() => {
    if (!detailAssembly) return;
    const updated = assemblies.find((a) => a.id === detailAssembly.id);
    if (updated) setDetailAssembly(updated);
    else setDetailAssembly(null);
  }, [assemblies]);

  const fetchAttachments = async (assemblyId: string) => {
    const { data } = await supabase
      .from("assembly_attachments")
      .select("*")
      .eq("assembly_id", assemblyId)
      .order("created_at", { ascending: true });
    if (data) {
      setAttachments((prev) => ({ ...prev, [assemblyId]: data as Attachment[] }));
    }
  };

  const openDetail = (assembly: Assembly) => {
    setDetailAssembly(assembly);
    setShowAttForm(false);
    setAttTitle("");
    setAttType("document");
    setAttYoutube("");
    setAttFile(null);
    if (!attachments[assembly.id]) fetchAttachments(assembly.id);
  };

  const closeDetail = () => {
    setDetailAssembly(null);
    setShowAttForm(false);
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDesc("");
    setFormPeriod("");
    setFormYoutube("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormIsVisible(false);
    setEditingId(null);
  };

  const openCreateForm = () => {
    closeDetail();
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (assembly: Assembly) => {
    closeDetail();
    setEditingId(assembly.id);
    setFormTitle(assembly.title);
    setFormDesc(assembly.description || "");
    setFormPeriod(assembly.period || "");
    setFormDate(assembly.assembly_date);
    setFormYoutube(assembly.youtube_url || "");
    setFormIsVisible(assembly.is_visible);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !user || !church) return;

    if (editingId) {
      const { error } = await supabase
        .from("assemblies")
        .update({
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          period: formPeriod.trim() || null,
          assembly_date: formDate,
          youtube_url: formYoutube.trim() || null,
          is_visible: formIsVisible,
        } as Record<string, unknown>)
        .eq("id", editingId)
        .eq("organization_id", church.id);
      if (error) {
        toast({ title: t("Erro"), description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: t("Assembleia atualizada!") });
      closeForm();
      fetchAssemblies();
      return;
    }

    const { error } = await supabase.from("assemblies").insert({
      created_by: user.id,
      organization_id: church.id,
      title: formTitle.trim(),
      description: formDesc.trim() || null,
      period: formPeriod.trim() || null,
      assembly_date: formDate,
      youtube_url: formYoutube.trim() || null,
      is_visible: false,
    } as Record<string, unknown>);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    closeForm();
    toast({ title: t("Assembleia criada!") });
    fetchAssemblies();
  };

  const toggleVisibility = async (assembly: Assembly) => {
    if (!church) return;
    const { error } = await supabase
      .from("assemblies")
      .update({ is_visible: !assembly.is_visible } as Record<string, unknown>)
      .eq("id", assembly.id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("Visibilidade atualizada") });
    fetchAssemblies();
  };

  const deleteAssembly = async (id: string) => {
    if (!church) return;
    const { error } = await supabase
      .from("assemblies")
      .delete()
      .eq("id", id)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    if (detailAssembly?.id === id) closeDetail();
    toast({ title: t("Assembleia removida") });
    fetchAssemblies();
  };

  const handleAddAttachment = async (assemblyId: string) => {
    const title = resolveAttTitle();
    if (attType === "video") {
      if (!title || !attYoutube.trim()) {
        toast({
          title: t("Erro"),
          description: "Informe o título e o link do YouTube.",
          variant: "destructive",
        });
        return;
      }
    } else if (!title || !attFile) {
      toast({
        title: t("Erro"),
        description: "Selecione um arquivo para anexar.",
        variant: "destructive",
      });
      return;
    }

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
      title,
      attachment_type: attType,
      file_url: fileUrl,
      file_type: attFile ? attFile.name.split(".").pop() : null,
      youtube_url: attType === "video" ? attYoutube.trim() || null : null,
    } as Record<string, unknown>);

    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Anexo adicionado!") });
      setAttTitle("");
      setAttType("document");
      setAttYoutube("");
      setAttFile(null);
      setShowAttForm(false);
      fetchAttachments(assemblyId);
    }
    setUploading(false);
  };

  const deleteAttachment = async (att: Attachment) => {
    const { error } = await supabase.from("assembly_attachments").delete().eq("id", att.id);
    if (error) {
      toast({ title: t("Erro"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("Anexo removido") });
    fetchAttachments(att.assembly_id);
  };

  const getYoutubeEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s?]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const formatAssemblyDate = (assembly: Assembly) =>
    format(new Date(assembly.assembly_date), "dd MMM yyyy", { locale: dateLoc });

  const buildShareText = (assembly: Assembly) => {
    const churchName = church?.name ?? "Congregação Jardim América";
    const periodLine = assembly.period ? `Período: ${assembly.period}\n` : "";
    const description = assembly.description ?? "";
    return [
      `Assembleia Geral — ${assembly.title}`,
      periodLine + `Data: ${formatAssemblyDate(assembly)}`,
      description,
      `Ecclesia Online — ${churchName}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const handleCopyText = async (assembly: Assembly) => {
    try {
      await navigator.clipboard.writeText(buildShareText(assembly));
      toast({ title: t("Texto copiado!") });
    } catch {
      toast({ title: t("Erro"), description: t("Não foi possível copiar"), variant: "destructive" });
    }
  };

  const handleShare = async (assembly: Assembly) => {
    const text = buildShareText(assembly);
    const result = await triggerShare({
      url: window.location.href,
      title: assembly.title,
      text,
    });
    if (result === "copied") toast({ title: t("Texto copiado!") });
  };

  const renderAttachmentForm = (assemblyId: string) => (
    <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
      <input
        value={attTitle}
        onChange={(e) => setAttTitle(e.target.value)}
        placeholder={t("Título do anexo")}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
      />
      <div className="flex gap-2 flex-wrap">
        {attachmentTypes.map((at) => (
          <button
            key={at.value}
            type="button"
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
          onChange={(e) => setAttYoutube(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
        />
      ) : (
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-sm cursor-pointer hover:bg-secondary transition-colors">
          <Upload size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground truncate">
            {attFile ? attFile.name : t("Selecionar arquivo")}
          </span>
          <input
            type="file"
            className="hidden"
            accept={ATTACHMENT_FILE_ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setAttFile(file);
              if (file && !attTitle.trim()) {
                setAttTitle(titleFromFileName(file.name));
              }
            }}
          />
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setShowAttForm(false);
            setAttTitle("");
            setAttFile(null);
            setAttYoutube("");
          }}
          className="px-3 py-1.5 rounded-lg bg-background text-sm"
        >
          {t("Cancelar")}
        </button>
        <button
          type="button"
          onClick={() => handleAddAttachment(assemblyId)}
          disabled={!canSubmitAttachment()}
          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? t("Enviando...") : "Anexar"}
        </button>
      </div>
    </div>
  );

  const renderAttachmentList = (assemblyId: string) => {
    const list = attachments[assemblyId] || [];
    if (list.length === 0) {
      return <p className="text-xs text-muted-foreground">{t("Nenhum anexo adicionado")}</p>;
    }
    return (
      <div className="space-y-2">
        {list.map((att) => (
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
            <div className="flex items-center gap-1 flex-shrink-0">
              {att.file_url && (
                <a
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary hover:bg-background transition-colors"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">{t("Baixar")}</span>
                </a>
              )}
              {att.youtube_url && (
                <a
                  href={att.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary hover:bg-background transition-colors"
                >
                  <ExternalLink size={14} />
                  <span className="hidden sm:inline">{t("Abrir vídeo")}</span>
                </a>
              )}
              {isAdmin && (
                <button
                  type="button"
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
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
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
              onClick={openCreateForm}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} /> {t("Nova Assembleia")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">{t("Carregando...")}</div>
        ) : assemblies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Gavel size={32} className="text-primary/60" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">{t("Nenhuma assembleia registrada")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-5">{t("Registre assembleias gerais com atas, relatórios e vídeos para consulta da comunidade.")}</p>
            {isAdmin && (
              <button onClick={openCreateForm} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus size={16} />{t("Registrar Assembleia")}
              </button>
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
                <div
                  className="p-4 sm:p-5 flex items-start gap-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => openDetail(assembly)}
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
                        {formatAssemblyDate(assembly)}
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
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {detailAssembly && !showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={closeDetail}
            />
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                className="w-full sm:max-w-2xl bg-card rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border/50 px-5 py-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-serif font-bold text-foreground">{detailAssembly.title}</h2>
                      {detailAssembly.is_visible ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                          {t("Visível")}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {t("Oculta")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatAssemblyDate(detailAssembly)}
                      </span>
                      {detailAssembly.period && (
                        <span className="px-2 py-0.5 rounded bg-secondary text-xs">{detailAssembly.period}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0">
                    <X size={18} />
                  </button>
                </div>

                <div className="px-5 py-4 space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyText(detailAssembly)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <Copy size={14} /> {t("Copiar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShare(detailAssembly)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <Share2 size={14} /> {t("Compartilhar")}
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditForm(detailAssembly)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                          <Pencil size={14} /> {t("Editar")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAttForm((v) => !v)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
                        >
                          <Plus size={14} /> {t("Anexar arquivo")}
                        </button>
                      </>
                    )}
                  </div>

                  {detailAssembly.description ? (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">{t("Conteúdo da assembleia")}</h3>
                      <DescriptionContent text={detailAssembly.description} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("Sem descrição registrada")}</p>
                  )}

                  {detailAssembly.youtube_url && getYoutubeEmbedUrl(detailAssembly.youtube_url) && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-foreground">{t("Vídeo da assembleia")}</h3>
                        <a
                          href={detailAssembly.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink size={12} /> {t("Abrir no YouTube")}
                        </a>
                      </div>
                      <div className="rounded-xl overflow-hidden aspect-video bg-black">
                        <iframe
                          src={getYoutubeEmbedUrl(detailAssembly.youtube_url)!}
                          className="w-full h-full"
                          allowFullScreen
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          title={detailAssembly.title}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground">{t("Anexos e Documentos")}</h3>
                    </div>
                    <AnimatePresence>
                      {showAttForm && isAdmin && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mb-3"
                        >
                          {renderAttachmentForm(detailAssembly.id)}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {renderAttachmentList(detailAssembly.id)}
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Create / edit assembly modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[55]"
              onClick={closeForm}
            />
            <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
              <motion.div
                ref={formModalRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div ref={formScrollRef} className="max-h-[calc(85vh-3rem)] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-serif font-bold">
                    {editingId ? t("Editar Assembleia") : t("Nova Assembleia")}
                  </h2>
                  <button onClick={closeForm} className="p-1 rounded-lg hover:bg-secondary">
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Título")}</label>
                    <input
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder={t("Ex: Assembleia Geral Ordinária")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Período de Referência")}</label>
                    <input
                      value={formPeriod}
                      onChange={(e) => setFormPeriod(e.target.value)}
                      placeholder={t("Ex: 1º Trimestre 2026")}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Data da Assembleia")}</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Descrição (opcional)")}</label>
                    <textarea
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder={t("Resumo da assembleia...")}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Link do YouTube (opcional)")}</label>
                    <input
                      value={formYoutube}
                      onChange={(e) => setFormYoutube(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                  </div>
                  {editingId && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsVisible}
                        onChange={(e) => setFormIsVisible(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-foreground">{t("Tornar visível para membros")}</span>
                    </label>
                  )}
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={closeForm} className="flex-1 py-2.5 rounded-lg bg-secondary text-sm font-medium">
                    {t("Cancelar")}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formTitle.trim()}
                    className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {editingId ? t("Salvar alterações") : t("Criar Assembleia")}
                  </button>
                </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
