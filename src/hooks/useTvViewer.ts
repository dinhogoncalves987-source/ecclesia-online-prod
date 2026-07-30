/**
 * useTvViewer — Hook de analytics de espectadores para TV Digital.
 *
 * Fluxo:
 *   1. Ao montar: registra evento "join" via RPC track_tv_view_event.
 *   2. A cada 30s: envia heartbeat com watched_seconds acumulados.
 *   3. Ao desmontar: registra evento "leave".
 *   4. Retorna viewerCount atual (atualizado via Realtime no sessionId).
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseTvViewerOptions {
  channelId: string | null;
  sessionId: string | null;
  enabled?: boolean;
}

export function useTvViewer({ channelId, sessionId, enabled = true }: UseTvViewerOptions) {
  const [viewerCount, setViewerCount] = useState<number>(0);
  const watchedRef   = useRef<number>(0);       // segundos assistidos
  const startRef     = useRef<number>(Date.now());
  const sessionKey   = useRef<string>(() => {
    try {
      let k = sessionStorage.getItem("tv_viewer_session");
      if (!k) { k = crypto.randomUUID(); sessionStorage.setItem("tv_viewer_session", k); }
      return k;
    } catch {
      return crypto.randomUUID();
    }
  });
  const sentJoin  = useRef(false);
  const mounted   = useRef(false);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeCh     = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Helper: chamar RPC de forma silenciosa
  async function track(
    eventType: "join" | "heartbeat" | "leave",
    watchedSeconds: number,
  ) {
    if (!channelId) return;
    try {
      await supabase.rpc("track_tv_view_event", {
        p_channel_id:      channelId,
        p_session_id:      sessionId ?? null,
        p_event_type:      eventType,
        p_viewer_session:  sessionKey.current,
        p_watched_seconds: watchedSeconds,
      });
    } catch {
      // silencioso — não interromper UX por falha de analytics
    }
  }

  useEffect(() => {
    if (!channelId || !enabled) return;

    mounted.current = true;
    startRef.current = Date.now();
    watchedRef.current = 0;
    sentJoin.current = false;

    // Registrar join
    void track("join", 0).then(() => { sentJoin.current = true; });

    // Heartbeat a cada 30s
    heartbeatTimer.current = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startRef.current) / 1000);
      watchedRef.current = elapsedSec;
      void track("heartbeat", elapsedSec);
    }, 30_000);

    // Realtime: acompanhar viewer_count e peak_viewer_count da sessão
    if (sessionId) {
      const ch = supabase
        .channel(`tv_viewer_count:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event:  "UPDATE",
            schema: "public",
            table:  "tv_live_sessions",
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (row.viewer_count != null) {
              setViewerCount(Number(row.viewer_count));
            }
          },
        )
        .subscribe();
      realtimeCh.current = ch;
    }

    return () => {
      mounted.current = false;

      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }

      // Enviar leave com total de segundos assistidos
      const finalSec = Math.floor((Date.now() - startRef.current) / 1000);
      void track("leave", finalSec);

      if (realtimeCh.current) {
        void supabase.removeChannel(realtimeCh.current);
        realtimeCh.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, sessionId, enabled]);

  return { viewerCount };
}
