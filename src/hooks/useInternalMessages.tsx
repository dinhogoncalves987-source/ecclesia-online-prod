import { useCallback, useEffect, useState } from "react";
import { fetchThreadMessages, type InternalMessage } from "@/lib/internalMessages";
import {
  deleteInternalMessage,
  sendInternalMessage,
  type SendMessagePayload,
} from "@/lib/internalMessageMutations";

type Options = {
  organizationId?: string;
  threadId?: string | null;
  currentUserId?: string | null;
  senderRole?: string | null;
  enabled?: boolean;
};

export function useInternalMessages({
  organizationId,
  threadId,
  currentUserId,
  senderRole,
  enabled = true,
}: Options) {
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fromDatabase, setFromDatabase] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId || !threadId || !enabled) {
      setMessages([]);
      setFromDatabase(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await fetchThreadMessages(organizationId, threadId, currentUserId);
    setMessages(result.messages);
    setFromDatabase(result.fromDatabase);
    setLoading(false);
  }, [organizationId, threadId, currentUserId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  const send = useCallback(
    async (payload: SendMessagePayload, file?: File) => {
      if (!organizationId || !threadId || !currentUserId) {
        return { ok: false as const, error: "not_authenticated" };
      }

      setSending(true);
      const result = await sendInternalMessage(
        organizationId,
        threadId,
        currentUserId,
        { ...payload, senderRole: payload.senderRole ?? senderRole ?? null },
        file,
      );
      setSending(false);

      if (result.ok && result.message) {
        setMessages((prev) => [...prev, result.message!]);
      }

      return result;
    },
    [organizationId, threadId, currentUserId, senderRole],
  );

  const remove = useCallback(
    async (messageId: string) => {
      if (!organizationId) return { ok: false as const, error: "missing_org" };

      setDeleting(true);
      const result = await deleteInternalMessage(organizationId, messageId);
      setDeleting(false);

      if (result.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }

      return result;
    },
    [organizationId],
  );

  return { messages, loading, sending, deleting, fromDatabase, refetch, send, remove };
}
