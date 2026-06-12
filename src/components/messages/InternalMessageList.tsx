import { InternalMessageBubble } from "@/components/messages/InternalMessageBubble";
import { useLanguage } from "@/hooks/useLanguage";
import type { InternalMessage } from "@/lib/internalMessages";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  messages: InternalMessage[];
  loading?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
};

export function InternalMessageList({
  messages,
  loading = false,
  canDelete = false,
  deleting = false,
  onDeleteMessage,
}: Props) {
  const { t } = useLanguage();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-sm text-muted-foreground text-center">{t("Nenhuma mensagem ainda")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 space-y-2">
      {messages.map((message) => (
        <InternalMessageBubble
          key={message.id}
          message={message}
          canDelete={canDelete && message.messageType !== "system"}
          deleting={deleting}
          onDelete={onDeleteMessage}
        />
      ))}
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}
