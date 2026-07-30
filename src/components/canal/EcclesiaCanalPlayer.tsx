/**
 * EcclesiaCanalPlayer — Player de Vídeo para o Canal Ecclesia
 *
 * Suporta:
 *   - HLS (.m3u8): usa hls.js via dynamic import (chunk separado)
 *   - MP4/WebM direto: elemento <video> nativo
 *   - Resume: inicia no last_position do histórico
 *   - Auto-save: salva posição a cada 30s via callback
 */

import { useEffect, useRef, useState } from "react";
import { Play, RefreshCw } from "lucide-react";

type CanalPlayerProps = {
  playbackUrl: string | null;
  hlsUrl?: string | null;
  startAt?: number;
  durationSeconds?: number | null;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HlsInstance = any;

export function EcclesiaCanalPlayer({
  playbackUrl,
  hlsUrl,
  startAt = 0,
  onTimeUpdate,
  onEnded,
}: CanalPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [HlsClass, setHlsClass] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const url = hlsUrl ?? playbackUrl;
  const isHls = !!url && (url.includes(".m3u8") || url.includes("hls"));

  // Load hls.js dynamically
  useEffect(() => {
    if (!isHls) return;
    void import("hls.js").then((mod) => setHlsClass(() => mod.default));
  }, [isHls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setError(null);
    setLoading(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHls) {
      if (!HlsClass) return; // aguardar hls.js carregar

      if (!HlsClass.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        if (startAt > 0) video.currentTime = startAt;
        setLoading(false);
        return;
      }

      if (!HlsClass.isSupported()) {
        setError("Seu navegador não suporta este formato de vídeo.");
        setLoading(false);
        return;
      }

      const hls = new HlsClass({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        if (startAt > 0) video.currentTime = startAt;
        setLoading(false);
        void video.play().catch(() => {});
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hls.on(HlsClass.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
        if (data.fatal) {
          setError("Erro ao carregar o vídeo. Tente recarregar.");
          setLoading(false);
        }
      });
    } else {
      // Direct URL (MP4, WebM, etc.)
      video.src = url;
      if (startAt > 0) video.currentTime = startAt;
      setLoading(false);
      void video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, startAt, HlsClass]);

  if (!url) {
    return (
      <div className="relative w-full aspect-video bg-gray-950 flex flex-col items-center justify-center rounded-xl text-muted-foreground">
        <Play className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">Vídeo não disponível</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        onTimeUpdate={() => onTimeUpdate?.(videoRef.current?.currentTime ?? 0)}
        onEnded={onEnded}
        onCanPlay={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <RefreshCw className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-white text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              if (videoRef.current) videoRef.current.load();
            }}
            className="mt-3 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
