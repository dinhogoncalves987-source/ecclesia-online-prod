/**
 * useObsWebSocket — Integração com OBS Studio via WebSocket v5.
 *
 * Conecta automaticamente ao OBS WebSocket local (obs://localhost:4455).
 * Se OBS não estiver disponível: retorna estado offline, sem erros na UI.
 *
 * Documentação OBS WebSocket v5:
 *   https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 *
 * Ativar em .env:
 *   VITE_OBS_WEBSOCKET_URL=ws://localhost:4455
 *   VITE_OBS_WEBSOCKET_PASSWORD=           (opcional)
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ObsState {
  connected:    boolean;
  streaming:    boolean;
  recording:    boolean;
  virtualCam:   boolean;
  currentScene: string | null;
  scenes:       string[];
  version:      string | null;
  error:        string | null;
}

const DEFAULT_OBS: ObsState = {
  connected:    false,
  streaming:    false,
  recording:    false,
  virtualCam:   false,
  currentScene: null,
  scenes:       [],
  version:      null,
  error:        null,
};

// ── Helpers de protocolo OBS WS v5 ───────────────────────────────────────────

async function sha256Base64(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function computeObsAuth(password: string, salt: string, challenge: string): Promise<string> {
  return sha256Base64(await sha256Base64(password + salt) + challenge);
}

let _reqId = 0;
function nextReqId(): string { return `req-${++_reqId}`; }

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useObsWebSocket() {
  const [obs, setObs]         = useState<ObsState>(DEFAULT_OBS);
  const wsRef                 = useRef<WebSocket | null>(null);
  const reconnectTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRequests       = useRef<Map<string, (data: unknown) => void>>(new Map());
  const mountedRef            = useRef(true);
  const retryCount            = useRef(0);
  const MAX_RETRIES           = 5;
  const RECONNECT_DELAY_MS    = 5_000;
  const STATUS_POLL_INTERVAL  = 8_000;
  const statusTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  const obsUrl      = import.meta.env.VITE_OBS_WEBSOCKET_URL ?? "ws://localhost:4455";
  const obsPassword = import.meta.env.VITE_OBS_WEBSOCKET_PASSWORD ?? "";

  // ── Enviar request genérico ───────────────────────────────────────────────

  const sendRequest = useCallback((requestType: string, requestData?: unknown): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("OBS not connected"));
        return;
      }
      const requestId = nextReqId();
      pendingRequests.current.set(requestId, resolve);
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData: requestData ?? {} } }));
      setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error("Request timeout"));
        }
      }, 5_000);
    });
  }, []);

  // ── Atualizar status (streaming + recording + scene) ─────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const [streamRes, recordRes, sceneListRes, currentSceneRes] = await Promise.allSettled([
        sendRequest("GetStreamStatus"),
        sendRequest("GetRecordStatus"),
        sendRequest("GetSceneList"),
        sendRequest("GetCurrentProgramScene"),
      ]);

      setObs((prev) => ({
        ...prev,
        streaming:    streamRes.status === "fulfilled"  ? Boolean((streamRes.value as Record<string, unknown>)?.outputActive)  : prev.streaming,
        recording:    recordRes.status === "fulfilled"  ? Boolean((recordRes.value as Record<string, unknown>)?.outputActive)   : prev.recording,
        scenes:       sceneListRes.status === "fulfilled"
          ? ((sceneListRes.value as Record<string, unknown>)?.scenes as Array<{sceneName: string}> ?? []).map((s) => s.sceneName)
          : prev.scenes,
        currentScene: currentSceneRes.status === "fulfilled"
          ? String((currentSceneRes.value as Record<string, unknown>)?.currentProgramSceneName ?? "")
          : prev.currentScene,
      }));
    } catch { /* OBS disconnected while fetching */ }
  }, [sendRequest]);

  // ── Conectar ao OBS ───────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (wsRef.current) wsRef.current.close();

    let ws: WebSocket;
    try {
      ws = new WebSocket(obsUrl);
    } catch {
      if (mountedRef.current) setObs((p) => ({ ...p, connected: false, error: "URL inválida" }));
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      // OBS WS v5: server sends Hello first, then we Identify
    };

    ws.onmessage = async (ev) => {
      let msg: { op: number; d: Record<string, unknown> };
      try { msg = JSON.parse(ev.data as string); } catch { return; }

      const { op, d } = msg;

      if (op === 0) {
        // Hello — decide se precisa de autenticação
        const auth = d.authentication as { challenge: string; salt: string } | null | undefined;
        let authentication: string | undefined;
        if (auth && obsPassword) {
          authentication = await computeObsAuth(obsPassword, auth.salt, auth.challenge);
        }
        ws.send(JSON.stringify({
          op: 1,
          d:  { rpcVersion: 1, ...(authentication ? { authentication } : {}) },
        }));
      }

      if (op === 2) {
        // Identified — conexão estabelecida
        if (!mountedRef.current) return;
        retryCount.current = 0;
        setObs((p) => ({
          ...p,
          connected: true,
          error:     null,
          version:   String(d.negotiatedRpcVersion ?? ""),
        }));
        await fetchStatus();
        if (statusTimerRef.current) clearInterval(statusTimerRef.current);
        statusTimerRef.current = setInterval(() => void fetchStatus(), STATUS_POLL_INTERVAL);
      }

      if (op === 7) {
        // RequestResponse
        const reqId = String(d.requestId ?? "");
        const cb = pendingRequests.current.get(reqId);
        if (cb) {
          pendingRequests.current.delete(reqId);
          cb(d.responseData);
        }
      }

      if (op === 5) {
        // Event — atualizar estado em tempo real
        const eventType = String(d.eventType ?? "");
        if (eventType === "StreamStateChanged") {
          setObs((p) => ({ ...p, streaming: Boolean((d.eventData as Record<string, unknown>)?.outputActive) }));
        }
        if (eventType === "RecordStateChanged") {
          setObs((p) => ({ ...p, recording: Boolean((d.eventData as Record<string, unknown>)?.outputActive) }));
        }
        if (eventType === "CurrentProgramSceneChanged") {
          setObs((p) => ({ ...p, currentScene: String((d.eventData as Record<string, unknown>)?.sceneName ?? "") }));
        }
      }
    };

    ws.onerror = () => {
      /* Network error — onclose handles reconnect */
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      if (statusTimerRef.current) { clearInterval(statusTimerRef.current); statusTimerRef.current = null; }
      setObs((p) => ({ ...p, connected: false, streaming: false, recording: false }));

      if (retryCount.current < MAX_RETRIES) {
        retryCount.current++;
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      } else {
        setObs((p) => ({ ...p, error: "Ecclesia Studio não encontrado neste computador" }));
      }
    };
  }, [obsUrl, obsPassword, fetchStatus]);

  // ── Mount / Unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controles ─────────────────────────────────────────────────────────────

  const startStream  = useCallback(() => sendRequest("StartStream").catch(() => {}),     [sendRequest]);
  const stopStream   = useCallback(() => sendRequest("StopStream").catch(() => {}),      [sendRequest]);
  const startRecord  = useCallback(() => sendRequest("StartRecord").catch(() => {}),     [sendRequest]);
  const stopRecord   = useCallback(() => sendRequest("StopRecord").catch(() => {}),      [sendRequest]);
  const setScene     = useCallback((name: string) =>
    sendRequest("SetCurrentProgramScene", { sceneName: name }).catch(() => {}), [sendRequest]);

  // Label amigável para a UI — sem termos técnicos
  const obsLabel = obs.connected
    ? obs.streaming && obs.recording ? "Ecclesia Studio: Ao vivo e gravando"
    : obs.streaming ? "Ecclesia Studio: Transmitindo"
    : obs.recording ? "Ecclesia Studio: Gravando"
    : "Ecclesia Studio conectado"
    : "Ecclesia Studio offline";

  return { obs, obsLabel, startStream, stopStream, startRecord, stopRecord, setScene };
}
