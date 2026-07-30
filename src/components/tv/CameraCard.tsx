/**
 * CameraCard — Preview de uma câmera no painel do diretor.
 *
 * Estados visuais:
 *   on_air     → borda verde + badge "NO AR"
 *   connected  → preview ativo + bolinha amarela
 *   waiting    → "Aguardando celular..." + spinner
 *   disconnected → não aparece (filtrado antes de passar para cá)
 */

import { useEffect, useRef, useState } from "react";
import { Video, User, Church, Mic, Camera, Smartphone } from "lucide-react";
import type { StudioCamera } from "@/hooks/useStudioCameras";

interface Props {
  camera:     StudioCamera;
  onCutTo:    (id: string) => void;
  onSettings?: (id: string) => void;
  compact?:   boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  video:   Video,
  user:    User,
  church:  Church,
  mic:     Mic,
  camera:  Camera,
  mobile:  Smartphone,
};

export function CameraCard({ camera, onCutTo, onSettings, compact = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, forceRender] = useState(0);

  // Bind stream to video element when stream changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (camera.stream) {
      el.srcObject = camera.stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [camera.stream]);

  // Re-render when stream appears (after acquireStream resolves)
  useEffect(() => {
    if (camera.stream) forceRender((n) => n + 1);
  }, [camera.stream]);

  const isOnAir      = camera.isOnAir;
  const isWaiting    = camera.status === "waiting";
  const isConnected  = camera.status === "connected" || camera.status === "on_air";
  const Icon         = ICON_MAP[camera.iconName] ?? Video;

  const handleClick = () => {
    if (isConnected || isOnAir) onCutTo(camera.id);
  };

  const borderClass = isOnAir
    ? "border-green-500 ring-2 ring-green-500/40"
    : isWaiting
    ? "border-yellow-400/50"
    : "border-border hover:border-primary/50";

  return (
    <button
      onClick={handleClick}
      disabled={!isConnected && !isOnAir}
      className={`relative flex flex-col w-full rounded-xl overflow-hidden border-2 transition-all duration-200 text-left
        ${borderClass}
        ${(isConnected || isOnAir) ? "cursor-pointer" : "cursor-default opacity-60"}
        ${compact ? "aspect-video" : ""}
      `}
      title={isOnAir ? "Câmera no ar" : `Cortar para: ${camera.name}`}
    >
      {/* Video preview area */}
      <div className={`relative bg-gray-950 overflow-hidden ${compact ? "flex-1" : "aspect-video"}`}>
        {/* Real camera stream */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${camera.stream ? "block" : "hidden"}`}
        />

        {/* Placeholder when no stream */}
        {!camera.stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-950">
            {isWaiting ? (
              <>
                <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] text-yellow-400 font-medium">Aguardando...</p>
              </>
            ) : (
              <>
                <Icon className="w-6 h-6 text-gray-600" />
                <p className="text-[10px] text-gray-500">Toque para conectar</p>
              </>
            )}
          </div>
        )}

        {/* NO AR badge */}
        {isOnAir && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            NO AR
          </div>
        )}

        {/* Connected indicator */}
        {!isOnAir && isConnected && (
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400 shadow" />
        )}

        {/* Waiting indicator */}
        {isWaiting && (
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-yellow-400 animate-pulse shadow" />
        )}
      </div>

      {/* Camera name */}
      {!compact && (
        <div className={`px-2.5 py-1.5 flex items-center justify-between ${isOnAir ? "bg-green-950/60" : "bg-card"}`}>
          <span className={`text-xs font-semibold truncate ${isOnAir ? "text-green-300" : "text-foreground"}`}>
            {camera.name}
          </span>
          {onSettings && (
            <button
              onClick={(e) => { e.stopPropagation(); onSettings(camera.id); }}
              className="text-muted-foreground hover:text-foreground transition ml-1 flex-shrink-0"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="4" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="12" r="1.2" />
              </svg>
            </button>
          )}
        </div>
      )}
    </button>
  );
}
