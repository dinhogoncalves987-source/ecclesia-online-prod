import { useState } from "react";
import { InternalMessageBubble } from "@/components/messages/InternalMessageBubble";
import { useLanguage } from "@/hooks/useLanguage";
import type { InternalMessage } from "@/lib/internalMessages";
import { ArrowDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useCallback } from "react";

// ── LocalStorage helper para "Apagar para mim" ───────────────────────────────
function getHiddenKey(userId: string) {
  return `ec_hidden_msg_${userId}`;
}

function loadHiddenIds(userId: string | null | undefined): Set<string> {
  if (!userId) return new Set();
  try {
    const stored = localStorage.getItem(getHiddenKey(userId));
    return new Set(stored ? (JSON.parse(stored) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveHiddenIds(userId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(getHiddenKey(userId), JSON.stringify(Array.from(ids)));
  } catch { /* ignore */ }
}

// Distância (px) do fundo a partir da qual consideramos "o usuário está lendo mensagens antigas"
const NEAR_BOTTOM_THRESHOLD = 120;

type Props = {
  messages: InternalMessage[];
  loading?: boolean;
  /** ID do usuário atual — necessário para "Apagar para mim" */
  currentUserId?: string | null;
  /** Staff ou autor pode apagar para todos */
  canDeleteForAll?: boolean;
  deleting?: boolean;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
  /** Abre o seletor de conversa para reenviar (like WhatsApp) */
  onForwardMessage?: (message: InternalMessage) => void;
};

export function InternalMessageList({
  messages,
  loading = false,
  currentUserId,
  canDeleteForAll = false,
  deleting = false,
  onDeleteMessage,
  onForwardMessage,
}: Props) {
  const { t } = useLanguage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasRenderedOnceRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // IDs ocultos localmente (para mim)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() =>
    loadHiddenIds(currentUserId),
  );

  // Resincroniza se o usuário mudar (ex: troca de conta)
  useEffect(() => {
    setHiddenIds(loadHiddenIds(currentUserId));
  }, [currentUserId]);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    setNewMessagesCount(0);
    setShowJumpButton(false);
  }, []);

  // Rolagem automática:
  //  - primeira renderização da thread → salta direto para o final (sem animação);
  //  - mensagem própria enviada → sempre rola para o final;
  //  - mensagem recebida e usuário já próximo do fim → rola para o final;
  //  - usuário lendo mensagens antigas → NÃO arranca da posição, mostra botão.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    const isNewLast = last.id !== lastMessageIdRef.current;
    lastMessageIdRef.current = last.id;

    if (!hasRenderedOnceRef.current) {
      hasRenderedOnceRef.current = true;
      scrollToBottom("auto");
      return;
    }

    if (!isNewLast) return;

    if (last.isOwn || isNearBottom()) {
      scrollToBottom("smooth");
    } else {
      setNewMessagesCount((c) => c + 1);
      setShowJumpButton(true);
    }
  }, [messages, isNearBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (isNearBottom()) {
      setShowJumpButton(false);
      setNewMessagesCount(0);
    }
  }, [isNearBottom]);

  const handleHideForMe = (messageId: string) => {
    if (!currentUserId) return;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      saveHiddenIds(currentUserId, next);
      return next;
    });
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleMessages = messages.filter(
    (m) => !hiddenIds.has(m.id),
  );

  if (visibleMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-sm text-muted-foreground text-center">{t("Nenhuma mensagem ainda")}</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 space-y-2"
      >
        {visibleMessages.map((message) => {
          const allowDeleteForAll =
            (canDeleteForAll || Boolean(message.isOwn)) &&
            message.messageType !== "system" &&
            message.messageType !== "deleted";

          return (
            <InternalMessageBubble
              key={message.id}
              message={message}
              canDeleteForAll={allowDeleteForAll}
              deleting={deleting}
              onDeleteForAll={allowDeleteForAll ? onDeleteMessage : undefined}
              onHideForMe={
                message.messageType !== "system" && message.messageType !== "deleted"
                  ? handleHideForMe
                  : undefined
              }
              onForward={
                onForwardMessage && message.messageType !== "system" && message.messageType !== "deleted"
                  ? onForwardMessage
                  : undefined
              }
            />
          );
        })}
        <div ref={bottomRef} aria-hidden />
      </div>

      {/* Botão "Novas mensagens" — só aparece se o usuário está lendo mensagens antigas */}
      {showJumpButton && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium pl-3 pr-2.5 py-1.5 shadow-lg hover:opacity-90 transition-opacity"
        >
          {newMessagesCount > 0
            ? `${newMessagesCount} ${newMessagesCount === 1 ? t("nova mensagem") : t("novas mensagens")}`
            : t("Novas mensagens")}
          <ArrowDown size={13} />
        </button>
      )}
    </div>
  );
}
