import { useState } from "react";
import { InternalChatHeader } from "@/components/messages/InternalChatHeader";
import { InternalChatLockedFooter } from "@/components/messages/InternalChatLockedFooter";
import { InternalMessageComposer } from "@/components/messages/InternalMessageComposer";
import { InternalMessageList } from "@/components/messages/InternalMessageList";
import { JitsiCallModal } from "@/components/messages/JitsiCallModal";
import { useInternalMessages } from "@/hooks/useInternalMessages";
import { useInternalCall } from "@/hooks/useInternalCall";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import { sendFirstCampaignMessage } from "@/lib/internalMessageMutations";
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
  /** Abre o seletor de conversa para reenviar (like WhatsApp) — só existe em modo inbox */
  onForwardMessage?: (message: InternalMessage) => void;
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
  onForwardMessage,
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { canonicalRole } = useRole();
  const { startCall, busy: callBusy, activeCall } = useInternalCall();
  const [threadBusy, setThreadBusy] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<InternalMessage[]>([]);
  const [meetingOpen, setMeetingOpen] = useState(false);

  // Uma thread de secretaria vinculada a um membro e sempre a conversa 1:1.
  // O usuario do membro pode ainda nao existir (convite nao ativado). Nesse
  // caso os icones continuam visiveis, mas desabilitados com uma explicacao,
  // em vez de desaparecerem e parecer que chamadas nao foram implantadas.
  const isDirect = Boolean(
    thread?.source === "secretariat"
    && thread.memberId
  );
  const hasCallableParticipant = Boolean(
    isDirect
    && thread?.participantUserId
    && currentUserId
    && thread.participantUserId !== currentUserId,
  );
  const canCall = Boolean(thread && hasCallableParticipant && !callBusy && !activeCall);
  const isMeeting = Boolean(thread?.source === "meeting" && thread.callRoomToken);

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

  // Chat WhatsApp-style: sempre aberto para quem tem permissão.
  // Sem conceito de "encerrar/reabrir" conversa.
  const canWrite = Boolean(currentUserId) && (isStaff || allowReplies);
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
        title: t("Não foi possível apagar"),
        description: t("Permissão negada pelo servidor. Contate o administrador do sistema para configurar as políticas de exclusão."),
        variant: "destructive",
      });
      return;
    }
    toast({ title: t("Mensagem apagada") });
    onThreadUpdated?.();
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
      <InternalChatHeader
        thread={thread}
        title={headerTitle}
        subtitle={subtitle}
        isStaff={isStaff}
        showBack={showBack}
        onBack={onBack}
        showCallActions={isDirect}
        callUnavailableReason={
          isDirect && !thread?.participantUserId
            ? t("Este membro precisa ativar o acesso ao aplicativo antes de receber ligações")
            : undefined
        }
        onVoiceCall={thread && canCall ? () => { void startCall(thread, "voice"); } : undefined}
        onVideoCall={thread && canCall ? () => { void startCall(thread, "video"); } : undefined}
        onJoinMeeting={thread && isMeeting ? () => setMeetingOpen(true) : undefined}
      />

      {/* Reunião de grupo explícita. Nunca é aberta pelos botões 1:1. */}
      {thread && isMeeting && thread.callRoomToken && (
        <JitsiCallModal
          open={meetingOpen}
          onClose={() => setMeetingOpen(false)}
          organizationId={organizationId}
          threadId={thread.id}
          callRoomToken={thread.callRoomToken}
          mode="video"
          displayName={
            (user?.user_metadata as Record<string, string> | undefined)?.full_name
            || user?.email?.split("@")[0]
            || "Participante"
          }
          callTitle={`Reunião: ${thread.subject}`}
          onBlocked={() => {
            setMeetingOpen(false);
            toast({
              title: t("Já existe uma chamada em andamento"),
              description: t("Encerre a chamada atual antes de entrar na reunião."),
              variant: "destructive",
            });
          }}
        />
      )}

      {displayMessages.length > 0 ? (
        <InternalMessageList
          messages={displayMessages}
          loading={loading && Boolean(thread?.id)}
          currentUserId={currentUserId}
          canDeleteForAll={isStaff}
          deleting={deleting}
          onDeleteMessage={handleDeleteMessage}
          onForwardMessage={onForwardMessage}
        />
      ) : (
        emptyHint ?? (
          <InternalMessageList
            messages={[]}
            loading={loading && Boolean(thread?.id)}
            currentUserId={currentUserId}
            canDeleteForAll={isStaff}
            deleting={deleting}
            onDeleteMessage={handleDeleteMessage}
            onForwardMessage={onForwardMessage}
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
