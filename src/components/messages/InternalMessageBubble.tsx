import { useState } from "react";
import { Trash2 } from "lucide-react";
import { InternalAudioPreview } from "@/components/messages/InternalAudioPreview";
import { InternalDocumentPreview } from "@/components/messages/InternalDocumentPreview";
import { InternalImagePreview } from "@/components/messages/InternalImagePreview";
import { InternalVideoPreview } from "@/components/messages/InternalVideoPreview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/useLanguage";
import type { InternalMessage } from "@/lib/internalMessages";
import { cn } from "@/lib/utils";

type Props = {
  message: InternalMessage;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: (messageId: string) => void | Promise<void>;
};

export function InternalMessageBubble({
  message,
  canDelete = false,
  deleting = false,
  onDelete,
}: Props) {
  const { lang, t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isOwn = message.isOwn ?? false;
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  const time = new Date(message.createdAt).toLocaleTimeString(dateLoc, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (message.messageType === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-muted-foreground bg-secondary/60 px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    );
  }

  const handleConfirmDelete = async () => {
    setConfirmOpen(false);
    await onDelete?.(message.id);
  };

  return (
    <>
      <div className={cn("flex w-full group", isOwn ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "relative max-w-[85%] sm:max-w-[72%] md:max-w-[65%] rounded-2xl px-3 py-2 shadow-sm",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-secondary text-foreground rounded-bl-md",
          )}
        >
          {canDelete && onDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmOpen(true)}
              className={cn(
                "absolute -top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity",
                "h-6 w-6 rounded-full flex items-center justify-center",
                isOwn ? "-left-2 bg-destructive text-destructive-foreground" : "-right-2 bg-destructive text-destructive-foreground",
              )}
              aria-label={t("Excluir mensagem")}
            >
              <Trash2 size={12} />
            </button>
          ) : null}

          {!isOwn && message.senderName && (
            <p className="text-[10px] font-semibold mb-0.5 opacity-80">{message.senderName}</p>
          )}

          {message.body ? (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
          ) : null}

          {message.attachments.map((att) => {
            if (message.messageType === "image" || att.fileType?.startsWith("image/")) {
              return <InternalImagePreview key={att.id} attachment={att} />;
            }
            if (message.messageType === "video" || att.fileType?.startsWith("video/")) {
              return <InternalVideoPreview key={att.id} attachment={att} />;
            }
            if (message.messageType === "audio" || att.fileType?.startsWith("audio/")) {
              return <InternalAudioPreview key={att.id} attachment={att} />;
            }
            return <InternalDocumentPreview key={att.id} attachment={att} />;
          })}

          <p
            className={cn(
              "text-[10px] mt-1 text-right tabular-nums",
              isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </p>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir mensagem?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Esta ação não poderá ser desfeita.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
