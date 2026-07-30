import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useInternalCall } from "@/hooks/useInternalCall";
import { cn } from "@/lib/utils";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function VideoSurface({
  stream,
  muted = false,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
}

export function InternalCallOverlay() {
  const { user } = useAuth();
  const {
    activeCall,
    isIncoming,
    busy,
    connectionState,
    localStream,
    remoteStream,
    muted,
    cameraEnabled,
    relayConfigured,
    relayRequired,
    relayInUse,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  } = useInternalCall();
  const [elapsed, setElapsed] = useState(0);

  const isCaller = activeCall?.callerUserId === user?.id;
  const otherName = activeCall
    ? isCaller ? activeCall.calleeName : activeCall.callerName
    : "";
  const otherAvatar = activeCall
    ? isCaller ? activeCall.calleeAvatarUrl : activeCall.callerAvatarUrl
    : null;
  const isVideo = activeCall?.mode === "video";
  const isActive = activeCall?.status === "accepted";
  const terminal = activeCall
    ? ["rejected", "cancelled", "ended", "missed", "failed"].includes(activeCall.status)
    : false;

  useEffect(() => {
    if (!activeCall?.answeredAt || !isActive) {
      setElapsed(0);
      return;
    }
    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(activeCall.answeredAt!).getTime()) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [activeCall?.answeredAt, isActive]);

  const statusLabel = useMemo(() => {
    if (!activeCall) return "";
    if (activeCall.status === "ringing") {
      return isIncoming
        ? isVideo ? "Videochamada recebida" : "Ligação recebida"
        : "Chamando…";
    }
    if (activeCall.status === "accepted") {
      if (connectionState === "reconnecting") return "Reconectando…";
      if (connectionState === "connecting") return "Conectando…";
      return formatDuration(elapsed);
    }
    if (activeCall.status === "rejected") return "Chamada recusada";
    if (activeCall.status === "missed") return "Não atendida";
    if (activeCall.status === "failed") return "Não foi possível conectar";
    return "Chamada encerrada";
  }, [activeCall, isIncoming, isVideo, connectionState, elapsed]);

  return (
    <AnimatePresence>
      {activeCall && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] overflow-hidden bg-[#08131d] text-white"
          role="dialog"
          aria-modal="true"
          aria-label={isVideo ? "Videochamada individual" : "Ligação individual"}
          data-testid="internal-call-overlay"
        >
          {isVideo && isActive && remoteStream ? (
            <VideoSurface stream={remoteStream} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,#23475a_0%,#102832_38%,#071118_100%)]" />
          )}

          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

          <div className="relative flex h-full flex-col items-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
                {isVideo ? "Videochamada Eclésia" : "Ligação Eclésia"}
              </p>
              <h2 className="mt-3 max-w-[85vw] truncate text-2xl font-semibold">{otherName}</h2>
              <p className="mt-1 text-sm text-white/75">{statusLabel}</p>
            </div>

            {(!isVideo || !remoteStream || !isActive) && (
              <div className="mt-14">
                {otherAvatar ? (
                  <img
                    src={otherAvatar}
                    alt=""
                    className="h-32 w-32 rounded-full border-4 border-white/15 object-cover shadow-2xl sm:h-40 sm:w-40"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/15 bg-white/10 text-5xl font-semibold shadow-2xl sm:h-40 sm:w-40">
                    {otherName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            )}

            {isVideo && localStream && isActive && (
              <div className="absolute right-4 top-[max(8rem,calc(env(safe-area-inset-top)+7rem))] h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl sm:h-52 sm:w-36">
                {cameraEnabled ? (
                  <VideoSurface stream={localStream} muted className="h-full w-full object-cover -scale-x-100" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-900">
                    <CameraOff className="text-white/55" />
                  </div>
                )}
              </div>
            )}

            <div className="mt-auto w-full max-w-md">
              {isActive
                && connectionState === "connected"
                && relayConfigured
                && relayRequired
                && relayInUse === false && (
                <p className="mb-4 rounded-xl bg-red-500/15 px-3 py-2 text-center text-xs text-red-100">
                  A conexão segura da chamada não foi confirmada.
                </p>
              )}

              {isIncoming && !terminal ? (
                <div className="flex items-center justify-around">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void rejectCall()}
                    className="flex flex-col items-center gap-2"
                    aria-label="Recusar chamada"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-950/40">
                      <PhoneOff size={27} />
                    </span>
                    <span className="text-xs text-white/80">Recusar</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void acceptCall()}
                    className="flex flex-col items-center gap-2"
                    aria-label="Atender chamada"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-950/40"
                    >
                      {isVideo ? <Video size={29} /> : <Phone size={27} />}
                    </motion.span>
                    <span className="text-xs text-white/80">Atender</span>
                  </button>
                </div>
              ) : !terminal ? (
                <div className={cn(
                  "grid items-center gap-3 rounded-3xl bg-black/35 p-4 backdrop-blur-md",
                  isVideo ? "grid-cols-4" : "grid-cols-3",
                )}>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="flex flex-col items-center gap-2"
                    aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}
                  >
                    <span className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full",
                      muted ? "bg-white text-slate-950" : "bg-white/15",
                    )}>
                      {muted ? <MicOff size={21} /> : <Mic size={21} />}
                    </span>
                    <span className="text-[10px]">{muted ? "Ativar" : "Silenciar"}</span>
                  </button>

                  {isVideo && (
                    <>
                      <button
                        type="button"
                        onClick={toggleCamera}
                        className="flex flex-col items-center gap-2"
                        aria-label={cameraEnabled ? "Desligar câmera" : "Ligar câmera"}
                      >
                        <span className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-full",
                          !cameraEnabled ? "bg-white text-slate-950" : "bg-white/15",
                        )}>
                          {cameraEnabled ? <Camera size={21} /> : <CameraOff size={21} />}
                        </span>
                        <span className="text-[10px]">Câmera</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void switchCamera()}
                        className="flex flex-col items-center gap-2"
                        aria-label="Trocar câmera"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                          <RefreshCw size={20} />
                        </span>
                        <span className="text-[10px]">Alternar</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void (isActive ? endCall() : cancelCall())}
                    className="flex flex-col items-center gap-2"
                    aria-label={isActive ? "Encerrar chamada" : "Cancelar chamada"}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500">
                      <PhoneOff size={22} />
                    </span>
                    <span className="text-[10px]">{isActive ? "Encerrar" : "Cancelar"}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
