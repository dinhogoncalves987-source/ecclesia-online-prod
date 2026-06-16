import { useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InternalAttachmentButton } from "@/components/messages/InternalAttachmentButton";
import { InternalAudioRecorder } from "@/components/messages/InternalAudioRecorder";
import { useLanguage } from "@/hooks/useLanguage";

type Props = {
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  onSend: (text: string, file?: File) => void | Promise<void>;
};

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

  const showMic = !disabled && !pendingFile && text.trim().length === 0;

  return (
    <div className="flex-shrink-0 border-t border-border/50 bg-card px-2 sm:px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {pendingFile ? (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs text-muted-foreground truncate flex-1">{pendingFile.name}</span>
          <button
            type="button"
            onClick={() => setPendingFile(null)}
            className="p-1 rounded-full hover:bg-secondary text-muted-foreground"
            aria-label={t("Remover anexo")}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-1 w-full">
        <InternalAttachmentButton
          disabled={disabled || sending}
          onFileSelect={(file) => setPendingFile(file)}
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? t("Escreva uma mensagem...")}
          rows={1}
          disabled={disabled || sending}
          className="flex-1 min-w-0 max-h-32 resize-none rounded-2xl border border-border/50 bg-secondary/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />

        {showMic ? (
          <InternalAudioRecorder
            disabled={disabled || sending}
            onAudioReady={handleAudioReady}
          />
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 flex-shrink-0 rounded-full"
            disabled={!canSend}
            onClick={() => void handleSend()}
            aria-label={t("Enviar")}
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        )}
      </div>
    </div>
  );
}
