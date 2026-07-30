import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  fetchActiveInternalCall,
  fetchInternalCallIceConfiguration,
  fetchPendingInternalCallSignals,
  mapInternalCall,
  mapInternalCallSignal,
  sendInternalCallSignal,
  startInternalCall,
  transitionInternalCall,
  type InternalCall,
  type InternalCallMode,
  type InternalCallSignal,
} from "@/lib/internalCalls";
import type { InternalThread } from "@/lib/internalMessages";
import { triggerInternalCallPush } from "@/lib/webPush";

type CallConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

type InternalCallContextValue = {
  activeCall: InternalCall | null;
  isIncoming: boolean;
  busy: boolean;
  connectionState: CallConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  relayConfigured: boolean | null;
  relayRequired: boolean;
  relayInUse: boolean | null;
  startCall: (thread: InternalThread, mode: InternalCallMode) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => Promise<void>;
};

const InternalCallContext = createContext<InternalCallContextValue | null>(null);
const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "ended", "missed", "failed"]);

function serializeRtc(value: RTCSessionDescriptionInit | RTCIceCandidateInit): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function humanCallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("participant_already_in_call")) return "Uma das pessoas já está em outra chamada.";
  if (message.includes("member_has_no_active_user")) return "Este membro ainda não ativou o acesso ao aplicativo.";
  if (message.includes("NotAllowedError")) return "Permita o uso do microfone e da câmera para continuar.";
  if (message.includes("NotFoundError")) return "Nenhum microfone ou câmera compatível foi encontrado.";
  if (message.includes("direct_thread_not_found_or_forbidden")) return "Esta conversa não permite chamada individual.";
  if (message.includes("turn_not_configured")) return "O servidor seguro de chamadas ainda não foi configurado.";
  if (message.includes("turn_credentials_unavailable")) return "O servidor seguro de chamadas está indisponível.";
  if (message.includes("active_call_not_found")) return "A chamada expirou antes de estabelecer a conexão.";
  return "Não foi possível iniciar a chamada agora.";
}

async function selectedCandidateUsesRelay(peer: RTCPeerConnection): Promise<boolean | null> {
  const stats = await peer.getStats();
  let selectedPairId: string | undefined;
  let selectedLocalCandidateId: string | undefined;

  stats.forEach((report) => {
    if (report.type === "transport" && typeof report.selectedCandidatePairId === "string") {
      selectedPairId = report.selectedCandidatePairId;
    }
    if (report.type === "candidate-pair" && report.selected === true) {
      selectedPairId = report.id;
    }
  });

  if (selectedPairId) {
    const pair = stats.get(selectedPairId);
    if (pair && typeof pair.localCandidateId === "string") {
      selectedLocalCandidateId = pair.localCandidateId;
    }
  }
  if (!selectedLocalCandidateId) return null;

  const candidate = stats.get(selectedLocalCandidateId);
  return candidate?.candidateType === "relay";
}

