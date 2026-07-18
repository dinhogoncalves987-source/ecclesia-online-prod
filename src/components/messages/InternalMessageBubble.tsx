import { EyeOff, Forward, MoreVertical, Share2, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { InternalMessage } from "@/lib/internalMessages";
import { shareInternalMessage } from "@/lib/shareMedia";
import { cn } from "@/lib/utils";

type DeleteTarget = "for-me" | "for-all" | null;

type Props = {
  message: InternalMessage;
  /** Staff ou própria mensagem pode apagar para todos */
  canDeleteForAll?: boolean;
  deleting?: boolean;
  onDeleteForAll?: (messageId: string) => void | Promise<void>;
  /** Callback chamado quando usuário escolhe "Apagar para mim" */
  onHideForMe?: (messageId: string) => void;
  /** Abre o seletor de conversa para reenviar esta mensagem (like WhatsApp) */
  onForward?: (message: InternalMessage) => void;
};

export function InternalMessageBubble({
  message,
  canDeleteForAll = false,
  deleting = false,
  onDeleteForAll,
  onHideForMe,
  onForward,
}: Props) {
  const { lang, t } = useLanguage();
  const { toast } = useToast();
  const [confirmTarget, setConfirmTarget] = useState<DeleteTarget>(null);
  const canForward = Boolean(onForward) && (Boolean(message.body) || message.attachments.length > 0);

  const handleShare = async () => {
    const result = await shareInternalMessage(message);
    if (result.ok && result.method === "clipboard") {
      toast({ title: t("Link copiado"), description: t("Cole em qualquer app para compartilhar.") });
    } else if (!result.ok && result.error !== "cancelled") {
      toast({
        title: t("Não foi possível compartilhar"),
        description: t("Seu navegador não tem suporte a compartilhamento nativo."),
        variant: "destructive",
      });
    }
  };

  const isOwn = message.isOwn ?? false;
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  const time = new Date(message.createdAt).toLocaleTimeString(dateLoc, {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Neste ponto a mensagem já não é "system" nem "deleted" (early returns acima),
  // então sempre há ao menos a opção de compartilhar.
  const showActionsMenu = true;

  /* ── Mensagem do sistema ─────────────────────────────────────────────────── */
  if (message.messageType === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-muted-foreground bg-secondary/60 px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    );
  }

  /* ── Mensagem apagada (para todos) ──────────────────────────────────────── */
  if (message.messageType === "deleted") {
    return (
      <div className={cn("flex w-full", isOwn ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[72%] rounded-2xl px-3 py-2",
            isOwn ? "rounded-br-md bg-primary/20" : "rounded-bl-md bg-secondary/40",
          )}
        >
          <p className="text-xs italic text-muted-foreground flex items-center gap-1.5">
            <EyeOff size={12} className="flex-shrink-0 opacity-60" />
            {t("Mensagem apagada")}
          </p>
          <p
            className={cn(
              "text-[10px] mt-0.5 text-right tabular-nums",
              isOwn ? "text-primary-foreground/40" : "text-muted-foreground/50",
            )}
          >
            {time}
          </p>
        </div>
      </div>
    );
  }

  /* ── Confirmação de apagar ───────────────────────────────────────────────── */
  const handleConfirm = async () => {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (target === "for-all") {
      await onDeleteForAll?.(message.id);
    } else if (target === "for-me") {
      onHideForMe?.(message.id);
    }
  };

  /* ── Menu ⋮ via DropdownMenu Radix (rende em portal, sem corte) ─────────── */
  const MenuButton = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label={t("Opções da mensagem")}
        >
          <MoreVertical size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isOwn ? "end" : "start"}
        side="top"
        sideOffset={4}
        className="min-w-[180px] z-[9999]"
      >
        <DropdownMenuItem className="gap-2.5 cursor-pointer" onSelect={() => void handleShare()}>
          <Share2 size={14} className="text-muted-foreground flex-shrink-0" />
          {t("Compartilhar")}
        </DropdownMenuItem>
        {(Boolean(onHideForMe) || (canDeleteForAll && Boolean(onDeleteForAll))) && <DropdownMenuSeparator />}
        {Boolean(onHideForMe) && (
          <DropdownMenuItem
            className="gap-2.5 cursor-pointer"
            onSelect={() => setConfirmTarget("for-me")}
          >
            <EyeOff size={14} className="text-muted-foreground flex-shrink-0" />
            {t("Apagar para mim")}
          </DropdownMenuItem>
        )}
        {canDeleteForAll && Boolean(onDeleteForAll) && (
          <DropdownMenuItem
            className="gap-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            onSelect={() => setConfirmTarget("for-all")}
          >
            <Trash2 size={14} className="flex-shrink-0" />
            {t("Apagar para todos")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2.5 cursor-pointer text-muted-foreground">
          {t("Cancelar")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /* ── Botão de reenviar (seta estilo WhatsApp, sempre visível junto ao ⋮) ── */
  const ForwardButton = () => (
    <button
      type="button"
      onClick={() => onForward?.(message)}
      className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      aria-label={t("Reenviar mensagem")}
      title={t("Reenviar")}
    >
      <Forward size={14} />
    </button>
  );

  /* ── Bubble normal ───────────────────────────────────────────────────────── */
  return (
    <>
      <div className={cn("flex w-full group items-end gap-1", isOwn ? "justify-end" : "justify-start")}>
        {/* Menu lado esquerdo (mensagens dos outros) */}
        {!isOwn && (
          <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity self-end pb-2">
            {canForward && <ForwardButton />}
            {showActionsMenu && <MenuButton />}
          </div>
        )}

        <div
          className={cn(
            "relative max-w-[85%] sm:max-w-[72%] md:max-w-[65%] rounded-2xl px-3 py-2 shadow-sm",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-secondary text-foreground rounded-bl-md",
          )}
        >
          {/* Nome do remetente (para mensagens de outros) */}
          {!isOwn && message.senderName && (
            <p className="text-[10px] font-semibold mb-0.5 opacity-80">{message.senderName}</p>
          )}

          {/* Corpo da mensagem */}
          {message.body ? (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
          ) : null}

          {/* Anexos */}
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

          {/* Timestamp */}
          <p
            className={cn(
              "text-[10px] mt-1 text-right tabular-nums",
              isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </p>
        </div>

        {/* Menu lado direito (mensagens próprias) */}
        {isOwn && (
          <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity self-end pb-2">
            {showActionsMenu && <MenuButton />}
            {canForward && <ForwardButton />}
          </div>
        )}
      </div>

      {/* ── Diálogo de confirmação ─────────────────────────────────────────── */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget === "for-me"
                ? t("Apagar para você?")
                : t("Apagar para todos?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget === "for-me"
                ? t("A mensagem será ocultada apenas para você. Os outros participantes continuarão vendo.")
                : t("A mensagem será substituída por \"Mensagem apagada\" para todos na conversa.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className={
                confirmTarget === "for-all"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {confirmTarget === "for-me" ? t("Ocultar para mim") : t("Apagar para todos")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
