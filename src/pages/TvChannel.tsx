import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useChurch } from "@/hooks/useChurchContext";
import { AdminLayout } from "@/components/AdminLayout";
import { TvPlayer } from "@/components/tv/TvPlayer";
import { useTvViewer } from "@/hooks/useTvViewer";
import {
  fetchTvChannelBySlug,
  fetchScheduleBlocks,
  getCurrentTvBlock,
  type TvChannel,
  type TvScheduleBlock,
  type TvCurrentBlock,
} from "@/lib/tvDigital";
import { supabase } from "@/integrations/supabase/client";
import { Tv2, CalendarDays, Clock, RefreshCw, ArrowLeft, Users } from "lucide-react";
import { Link } from "react-router-dom";

// Intervalo de atualização do bloco atual (30s)
const BLOCK_REFRESH_INTERVAL_MS = 30_000;

export default function TvChannel() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [channel, setChannel] = useState<TvChannel | null>(null);
  const [currentBlock, setCurrentBlock] = useState<TvCurrentBlock>({ type: "offline" });
  const [schedule, setSchedule] = useState<TvScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewer analytics: registra join/heartbeat/leave e retorna contagem ao vivo
  const liveSessionId =
    currentBlock.type === "live"
      ? (currentBlock as { type: "live"; sessionId?: string }).sessionId ?? null
      : null;

  const { viewerCount } = useTvViewer({
    channelId:  channel?.id ?? null,
    sessionId:  liveSessionId,
    enabled:    !!channel && !loading,
  });

  const channelSubRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carregar canal e dados iniciais
  useEffect(() => {
    if (!orgId || !channelSlug) return;
    void (async () => {
      setLoading(true);
      const ch = await fetchTvChannelBySlug(orgId, channelSlug);
      if (!ch) {
        setError("Canal não encontrado.");
        setLoading(false);
        return;
      }
      setChannel(ch);

      const [block, blocks] = await Promise.all([
        getCurrentTvBlock(ch.id),
        fetchScheduleBlocks(ch.id, undefined, 3),
      ]);
      setCurrentBlock(block);
      setSchedule(blocks);
      setLoading(false);
    })();
  }, [orgId, channelSlug]);

  // Realtime: detectar mudanças em live sessions para este canal
  useEffect(() => {
    if (!channel) return;

    if (channelSubRef.current) {
      void supabase.removeChannel(channelSubRef.current);
    }

    const ch = supabase
      .channel(`tv_watch:${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tv_live_sessions",
          filter: `tv_channel_id=eq.${channel.id}`,
        },
        () => {
          // Recarregar bloco atual quando houver mudança na sessão ao vivo
          void refreshCurrentBlock();
        },
      )
      .subscribe();

    channelSubRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
      channelSubRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  // Atualizar bloco atual periodicamente (para pseudo-live avançar)
  const refreshCurrentBlock = useCallback(async () => {
    if (!channel) return;
    const block = await getCurrentTvBlock(channel.id);
    setCurrentBlock(block);
  }, [channel]);

  useEffect(() => {
    if (!channel) return;
    refreshTimerRef.current = setInterval(() => {
      void refreshCurrentBlock();
    }, BLOCK_REFRESH_INTERVAL_MS);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [channel, refreshCurrentBlock]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !channel) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
          <Tv2 className="w-16 h-16 mb-4 opacity-20" />
          <p>{error ?? "Canal não encontrado."}</p>
          <Link to="/tv" className="mt-4 text-primary hover:underline text-sm flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Voltar para TV Digital
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link to="/tv" className="p-2 hover:bg-muted rounded-lg transition text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          {channel.logoUrl ? (
            <img src={channel.logoUrl} alt={channel.name} className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tv2 className="w-5 h-5 text-primary" />
            </div>
          )}
          <div>
            <h1 className="font-bold text-lg">{channel.name}</h1>
            {channel.description && (
              <p className="text-xs text-muted-foreground">{channel.description}</p>
            )}
          </div>
          <button
            onClick={refreshCurrentBlock}
            className="ml-auto p-2 hover:bg-muted rounded-lg transition text-muted-foreground"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Player */}
        <TvPlayer
          block={currentBlock}
          channelName={channel.name}
          onError={(msg) => console.warn("[TvPlayer]", msg)}
        />

        {/* Info do bloco atual */}
        <div className="mt-4 bg-card border border-border rounded-xl p-4">
          <CurrentBlockInfo block={currentBlock} />
        </div>

        {/* Próximos da grade */}
        {schedule.length > 0 && (
          <div className="mt-4 bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Próximos programas
            </h2>
            <div className="flex flex-col gap-2">
              {schedule.map((block) => {
                const start = new Date(block.startTime);
                const end = new Date(block.endTime);
                const now = new Date();
                const isNow = start <= now && end > now;
                return (
                  <div
                    key={block.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                      isNow ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex-shrink-0 w-28 text-xs text-muted-foreground font-mono">
                      {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <span className="truncate">{block.programTitle ?? "Programa"}</span>
                    {isNow && (
                      <span className="ml-auto flex-shrink-0 text-xs text-primary font-semibold">
                        AGORA
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function CurrentBlockInfo({ block }: { block: TvCurrentBlock }) {
  if (block.type === "offline") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Tv2 className="w-4 h-4" />
        <span>Canal offline — sem programação no momento</span>
      </div>
    );
  }

  if (block.type === "live") {
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-red-500 font-semibold text-sm">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          AO VIVO
        </span>
        <span className="text-xs text-muted-foreground">
          Transmissão em andamento
        </span>
        {viewerCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            {viewerCount} assistindo
          </span>
        )}
      </div>
    );
  }

  if (block.type === "replay") {
    const offsetMin = Math.floor(block.offsetSeconds / 60);
    return (
      <div className="flex items-center gap-3">
        <RefreshCw className="w-4 h-4 text-blue-500" />
        <div>
          <p className="text-sm font-medium">{block.replayTitle}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            Reprise — {offsetMin > 0 ? `iniciado há ${offsetMin}min` : "início do programa"}
          </p>
        </div>
      </div>
    );
  }

  if (block.type === "program") {
    const start = new Date(block.blockStart);
    return (
      <div className="flex items-center gap-3">
        <Tv2 className="w-4 h-4 text-green-500" />
        <div>
          <p className="text-sm font-medium">Programa em exibição</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            Iniciou às {start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
