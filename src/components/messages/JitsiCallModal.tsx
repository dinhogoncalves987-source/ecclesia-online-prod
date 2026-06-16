/**
 * JitsiCallModal — Sala de chamadas Ecclesia Online.
 *
 * Identidade visual: 100% Ecclesia. Nenhum elemento Jitsi visível ao usuário.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PhoneOff, Video, Phone, Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Tipos da API externa ───────────────────────────────────────────────────────
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

export type JitsiCallMode = "voice" | "video";

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  threadId: string;
  mode: JitsiCallMode;
  displayName?: string;
  callTitle?: string;
};

// ── Utilitários ────────────────────────────────────────────────────────────────

function makeRoomName(orgId: string, threadId: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "");
  const part = (s: string) => {
    const c = clean(s);
    return (c.slice(0, 6) + c.slice(-6)).slice(0, 12);
  };
  return `ec-${part(orgId)}-${part(threadId)}`;
}

let jitsiScriptPromise: Promise<void> | null = null;

function loadJitsiScript(): Promise<void> {
  if (jitsiScriptPromise) return jitsiScriptPromise;
  jitsiScriptPromise = new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { jitsiScriptPromise = null; reject(new Error("Falha ao iniciar")); };
    document.head.appendChild(script);
  });
  return jitsiScriptPromise;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function JitsiCallModal({
  open,
  onClose,
  organizationId,
  threadId,
  mode,
  displayName = "Participante",
  callTitle,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);
  const [status, setStatus] = useState<"loading" | "active" | "error">("loading");

  const disposeJitsi = useCallback(() => {
    if (apiRef.current) {
      try { apiRef.current.dispose(); } catch { /* ignora */ }
      apiRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) { disposeJitsi(); setStatus("loading"); return; }

    let cancelled = false;
    setStatus("loading");

    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;

        const roomName = makeRoomName(organizationId, threadId);
        const callSubject = mode === "video" ? "Videochamada Ecclesia" : "Chamada de Voz Ecclesia";

        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            startWithAudioOnly: mode === "voice",
            startWithVideoMuted: mode === "voice",
            startWithAudioMuted: false,
            hideConferenceSubject: true,
            hideConferenceTimer: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false,
            subject: callSubject,
            defaultRemoteDisplayName: "Participante",
            enableNoisyMicDetection: false,
            toolbarButtons: [
              "camera",
              "fullscreen",
              "hangup",
              "microphone",
              "participants-pane",
              "raisehand",
              "tileview",
              "toggle-camera",
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            JITSI_WATERMARK_LINK: "",
            DEFAULT_LOGO_URL: "",
            APP_NAME: "Ecclesia",
            NATIVE_APP_NAME: "Ecclesia",
            PROVIDER_NAME: "Ecclesia",
            DEFAULT_REMOTE_DISPLAY_NAME: "Participante",
            DISPLAY_WELCOME_FOOTER: false,
            HIDE_INVITE_MORE_HEADER: true,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            LANG_DETECTION: false,
            TOOLBAR_ALWAYS_VISIBLE: false,
            DEFAULT_BACKGROUND: "#0f172a",
          },
          userInfo: { displayName },
        });

        api.on("videoConferenceJoined", () => { if (!cancelled) setStatus("active"); });
        api.on("readyToClose", () => { if (!cancelled) { disposeJitsi(); onClose(); } });
        apiRef.current = api;

        // Fallback: marcar como ativo após 12s mesmo sem evento (firewall, etc.)
        const fallback = setTimeout(() => { if (!cancelled) setStatus("active"); }, 12_000);
        return () => clearTimeout(fallback);
      })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, threadId, mode, displayName]);

  const handleClose = useCallback(() => { disposeJitsi(); onClose(); }, [disposeJitsi, onClose]);

  if (!open) return null;

  const modeLabel = mode === "video" ? "Videochamada" : "Ligação de Voz";
  const title = callTitle ?? modeLabel;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0f172a]">

      {/* ── Header Ecclesia ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-white/10">

        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-serif text-base leading-none">Ω</span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm">{title}</span>
              {mode === "video"
                ? <Video size={13} className="text-white/50" />
                : <Phone size={13} className="text-white/50" />}
            </div>
            <span className="text-white/40 text-[11px]">Ecclesia Online · Sala privada</span>
          </div>

          {/* Status */}
          <div className="ml-2">
            {status === "loading" && (
              <span className="flex items-center gap-1.5 text-xs text-white/40">
                <Loader2 size={11} className="animate-spin" /> Conectando...
              </span>
            )}
            {status === "active" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ativa
              </span>
            )}
            {status === "error" && (
              <span className="text-xs text-red-400">Erro ao conectar</span>
            )}
          </div>
        </div>

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

      {/* ── Área da chamada ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Overlay de carregamento — cobre o iframe enquanto Jitsi não carrega */}
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-[#0f172a]">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-2xl">
              <span className="text-accent font-serif text-3xl">Ω</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-white/40" />
                <span className="text-white/60 text-sm font-medium">
                  {mode === "video" ? "Iniciando videochamada..." : "Iniciando chamada de voz..."}
                </span>
              </div>
              <p className="text-white/30 text-xs">Aguarde enquanto preparamos a sala</p>
            </div>
            <div className="flex items-center gap-1.5 text-white/20 text-[11px]">
              <Lock size={11} />
              <span>Comunicação criptografada · Sala privada</span>
            </div>
          </div>
        )}

        {/* Overlay de erro */}
        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0f172a]">
            <div className="w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center">
              <PhoneOff size={28} className="text-destructive" />
            </div>
            <div className="text-center">
              <p className="text-white/80 text-sm font-medium">Não foi possível conectar</p>
              <p className="text-white/40 text-xs mt-1 max-w-xs">
                Verifique a conexão com a internet e tente novamente.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleClose} className="border-white/20 text-white hover:bg-white/10">
              Fechar
            </Button>
          </div>
        )}

        {/* Iframe Jitsi — sempre no DOM para não perder a conexão */}
        <div ref={containerRef} className="w-full h-full" />

        {/* ── Overlays permanentes que cobrem watermarks do Jitsi ──────────────── */}
        {/* Aparece assim que o loading desaparece (status !== "loading") */}
        {status !== "loading" && (
          <>
            {/* Canto superior esquerdo: cobre logo Jitsi */}
            <div
              className="absolute top-0 left-0 z-20 flex items-center gap-1.5 px-2 py-2 bg-[#0f172a] pointer-events-auto cursor-default select-none"
              style={{ width: 180, height: 48 }}
            >
              <div className="w-5 h-5 rounded bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-accent font-serif text-[10px] leading-none">Ω</span>
              </div>
              <div className="flex flex-col">
                <span className="text-white/70 text-[10px] font-semibold leading-none">Ecclesia Online</span>
                <span className="text-white/30 text-[9px] leading-none mt-0.5">Sala privada</span>
              </div>
            </div>

            {/* Canto inferior esquerdo: cobre "Powered by Jitsi Meet" */}
            <div
              className="absolute bottom-0 left-0 z-20 bg-[#0f172a] pointer-events-auto cursor-default select-none flex items-center px-2"
              style={{ width: 240, height: 32 }}
            >
              <div className="flex items-center gap-1 text-white/20">
                <Shield size={9} />
                <span className="text-[9px]">Sala segura · Ecclesia Online</span>
              </div>
            </div>

            {/* Canto inferior direito: cobre links adicionais */}
            <div
              className="absolute bottom-0 right-0 z-20 bg-[#0f172a]/80 pointer-events-auto cursor-default select-none"
              style={{ width: 120, height: 28 }}
            />
          </>
        )}
      </div>
    </div>
  );
}
