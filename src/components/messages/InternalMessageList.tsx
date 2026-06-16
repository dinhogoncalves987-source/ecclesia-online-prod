import { useState } from "react";
import { InternalMessageBubble } from "@/components/messages/InternalMessageBubble";
import { useLanguage } from "@/hooks/useLanguage";
import type { InternalMessage } from "@/lib/internalMessages";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

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

type Props = {
  messages: InternalMessage[];
  loading?: boolean;
  /** ID do usuário atual — necessário para "Apagar para mim" */
  currentUserId?: string | null;
  /** Staff ou autor pode apagar para todos */
  canDeleteForAll?: boolean;
  deleting?: boolean;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
};

export function InternalMessageList({
  messages,
  loading = false,
  currentUserId,
  canDeleteForAll = false,
  deleting = false,
  onDeleteMessage,
}: Props) {
  const { t } = useLanguage();
  const bottomRef = useRef<HTMLDivElement>(null);

  // IDs ocultos localmente (para mim)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() =>
    loadHiddenIds(currentUserId),
  );

  // Resincroniza se o usuário mudar (ex: troca de conta)
  useEffect(() => {
    setHiddenIds(loadHiddenIds(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 space-y-2">
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
          />
        );
      })}
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}
