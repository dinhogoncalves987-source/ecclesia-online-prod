import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { EcclesiaCanalPlayer } from "@/components/canal/EcclesiaCanalPlayer";
import {
  fetchVideoById, fetchWatchHistory, saveWatchPosition,
  checkUserLiked, toggleLike, checkSubscribed, toggleSubscription,
  fetchComments, addComment, deleteComment, fetchReplies,
  type EcclesiaVideo, type EcclesiaComment,
  formatDuration, timeAgo, CATEGORY_LABELS,
} from "@/lib/canalEcclesia";
import {
  MOCK_VIDEOS, MOCK_COMMENTS, MOCK_CHANNELS, getMockRelated,
} from "@/lib/canalMockData";
import { CanalVideoCard } from "@/components/canal/CanalComponents";
import { supabase } from "@/integrations/supabase/client";
import {
  ThumbsUp, Bell, BellOff, Send, ChevronDown, ChevronUp,
  ArrowLeft, Trash2, MessageSquare, Eye, Share2, Bookmark,
  CheckCircle2, Tv2, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";

const SAVE_INTERVAL_MS = 30_000;

export default function VideoPlayer() {
  const { id: videoId } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [video, setVideo] = useState<EcclesiaVideo | null>(null);
  const [channelName, setChannelName] = useState<string>("");
  const [startAt, setStartAt] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Related videos
  const [relatedVideos, setRelatedVideos] = useState<EcclesiaVideo[]>([]);

  // Comments
  const [comments, setComments] = useState<EcclesiaComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replies, setReplies] = useState<Record<string, EcclesiaComment[]>>({});
  const [showReplies, setShowReplies] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Watch position
  const currentTimeRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!videoId) return;
    void (async () => {
      try {
        let v: EcclesiaVideo | null = await fetchVideoById(videoId);

        if (!v) {
          // Fallback to mock
          v = MOCK_VIDEOS.find((m) => m.id === videoId) ?? null;
          if (v) {
            const ch = MOCK_CHANNELS.find((c) => c.id === v!.channelId);
            setChannelName(ch?.name ?? "");
            setRelatedVideos(getMockRelated(videoId, v.category));
          }
        }

        if (!v) { setError("Vídeo não encontrado."); setLoading(false); return; }
        setVideo(v);

        // Try to get channel name
        if (!channelName) {
          try {
            const { data: ch } = await supabase
              .from("ecclesia_channels")
              .select("name")
              .eq("id", v.channelId)
              .single();
            if (ch?.name) setChannelName(ch.name);
          } catch {
            const mock = MOCK_CHANNELS.find((c) => c.id === v!.channelId);
            if (mock) setChannelName(mock.name);
          }
        }

        // Related
        const related = getMockRelated(videoId, v.category);
        setRelatedVideos(related);

        // Watch history
        const history = user ? await fetchWatchHistory(videoId) : null;
        if (history?.lastPosition && history.lastPosition > 10) {
          setStartAt(history.lastPosition);
        }

        if (user?.id) {
          const [liked, subbed] = await Promise.all([
            checkUserLiked(videoId, user.id),
            checkSubscribed(v.channelId, user.id),
          ]);
          setIsLiked(liked);
          setIsSubscribed(subbed);
        }

        const coms = await fetchComments(videoId);
        setComments(coms);
      } catch {
        // Use mock data
        const mockV = MOCK_VIDEOS.find((m) => m.id === videoId);
        if (mockV) {
          setVideo(mockV);
          const ch = MOCK_CHANNELS.find((c) => c.id === mockV.channelId);
          setChannelName(ch?.name ?? "");
          setRelatedVideos(getMockRelated(videoId, mockV.category));
        } else {
          setError("Não foi possível reproduzir este vídeo.");
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, user?.id]);

  // Realtime: novos comentários
  useEffect(() => {
    if (!videoId) return;
    const ch = supabase
      .channel(`video_comments:${videoId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "ecclesia_video_comments",
        filter: `video_id=eq.${videoId}`,
      }, async () => {
        const fresh = await fetchComments(videoId);
        setComments(fresh);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [videoId]);

  // Auto-save watch position every 30s
  const doSave = useCallback(() => {
    if (!videoId || !user || currentTimeRef.current < 5) return;
    void saveWatchPosition(videoId, currentTimeRef.current, video?.durationSeconds);
  }, [videoId, user, video?.durationSeconds]);

  useEffect(() => {
    if (!user) return;
    saveTimerRef.current = setInterval(doSave, SAVE_INTERVAL_MS);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      doSave();
    };
  }, [doSave, user]);

  function handleTimeUpdate(t: number) { currentTimeRef.current = t; }

  async function handleLike() {
    if (!user) { toast.error("Faça login para curtir."); return; }
    try {
      const ok = await toggleLike(video!.id, isLiked);
      if (ok) {
        setIsLiked(!isLiked);
        setVideo((v) => v ? { ...v, likeCount: v.likeCount + (isLiked ? -1 : 1) } : v);
      }
    } catch {
      setIsLiked(!isLiked);
    }
  }

  async function handleSubscribe() {
    if (!user || !video) return;
    try {
      const ok = await toggleSubscription(video.channelId, isSubscribed);
      if (ok) {
        setIsSubscribed(!isSubscribed);
        toast.success(isSubscribed ? "Deixou de seguir o canal." : "Seguindo o canal!");
      }
    } catch {
      setIsSubscribed(!isSubscribed);
      toast.success(isSubscribed ? "Deixou de seguir o canal." : "Seguindo o canal!");
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/video/${videoId}`;
    if (navigator.share) {
      void navigator.share({ title: video?.title ?? "Vídeo", url });
    } else {
      void navigator.clipboard.writeText(url).then(() => {
        setLinkCopied(true);
        toast.success("Link copiado!");
        setTimeout(() => setLinkCopied(false), 2000);
      });
    }
  }

  async function handleAddComment(parentId?: string | null) {
    const text = parentId ? (replyText[parentId] ?? "") : commentText;
    if (!text.trim()) return;
    if (!user) { toast.error("Faça login para comentar."); return; }
    setSubmittingComment(true);
    try {
      const result = await addComment(video!.id, text.trim(), parentId);
      if (!result.ok) { toast.error("Erro ao enviar comentário."); return; }
      if (parentId) {
        setReplyText((r) => ({ ...r, [parentId]: "" }));
        setReplyingTo(null);
        const newReplies = await fetchReplies(parentId);
        setReplies((r) => ({ ...r, [parentId]: newReplies }));
      } else {
        setCommentText("");
        const fresh = await fetchComments(video!.id);
        setComments(fresh);
      }
    } catch {
      toast.error("Erro ao enviar comentário.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm("Remover este comentário?")) return;
    try {
      const ok = await deleteComment(commentId);
      if (ok) {
        setComments((c) => c.map((x) => x.id === commentId ? { ...x, isDeleted: true, body: "[Comentário removido]" } : x));
      }
    } catch { /* silent */ }
  }

  async function toggleReplies(commentId: string) {
    const showing = showReplies[commentId];
    if (!showing && !replies[commentId]) {
      try {
        const r = await fetchReplies(commentId);
        setReplies((prev) => ({ ...prev, [commentId]: r }));
      } catch { /* silent */ }
    }
    setShowReplies((s) => ({ ...s, [commentId]: !showing }));
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminLayout>
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-3 w-32 bg-muted rounded" />
            <div className="aspect-video bg-muted rounded-2xl" />
            <div className="h-6 w-3/4 bg-muted rounded" />
            <div className="h-4 w-1/2 bg-muted rounded" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !video) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-destructive/50" />
          </div>
          <p className="font-medium">{error ?? "Vídeo não encontrado."}</p>
          <Link to="/canal" className="text-primary hover:underline text-sm flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Voltar ao Canal Eclésia
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const userInitials = (user?.email ?? "V").slice(0, 1).toUpperCase();
  const desc = video.description ?? "";
  const isProcessing = video.status === "processing";

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-3 sm:p-5 md:p-6">
        {/* Back */}
        <Link
          to="/canal"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Canal Eclésia
        </Link>

        {/* ── Layout: player + relacionados ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Player + details */}
          <div className="flex-1 min-w-0">

            {/* Player */}
            {isProcessing ? (
              <div className="aspect-video bg-gray-950 rounded-2xl flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-yellow-400 text-sm font-medium">Este vídeo ainda está sendo processado</p>
                <p className="text-white/40 text-xs">Estará disponível em breve</p>
              </div>
            ) : (
              <EcclesiaCanalPlayer
                playbackUrl={video.playbackUrl}
                hlsUrl={video.hlsUrl}
                startAt={startAt}
                durationSeconds={video.durationSeconds}
                onTimeUpdate={handleTimeUpdate}
                onEnded={doSave}
              />
            )}

            {/* ── Video Info ── */}
            <div className="mt-4 space-y-3">
              <h1 className="text-lg sm:text-xl font-bold leading-snug">{video.title}</h1>

              {/* Meta row */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {video.viewCount.toLocaleString("pt-BR")} visualizações
                </span>
                <span>·</span>
                <span>{timeAgo(video.publishedAt ?? video.createdAt)}</span>
                <span>·</span>
                <span className="bg-muted px-2 py-0.5 rounded-full">
                  {CATEGORY_LABELS[video.category]}
                </span>
                {video.durationSeconds && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(video.durationSeconds)}</span>
                  </>
                )}
                {video.tvLiveSessionId && (
                  <>
                    <span>·</span>
                    <span className="bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                      📺 Replay TV Digital
                    </span>
                  </>
                )}
              </div>

              {/* Channel + actions */}
              <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-border">
                {/* Channel */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Tv2 className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      {channelName || "Canal"}
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    </p>
                    <p className="text-xs text-muted-foreground">Canal no Eclésia</p>
                  </div>
                  <button
                    onClick={() => void handleSubscribe()}
                    className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                      isSubscribed
                        ? "bg-muted border border-border"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {isSubscribed ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    {isSubscribed ? "Seguindo" : "Seguir"}
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleLike()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                      isLiked
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    {video.likeCount > 0 ? video.likeCount.toLocaleString("pt-BR") : "Curtir"}
                  </button>

                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted transition text-sm"
                  >
                    {linkCopied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                    {linkCopied ? "Copiado!" : "Compartilhar"}
                  </button>

                  <button
                    onClick={() => {
                      setIsSaved(!isSaved);
                      toast.success(isSaved ? "Removido dos salvos." : "Vídeo salvo!");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition text-sm ${
                      isSaved ? "bg-primary/10 border-primary/30 text-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
                    Salvar
                  </button>
                </div>
              </div>

              {/* ── Description ── */}
              {desc && (
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className={`text-sm text-muted-foreground whitespace-pre-line leading-relaxed ${
                    descExpanded ? "" : "line-clamp-3"
                  }`}>
                    {desc}
                  </p>
                  {desc.length > 200 && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="flex items-center gap-1 text-xs font-medium mt-2 hover:text-primary transition"
                    >
                      {descExpanded ? "Mostrar menos" : "Mostrar mais"}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${descExpanded ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              )}

              {/* ── Comments ── */}
              <div className="border-t border-border pt-5 mt-4">
                <h2 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4" />
                  {video.commentCount} comentários
                </h2>

                {/* Add comment */}
                <div className="flex gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                    {userInitials}
                  </div>
                  <div className="flex-1">
                    <textarea
                      className="w-full border-b border-border bg-transparent text-sm focus:outline-none focus:border-primary resize-none pb-1 placeholder:text-muted-foreground/60"
                      placeholder={user ? "Adicionar comentário…" : "Faça login para comentar"}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={2}
                      disabled={!user}
                    />
                    {commentText.trim() && (
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => setCommentText("")} className="text-xs px-3 py-1.5 hover:bg-muted rounded-lg transition">
                          Cancelar
                        </button>
                        <button
                          onClick={() => void handleAddComment(null)}
                          disabled={submittingComment}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                        >
                          <Send className="w-3 h-3" />
                          Comentar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mock comments fallback when real list is empty */}
                {comments.length === 0 && !user && (
                  <div className="flex flex-col gap-5 mb-4">
                    {MOCK_COMMENTS.slice(0, 3).map((mc) => (
                      <div key={mc.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {mc.userName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium">{mc.userName}</span>
                            <span className="text-xs text-muted-foreground">há {mc.time}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{mc.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment list */}
                <div className="flex flex-col gap-5">
                  {comments.map((c) => (
                    <div key={c.id}>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden">
                          {c.userAvatar ? (
                            <img src={c.userAvatar} alt={c.userName} className="w-full h-full object-cover" />
                          ) : c.userName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium">{c.userName}</span>
                            <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className={`text-sm ${c.isDeleted ? "italic text-muted-foreground" : ""}`}>{c.body}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            {!c.isDeleted && (
                              <button
                                onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                                className="text-xs text-muted-foreground hover:text-foreground transition"
                              >
                                Responder
                              </button>
                            )}
                            {c.replyCount > 0 && (
                              <button
                                onClick={() => void toggleReplies(c.id)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {showReplies[c.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {c.replyCount} {c.replyCount === 1 ? "resposta" : "respostas"}
                              </button>
                            )}
                            {user?.id === c.userId && !c.isDeleted && (
                              <button
                                onClick={() => void handleDeleteComment(c.id)}
                                className="text-xs text-destructive hover:opacity-70 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {replyingTo === c.id && (
                            <div className="flex gap-2 mt-2">
                              <textarea
                                className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                placeholder="Escreva uma resposta…"
                                rows={2}
                                value={replyText[c.id] ?? ""}
                                onChange={(e) => setReplyText((r) => ({ ...r, [c.id]: e.target.value }))}
                              />
                              <button
                                onClick={() => void handleAddComment(c.id)}
                                disabled={!replyText[c.id]?.trim()}
                                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {showReplies[c.id] && replies[c.id] && (
                            <div className="mt-3 ml-4 flex flex-col gap-3 border-l-2 border-border pl-3">
                              {replies[c.id].map((r) => (
                                <div key={r.id} className="flex gap-2">
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden">
                                    {r.userAvatar ? (
                                      <img src={r.userAvatar} alt={r.userName} className="w-full h-full object-cover" />
                                    ) : r.userName.slice(0, 1).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs font-medium">{r.userName}</span>
                                      <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                                    </div>
                                    <p className="text-sm">{r.body}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {comments.length === 0 && user && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum comentário ainda. Seja o primeiro!
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Vídeos Relacionados ── */}
          {relatedVideos.length > 0 && (
            <aside className="lg:w-80 xl:w-96 flex-shrink-0">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Copy className="w-4 h-4 text-primary" />
                Relacionados
              </h2>
              <div className="flex flex-col gap-3 lg:gap-4">
                {relatedVideos.map((v) => (
                  <CanalVideoCard key={v.id} video={v} channelName={
                    MOCK_CHANNELS.find((c) => c.id === v.channelId)?.name
                  } showChannel size="compact" />
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
