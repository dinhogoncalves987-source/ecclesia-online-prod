/**
 * useLiveKitStudio — Gerencia a sessão multicâmeras do Ecclesia Studio.
 *
 * Dois modos:
 *
 *   MOCK LOCAL (Vite dev + VITE_TV_STUDIO_MOCK_ENABLED=true):
 *     — Usa câmeras locais do navegador via getUserMedia.
 *     — Salva estado no DB (tv_studio_rooms, tv_camera_sessions).
 *     — Cortes são registrados em tv_cut_log.
 *
 *   LIVEKIT (padrão obrigatório em qualquer build):
 *     — Cria sala via Edge Function create-livekit-room.
 *     — Diretor entra como subscriber; câmeras remotas publicam vídeo.
 *     — Tracks de câmeras remotas são exibidos no painel.
 *     — Cortes chamam set_camera_on_air RPC + atualizam LiveKit data messages.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Room as LKRoom, RemoteParticipant, RemoteTrackPublication, Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { joinProductionAsCamera } from "@/lib/tvDigital";
import { getOrCreateStudioDeviceId } from "@/lib/studioDevice";

// ── Env ───────────────────────────────────────────────────────────────────────

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? "";
// Nunca transforma falta de configuração em sucesso num deploy. O modo
// local existe apenas para desenvolvimento explícito e não pode ser ativado
// em um build de staging/produção.
const IS_MOCK = import.meta.env.DEV
  && import.meta.env.VITE_TV_STUDIO_MOCK_ENABLED === "true";
const MAX_CAMERAS = Number(import.meta.env.VITE_STUDIO_MAX_CAMERAS ?? 6);

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ParticipantRole   = "director" | "camera";
export type ParticipantStatus = "waiting" | "connecting" | "connected" | "live" | "disconnected";

export interface StudioParticipant {
  /** camera_session_id ou browser deviceId  */
  id:        string;
  /** identity LiveKit: "director:{uid}" | "camera:{sid}" */
  identity:  string;
  name:      string;
  role:      ParticipantRole;
  stream:    MediaStream | null;
  isOnAir:   boolean;
  status:    ParticipantStatus;
  deviceId?: string;       // apenas mock
}

interface UseLiveKitStudioOptions {
  organizationId: string;
  channelId:      string;
  liveSessionId?: string | null;
  /** ID de sala já criada (quando a produção foi iniciada pelo TvAoVivo). */
  initialRoomId?: string;
  /** device_id do operador (para identificação no DB). */
  deviceId?:      string;
  authToken?:     string | null;  // Supabase access token
  enabled?:       boolean;
}

interface StudioRoomInfo {
  studioRoomId: string;
  roomName:     string;
  isMock:       boolean;
}

// ── Helper: chamar Edge Function ──────────────────────────────────────────────

