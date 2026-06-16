import { useState } from "react";
import { Loader2, Mic, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InternalAttachmentButton } from "@/components/messages/InternalAttachmentButton";
import { InternalAudioRecorder } from "@/components/messages/InternalAudioRecorder";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  onSend: (text: string, file?: File) => void | Promise<void>;
};

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Barras de waveform animado estilo WhatsApp durante gravação */
const WAVE_HEIGHTS = [6, 10, 16, 8, 14, 10, 6, 12, 8, 14, 10, 6];

function AudioWaveform() {
  return (
    <div className="flex items-center gap-[2px]">
      {WAVE_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="ec-wave-bar inline-block w-[2.5px] rounded-full bg-red-500"
          style={{
            height: `${h}px`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

export function InternalMessageComposer({
  disabled = false,
  sending = false,
  placeholder,
  onSend,
}: Props) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const canSend = !disabled && !sending && (text.trim().length > 0 || Boolean(pendingFile));
  const showMic = !disabled && !pendingFile && text.trim().length === 0;

  const handleSend = async () => {
    if (!canSend) return;
    const body = text.trim();
    const file = pendingFile ?? undefined;
    setText("");
    setPendingFile(null);
    await onSend(body, file);
  };

  const handleAudioReady = async (file: File) => {
    await onSend("", file);
  };

  return (
    <div className="flex-shrink-0 border-t border-border/50 bg-card">
      <InternalAudioRecorder disabled={disabled || sending} onAudioReady={handleAudioReady}>
        {({ isRecording, isPreparing, elapsedSeconds, start, stopAndSend, cancel }) => {

          /* ── ESTADO GRAVANDO: barra estilo WhatsApp ───────────────────── */
          if (isRecording || isPreparing) {
            return (
              <div className="flex items-center gap-2 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">

                {/* Cancelar (lixeira) */}
                <button
                  type="button"
                  onClick={cancel}
                  title={t("Cancelar gravação")}
                  aria-label={t("Cancelar gravação")}
                  className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center bg-secondary/80 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                >
                  <Trash2 size={17} />
                </button>

                {/* Barra central: indicador + waveform + timer */}
                <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-2xl bg-secondary/40 border border-border/50">
                  {isPreparing ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">{t("Aguardando microfone...")}</span>
                    </>
                  ) : (
                    <>
                      {/* Ponto vermelho pulsante */}
                      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                      </span>

                      {/* Timer */}
                      <span className="text-sm font-mono tabular-nums text-foreground flex-shrink-0 min-w-[32px]">
                        {formatTime(elapsedSeconds)}
                      </span>

                      {/* Waveform animado */}
                      <div className="flex-1 flex items-center justify-center">
                        <AudioWaveform />
                      </div>
                    </>
                  )}
                </div>

                {/* Enviar */}
                <button
                  type="button"
                  disabled={isPreparing}
                  onClick={stopAndSend}
                  title={t("Enviar áudio")}
                  aria-label={t("Enviar áudio")}
                  className={cn(
                    "h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center transition-colors",
                    isPreparing
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:opacity-90 shadow-md",
                  )}
                >
                  <Send size={16} />
                </button>
              </div>
            );
          }

          /* ── ESTADO NORMAL ────────────────────────────────────────────── */
          return (
            <div className="px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {/* Prévia de arquivo pendente */}
              {pendingFile && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {pendingFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    className="p-1 rounded-full hover:bg-secondary text-muted-foreground"
                    aria-label={t("Remover anexo")}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-1.5">
                {/* Botão de anexo */}
                <InternalAttachmentButton
                  disabled={disabled || sending}
                  onFileSelect={(file) => setPendingFile(file)}
                />

                {/* Input + mic/enviar integrados */}
                <div className="flex-1 flex items-end gap-0 rounded-2xl border border-border/50 bg-secondary/30 overflow-hidden px-3 py-[7px]">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={placeholder ?? t("Mensagem")}
                    rows={1}
                    disabled={disabled || sending}
                    className="flex-1 min-w-0 max-h-32 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 leading-5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />

                  {/* Microfone (quando input vazio) ou Enviar (quando há texto) */}
                  {showMic ? (
                    <button
                      type="button"
                      disabled={disabled || sending}
                      onClick={() => void start()}
                      aria-label={t("Gravar áudio")}
                      title={t("Gravar áudio")}
                      className={cn(
                        "flex-shrink-0 ml-1 rounded-full flex items-center justify-center transition-colors self-end mb-0.5",
                        disabled || sending
                          ? "opacity-40 cursor-not-allowed text-muted-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Mic size={18} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!canSend}
                      onClick={() => void handleSend()}
                      aria-label={t("Enviar")}
                      className={cn(
                        "flex-shrink-0 ml-1 h-6 w-6 rounded-full flex items-center justify-center transition-colors self-end mb-0.5",
                        canSend
                          ? "bg-primary text-primary-foreground hover:opacity-90"
                          : "opacity-30 cursor-not-allowed bg-muted text-muted-foreground",
                      )}
                    >
                      {sending ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Send size={13} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </InternalAudioRecorder>
    </div>
  );
}
