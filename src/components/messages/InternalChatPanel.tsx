import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { InternalChatHeader } from "@/components/messages/InternalChatHeader";
import { InternalChatLockedFooter } from "@/components/messages/InternalChatLockedFooter";
import { InternalMessageComposer } from "@/components/messages/InternalMessageComposer";
import { InternalMessageList } from "@/components/messages/InternalMessageList";
import { useInternalMessages } from "@/hooks/useInternalMessages";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import {
  closeInternalThread,
  reopenInternalThread,
  sendFirstCampaignMessage,
} from "@/lib/internalMessageMutations";
import type { InternalMessage, InternalThread } from "@/lib/internalMessages";

type Props = {
  organizationId: string;
  thread: InternalThread | null;
  currentUserId: string | null;
  allowReplies?: boolean;
  isStaff?: boolean;
  campaignId?: string;
  campaignTitle?: string;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onThreadCreated?: (thread: InternalThread) => void;
  onThreadUpdated?: () => void;
};

export function InternalChatPanel({
  organizationId,
  thread,
  currentUserId,
  allowReplies = true,
  isStaff = false,
  campaignId,
  campaignTitle,
  title,
  subtitle,
  showBack = false,
  onBack,
  onThreadCreated,
  onThreadUpdated,
}: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { canonicalRole } = useRole();
  const [threadBusy, setThreadBusy] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<InternalMessage[]>([]);

  const senderRole = isStaff ? (canonicalRole ?? "leader") : "member";

  const { messages, loading, sending, deleting, send, remove, refetch } = useInternalMessages({
    organizationId,
    threadId: thread?.id ?? null,
    currentUserId,
    senderRole,
    enabled: Boolean(thread?.id),
  });

  const displayMessages =
    thread?.id && messages.length > 0
      ? messages
      : pendingMessages.length > 0
        ? pendingMessages
        : messages;

  const threadClosed = thread?.status === "closed" || (thread != null && !thread.replyEnabled);
  // Staff sempre pode escrever; membro só se campanha permite e thread está aberta
  const canWrite = Boolean(currentUserId) && (isStaff || (allowReplies && !threadClosed));
  const memberLocked = !isStaff && !canWrite;
  const showComposer = canWrite;

  const headerTitle =
    title ?? campaignTitle ?? (isStaff ? t("Mensagens da campanha") : t("Falar com a equipe"));

  const handleSend = async (text: string, file?: File) => {
    if (!currentUserId) {
      toast({ title: t("Erro"), description: t("Tente novamente"), variant: "destructive" });
      return;
    }

    if (thread?.id) {
      const result = await send({ body: text }, file);
      if (!result.ok) {
        toast({
          title: t("Erro"),
          description: result.error ?? t("Tente novamente"),
          variant: "destructive",
        });
      }
      return;
    }

    if (campaignId) {
      setThreadBusy(true);
      const result = await sendFirstCampaignMessage({
        organizationId,
        campaignId,
        campaignTitle: campaignTitle ?? t("Campanha"),
        userId: currentUserId,
        body: text,
        senderRole,
        file,
      });
      setThreadBusy(false);

      if (!result.ok) {
        toast({
          title: t("Erro"),
          description: result.error ?? t("Tente novamente"),
          variant: "destructive",
        });
        return;
      }

      if (result.thread) onThreadCreated?.(result.thread);
      if (result.message) setPendingMessages((prev) => [...prev, result.message!]);
      onThreadUpdated?.();
      return;
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const result = await remove(messageId);
    if (!result.ok) {
      toast({
        title: t("Erro"),
        description: t("Não foi possível excluir a mensagem"),
        variant: "destructive",
      });
      return;
    }
    toast({ title: t("Mensagem excluída") });
    onThreadUpdated?.();
  };

  const handleClose = async () => {
    if (!thread) return;
    setThreadBusy(true);
    const result = await closeInternalThread(organizationId, thread.id);
    setThreadBusy(false);
    if (!result.ok) {
      toast({ title: t("Erro"), variant: "destructive" });
      return;
    }
    onThreadUpdated?.();
    await refetch();
  };

  const handleReopen = async () => {
    if (!thread) return;
    setThreadBusy(true);
    const result = await reopenInternalThread(organizationId, thread.id);
    setThreadBusy(false);
    if (!result.ok) {
      toast({ title: t("Erro"), variant: "destructive" });
      return;
    }
    onThreadUpdated?.();
    await refetch();
  };

  const renderEmptyHint = () => {
    // Sem thread ainda: sugerir envio da primeira mensagem apenas para quem pode escrever
    if (!thread && displayMessages.length === 0 && showComposer) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground max-w-sm">
            {t("Envie sua primeira mensagem para a equipe desta campanha.")}
          </p>
        </div>
      );
    }
    return null;
  };

  const emptyHint = renderEmptyHint();

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 h-full bg-background">
      {isStaff && thread ? (
        <InternalChatHeader
          thread={thread}
          title={headerTitle}
          subtitle={subtitle}
          isStaff={isStaff}
          showBack={showBack}
          onBack={onBack}
          onCloseThread={() => void handleClose()}
          onReopenThread={() => void handleReopen()}
          busy={threadBusy}
        />
      ) : (
        <div className="flex-shrink-0 border-b border-border/50 bg-card px-3 sm:px-4 py-3 min-h-[56px] flex items-center gap-2">
          {showBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden p-2 -ml-1 rounded-full hover:bg-secondary flex-shrink-0"
              aria-label={t("Voltar")}
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm sm:text-base truncate">{headerTitle}</h3>
            {subtitle ? (
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            ) : null}
          </div>
        </div>
      )}

      {displayMessages.length > 0 ? (
        <InternalMessageList
          messages={displayMessages}
          loading={loading && Boolean(thread?.id)}
          canDelete={isStaff}
          deleting={deleting}
          onDeleteMessage={handleDeleteMessage}
        />
      ) : (
        emptyHint ?? (
          <InternalMessageList
            messages={[]}
            loading={loading && Boolean(thread?.id)}
            canDelete={isStaff}
            deleting={deleting}
            onDeleteMessage={handleDeleteMessage}
          />
        )
      )}

      {showComposer ? (
        <InternalMessageComposer
          disabled={threadBusy}
          sending={sending || threadBusy}
          placeholder={t("Mensagem")}
          onSend={handleSend}
        />
      ) : memberLocked ? (
        <InternalChatLockedFooter />
      ) : null}
    </div>
  );
}
