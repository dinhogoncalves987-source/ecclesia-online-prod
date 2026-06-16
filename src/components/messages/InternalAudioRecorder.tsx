/**
 * InternalAudioRecorder — gerencia o MediaRecorder internamente.
 * Expõe estado de gravação e callbacks de controle para o compositor pai.
 */
import { useState, useRef, useCallback, useEffect } from "react";

export type AudioRecorderControls = {
  isRecording: boolean;
  isPreparing: boolean;
  elapsedSeconds: number;
  start: () => void;
  stopAndSend: () => void;
  cancel: () => void;
};

type Props = {
  disabled?: boolean;
  onAudioReady: (file: File) => void | Promise<void>;
  children: (controls: AudioRecorderControls) => React.ReactNode;
};

export function InternalAudioRecorder({ disabled = false, onAudioReady, children }: Props) {
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (disabled || recording || preparing) return;
    cancelledRef.current = false;
    setPreparing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setPreparing(false);
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimer();
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const ext = mimeType.includes("ogg") ? "ogg" : "webm";
          const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
          void onAudioReady(file);
        }
        chunksRef.current = [];
        setRecording(false);
        setElapsed(0);
      };

      mediaRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((s) => s + 1);
      }, 1000);
    } catch {
      // Microfone negado ou indisponível — falha silenciosa
    } finally {
      setPreparing(false);
    }
  }, [disabled, recording, preparing, onAudioReady]);

  const stopAndSend = useCallback(() => {
    if (!mediaRef.current || mediaRef.current.state === "inactive") return;
    cancelledRef.current = false;
    mediaRef.current.stop();
    mediaRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    mediaRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
  }, []);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimer();
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        try { mediaRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return (
    <>
      {children({
        isRecording: recording,
        isPreparing: preparing,
        elapsedSeconds: elapsed,
        start,
        stopAndSend,
        cancel,
      })}
    </>
  );
}