async function callEdgeFunction<T>(
  fnName:  string,
  body:    Record<string, unknown>,
  token?:  string | null,
): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke<T>(fnName, {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (error) { console.warn(`[${fnName}]`, error); return null; }
  return data;
}

// ── Importação dinâmica de livekit-client ─────────────────────────────────────

let _lkModule: typeof import("livekit-client") | null = null;
async function getLK() {
  if (_lkModule) return _lkModule;
  _lkModule = await import("livekit-client");
  return _lkModule;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveKitStudio({
  organizationId,
  channelId,
  liveSessionId,
  initialRoomId,
  deviceId,
  authToken,
  enabled = true,
}: UseLiveKitStudioOptions) {

  const [roomInfo, setRoomInfo]           = useState<StudioRoomInfo | null>(null);
  const [participants, setParticipants]   = useState<StudioParticipant[]>([]);
  const [onAirId, setOnAirId]             = useState<string | null>(null);
  const [isConnected, setIsConnected]     = useState(false);
  const [isCreating, setIsCreating]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [isMockMode]                      = useState(IS_MOCK);

  // LiveKit Room reference
  const roomRef         = useRef<LKRoom | null>(null);
  // Mock: local MediaStreams
  const streamsRef      = useRef<Map<string, MediaStream>>(new Map());
  // Heartbeat interval
  const heartbeatTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  // Supabase realtime channel
  const realtimeRef     = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    heartbeatTimers.current.forEach((t) => clearInterval(t));
    heartbeatTimers.current.clear();
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current.clear();
    roomRef.current?.disconnect();
    roomRef.current = null;
    if (realtimeRef.current) {
      void supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Realtime: atualizar câmeras da sala ──────────────────────────────────────

  const subscribeRealtime = useCallback((sessionId: string) => {
    if (realtimeRef.current) void supabase.removeChannel(realtimeRef.current);

    const ch = supabase
      .channel(`studio_session:${sessionId}`)
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table:  "tv_camera_sessions",
        filter: `live_session_id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id ?? "";
          setParticipants((prev) => prev.filter((p) => p.id !== id));
          return;
        }
        const r = payload.new as Record<string, unknown>;
        const rawStatus = String(r.status ?? "waiting");
        const status = (rawStatus === "on_air" ? "live" : rawStatus) as ParticipantStatus;
        if (status === "disconnected") {
          setParticipants((prev) => prev.filter((p) => p.id !== String(r.id)));
          return;
        }
        setParticipants((prev) => {
          const idx = prev.findIndex((p) => p.id === String(r.id));
          const updated: StudioParticipant = {
            id:       String(r.id),
            identity: String(r.livekit_participant_identity ?? ""),
            name:     String(r.camera_name ?? "Câmera"),
            role:     (r.role as ParticipantRole) ?? "camera",
            stream:   idx >= 0 ? (prev[idx].stream ?? null) : null,
            isOnAir:  Boolean(r.is_on_air),
            status,
          };
          if (idx >= 0) {
            const next = [...prev]; next[idx] = updated; return next;
          }
          return [...prev, updated];
        });
        if (r.is_on_air) setOnAirId(String(r.id));
      })
      .subscribe();

    realtimeRef.current = ch;
  }, []);

  // ── Criar sala (MOCK ou LiveKit) ─────────────────────────────────────────────

  const createStudioRoom = useCallback(async (): Promise<StudioRoomInfo | null> => {
    if (!organizationId || !channelId || !liveSessionId) {
      setError("Inicie uma produção antes de abrir o estúdio.");
      return null;
    }
    setIsCreating(true);
    setError(null);

    try {
      if (IS_MOCK) {
        // Mock: criar sala direto no DB via RPC
        const { data, error: rpcErr } = await supabase.rpc("create_tv_studio_room", {
          p_live_session_id: liveSessionId ?? null,
        });
        if (rpcErr || !data || data.length === 0) {
          setError(rpcErr?.message ?? "Erro ao criar sala");
          return null;
        }
        const { studio_room_id, room_name } = data[0] as { studio_room_id: string; room_name: string };
        const info: StudioRoomInfo = { studioRoomId: studio_room_id, roomName: room_name, isMock: true };
        setRoomInfo(info);
        subscribeRealtime(liveSessionId);
        return info;
      }

      // LiveKit: chamar Edge Function
      const result = await callEdgeFunction<{
        studioRoomId: string;
        roomName: string;
        livekitConfigured: boolean;
        livekitRoomCreated: boolean;
      }>("create-livekit-room", { liveSessionId }, authToken);

      if (!result) { setError("Erro ao criar sala LiveKit"); return null; }
      if (!result.livekitConfigured) {
        setError("LiveKit não está configurado no servidor.");
        return null;
      }
      if (!result.livekitRoomCreated) {
        setError("A sala foi registrada, mas o servidor LiveKit não respondeu.");
        return null;
      }

      const info: StudioRoomInfo = {
        studioRoomId:    result.studioRoomId,
        roomName:        result.roomName,
        isMock:          false,
      };
      setRoomInfo(info);
      subscribeRealtime(liveSessionId);
      return info;

    } finally {
      setIsCreating(false);
    }
  }, [organizationId, channelId, liveSessionId, authToken, subscribeRealtime]);

  // ── Entrar como Diretor (LiveKit) ─────────────────────────────────────────────

  const connectAsDirector = useCallback(async (studioRoomId: string): Promise<boolean> => {
    if (IS_MOCK) {
      setIsConnected(true);
      return true;
    }

    try {
      const tokenData = await callEdgeFunction<{ token: string; livekitUrl: string; mock?: boolean }>(
        "create-livekit-token",
        { studioRoomId, role: "director" },
        authToken,
      );
      if (!tokenData) {
        setError("Não foi possível autorizar a direção no LiveKit.");
        setIsConnected(false);
        return false;
      }

      const lk = await getLK();
      const room = new lk.Room({
        adaptiveStream: true,
        dynacast:       true,
      });

      // Participantes remotos publicando tracks
      room.on(lk.RoomEvent.TrackSubscribed, (track: Track, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== lk.Track.Kind.Video) return;
        const stream = new MediaStream([track.mediaStreamTrack]);
        setParticipants((prev) => prev.map((p) =>
          p.identity === participant.identity ? { ...p, stream, status: "connected" } : p,
        ));
      });

      room.on(lk.RoomEvent.TrackUnsubscribed, (_track: Track, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        setParticipants((prev) => prev.map((p) =>
          p.identity === participant.identity ? { ...p, stream: null } : p,
        ));
      });

      room.on(lk.RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        setParticipants((prev) => prev.filter((p) => p.identity !== participant.identity));
      });

      room.on(lk.RoomEvent.Disconnected, () => {
        setIsConnected(false);
      });

      await room.connect(tokenData.livekitUrl ?? LIVEKIT_URL, tokenData.token);
      roomRef.current = room;
      setIsConnected(true);
      return true;

    } catch (err) {
      console.warn("[useLiveKitStudio] director connect error:", err);
      setError("Erro ao conectar ao servidor do estúdio.");
      setIsConnected(false);
      return false;
    }
  }, [authToken]);

  // ── Adicionar câmera mock (local browser) ─────────────────────────────────────

  const addMockCamera = useCallback(async (
    studioRoomId: string,
    name:         string,
    deviceId?:    string,
  ): Promise<StudioParticipant | null> => {
    if (participants.filter((p) => p.role === "camera").length >= MAX_CAMERAS) {
      return null;
    }

    if (!liveSessionId) {
      console.warn("[addMockCamera] liveSessionId ausente para a sala:", studioRoomId);
      return null;
    }

    const result = await joinProductionAsCamera(liveSessionId, {
      deviceId:   deviceId ?? getOrCreateStudioDeviceId(),
      cameraName: name,
      deviceType: "browser",
      sourceType: "local_demo",
    });

    if (!result.ok) {
      console.warn("[addMockCamera] joinProductionAsCamera error:", result.error);
      return null;
    }
    const sessionId = result.cameraSessionId!;

    // Adquirir stream
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : { width: 1280, height: 720 },
        audio: false,
      });
      streamsRef.current.set(sessionId, stream);
    } catch {
      console.warn("[addMockCamera] getUserMedia failed for", name);
    }

    const participant: StudioParticipant = {
      id: sessionId, identity: `camera:${sessionId}`,
      name, role: "camera", stream, isOnAir: false,
      status: "connected", deviceId,
    };

    setParticipants((prev) => [...prev, participant]);

    // Heartbeat a cada 20s
    const timer = setInterval(() => {
      void supabase.rpc("update_camera_heartbeat", { p_camera_session_id: sessionId });
    }, 20_000);
    heartbeatTimers.current.set(sessionId, timer);

    return participant;
  }, [liveSessionId, participants]);

  // ── Corte ao vivo ─────────────────────────────────────────────────────────────

  const cutToCamera = useCallback(async (participantId: string): Promise<void> => {
    setOnAirId(participantId);
    setParticipants((prev) => prev.map((p) => ({
      ...p,
      isOnAir: p.id === participantId,
      status:  p.id === participantId ? "live" : (p.status === "live" ? "connected" : p.status),
    })));

    // Persistir no DB
    await supabase.rpc("set_camera_on_air", { p_camera_session_id: participantId });

    // Notificar via LiveKit data message (se conectado)
    if (roomRef.current) {
      try {
        const msg = JSON.stringify({ type: "on_air", cameraId: participantId });
        await roomRef.current.localParticipant.publishData(
          new TextEncoder().encode(msg),
          { reliable: true },
        );
      } catch { /* silently ignore */ }
    }
  }, []);

  // ── Desconectar câmera ────────────────────────────────────────────────────────

  const removeParticipant = useCallback(async (participantId: string): Promise<void> => {
    // Parar stream local
    const stream = streamsRef.current.get(participantId);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); streamsRef.current.delete(participantId); }

    // Parar heartbeat
    const timer = heartbeatTimers.current.get(participantId);
    if (timer) { clearInterval(timer); heartbeatTimers.current.delete(participantId); }

    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    await supabase.rpc("disconnect_camera", { p_camera_session_id: participantId });
  }, []);

  // ── Encerrar sala ─────────────────────────────────────────────────────────────

  const endRoom = useCallback(async (): Promise<void> => {
    if (!roomInfo) return;
    cleanup();

    if (!IS_MOCK) {
      await callEdgeFunction("end-livekit-room", {
        studioRoomId: roomInfo.studioRoomId,
        directorDeviceId: deviceId ?? "",
      }, authToken);
    } else if (liveSessionId) {
      await supabase.rpc("end_live_production", {
        p_live_session_id: liveSessionId,
        p_director_device_id: deviceId ?? "",
      });
    }
    setRoomInfo(null);
    setParticipants([]);
    setIsConnected(false);
    setOnAirId(null);
  }, [roomInfo, liveSessionId, deviceId, authToken, cleanup]);

  // ── Câmeras visíveis (excluir desconectadas) ──────────────────────────────────

  const activeCameras = participants.filter(
    (p) => p.role === "camera" && p.status !== "disconnected",
  );
  const onAirCamera = participants.find((p) => p.id === onAirId && p.isOnAir) ?? null;

  // ── Auto-connect quando initialRoomId é fornecido (produção já criada) ────────

  useEffect(() => {
    if (!enabled || !initialRoomId || !liveSessionId || roomInfo) return;
    const info: StudioRoomInfo = { studioRoomId: initialRoomId, roomName: "", isMock: IS_MOCK };
    setRoomInfo(info);
    subscribeRealtime(liveSessionId);
    void connectAsDirector(initialRoomId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, initialRoomId, liveSessionId, roomInfo]);

  // Link para câmera remota entrar
  function getCameraLink(studioRoomId: string): string {
    return `${window.location.origin}/tv/studio/${studioRoomId}/camera`;
  }

  return {
    roomInfo,
    activeCameras,
    onAirCamera,
    onAirId,
    isConnected,
    isCreating,
    isMockMode,
    error,
    maxCameras: MAX_CAMERAS,
    createStudioRoom,
    connectAsDirector,
    addMockCamera,
    cutToCamera,
    removeParticipant,
    endRoom,
    getCameraLink,
  };
}
