import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchThreadMessages,
  mapDbAttachmentToUi,
  mapDbMessageToUi,
  markThreadMessagesRead,
  type DbInternalAttachmentRow,
  type DbInternalMessageRow,
  type InternalMessage,
} from "@/lib/internalMessages";
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  // ── Mark messages as read when thread opens or new messages arrive ──────────
  // Fires after messages load and whenever the message count changes (new arrivals).
  // The 400ms delay lets the UI settle before calling the RPC.
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!organizationId || !threadId || !currentUserId || !enabled) return;

    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      void markThreadMessagesRead(threadId, organizationId);
    }, 400);

    return () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, threadId, currentUserId, enabled, messages.length]);

  // ── Realtime: INSERT (new messages) + UPDATE (read_at changes) ──────────────
  useEffect(() => {
    if (!organizationId || !threadId || !enabled) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `internal_messages:thread:${threadId}`;

    const channel = supabase
      .channel(channelName)
      // ── New messages ──────────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const row = payload.new as DbInternalMessageRow;

          // Own messages already added optimistically by send()
          if (row.sender_user_id && row.sender_user_id === currentUserId) return;

          // Fetch sender display name
          let senderName = "Membro";
          if (row.sender_user_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", row.sender_user_id)
              .maybeSingle();
            const p = profile as { full_name?: string | null } | null;
            if (p?.full_name) senderName = p.full_name;
          }

          // Fetch attachments (empty for plain text)
          let attachments: ReturnType<typeof mapDbAttachmentToUi>[] = [];
          const { data: attRows } = await supabase
            .from("internal_message_attachments")
            .select("*")
            .eq("message_id", row.id);
          if (attRows) {
            attachments = (attRows as DbInternalAttachmentRow[]).map(mapDbAttachmentToUi);
          }

          const msg: InternalMessage = {
            ...mapDbMessageToUi(row, attachments),
            senderName,
            isOwn: false,
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      // ── read_at changes (✓✓ indicator for sent messages) ─────────────────
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "internal_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as DbInternalMessageRow;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, readAt: updated.read_at } : m,
            ),
          );
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [organizationId, threadId, currentUserId, enabled]);

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
        setMessages((prev) => {
          if (prev.some((m) => m.id === result.message!.id)) return prev;
          return [...prev, result.message!];
        });
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, messageType: "deleted" as const, body: null, attachments: [] }
              : m,
          ),
        );
      }

      return result;
    },
    [organizationId],
  );

  return { messages, loading, sending, deleting, fromDatabase, refetch, send, remove };
}
