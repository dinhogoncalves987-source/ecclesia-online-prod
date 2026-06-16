import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  onAudioReady: (file: File) => void | Promise<void>;
};

export function InternalAudioRecorder({ disabled = false, onAudioReady }: Props) {
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    if (disabled || recording || preparing) return;
    setPreparing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
        stream.getTracks().forEach((t) => t.stop());
        void onAudioReady(file);
      };

      mediaRef.current = recorder;
      recorder.start(100);
      setRecording(true);
    } catch {
      // Microfone negado ou indisponível — falha silenciosa
    } finally {
      setPreparing(false);
    }
  }, [disabled, recording, preparing, onAudioReady]);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    mediaRef.current = null;
    setRecording(false);
  }, []);

  return (
    <button
      type="button"
      disabled={disabled || preparing}
      onClick={recording ? stop : () => void start()}
      className={cn(
        "h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-150",
        recording
          ? "bg-destructive text-destructive-foreground scale-110"
          : "hover:bg-secondary text-muted-foreground",
        (disabled || preparing) && "opacity-50 cursor-not-allowed",
      )}
      aria-label={recording ? "Parar gravação" : "Gravar áudio"}
      title={recording ? "Parar gravação (clique para enviar)" : "Gravar áudio"}
    >
      {preparing ? (
        <Loader2 size={16} className="animate-spin" />
      ) : recording ? (
        <Square size={14} fill="currentColor" className="animate-pulse" />
      ) : (
        <Mic size={16} />
      )}
    </button>
  );
}
