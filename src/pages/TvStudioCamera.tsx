/**
 * TvStudioCamera — Página para celular entrar como câmera no Ecclesia Studio.
 *
 * Rota pública: /tv/studio/:roomId/camera
 *
 * Fluxo:
 *  1. RecordingModeGate: iOS → Foco/DND  |  Android → permissões  |  PC → auto
 *  2. Se aprovado "official": câmera oficial com Wake Lock + fullscreen Android
 *  3. Se aprovado "demo": câmera de teste com banner de aviso
 *  4. Se bloqueado: redireciona para /
 *  5. useCameraFocus: detecta perda de foco → alerta diretor via Realtime
 *  6. useWakeLock: mantém tela acesa enquanto conectado
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Room as LKRoom } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { joinProductionAsCamera } from "@/lib/tvDigital";
import { getOrCreateStudioDeviceId, getStudioDeviceLabel } from "@/lib/studioDevice";
import { requestFullscreenIfAndroid } from "@/lib/platformDetect";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useCameraFocus } from "@/hooks/useCameraFocus";
import { useVoiceActivityDetector } from "@/hooks/useVoiceActivityDetector";
import {
  RecordingModeGate, type CameraMode,
} from "@/components/tv/RecordingModeGate";
import {
  Camera, Wifi, WifiOff, LogOut, Video, VideoOff, RotateCcw, Radio, AlertTriangle,
} from "lucide-react";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? "";
const IS_MOCK     = !LIVEKIT_URL;

const PRESET_NAMES = [
  "Pastor", "Nave Direita", "Nave Esquerda", "Altar",
  "Galeria", "Videomaker", "Entrevistador", "Convidado",
];

type CamStatus = "gate" | "idle" | "entering" | "connected" | "live" | "error" | "disconnected";

export default function TvStudioCamera() {
  const { roomId }  = useParams<{ roomId: string }>();
  const navigate    = useNavigate();

  const deviceId    = getOrCreateStudioDeviceId();
  const deviceLabel = getStudioDeviceLabel(deviceId);

  const [cameraMode, setCameraMode]       = useState<CameraMode | null>(null);
  const [cameraName, setCameraName]       = useState(deviceLabel);
  const [status, setStatus]               = useState<CamStatus>("gate");
  const [isOnAir, setIsOnAir]             = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing]   = useState<"user" | "environment">("environment");
  const [stream, setStream]               = useState<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [interrupted, setInterrupted]     = useState(false);

  const videoRef     = useRef<HTMLVideoElement>(null);
  const lkRoomRef    = useRef<LKRoom | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isActive = status === "connected" || status === "live";

  // ── Wake Lock: tela acesa enquanto conectado ──────────────────────────────
  useWakeLock(isActive);

  // ── Focus detection: alerta diretor ao perder foco ────────────────────────
  useCameraFocus({
    sessionId,
    liveSessionId,
    active: isActive,
    isOnAir,
    onInterrupted: () => setInterrupted(true),
    onResumed:     () => setInterrupted(false),
  });

  // ── Sensor de voz: emite speaking_detected / audio_level ao canal ────────
  // Ativo somente quando connected/live, com stream e microfone disponíveis.
  // Nunca grava nem envia áudio bruto — apenas análise local de volume.
  useVoiceActivityDetector({
    stream,
    liveSessionId,
    deviceId,
    active: isActive,
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      lkRoomRef.current?.disconnect();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (realtimeRef.current)  void supabase.removeChannel(realtimeRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bind stream ao video element ──────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) { el.srcObject = stream; void el.play().catch(() => {}); }
    else        { el.srcObject = null; }
  }, [stream]);

  // ── Gate: callback de aprovação ───────────────────────────────────────────
  function handleGateApprove(mode: CameraMode) {
    setCameraMode(mode);
    setStatus("idle");
    void requestCamera(cameraFacing);
    if (mode === "official") void requestFullscreenIfAndroid();
  }

  function handleGateBlock() {
    navigate("/");
  }

  // ── Solicitar câmera ──────────────────────────────────────────────────────
  const requestCamera = useCallback(async (facing: "user" | "environment") => {
    stream?.getTracks().forEach((t) => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      setStream(s);
      setHasPermission(true);
      return s;
    } catch {
      setHasPermission(false);
      setErrorMsg("Câmera não disponível. Verifique as permissões do navegador.");
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // ── Flip câmera ───────────────────────────────────────────────────────────
  const flipCamera = useCallback(async () => {
    const next = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(next);
    await requestCamera(next);
  }, [cameraFacing, requestCamera]);

  // ── Entrar no estúdio ─────────────────────────────────────────────────────
  async function handleEnter() {
    if (!cameraName.trim() || !roomId) { setErrorMsg("Informe o nome da câmera."); return; }
    setStatus("entering");
    setErrorMsg(null);

    const cameraStream = await requestCamera(cameraFacing);
    if (!cameraStream) { setStatus("error"); return; }

    // 1. Resolver live_session_id a partir do studio_room_id (parâmetro da URL)
    const { data: sessLookup, error: lookupErr } = await supabase
      .from("tv_live_sessions")
      .select("id")
      .eq("studio_room_id", roomId)
      .eq("status_transmissao", "live")
      .limit(1)
      .single();

    if (lookupErr || !sessLookup) {
      setErrorMsg("Produção não encontrada ou já encerrada. Verifique o link com o diretor.");
      setStatus("error");
      return;
    }
    const resolvedLiveSessionId = String(sessLookup.id);

    // 2. Entrar como câmera usando a RPC correta
    const joinResult = await joinProductionAsCamera(resolvedLiveSessionId, {
      deviceId,
      cameraName: cameraName.trim(),
      deviceType: "mobile",
      sourceType: "external_link",
    });

    if (!joinResult.ok) {
      const msg = joinResult.error ?? "Erro ao entrar na produção";
      setErrorMsg(
        msg.includes("6") || msg.toLowerCase().includes("limit")
          ? "Limite de 6 câmeras por produção atingido."
          : msg,
      );
      setStatus("error");
      return;
    }

    const sid = joinResult.cameraSessionId!;
    setSessionId(sid);
    setLiveSessionId(resolvedLiveSessionId);

    // LiveKit (se configurado)
    if (!IS_MOCK) {
      try {
        const { data: tokenData } = await supabase.functions.invoke<{
          token: string; livekitUrl: string; mock?: boolean;
        }>("create-livekit-token", {
          body: { studioRoomId: roomId, role: "camera", cameraSessionId: sid, cameraName: cameraName.trim() },
        });
        if (tokenData && !tokenData.mock && tokenData.token) {
          const lk   = await import("livekit-client");
          const room = new lk.Room();
          room.on(lk.RoomEvent.DataReceived, (payload: Uint8Array) => {
            try {
              const msg = JSON.parse(new TextDecoder().decode(payload)) as { type: string; cameraId: string };
              if (msg.type === "on_air") setIsOnAir(msg.cameraId === sid);
            } catch { /* ignore */ }
          });
          room.on(lk.RoomEvent.Disconnected, () => setStatus("disconnected"));
          await room.connect(tokenData.livekitUrl ?? LIVEKIT_URL, tokenData.token);
          const track = new lk.LocalVideoTrack(cameraStream.getVideoTracks()[0]);
          await room.localParticipant.publishTrack(track);
          lkRoomRef.current = room;
        }
      } catch (err) {
        console.warn("[TvStudioCamera] LiveKit connect failed, continuing mock:", err);
      }
    }

    // Realtime: detectar when this camera goes on air
    const ch = supabase
      .channel(`camera_session:${sid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "tv_camera_sessions", filter: `id=eq.${sid}`,
      }, (payload) => {
        const r = payload.new as Record<string, unknown>;
        setIsOnAir(Boolean(r.is_on_air));
        setStatus(Boolean(r.is_on_air) ? "live" : "connected");
      })
      .subscribe();
    realtimeRef.current = ch;

    // Heartbeat a cada 15s
    heartbeatRef.current = setInterval(() => {
      void supabase.rpc("update_camera_heartbeat", { p_camera_session_id: sid });
    }, 15_000);

    setStatus("connected");
  }

  // ── Sair ──────────────────────────────────────────────────────────────────
  async function handleLeave() {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (realtimeRef.current)  { void supabase.removeChannel(realtimeRef.current); }
    lkRoomRef.current?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (sessionId) await supabase.rpc("disconnect_camera", { p_camera_session_id: sessionId });
    setStatus("disconnected");
    setTimeout(() => navigate("/"), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col text-white">

      {/* Gate obrigatório */}
      {status === "gate" && (
        <RecordingModeGate onApprove={handleGateApprove} onBlock={handleGateBlock} />
      )}

      {/* Video preview (full screen) */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className={`w-full h-full object-cover ${stream ? "block" : "hidden"}`}
        />

        {!stream && status !== "gate" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Video className="w-12 h-12 text-gray-700" />
            <p className="text-gray-500 text-sm">Câmera não ativa</p>
          </div>
        )}

        {/* NO AR overlay */}
        {isOnAir && (
          <div className="absolute inset-0 border-4 border-green-500 pointer-events-none">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-full shadow-xl">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              NO AR
            </div>
          </div>
        )}

        {/* Banner modo de teste */}
        {cameraMode === "demo" && isActive && (
          <div className="absolute top-0 inset-x-0 flex items-center justify-center gap-2 bg-yellow-500/90 text-black text-xs font-semibold py-2 px-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            Modo de teste — câmera não protegida contra interrupções
          </div>
        )}

        {/* Banner de câmera interrompida */}
        {interrupted && isActive && (
          <div className="absolute inset-x-0 bottom-32 flex items-center justify-center px-4">
            <div className="bg-red-600/90 text-white text-sm font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4" />
              Câmera interrompida — o diretor foi avisado
            </div>
          </div>
        )}

        {/* Status bar */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {isActive ? (
            <span className="flex items-center gap-1.5 text-xs bg-black/60 px-2.5 py-1 rounded-full">
              <Wifi className="w-3.5 h-3.5 text-green-400" />
              Conectado ao Studio
            </span>
          ) : status === "entering" ? (
            <span className="flex items-center gap-1.5 text-xs bg-black/60 px-2.5 py-1 rounded-full">
              <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
              Conectando...
            </span>
          ) : null}
        </div>

        {/* Camera name badge */}
        {cameraName && isActive && (
          <div className="absolute bottom-4 left-4">
            <span className="text-sm font-medium bg-black/60 px-3 py-1 rounded-full">{cameraName}</span>
          </div>
        )}

        {/* Flip camera button */}
        {stream && (
          <button
            onClick={() => void flipCamera()}
            className="absolute top-4 left-4 p-2.5 bg-black/50 rounded-full hover:bg-black/70 transition"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom panel */}
      <div className="bg-gray-900 border-t border-gray-800 p-5 space-y-4 safe-area-bottom">

        {status === "disconnected" && (
          <div className="text-center space-y-2">
            <WifiOff className="w-8 h-8 mx-auto text-gray-500" />
            <p className="text-gray-400 text-sm">Câmera desconectada. Saindo...</p>
          </div>
        )}

        {errorMsg && status === "error" && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-3 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        {(status === "idle" || status === "error") && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1.5">
                Qual é o seu nome / posição?
              </label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-base placeholder-gray-600 focus:outline-none focus:border-primary"
                value={cameraName}
                onChange={(e) => setCameraName(e.target.value)}
                placeholder="Ex: Pastor, Nave Direita..."
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && void handleEnter()}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PRESET_NAMES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCameraName(n)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition ${
                      cameraName === n
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-gray-700 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {hasPermission === false && (
              <button
                onClick={() => void requestCamera(cameraFacing)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-700 text-sm"
              >
                <VideoOff className="w-4 h-4" />
                Tentar ativar câmera novamente
              </button>
            )}

            <button
              onClick={() => void handleEnter()}
              disabled={!cameraName.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-primary-foreground text-base font-semibold disabled:opacity-40 active:scale-95 transition"
            >
              <Camera className="w-5 h-5" />
              Entrar como câmera
            </button>

            {IS_MOCK && (
              <p className="text-xs text-gray-600 text-center">
                Modo demonstração — câmera local sem transmissão remota
              </p>
            )}
          </>
        )}

        {status === "entering" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Conectando ao Ecclesia Studio...</p>
          </div>
        )}

        {isActive && (
          <div className="space-y-3">
            <div className={`flex items-center justify-center gap-2 py-3 rounded-xl ${
              isOnAir ? "bg-green-600/20 border border-green-600/50" : "bg-gray-800"
            }`}>
              <Radio className={`w-4 h-4 ${isOnAir ? "text-green-400" : "text-gray-500"}`} />
              <span className={`text-sm font-medium ${isOnAir ? "text-green-300" : "text-gray-400"}`}>
                {isOnAir ? "Você está NO AR" : "Câmera conectada — aguardando o diretor"}
              </span>
            </div>
            <button
              onClick={() => void handleLeave()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-800 text-red-400 text-sm active:scale-95 transition"
            >
              <LogOut className="w-4 h-4" />
              Sair do estúdio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
