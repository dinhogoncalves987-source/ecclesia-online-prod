/**
 * JitsiCallModal
 *
 * Integração com Jitsi Meet via IFrame API oficial (https://meet.jit.si).
 * Cada thread possui sua própria sala permanente.
 *
 * Sala: ecclesia-{12 chars do orgId sem hífens}-{12 chars do threadId sem hífens}
 *
 * FASE 1: Modal fullscreen com sala Jitsi
 * FASE 2: Conectado a onVoiceCall / onVideoCall do InternalChatHeader
 * FASE 3: Microfone e câmera gerenciados pelo Jitsi
 * FASE 4: Gravação local via getDisplayMedia + MediaRecorder → download .webm
 * FASE 5: Barra de controle com estado visual (conectando, ativo, gravando)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Loader2, PhoneOff, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Tipos para a API externa do Jitsi ────────────────────────────────────────
type JitsiAPI = {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  on: (event: string, handler: (data?: unknown) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: JitsiOptions) => JitsiAPI;
  }
}

type JitsiOptions = {
  roomName: string;
  parentNode: HTMLElement;
  width: string | number;
  height: string | number;
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
  userInfo?: { displayName?: string };
};

// ── Props do componente ───────────────────────────────────────────────────────
export type JitsiCallMode = "voice" | "video";

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  threadId: string;
  mode: JitsiCallMode;
  displayName?: string;
};

// ── Utilitários ───────────────────────────────────────────────────────────────

/**
 * Gera nome de sala único e seguro para Jitsi a partir de org + thread.
 *
 * Usa primeiros 6 + últimos 6 chars de cada UUID (sem hífens) para capturar
 * tanto o prefixo de namespace quanto o sufixo único — evitando colisões
 * em UUIDs sequenciais com prefixo fixo (ex: IDs de demo dd000015-...-000001).
 */
function makeRoomName(orgId: string, threadId: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "");
  const part = (s: string) => {
    const c = clean(s);
    return (c.slice(0, 6) + c.slice(-6)).slice(0, 12);
  };
  return `ec-${part(orgId)}-${part(threadId)}`;
}

/** Carrega o script external_api.js do Jitsi uma única vez no documento. */
let jitsiScriptPromise: Promise<void> | null = null;

function loadJitsiScript(): Promise<void> {
  if (jitsiScriptPromise) return jitsiScriptPromise;

  jitsiScriptPromise = new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) { resolve(); return; }

    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      jitsiScriptPromise = null;
      reject(new Error("Falha ao carregar Jitsi Meet API"));
    };
    document.head.appendChild(script);
  });

  return jitsiScriptPromise;
}

// ── Componente principal ──────────────────────────────────────────────────────
export function JitsiCallModal({
  open,
  onClose,
  organizationId,
  threadId,
  mode,
  displayName = "Participante",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);

  const [status, setStatus] = useState<"loading" | "active" | "error">("loading");
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── Limpeza da instância Jitsi ─────────────────────────────────────────────
  const disposeJitsi = useCallback(() => {
    if (apiRef.current) {
      try { apiRef.current.dispose(); } catch { /* ignora */ }
      apiRef.current = null;
    }
  }, []);

  // ── Inicializa Jitsi quando o modal abre ──────────────────────────────────
  useEffect(() => {
    if (!open) {
      disposeJitsi();
      setStatus("loading");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;

        const roomName = makeRoomName(organizationId, threadId);

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            startWithAudioOnly: mode === "voice",
            startWithVideoMuted: mode === "voice",
            startWithAudioMuted: false,
            enableNoisyMicDetection: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: false,
            HIDE_INVITE_MORE_HEADER: true,
          },
          userInfo: { displayName },
        });

        api.on("videoConferenceJoined", () => {
          if (!cancelled) setStatus("active");
        });

        api.on("readyToClose", () => {
          if (!cancelled) {
            disposeJitsi();
            onClose();
          }
        });

        apiRef.current = api;

        // Fallback: se o evento não disparar em 12s, considerar ativo
        const fallback = setTimeout(() => {
          if (!cancelled) setStatus("active");
        }, 12_000);

        return () => clearTimeout(fallback);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, threadId, mode, displayName]);

  // ── Encerrar chamada ──────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (recording) stopRecording();
    disposeJitsi();
    onClose();
  }, [recording, disposeJitsi, onClose]);

  // ── Gravação local via getDisplayMedia ────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reuniao-ecclesia-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        stream.getTracks().forEach((t) => t.stop());
      };

      // Para automaticamente se o usuário parar o compartilhamento
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
        recorderRef.current = null;
        setRecording(false);
      });

      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      // Usuário cancelou ou permissão negada — silencioso
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
  };

  // ── Nada a renderizar quando fechado ─────────────────────────────────────
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#1a1a2e]">
      {/* ── Barra superior de controle ─────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/60 border-b border-white/10 backdrop-blur-sm">
        {/* Info da chamada */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {mode === "video" ? (
              <Video size={16} className="text-white/80" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-white/80 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
              </div>
            )}
            <span className="text-white font-medium text-sm">
              {mode === "video" ? "Videochamada" : "Ligação de Voz"}
            </span>
          </div>

          {/* Status */}
          {status === "loading" && (
            <span className="flex items-center gap-1.5 text-xs text-white/50">
              <Loader2 size={11} className="animate-spin" />
              Conectando...
            </span>
          )}
          {status === "active" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Chamada ativa
            </span>
          )}
          {status === "error" && (
            <span className="text-xs text-red-400">Erro ao conectar</span>
          )}

          {/* Indicador de gravação */}
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 animate-pulse">
              <Circle size={8} fill="currentColor" />
              Gravando
            </span>
          )}
        </div>

        {/* Sala interna — nome não exposto na UI */}
        <span className="hidden md:block text-[10px] text-white/20">
          Sala interna
        </span>

        {/* Botões de controle */}
        <div className="flex items-center gap-2">
          {recording ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={stopRecording}
              className="h-8 gap-1.5 text-xs"
            >
              <Square size={11} fill="currentColor" />
              Parar Gravação
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void startRecording()}
              disabled={status === "error"}
              className={cn(
                "h-8 gap-1.5 text-xs border border-white/20 text-white/80",
                "hover:bg-white/10 hover:text-white",
              )}
            >
              <Circle size={11} />
              Gravar Reunião
            </Button>
          )}

          <Button
            size="sm"
            variant="destructive"
            onClick={handleClose}
            className="h-8 gap-1.5 text-xs"
          >
            <PhoneOff size={14} />
            Encerrar
          </Button>
        </div>
      </div>

      {/* ── Container do Jitsi ────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Overlay de carregamento */}
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#1a1a2e]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={36} className="animate-spin text-white/40" />
              <p className="text-white/60 text-sm">Carregando sala de reunião...</p>
              <p className="text-white/30 text-xs">Aguarde, conectando...</p>
            </div>
          </div>
        )}

        {/* Overlay de erro */}
        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#1a1a2e]">
            <p className="text-red-400 text-sm">Não foi possível carregar o Jitsi Meet.</p>
            <p className="text-white/40 text-xs max-w-xs text-center">
              Verifique se o endereço meet.jit.si está acessível e tente novamente.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClose}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Fechar
            </Button>
          </div>
        )}

        {/* Iframe do Jitsi renderizado pela API externa */}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
