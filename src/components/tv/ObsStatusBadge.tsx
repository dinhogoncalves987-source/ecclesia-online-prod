/**
 * ObsStatusBadge — Indicador visual do status do Ecclesia Studio local.
 * Linguagem simples: nada de "OBS", "WebSocket", "RTMP", "HLS".
 */

import type { ObsState } from "@/hooks/useObsWebSocket";

interface Props {
  obs: ObsState;
  compact?: boolean;
}

export function ObsStatusBadge({ obs, compact = false }: Props) {
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          obs.connected
            ? obs.streaming || obs.recording
              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            obs.connected
              ? obs.streaming || obs.recording ? "bg-red-500 animate-pulse" : "bg-green-500"
              : "bg-gray-400"
          }`}
        />
        {obs.connected
          ? obs.streaming && obs.recording ? "Ao vivo e gravando"
          : obs.streaming ? "Transmitindo"
          : obs.recording ? "Gravando"
          : "Estúdio pronto"
          : "Studio offline"}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
        obs.connected
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
          : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30"
      }`}
    >
      {/* Dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          obs.connected
            ? obs.streaming || obs.recording ? "bg-red-500 animate-pulse" : "bg-green-500"
            : "bg-gray-400"
        }`}
      />

      <div className="flex-1 min-w-0">
        <p className={`font-medium text-xs ${obs.connected ? "text-green-800 dark:text-green-300" : "text-gray-500"}`}>
          {obs.connected ? "Ecclesia Studio Online" : "Ecclesia Studio Offline"}
        </p>
        {obs.connected && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {obs.streaming && obs.recording ? "Transmitindo e gravando"
              : obs.streaming ? "Transmissão ativa"
              : obs.recording ? "Gravação ativa"
              : "Aguardando comando"}
          </p>
        )}
        {!obs.connected && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {obs.error ? "Computador não preparado" : "Computador não preparado"}
          </p>
        )}
      </div>

      {/* Status indicators */}
      {obs.connected && (
        <div className="flex gap-1">
          {obs.streaming && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-600 text-white">AO VIVO</span>
          )}
          {obs.recording && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500 text-white">REC</span>
          )}
        </div>
      )}
    </div>
  );
}
