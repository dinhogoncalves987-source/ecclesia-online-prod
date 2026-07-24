/**
 * useVoiceActivityDetector — Sensor local de atividade de voz.
 *
 * Analisa somente o volume do microfone localmente via Web Audio API.
 *
 * NUNCA grava, armazena ou envia:
 *  - áudio bruto
 *  - streams de áudio
 *  - blobs
 *  - transcrições
 *  - conteúdo falado
 *
 * Emite apenas eventos de volume/presença de fala via Supabase Realtime:
 *  - speaking_detected  (após minSpeechMs de fala contínua)
 *  - speaking_stopped   (após holdSilenceMs de silêncio)
 *  - audio_level        (throttled a audioLevelEmitMs)
 *
 * Ativado somente quando: stream + liveSessionId + deviceId + active = true.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VoiceActivityOptions {
  stream:              MediaStream | null;
  liveSessionId:       string | null;
  deviceId:            string;
  /** Ativar somente quando câmera estiver connected ou live. */
  active:              boolean;
  /** dB abaixo do qual é considerado silêncio. Default: -25 */
  thresholdDb?:        number;
  /** ms de fala contínua antes de emitir speaking_detected. Default: 1200 */
  minSpeechMs?:        number;
  /** ms de silêncio antes de emitir speaking_stopped. Default: 2000 */
  holdSilenceMs?:      number;
  /** Cooldown mínimo entre speaking_detected consecutivos. Default: 1500 */
  speakingEmitCooldownMs?: number;
  /** Throttle de audio_level broadcasts. Default: 300 */
  audioLevelEmitMs?:   number;
}

export function useVoiceActivityDetector(opts: VoiceActivityOptions): void {
  const {
    stream,
    liveSessionId,
    deviceId,
    active,
    thresholdDb            = -25,
    minSpeechMs            = 1200,
    holdSilenceMs          = 2000,
    speakingEmitCooldownMs = 1500,
    audioLevelEmitMs       = 300,
  } = opts;

  const rafRef              = useRef<number | null>(null);
  const audioCtxRef         = useRef<AudioContext | null>(null);
  const analyserRef         = useRef<AnalyserNode | null>(null);
  const sourceRef           = useRef<MediaStreamAudioSourceNode | null>(null);

  // Timing state (não causa re-render — só lógica interna)
  const speechStartRef      = useRef<number | null>(null);
  const silenceStartRef     = useRef<number | null>(null);
  const isSpeakingRef       = useRef(false);
  const lastLevelEmitRef    = useRef(0);
  const lastSpeakingEmitRef = useRef(0);

  useEffect(() => {
    const shouldRun =
      active &&
      !!stream &&
      !!liveSessionId &&
      !!deviceId &&
      typeof AudioContext !== "undefined";

    if (!shouldRun) return;

    // Verificar se há track de áudio válido
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length || !audioTracks[0].enabled) return;

    // Criar AudioContext + Analyser
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return; // sem suporte → sair silenciosamente
    }
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    analyserRef.current = analyser;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray    = new Float32Array(bufferLength);

    // Usar um channel efêmero para broadcast (não precisamos de subscribe)
    const realtimeChannel = supabase.channel(`production:${liveSessionId}`);

    // ── Loop de análise ───────────────────────────────────────────────────────

    function tick() {
      rafRef.current = requestAnimationFrame(tick);

      analyser.getFloatTimeDomainData(dataArray);

      // Calcular RMS (volume médio)
      let sumSq = 0;
      for (let i = 0; i < bufferLength; i++) {
        sumSq += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSq / bufferLength);
      const db  = rms > 0 ? 20 * Math.log10(rms) : -160;

      const isSoundAboveThreshold = db >= thresholdDb;
      const now = Date.now();

      // ── Normalizar level 0–1 ─────────────────────────────────────────────
      const minDb = -60;
      const level = Math.max(0, Math.min(1, (db - minDb) / (thresholdDb - minDb)));

      // ── Throttle audio_level ─────────────────────────────────────────────
      if (now - lastLevelEmitRef.current >= audioLevelEmitMs) {
        lastLevelEmitRef.current = now;
        void realtimeChannel.send({
          type:    "broadcast",
          event:   "audio_level",
          payload: {
            event:        "audio_level",
            live_session_id: liveSessionId,
            device_id:    deviceId,
            level:        Math.round(level * 100) / 100,
            is_speaking:  isSpeakingRef.current,
            timestamp:    now,
          },
        });
      }

      // ── Detectar fala ────────────────────────────────────────────────────
      if (isSoundAboveThreshold) {
        silenceStartRef.current = null; // resetar contador de silêncio

        if (speechStartRef.current === null) {
          speechStartRef.current = now; // início da fala
        }

        const speechDuration = now - speechStartRef.current;

        // Emitir speaking_detected após minSpeechMs + cooldown
        if (
          speechDuration >= minSpeechMs &&
          now - lastSpeakingEmitRef.current >= speakingEmitCooldownMs
        ) {
          lastSpeakingEmitRef.current = now;
          if (!isSpeakingRef.current) isSpeakingRef.current = true;

          void realtimeChannel.send({
            type:    "broadcast",
            event:   "speaking_detected",
            payload: {
              event:        "speaking_detected",
              live_session_id: liveSessionId,
              device_id:    deviceId,
              timestamp:    now,
            },
          });
        }
      } else {
        speechStartRef.current = null; // resetar contador de fala

        if (isSpeakingRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now; // início do silêncio
          }

          const silenceDuration = now - silenceStartRef.current;

          if (silenceDuration >= holdSilenceMs) {
            isSpeakingRef.current   = false;
            silenceStartRef.current = null;

            void realtimeChannel.send({
              type:    "broadcast",
              event:   "speaking_stopped",
              payload: {
                event:        "speaking_stopped",
                live_session_id: liveSessionId,
                device_id:    deviceId,
                timestamp:    now,
              },
            });
          }
        }
      }
    }

    // Aguardar AudioContext estar pronto (pode estar suspended em alguns navegadores)
    const startLoop = () => { rafRef.current = requestAnimationFrame(tick); };
    if (ctx.state === "suspended") {
      void ctx.resume().then(startLoop);
    } else {
      startLoop();
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      void ctx.close().catch(() => {});
      void supabase.removeChannel(realtimeChannel);
      speechStartRef.current   = null;
      silenceStartRef.current  = null;
      isSpeakingRef.current    = false;
      lastLevelEmitRef.current = 0;
      lastSpeakingEmitRef.current = 0;
    };
  // Apenas re-criar quando dependências essenciais mudarem
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stream, liveSessionId, deviceId]);
}