export function InternalCallProvider({
  organizationId,
  currentUserId,
  children,
}: {
  organizationId?: string;
  currentUserId?: string;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const [activeCall, setActiveCall] = useState<InternalCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionState, setConnectionState] = useState<CallConnectionState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [relayConfigured, setRelayConfigured] = useState<boolean | null>(null);
  const [relayRequired, setRelayRequired] = useState(true);
  const [relayInUse, setRelayInUse] = useState<boolean | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentCallRef = useRef<InternalCall | null>(null);
  const processedSignalIdsRef = useRef(new Set<number>());
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const facingModeRef = useRef<"user" | "environment">("user");
  const terminalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isIncoming = Boolean(
    activeCall
    && currentUserId
    && activeCall.status === "ringing"
    && activeCall.calleeUserId === currentUserId,
  );

  const stopMediaAndPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraEnabled(true);
    setRelayInUse(null);
    setConnectionState("idle");
    processedSignalIdsRef.current.clear();
    queuedCandidatesRef.current = [];
  }, []);

  const finishTerminalCall = useCallback((call: InternalCall) => {
    setActiveCall(call);
    currentCallRef.current = call;
    stopMediaAndPeer();
    if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current);
    terminalTimerRef.current = setTimeout(() => {
      setActiveCall((current) => current?.id === call.id ? null : current);
      if (currentCallRef.current?.id === call.id) currentCallRef.current = null;
    }, 1400);
  }, [stopMediaAndPeer]);

  const acquireMedia = useCallback(async (mode: InternalCallMode): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("media_devices_unavailable");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: mode === "video"
        ? {
            facingMode: facingModeRef.current,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setCameraEnabled(mode === "video");
    return stream;
  }, []);

  const sendSignal = useCallback(async (
    callId: string,
    signalType: "offer" | "answer" | "ice",
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit,
  ) => {
    await sendInternalCallSignal(callId, signalType, serializeRtc(payload));
  }, []);

  const createPeer = useCallback(async (
    call: InternalCall,
    stream: MediaStream,
  ): Promise<RTCPeerConnection> => {
    const iceConfig = await fetchInternalCallIceConfiguration(call.id);
    setRelayConfigured(iceConfig.relayConfigured);
    setRelayRequired(iceConfig.relayRequired);

    const peer = new RTCPeerConnection({
      iceServers: iceConfig.iceServers,
      iceTransportPolicy: iceConfig.relayRequired ? "relay" : "all",
      iceCandidatePoolSize: iceConfig.relayConfigured ? 8 : 0,
    });
    peerRef.current = peer;

    for (const track of stream.getTracks()) peer.addTrack(track, stream);

    peer.ontrack = (event) => {
      const [streamFromEvent] = event.streams;
      if (streamFromEvent) {
        setRemoteStream(streamFromEvent);
      } else {
        setRemoteStream((current) => {
          const next = current ?? new MediaStream();
          next.addTrack(event.track);
          return next;
        });
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal(call.id, "ice", event.candidate.toJSON()).catch(() => undefined);
      }
    };

    peer.onconnectionstatechange = () => {
      switch (peer.connectionState) {
        case "connected":
          setConnectionState("connected");
          void selectedCandidateUsesRelay(peer)
            .then((usingRelay) => setRelayInUse(usingRelay))
            .catch(() => setRelayInUse(null));
          break;
        case "disconnected":
          setConnectionState("reconnecting");
          break;
        case "failed":
          setConnectionState("failed");
          void transitionInternalCall(call.id, "fail", "webrtc_connection_failed").catch(() => undefined);
          break;
        case "connecting":
        case "new":
          setConnectionState("connecting");
          break;
        default:
          break;
      }
    };

    setConnectionState("connecting");
    return peer;
  }, [sendSignal]);

  const flushQueuedCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const candidates = [...queuedCandidatesRef.current];
    queuedCandidatesRef.current = [];
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const processSignal = useCallback(async (signal: InternalCallSignal) => {
    if (!currentUserId || signal.recipientUserId !== currentUserId) return;
    if (processedSignalIdsRef.current.has(signal.id)) return;
    processedSignalIdsRef.current.add(signal.id);

    const peer = peerRef.current;
    if (!peer) {
      // A oferta chega antes de a pessoa atender. Ela permanece no banco e
      // será processada logo após o aceite; candidatos ficam na mesma fila.
      return;
    }

    if (signal.signalType === "offer") {
      await peer.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
      await flushQueuedCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal(signal.callId, "answer", answer);
      return;
    }

    if (signal.signalType === "answer") {
      if (!peer.currentRemoteDescription) {
        await peer.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
        await flushQueuedCandidates(peer);
      }
      return;
    }

    const candidate = signal.payload as unknown as RTCIceCandidateInit;
    if (peer.remoteDescription) {
      await peer.addIceCandidate(candidate).catch(() => undefined);
    } else {
      queuedCandidatesRef.current.push(candidate);
    }
  }, [currentUserId, flushQueuedCandidates, sendSignal]);

  const processPendingSignals = useCallback(async (callId: string) => {
    if (!currentUserId) return;
    // Ao atender, reprocessa desde o banco. IDs vistos antes de existir peer
    // precisam ser liberados para não descartar a oferta.
    processedSignalIdsRef.current.clear();
    const signals = await fetchPendingInternalCallSignals(callId, currentUserId);
    for (const signal of signals) await processSignal(signal);
  }, [currentUserId, processSignal]);

  const startCall = useCallback(async (thread: InternalThread, mode: InternalCallMode) => {
    if (!currentUserId || !organizationId || busy || activeCall) return;
    if (
      thread.organizationId !== organizationId
      || thread.source !== "secretariat"
      || !thread.memberId
      || !thread.participantUserId
      || thread.participantUserId === currentUserId
    ) {
      toast({
        title: "Chamada individual indisponível",
        description: "Selecione uma conversa direta com outro membro.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    let createdCall: InternalCall | null = null;
    try {
      const stream = await acquireMedia(mode);
      const call = await startInternalCall(thread.id, mode);
      createdCall = call;
      currentCallRef.current = call;
      setActiveCall(call);
      const peer = await createPeer(call, stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal(call.id, "offer", offer);
      triggerInternalCallPush(call.id);
    } catch (error) {
      stopMediaAndPeer();
      if (createdCall) {
        await transitionInternalCall(
          createdCall.id,
          "fail",
          "media_or_signaling_failed",
        ).catch(() => undefined);
        setActiveCall(null);
        currentCallRef.current = null;
      }
      toast({
        title: "Não foi possível ligar",
        description: humanCallError(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [
    currentUserId,
    organizationId,
    busy,
    activeCall,
    toast,
    acquireMedia,
    createPeer,
    sendSignal,
    stopMediaAndPeer,
  ]);

  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || call.status !== "ringing" || !isIncoming || busy) return;
    setBusy(true);
    try {
      const stream = await acquireMedia(call.mode);
      await createPeer(call, stream);
      const accepted = await transitionInternalCall(call.id, "accept");
      currentCallRef.current = accepted;
      setActiveCall(accepted);
      await processPendingSignals(call.id);
    } catch (error) {
      stopMediaAndPeer();
      await transitionInternalCall(call.id, "fail", "media_or_signaling_failed").catch(() => undefined);
      toast({
        title: "Não foi possível atender",
        description: humanCallError(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [isIncoming, busy, acquireMedia, createPeer, processPendingSignals, stopMediaAndPeer, toast]);

  const runTerminalAction = useCallback(async (
    action: "reject" | "cancel" | "end",
    reason: string,
  ) => {
    const call = currentCallRef.current;
    if (!call || busy) return;
    setBusy(true);
    try {
      const ended = await transitionInternalCall(call.id, action, reason);
      finishTerminalCall(ended);
    } catch {
      stopMediaAndPeer();
      setActiveCall(null);
      currentCallRef.current = null;
    } finally {
      setBusy(false);
    }
  }, [busy, finishTerminalCall, stopMediaAndPeer]);

  const rejectCall = useCallback(
    () => runTerminalAction("reject", "callee_rejected"),
    [runTerminalAction],
  );
  const cancelCall = useCallback(
    () => runTerminalAction("cancel", "caller_cancelled"),
    [runTerminalAction],
  );
  const endCall = useCallback(
    () => runTerminalAction("end", "participant_ended"),
    [runTerminalAction],
  );

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setCameraEnabled(videoTrack.enabled);
  }, []);

  const switchCamera = useCallback(async () => {
    const call = currentCallRef.current;
    const peer = peerRef.current;
    if (!call || call.mode !== "video" || !peer) return;

    const nextFacing = facingModeRef.current === "user" ? "environment" : "user";
    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const nextTrack = nextStream.getVideoTracks()[0];
    if (!nextTrack) return;

    const sender = peer.getSenders().find((item) => item.track?.kind === "video");
    await sender?.replaceTrack(nextTrack);

    const current = localStreamRef.current;
    current?.getVideoTracks().forEach((track) => {
      current.removeTrack(track);
      track.stop();
    });
    current?.addTrack(nextTrack);
    facingModeRef.current = nextFacing;
    setLocalStream(current ? new MediaStream(current.getTracks()) : nextStream);
    localStreamRef.current = current ?? nextStream;
  }, []);

  useEffect(() => {
    currentCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (!organizationId || !currentUserId) {
      setActiveCall(null);
      currentCallRef.current = null;
      stopMediaAndPeer();
      return;
    }

    void fetchActiveInternalCall(currentUserId)
      .then((call) => {
        if (call) {
          currentCallRef.current = call;
          setActiveCall(call);
        }
      })
      .catch(() => undefined);

    const channel = supabase
      .channel(`internal-calls-user-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_calls", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          if (!raw?.id) return;
          const call = mapInternalCall(raw as Parameters<typeof mapInternalCall>[0]);
          if (currentUserId !== call.callerUserId && currentUserId !== call.calleeUserId) return;
          if (TERMINAL_STATUSES.has(call.status)) {
            finishTerminalCall(call);
          } else {
            currentCallRef.current = call;
            setActiveCall(call);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current);
      stopMediaAndPeer();
    };
  }, [organizationId, currentUserId, finishTerminalCall, stopMediaAndPeer]);

  useEffect(() => {
    const callId = activeCall?.id;
    if (!callId || !currentUserId || TERMINAL_STATUSES.has(activeCall.status)) return;

    const channel = supabase
      .channel(`internal-call-signals-${callId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_call_signals",
          filter: `call_id=eq.${callId}`,
        },
        (payload) => {
          const signal = mapInternalCallSignal(
            payload.new as Parameters<typeof mapInternalCallSignal>[0],
          );
          void processSignal(signal).catch(() => undefined);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [activeCall?.id, activeCall?.status, currentUserId, processSignal]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== "ringing") return;
    const remaining = Math.max(
      0,
      31_000 - (Date.now() - new Date(activeCall.startedAt).getTime()),
    );
    const timer = setTimeout(() => {
      void transitionInternalCall(activeCall.id, "timeout", "not_answered")
        .then(finishTerminalCall)
        .catch(() => undefined);
    }, remaining);
    return () => clearTimeout(timer);
  }, [activeCall, finishTerminalCall]);

  useEffect(() => {
    if (!isIncoming) return;
    navigator.vibrate?.([350, 250, 350, 250, 350]);
    const interval = setInterval(() => navigator.vibrate?.([350, 250, 350]), 2400);
    return () => {
      clearInterval(interval);
      navigator.vibrate?.(0);
    };
  }, [isIncoming]);

  const value = useMemo<InternalCallContextValue>(() => ({
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
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  }), [
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
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  ]);

  return <InternalCallContext.Provider value={value}>{children}</InternalCallContext.Provider>;
}

export function useInternalCall(): InternalCallContextValue {
  const context = useContext(InternalCallContext);
  if (!context) throw new Error("useInternalCall must be used inside InternalCallProvider");
  return context;
}
