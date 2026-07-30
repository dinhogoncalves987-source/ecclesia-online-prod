import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchEcclesiaChannels, upsertEcclesiaChannel, uploadVideoToR2,
  createVideo, importTvSessionToCanal, slugify,
  CATEGORY_LABELS, type EcclesiaChannel, type EcclesiaVideoCategory,
} from "@/lib/canalEcclesia";
import { fetchRecentSessions, type TvLiveSession } from "@/lib/tvDigital";
import {
  Upload, Film, CheckCircle2, AlertCircle, Tv2, Plus, X,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

type UploadStage = "form" | "uploading" | "done" | "error";

export default function CanalUpload() {
  const { church } = useChurch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const orgId = church?.id ?? "";

  const [channels, setChannels] = useState<EcclesiaChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [tvSessions, setTvSessions] = useState<TvLiveSession[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<EcclesiaVideoCategory>("culto");
  const [visibility, setVisibility] = useState<"org_members" | "public" | "private">("org_members");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Upload state
  const [stage, setStage] = useState<UploadStage>("form");
  const [progress, setProgress] = useState(0);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);

  // TV import state
  const [showTvImport, setShowTvImport] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [importTitle, setImportTitle] = useState("");
  const [importCategory, setImportCategory] = useState<EcclesiaVideoCategory>("culto");
  const [importLoading, setImportLoading] = useState(false);

  // Quick-create channel
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      const [chs, sessions] = await Promise.all([
        fetchEcclesiaChannels(orgId),
        fetchRecentSessions(orgId, 20),
      ]);
      setChannels(chs);
      if (chs.length > 0) setSelectedChannelId(chs[0].id);
      setTvSessions(sessions.filter((s) => s.statusTransmissao === "ended" && (s.r2StorageKey || s.hlsUrl)));
    })();
  }, [orgId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));

    // Read duration from video metadata
    const url = URL.createObjectURL(f);
    setVideoPreviewUrl(url);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.src = url;
    vid.onloadedmetadata = () => {
      setDuration(Math.floor(vid.duration));
      URL.revokeObjectURL(url);
    };
  }

  async function handleCreateChannel() {
    if (!newChannelName.trim()) return;
    setCreatingChannel(true);
    const result = await upsertEcclesiaChannel(orgId, {
      name: newChannelName.trim(),
      slug: slugify(newChannelName),
    });
    setCreatingChannel(false);
    if (!result.ok) { toast.error(result.error); return; }
    setChannels((prev) => [...prev, result.channel!]);
    setSelectedChannelId(result.channel!.id);
    setShowNewChannel(false);
    setNewChannelName("");
    toast.success("Canal criado.");
  }

  async function handleUpload() {
    if (!title.trim()) { toast.error("Informe o título do vídeo."); return; }
    if (!file) { toast.error("Selecione um arquivo de vídeo."); return; }
    if (!selectedChannelId) { toast.error("Selecione um canal."); return; }
    if (!user?.id) { toast.error("Faça login para enviar."); return; }

    setStage("uploading");
    setProgress(0);

    const uploadResult = await uploadVideoToR2(file, orgId, setProgress);
    if (!uploadResult.ok || !uploadResult.storageKey || !uploadResult.publicUrl) {
      setStage("error");
      toast.error(`Erro no upload: ${uploadResult.error ?? "Verifique a conexão e tente novamente."}`);
      return;
    }

    const videoResult = await createVideo(orgId, selectedChannelId, {
      title: title.trim(),
      description: description || null,
      category,
      r2StorageKey: uploadResult.storageKey,
      playbackUrl: uploadResult.publicUrl,
      durationSeconds: duration,
      visibility,
    });

    if (!videoResult.ok) {
      setStage("error");
      toast.error(`Erro ao salvar metadados: ${videoResult.error}`);
      return;
    }

    setUploadedVideoId(videoResult.videoId!);
    setStage("done");
    toast.success("Vídeo publicado com sucesso!");
  }

  async function handleTvImport() {
    if (!selectedSessionId) { toast.error("Selecione uma transmissão."); return; }
    if (!importTitle.trim()) { toast.error("Informe o título."); return; }
    if (!selectedChannelId) { toast.error("Selecione um canal."); return; }
    setImportLoading(true);
    const result = await importTvSessionToCanal(selectedSessionId, selectedChannelId, importTitle, importCategory);
    setImportLoading(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Transmissão importada como vídeo!");
    navigate(`/video/${result.videoId}`);
  }

  // ── Tela de conclusão ──────────────────────────────────────────────────────
  if (stage === "done") {
    return (
      <AdminLayout>
        <div className="max-w-lg mx-auto p-6 flex flex-col items-center text-center mt-20">
          <CheckCircle2 className="w-20 h-20 text-green-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Vídeo publicado!</h1>
          <p className="text-muted-foreground mb-6">Seu vídeo está disponível no Canal Ecclesia.</p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/video/${uploadedVideoId}`)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition"
            >
              Ver vídeo
            </button>
            <button
              onClick={() => { setStage("form"); setFile(null); setTitle(""); setDescription(""); setDuration(null); setProgress(0); }}
              className="px-6 py-2.5 border border-border rounded-lg hover:bg-muted transition"
            >
              Enviar outro
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ── Tela de erro ────────────────────────────────────────────────────────────
  if (stage === "error") {
    return (
      <AdminLayout>
        <div className="max-w-lg mx-auto p-6 flex flex-col items-center text-center mt-20">
          <AlertCircle className="w-20 h-20 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Erro no upload</h1>
          <p className="text-muted-foreground mb-6">Verifique sua conexão e tente novamente.</p>
          <button
            onClick={() => { setStage("form"); setProgress(0); }}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition"
          >
            Tentar novamente
          </button>
        </div>
      </AdminLayout>
    );
  }

  // ── Uploading ───────────────────────────────────────────────────────────────
  if (stage === "uploading") {
    return (
      <AdminLayout>
        <div className="max-w-lg mx-auto p-6 flex flex-col items-center text-center mt-20">
          <Film className="w-16 h-16 text-primary mb-4 animate-pulse" />
          <h1 className="text-xl font-bold mb-2">Enviando vídeo…</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Não feche esta aba. O arquivo está sendo enviado diretamente para o Cloudflare R2.
          </p>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden mb-2">
            <div
              className="h-3 bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm font-mono text-muted-foreground">{progress}%</p>
          {progress === 100 && (
            <p className="text-sm text-muted-foreground mt-3 animate-pulse">
              Finalizando publicação…
            </p>
          )}
        </div>
      </AdminLayout>
    );
  }

  // ── Formulário ──────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Enviar vídeo</h1>
        </div>

        {/* Toggle: upload manual vs importar da TV */}
        <div className="flex gap-2 mb-6 p-1 bg-muted rounded-xl w-fit">
          <button
            onClick={() => setShowTvImport(false)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${!showTvImport ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
          >
            <Upload className="w-4 h-4" />
            Upload de arquivo
          </button>
          <button
            onClick={() => setShowTvImport(true)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${showTvImport ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
          >
            <Tv2 className="w-4 h-4" />
            Importar da TV Digital
          </button>
        </div>

        {/* Canal selector */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <label className="text-sm font-medium mb-2 block">Canal de destino *</label>
          <div className="flex gap-2">
            <select
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
            >
              {channels.length === 0 && <option value="">Nenhum canal — crie um abaixo</option>}
              {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
            <button
              onClick={() => setShowNewChannel(!showNewChannel)}
              className="flex items-center gap-1 border border-border rounded-lg px-3 py-2 text-sm hover:bg-muted transition"
            >
              <Plus className="w-4 h-4" />
              Novo canal
            </button>
          </div>
          {showNewChannel && (
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="Nome do canal"
                onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
              />
              <button onClick={handleCreateChannel} disabled={creatingChannel} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                {creatingChannel ? "…" : "Criar"}
              </button>
              <button onClick={() => setShowNewChannel(false)}><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {/* ── Import from TV ── */}
        {showTvImport && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Tv2 className="w-4 h-4 text-primary" />
              Importar transmissão da TV Digital
            </h2>
            {tvSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhuma transmissão encerrada com gravação disponível.
                <br />
                <span className="text-xs">Apenas transmissões com <code>r2_storage_key</code> ou <code>hls_url</code> aparecem aqui.</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Transmissão</label>
                  <select
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {tvSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.startedAt
                          ? new Date(s.startedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : "Transmissão"} — {s.streamSourceType ?? "Fonte desconhecida"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Título do vídeo *</label>
                  <input
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder="Ex: Culto Dominical — 30/06/2026"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
                  <select
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    value={importCategory}
                    onChange={(e) => setImportCategory(e.target.value as EcclesiaVideoCategory)}
                  >
                    {(Object.entries(CATEGORY_LABELS) as [EcclesiaVideoCategory, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleTvImport}
                  disabled={importLoading || !selectedSessionId || !importTitle.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm transition hover:bg-primary/90 disabled:opacity-50"
                >
                  <Tv2 className="w-4 h-4" />
                  {importLoading ? "Importando…" : "Importar transmissão como vídeo"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Manual upload ── */}
        {!showTvImport && (
          <div className="bg-card border border-border rounded-xl p-5">
            {/* Drop zone */}
            {!file ? (
              <div
                className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition"
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderOpen className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="font-medium">Arraste um vídeo ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM, MKV — qualquer tamanho (via R2)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-muted/50 rounded-xl px-4 py-3 mb-4">
                <Film className="w-6 h-6 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                    {duration ? ` · ${Math.floor(duration / 60)}min ${duration % 60}s` : ""}
                  </p>
                </div>
                <button onClick={() => { setFile(null); setDuration(null); }} className="text-muted-foreground hover:text-destructive transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Metadata form */}
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Culto Dominical — 30 de junho"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
                <textarea
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Descrição opcional"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
                  <select
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as EcclesiaVideoCategory)}
                  >
                    {(Object.entries(CATEGORY_LABELS) as [EcclesiaVideoCategory, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Visibilidade</label>
                  <select
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                  >
                    <option value="org_members">Membros</option>
                    <option value="public">Público</option>
                    <option value="private">Privado</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                O arquivo será enviado diretamente para o Cloudflare R2 sem passar pelo banco de dados.
                Apenas os metadados (título, duração, URL) serão salvos no Supabase.
              </div>

              <button
                onClick={handleUpload}
                disabled={!file || !title.trim() || !selectedChannelId}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Publicar vídeo
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
