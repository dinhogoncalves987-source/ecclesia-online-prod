/**
 * useCameraFocus — detecta perda de foco do operador e alerta o diretor.
 *
 * Quando o operador sai do app (recebe ligação, troca de aba, etc.):
 *  1. Posta broadcast "camera_interrupted" no canal Realtime da produção.
 *  2. Atualiza status da câmera para "disconnected" no banco (valor válido no CHECK).
 *  3. Se a câmera estava no ar (isOnAir = true), aciona failover automático.
 *  4. Chama onInterrupted() para que a UI mostre aviso ao operador.
 *
 * Quando o operador volta:
 *  1. Atualiza status de volta para "connected".
 *  2. Chama onResumed() para remover o aviso.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { autoSwitchCameraOnFailure } from "@/lib/cameraFailover";

interface UseCameraFocusOptions {
  sessionId:     string | null;
  liveSessionId: string | null;
  /** Se true, o hook está ativo (câmera conectada). */
  active:        boolean;
  /** Se true, esta câmera está atualmente no ar — o failover é acionado se perder foco. */
  isOnAir?:      boolean;
  onInterrupted?: () => void;
  onResumed?:    () => void;
}

export function useCameraFocus({
  sessionId,
  liveSessionId,
  active,
  isOnAir = false,
  onInterrupted,
  onResumed,
}: UseCameraFocusOptions): void {
  // Evitar envios duplicados em rápidas alternâncias
  const interruptedRef = useRef(false);
  // Capturar valor atual de isOnAir sem re-registrar o listener
  const isOnAirRef = useRef(isOnAir);
  useEffect(() => { isOnAirRef.current = isOnAir; }, [isOnAir]);

  useEffect(() => {
    if (!active || !sessionId) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (interruptedRef.current) return; // já notificado
        interruptedRef.current = true;

        // 1. Broadcast de interrupção para o canal da produção
        if (liveSessionId) {
          void supabase
            .channel(`director:${liveSessionId}`)
            .send({
              type:    "broadcast",
              event:   "camera_interrupted",
              payload: { session_id: sessionId, reason: "focus_lost", ts: Date.now() },
            });
        }

        // 2. Marcar câmera como disconnected no banco (status válido no CHECK)
        void supabase
          .from("tv_camera_sessions")
          .update({ status: "disconnected" })
          .eq("id", sessionId);

        // 3. Se estava no ar, acionar failover automático
        if (isOnAirRef.current && liveSessionId) {
          void autoSwitchCameraOnFailure({
            liveSessionId,
            failedSessionId: sessionId,
            reason: "focus_lost",
          });
        }

        onInterrupted?.();

      } else if (document.visibilityState === "visible") {
        if (!interruptedRef.current) return;
        interruptedRef.current = false;

        // 4. Reconectar — restaurar status
        void supabase
          .from("tv_camera_sessions")
          .update({ status: "connected", last_heartbeat_at: new Date().toISOString() })
          .eq("id", sessionId);

        onResumed?.();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [active, sessionId, liveSessionId, onInterrupted, onResumed]);
}
