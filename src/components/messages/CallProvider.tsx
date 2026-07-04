/**
 * CallProvider — Abstração de Videoconferência do Ecclesia
 *
 * Feature flag: VITE_CALL_PROVIDER
 *   "jitsi"   → JitsiProvider (atual, provisório)
 *   "livekit" → LiveKitProvider (definitivo, quando VPS estiver pronta)
 *   "webrtc"  → WebRTCProvider (futuro, P2P nativo)
 *
 * Uso:
 *   import { CallProvider, useCall } from "@/components/messages/CallProvider"
 *
 *   <CallProvider>
 *     <App />
 *   </CallProvider>
 *
 *   const { startCall, endCall, activeCall } = useCall();
 */

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Feature flag ──────────────────────────────────────────────────────────────

export const ACTIVE_CALL_PROVIDER =
  (import.meta.env.VITE_CALL_PROVIDER as string | undefined) ?? "jitsi";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type CallType = "audio" | "video";
export type CallStatus = "idle" | "initiating" | "ringing" | "active" | "ended";

export type ActiveCall = {
  id: string;
  threadId: string | null;
  organizationId: string;
  callType: CallType;
  status: CallStatus;
  provider: string;
  roomName: string;
  roomUrl?: string;
  initiatedBy: string;
  startedAt: string | null;
};

type CallContextValue = {
  activeCall: ActiveCall | null;
  startCall: (params: StartCallParams) => Promise<void>;
  endCall: () => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  rejectCall: (callId: string) => Promise<void>;
  isCallModalOpen: boolean;
};

export type StartCallParams = {
  threadId: string;
  organizationId: string;
  callType: CallType;
  initiatedBy: string;
  participants?: string[];
};

// ── Context ───────────────────────────────────────────────────────────────────

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside <CallProvider>");
  return ctx;
}

// ── Geração de nome de sala ───────────────────────────────────────────────────

function generateRoomName(threadId: string, organizationId: string): string {
  const ts = Date.now().toString(36);
  const orgShort = organizationId.slice(0, 8);
  const threadShort = threadId.slice(0, 8);
  return `ecclesia-${orgShort}-${threadShort}-${ts}`;
}

// ── CallProvider ──────────────────────────────────────────────────────────────

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const callIdRef = useRef<string | null>(null);

  const startCall = useCallback(async (params: StartCallParams) => {
    const roomName = generateRoomName(params.threadId, params.organizationId);

    // Registrar chamada no banco
    const { data, error } = await supabase
      .from("chat_calls")
      .insert({
        thread_id: params.threadId,
        organization_id: params.organizationId,
        initiated_by: params.initiatedBy,
        call_type: params.callType,
        status: "initiated",
        provider: ACTIVE_CALL_PROVIDER,
        room_name: roomName,
        participants: params.participants ?? [params.initiatedBy],
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[CallProvider] startCall failed:", error);
      return;
    }

    const call: ActiveCall = {
      id: (data as { id: string }).id,
      threadId: params.threadId,
      organizationId: params.organizationId,
      callType: params.callType,
      status: "initiating",
      provider: ACTIVE_CALL_PROVIDER,
      roomName,
      initiatedBy: params.initiatedBy,
      startedAt: null,
    };

    callIdRef.current = call.id;
    setActiveCall(call);
    setIsCallModalOpen(true);
  }, []);

  const endCall = useCallback(async () => {
    if (callIdRef.current) {
      await supabase
        .from("chat_calls")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callIdRef.current);
    }
    setActiveCall(null);
    setIsCallModalOpen(false);
    callIdRef.current = null;
  }, []);

  const acceptCall = useCallback(async (callId: string) => {
    await supabase
      .from("chat_calls")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", callId);
    setIsCallModalOpen(true);
  }, []);

  const rejectCall = useCallback(async (callId: string) => {
    await supabase
      .from("chat_calls")
      .update({ status: "rejected" })
      .eq("id", callId);
    setActiveCall(null);
    setIsCallModalOpen(false);
  }, []);

  return (
    <CallContext.Provider
      value={{ activeCall, startCall, endCall, acceptCall, rejectCall, isCallModalOpen }}
    >
      {children}
      {isCallModalOpen && activeCall && (
        <CallModal call={activeCall} onEnd={endCall} />
      )}
    </CallContext.Provider>
  );
}

// ── CallModal: despacha para o provider correto ────────────────────────────────

function CallModal({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  if (ACTIVE_CALL_PROVIDER === "livekit") {
    return <LiveKitCallModal call={call} onEnd={onEnd} />;
  }
  return <JitsiCallModal call={call} onEnd={onEnd} />;
}

// ── JitsiProvider ─────────────────────────────────────────────────────────────

const JITSI_DOMAIN = "meet.jit.si";

function JitsiCallModal({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  const jitsiUrl = `https://${JITSI_DOMAIN}/${call.roomName}`;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center">
      <div className="w-full max-w-4xl h-[80vh] bg-black rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
          <span className="text-sm font-medium">
            {call.callType === "video" ? "Videochamada" : "Chamada de áudio"} — Ecclesia
          </span>
          <button
            type="button"
            onClick={onEnd}
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            Encerrar
          </button>
        </div>
        <iframe
          src={jitsiUrl}
          allow="camera; microphone; fullscreen; display-capture"
          className="flex-1 w-full border-0"
          title="Ecclesia Call"
        />
      </div>
    </div>
  );
}

// ── LiveKitProvider (stub — ativo quando VPS LiveKit estiver pronta) ─────────

function LiveKitCallModal({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  const livekitUrl = import.meta.env.VITE_LIVEKIT_URL as string | undefined;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center">
      <div className="bg-gray-900 text-white rounded-xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="text-4xl mb-4">📡</div>
        <p className="text-lg font-semibold mb-2">LiveKit</p>
        {livekitUrl ? (
          <>
            <p className="text-sm text-gray-400 mb-4">Sala: {call.roomName}</p>
            <p className="text-xs text-gray-500 mb-6">
              Conectando ao servidor LiveKit…
            </p>
          </>
        ) : (
          <p className="text-sm text-amber-400 mb-6">
            Servidor LiveKit não configurado.
            <br />
            Defina VITE_LIVEKIT_URL no .env.
          </p>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
