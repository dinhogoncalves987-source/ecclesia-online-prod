/**
 * ProgramMonitor — Monitor principal do Ecclesia Studio.
 * Mostra exatamente o que o público está vendo.
 */

import { useEffect, useRef } from "react";
import { Tv2, Eye, Clock, Circle } from "lucide-react";
import type { StudioCamera } from "@/hooks/useStudioCameras";

interface Props {
  onAirCamera:   StudioCamera | null;
  isLive:        boolean;
  isRecording:   boolean;
  durationSec:   number;
  viewerCount:   number;
  hlsUrl?:       string | null;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ProgramMonitor({ onAirCamera, isLive, isRecording, durationSec, viewerCount, hlsUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Mostrar stream da câmera no ar no monitor
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (onAirCamera?.stream) {
      el.srcObject = onAirCamera.stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [onAirCamera?.stream, onAirCamera?.id]);

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border-2 border-border bg-gray-950 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          PROGRAMA — O que o público está vendo
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
              <Circle className="w-1.5 h-1.5 fill-white" /> AO VIVO
            </span>
          )}
          {isRecording && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-700 text-white">
              <Circle className="w-1.5 h-1.5 fill-white" /> REC
            </span>
          )}
        </div>
      </div>

      {/* Video area */}
      <div className="relative aspect-video bg-gray-950">
        {/* Camera stream */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${onAirCamera?.stream ? "block" : "hidden"}`}
        />

        {/* HLS player fallback (for live session without local camera) */}
        {!onAirCamera?.stream && hlsUrl && isLive && (
          <video
            src={hlsUrl}
            autoPlay
            muted
            playsInline
            controls={false}
            className="w-full h-full object-cover"
          />
        )}

        {/* Placeholder */}
        {!onAirCamera?.stream && !hlsUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Tv2 className="w-12 h-12 text-gray-700" />
            <p className="text-sm text-gray-500">
              {isLive ? "Transmissão ativa — selecione uma câmera" : "Nenhuma transmissão ativa"}
            </p>
          </div>
        )}

        {/* Overlay info */}
        {(isLive || isRecording) && (
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
            {/* Camera name */}
            {onAirCamera && (
              <span className="text-xs font-medium text-white bg-black/60 px-2 py-0.5 rounded-full">
                {onAirCamera.name}
              </span>
            )}
            {/* Stats */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-white bg-black/60 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" />
                {formatDuration(durationSec)}
              </span>
              {viewerCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-white bg-black/60 px-2 py-0.5 rounded-full">
                  <Eye className="w-3 h-3" />
                  {viewerCount}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-gray-900 border-t border-gray-800">
        <p className="text-[10px] text-gray-500 text-center">
          {isLive
            ? `Transmissão em andamento${onAirCamera ? ` — ${onAirCamera.name}` : ""}`
            : "Use os controles acima para iniciar a transmissão"}
        </p>
      </div>
    </div>
  );
}
