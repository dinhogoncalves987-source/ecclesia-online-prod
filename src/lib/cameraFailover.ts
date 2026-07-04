/**
 * cameraFailover — Failover automático de câmeras na TV Digital.
 *
 * Usa a RPC `set_camera_on_air` para garantir troca atômica:
 *   1. O banco faz os dois UPDATEs (desliga todas, liga a nova) em uma única chamada.
 *   2. Após a RPC, marcamos a câmera caída como "disconnected" (limpeza).
 *
 * Regras:
 *  - Só age se a câmera caída tinha is_on_air = true.
 *  - Busca substitutas com status = "connected" ou "live" na mesma live_session_id.
 *  - Prefere câmera com heartbeat mais recente.
 *  - Nunca mistura câmeras entre produções ou organizações.
 *  - Só pode existir uma câmera is_on_air = true por produção (garantido pela RPC).
 */

import { supabase } from "@/integrations/supabase/client";
import { cutToProductionCamera } from "@/lib/tvDigital";

export interface FailoverOptions {
  liveSessionId:   string;
  failedSessionId: string;
  reason?:         string;
  onSwitched?:     (newSessionId: string, newCameraName: string) => void;
  onNoFallback?:   () => void;
}

export interface FailoverResult {
  switched:       boolean;
  newSessionId?:  string;
  newCameraName?: string;
  message:        string;
}

export async function autoSwitchCameraOnFailure(opts: FailoverOptions): Promise<FailoverResult> {
  const { liveSessionId, failedSessionId, reason = "focus_lost" } = opts;

  // 1. Verificar se a câmera caída estava no ar
  const { data: failedCam, error: fetchErr } = await supabase
    .from("tv_camera_sessions")
    .select("id, is_on_air, camera_number, camera_name")
    .eq("id", failedSessionId)
    .single();

  if (fetchErr || !failedCam) {
    console.warn("[cameraFailover] Failed to fetch failed camera:", fetchErr?.message);
    return { switched: false, message: "Câmera interrompida (dados não encontrados)." };
  }

  const row = failedCam as Record<string, unknown>;
  const wasOnAir  = Boolean(row.is_on_air);
  const failedName = String(row.camera_name ?? `Câmera ${row.camera_number ?? "?"}`);

  // 2. Se não estava no ar: apenas marcar como desconectada e encerrar
  if (!wasOnAir) {
    void supabase
      .from("tv_camera_sessions")
      .update({ status: "disconnected", is_on_air: false })
      .eq("id", failedSessionId);

    return {
      switched: false,
      message:  `Câmera "${failedName}" interrompida (não estava no ar).`,
    };
  }

  // 3. Buscar câmeras reservas da mesma produção
  //    Precisam estar connected/live, não no ar e não ser a câmera caída.
  const { data: candidates, error: candErr } = await supabase
    .from("tv_camera_sessions")
    .select("id, camera_name, camera_number, last_heartbeat_at")
    .eq("live_session_id", liveSessionId)
    .in("status", ["connected", "live"])
    .eq("is_on_air", false)
    .neq("id", failedSessionId)
    .order("last_heartbeat_at", { ascending: false })
    .limit(10);

  if (candErr) {
    console.warn("[cameraFailover] Error fetching candidates:", candErr.message);
  }

  if (!candidates || candidates.length === 0) {
    // Marcar câmera caída como desconectada antes de avisar
    void supabase
      .from("tv_camera_sessions")
      .update({ status: "disconnected", is_on_air: false })
      .eq("id", failedSessionId);

    void broadcastToDirector(liveSessionId, "camera_no_fallback", {
      failed_session_id: failedSessionId,
      failed_name:       failedName,
      reason,
    });

    opts.onNoFallback?.();
    return {
      switched: false,
      message:  `Câmera "${failedName}" interrompida. Não há outra câmera disponível.`,
    };
  }

  // 4. Escolher a melhor candidata (maior heartbeat = primeira da lista)
  const candidate    = candidates[0] as Record<string, unknown>;
  const newSessionId = String(candidate.id);
  const newCameraName = String(candidate.camera_name ?? `Câmera ${candidate.camera_number ?? "?"}`);

  // 5. Troca atômica via set_camera_on_air:
  //    - Desliga TODAS as câmeras da sala (is_on_air=false, status='connected')
  //    - Liga a nova câmera (is_on_air=true, status='live')
  //    Tudo em uma única chamada ao banco.
  const ok = await cutToProductionCamera(newSessionId);

  if (!ok) {
    // Falha na RPC: ainda marcar a câmera caída como desconectada
    void supabase
      .from("tv_camera_sessions")
      .update({ status: "disconnected", is_on_air: false })
      .eq("id", failedSessionId);

    return {
      switched: false,
      message:  `Câmera "${failedName}" interrompida — falha ao trocar para câmera reserva.`,
    };
  }

  // 6. Após a RPC, marcar a câmera caída como "disconnected":
  //    (A RPC a resetou para 'connected' como efeito colateral — precisamos corrigir)
  void supabase
    .from("tv_camera_sessions")
    .update({ status: "disconnected", is_on_air: false })
    .eq("id", failedSessionId);

  // 7. Avisar diretor via Realtime
  void broadcastToDirector(liveSessionId, "camera_failover", {
    failed_session_id:  failedSessionId,
    failed_name:        failedName,
    new_session_id:     newSessionId,
    new_camera_name:    newCameraName,
    reason,
    message: `Câmera "${failedName}" foi interrompida. O sistema mudou automaticamente para "${newCameraName}".`,
  });

  opts.onSwitched?.(newSessionId, newCameraName);

  return {
    switched:    true,
    newSessionId,
    newCameraName,
    message: `Câmera "${failedName}" foi interrompida. O sistema mudou automaticamente para "${newCameraName}".`,
  };
}

/** Envia broadcast ao canal do diretor desta produção. */
async function broadcastToDirector(
  liveSessionId: string,
  event:         string,
  payload:       Record<string, unknown>,
) {
  try {
    const ch = supabase.channel(`director:${liveSessionId}`);
    await ch.send({ type: "broadcast", event, payload });
    void supabase.removeChannel(ch);
  } catch (err) {
    console.warn("[cameraFailover] Broadcast error:", err);
  }
}
