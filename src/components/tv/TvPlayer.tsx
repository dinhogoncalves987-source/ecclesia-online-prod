/**
 * TvPlayer — Player HLS para a TV Digital Ecclesia
 *
 * Suporta três modos:
 *   - live:    transmissão ao vivo via HLS (URL + status AO VIVO)
 *   - replay:  reprise com início no offset calculado (pseudo-live estilo TV)
 *   - offline: tela de canal offline
 *
 * Usa hls.js para compatibilidade cross-browser.
 * Em Safari/iOS com suporte nativo a HLS, usa o elemento <video> diretamente.
 */

import { useEffect, useRef, useState } from "react";
import { Radio, Tv2, RefreshCw } from "lucide-react";
import type { TvCurrentBlock } from "@/lib/tvDigital";

// Dynamic import of hls.js to keep TvChannel chunk smaller
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HlsType = any;

type TvPlayerProps = {
  block: TvCurrentBlock;
  channelName: string;
  onError?: (msg: string) => void;
};

export function TvPlayer({ block, channelName, onError }: TvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actuallyPlaying, setActuallyPlaying] = useState(false);
  const [HlsClass, setHlsClass] = useState<HlsType>(null);

  const hlsUrl =
    block.type === "live" ? block.hlsUrl :
    block.type === "replay" ? block.hlsUrl :
    block.type === "program" ? block.hlsUrl :
    null;

  const offsetSeconds =
    block.type === "replay" || block.type === "program" || block.type === "interval"
      ? block.offsetSeconds
      : 0;

  // Dynamic import of hls.js (avoids bundling into the main chunk)
  useEffect(() => {
    void import("hls.js").then((mod) => setHlsClass(() => mod.default));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl || !HlsClass) return;

    setPlayerError(null);
    setIsLoading(true);
    setActuallyPlaying(false);

    // Destruir instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari / iOS com HLS nativo
    if (!HlsClass.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.currentTime = offsetSeconds;
      void video.play().catch(() => setPlayerError("Clique em Play para reproduzir."));
      setIsLoading(false);
      return;
    }

    if (!HlsClass.isSupported()) {
      setPlayerError("Seu navegador não suporta este formato de vídeo.");
      setIsLoading(false);
      return;
    }

    const hls = new HlsClass({
      enableWorker: true,
      lowLatencyMode: block.type === "live",
      backBufferLength: block.type === "live" ? 30 : 90,
    });

    hlsRef.current = hls;
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);

    hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
      setIsLoading(false);
      // Para replays, iniciar no offset correto (pseudo-live)
      if (offsetSeconds > 0) {
        video.currentTime = offsetSeconds;
      }
      void video.play().catch(() => {
        // Autoplay bloqueado — mostrar botão de play
      });
    });

    hls.on(HlsClass.Events.ERROR, (_: unknown, data: { fatal: boolean; type: string }) => {
      if (data.fatal) {
        setIsLoading(false);
        const msg =
          data.type === HlsClass.ErrorTypes.NETWORK_ERROR
            ? "Erro de rede. Verifique sua conexão."
            : data.type === HlsClass.ErrorTypes.MEDIA_ERROR
            ? "Erro de mídia. Tentando recuperar…"
            : "Erro no player.";
        setPlayerError(msg);
        onError?.(msg);

        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        }
      }
    });

    const onPlaying = () => { setActuallyPlaying(true); setIsLoading(false); };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      hls.destroy();
      hlsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlsUrl, offsetSeconds, HlsClass]);

  // ── Tela offline ────────────────────────────────────────────────────────────
  if (block.type === "offline") {
    return (
      <div className="relative w-full aspect-video bg-gray-950 flex flex-col items-center justify-center text-white select-none rounded-xl overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0iIzMzMyIvPjwvc3ZnPg==')] opacity-30" />
        <Tv2 className="w-16 h-16 text-gray-600 mb-4" />
        <p className="text-xl font-semibold text-gray-400">{channelName}</p>
        <p className="text-gray-600 mt-2">Nenhuma transmissão no momento</p>
        <p className="text-xs text-gray-700 mt-1">Confira a grade de programação</p>
      </div>
    );
  }

  // ── Tela de erro ─────────────────────────────────────────────────────────────
  if (playerError && !hlsUrl) {
    return (
      <div className="relative w-full aspect-video bg-gray-950 flex flex-col items-center justify-center text-white rounded-xl overflow-hidden">
        <RefreshCw className="w-10 h-10 text-red-500 mb-3" />
        <p className="text-gray-300">{playerError}</p>
        <button
          onClick={() => setPlayerError(null)}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ── Player ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        autoPlay
        muted={false}
      />

      {/* Badge de status */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        {block.type === "live" && (
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg animate-pulse">
            <Radio className="w-3 h-3" />
            AO VIVO
          </span>
        )}
        {block.type === "replay" && (
          <span className="flex items-center gap-1.5 bg-gray-800/90 text-gray-300 text-xs font-semibold px-2.5 py-1 rounded-full">
            <RefreshCw className="w-3 h-3" />
            REPRISE
          </span>
        )}
      </div>

      {/* Spinner de loading */}
      {isLoading && !actuallyPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Mensagem de erro sobreposta */}
      {playerError && (
        <div className="absolute bottom-16 left-0 right-0 flex justify-center">
          <div className="bg-red-900/90 text-white text-sm px-4 py-2 rounded-lg">
            {playerError}
          </div>
        </div>
      )}

      {/* Info do bloco de replay */}
      {block.type === "replay" && block.replayTitle && (
        <div className="absolute bottom-14 left-3 right-3 pointer-events-none">
          <p className="text-white text-sm font-medium drop-shadow-lg line-clamp-1">
            {block.replayTitle}
          </p>
        </div>
      )}
    </div>
  );
}
