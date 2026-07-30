/**
 * TvBiblioteca — Biblioteca de transmissões, gravações e reprises.
 *
 * Exibe:
 *  - Transmissões encerradas (tv_live_sessions)
 *  - Gravações prontas (recording_status = uploaded)
 *  - Reprises cadastradas (tv_replays)
 *  - Botões: Publicar no Canal, Criar reprise, Editar, Excluir
 */

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { TvAdminNav } from "@/components/tv/TvAdminNav";
import { useChurch } from "@/hooks/useChurchContext";
import {
  fetchRecentSessions, fetchReplays, publishSessionToCanal, statusBadge, recordingStatusBadge,
  type TvLiveSession, type TvReplay,
} from "@/lib/tvDigital";
import { fetchEcclesiaChannels, type EcclesiaChannel } from "@/lib/canalEcclesia";
import {
  Archive, Upload, PlayCircle, Trash2, RefreshCw, Film,
  Clock, Eye, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type RecordingStatus = "idle" | "none" | "recording" | "processing" | "uploaded" | "failed";

export default function TvBiblioteca() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [sessions, setSessions]         = useState<TvLiveSession[]>([]);
  const [replays, setReplays]           = useState<TvReplay[]>([]);
  const [canalChannels, setCanalChannels] = useState<EcclesiaChannel[]>([]);
  const [loading, setLoading]           = useState(true);
  const [publishing, setPublishing]     = useState<string | null>(null);
  const [tab, setTab]                   = useState<"gravacoes" | "reprises">("gravacoes");

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [sess, canalChs] = await Promise.all([
        fetchRecentSessions(orgId, 50),
        fetchEcclesiaChannels(orgId),
      ]);
      setSessions(sess.filter((s) => s.statusTransmissao === "ended"));
      setCanalChannels(canalChs);

      // Carregar reprises de todos os canais TV
      if (sess.length > 0) {
        const channelIds = [...new Set(sess.map((s) => s.channelId))];
        const allReplays = (await Promise.all(channelIds.map((id) => fetchReplays(id)))).flat();
        setReplays(allReplays);
      }
    } catch (err) {
      console.warn("[TvBiblioteca] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function handlePublish(session: TvLiveSession) {
    if (canalChannels.length === 0) {
      toast.error("Crie um canal no Canal Ecclesia primeiro.");
      return;
    }
    const target = canalChannels[0];
    const title  = `Transmissão — ${new Date(session.startedAt ?? "").toLocaleDateString("pt-BR")}`;
    setPublishing(session.id);
    const result = await publishSessionToCanal(session.id, target.id, title);
    setPublishing(null);
    if (result.ok) toast.success("Publicado no Canal Ecclesia!");
    else toast.error(`Erro: ${result.error}`);
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function formatDuration(startedAt: string | null, endedAt: string | null): string {
    if (!startedAt || !endedAt) return "—";
    const sec = Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Archive className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Biblioteca</h1>
            <p className="text-sm text-muted-foreground">
              Gravações, transmissões encerradas e reprises
            </p>
          </div>
        </div>

        <TvAdminNav />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {([
            { id: "gravacoes", label: "Gravações", count: sessions.length },
            { id: "reprises",  label: "Reprises",  count: replays.length },
          ] as const).map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5">{count}</span>
              )}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto p-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "gravacoes" ? (
          sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Film className="w-16 h-16 opacity-20" />
              <p className="text-sm font-medium">Nenhuma transmissão encerrada</p>
              <p className="text-xs opacity-60 text-center max-w-sm">
                As transmissões encerradas aparecem aqui. Inicie uma transmissão na aba Ao Vivo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const badge   = statusBadge(session.statusTransmissao);
                const recBadge = recordingStatusBadge(session.recordingStatus as RecordingStatus);
                const isReady = session.recordingStatus === "uploaded";

                return (
                  <div
                    key={session.id}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    {/* Thumbnail placeholder */}
                    <div className="w-full sm:w-32 h-20 sm:h-20 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <PlayCircle className="w-8 h-8 text-muted-foreground/40" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${recBadge.color}`}>
                          {recBadge.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        Transmissão — {formatDate(session.startedAt)}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(session.startedAt, session.endedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {session.peakViewerCount} pico
                        </span>
                      </div>
                      {session.recordingStatus === "processing" && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Processando gravação...
                        </p>
                      )}
                      {session.errorMessage && (
                        <p className="text-xs text-red-500 mt-1">{session.errorMessage}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 flex-shrink-0">
                      {isReady && (
                        <button
                          onClick={() => void handlePublish(session)}
                          disabled={publishing === session.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {publishing === session.id ? "Publicando..." : "Publicar no Canal"}
                        </button>
                      )}
                      {session.r2StorageKey && (
                        <a
                          href={`${import.meta.env.VITE_R2_PUBLIC_URL ?? ""}/${session.r2StorageKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted transition"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          Assistir
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // Reprises tab
          replays.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Film className="w-16 h-16 opacity-20" />
              <p className="text-sm font-medium">Nenhuma reprise cadastrada</p>
              <p className="text-xs opacity-60 text-center max-w-sm">
                Reprises são gravações que podem ser exibidas na grade da TV. Publique uma gravação primeiro.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {replays.map((r) => (
                <div key={r.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    {r.thumbnailUrl ? (
                      <img src={r.thumbnailUrl} alt={r.title} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-8 h-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    {r.durationSeconds && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Math.floor(r.durationSeconds / 60)}min
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </AdminLayout>
  );
}
