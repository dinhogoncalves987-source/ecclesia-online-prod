import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Loader2, Mic, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InternalAttachmentButton } from "@/components/messages/InternalAttachmentButton";
import { InternalAudioRecorder } from "@/components/messages/InternalAudioRecorder";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { isMobileViewport } from "@/lib/mobileScroll";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  const canSend = !disabled && !sending && (text.trim().length > 0 || Boolean(pendingFile));
  const showMic = !disabled && !pendingFile && text.trim().length === 0;

  // Auto-grow: adjust height whenever text changes
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`; // max ≈ 8 lines
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Alguns WebViews móveis reposicionam o cursor no início quando o textarea
  // controlado troca o botão de microfone pelo de envio no primeiro caractere.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const selection = selectionRef.current;
    if (!el || !selection || document.activeElement !== el) return;

    const max = el.value.length;
    el.setSelectionRange(
      Math.min(selection.start, max),
      Math.min(selection.end, max),
    );
  }, [text]);

  const rememberSelection = useCallback((el: HTMLTextAreaElement) => {
    selectionRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }, []);

  const handleSend = async () => {
    if (!canSend) return;
    const body = text.trim();
    const file = pendingFile ?? undefined;
    setText("");
    setPendingFile(null);
    await onSend(body, file);
    // Restore focus so user can keep typing immediately (WhatsApp behaviour)
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleAudioReady = async (file: File) => {
    await onSend("", file);
  };

  // Teclado mobile não pode cobrir o composer: quando o campo ganha foco,
  // aguarda a animação do teclado virtual e garante que o composer continue
  // visível (rola a própria caixa para dentro da área visível do viewport).
  const handleFocus = useCallback(() => {
    if (!isMobileViewport()) return;
    const scrollIntoView = () => {
      composerRootRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    };
    setTimeout(scrollIntoView, 300);
    window.visualViewport?.addEventListener("resize", scrollIntoView, { once: true });
  }, []);

  return (
    <div ref={composerRootRef} className="flex-shrink-0 border-t border-border/50 bg-card">
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
                <div
                  className="flex-1 flex items-end gap-0 rounded-2xl border border-border/50 bg-secondary/30 px-3 py-[7px] touch-manipulation"
                  // Toque em qualquer parte da caixa (ex: padding ao redor da
                  // textarea) sempre foca e abre o teclado — nunca depende de
                  // ter iniciado uma gravação de áudio antes. Isso corrige o
                  // caso em que o alvo exato do toque não é a própria
                  // textarea (ex: nas bordas/padding do balão).
                  onPointerDown={(e) => {
                    if (e.target !== textareaRef.current) {
                      e.preventDefault();
                      textareaRef.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => {
                      rememberSelection(e.currentTarget);
                      setText(e.currentTarget.value);
                    }}
                    onSelect={(e) => rememberSelection(e.currentTarget)}
                    placeholder={placeholder ?? t("Mensagem")}
                    rows={1}
                    disabled={disabled || sending}
                    spellCheck
                    autoComplete="on"
                    autoCorrect="on"
                    // enterKeyHint="send" faz o teclado virtual mobile mostrar
                    // o botão "Enviar" e dispara um keydown "Enter" confiável
                    // na maioria dos navegadores/IMEs mobile modernos.
                    enterKeyHint="send"
                    inputMode="text"
                    dir="ltr"
                    className="flex-1 min-w-0 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 leading-5 overflow-y-auto touch-manipulation"
                    style={{ maxHeight: "128px" }}
                    onFocus={handleFocus}
                    onKeyDown={(e) => {
                      // Ignora Enter durante composição de IME (acentos, chinês/japonês, etc.)
                      if (e.nativeEvent.isComposing) return;
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
