import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchThreadsBySource,
  fetchThreadUnreadCounts,
  mapDbThreadToUi,
  type DbInternalThreadRow,
  type InternalThread,
  type InternalThreadSource,
} from "@/lib/internalMessages";

type Options = {
  organizationId?: string;
  source?: InternalThreadSource;
  campaignId?: string;
  /** Used to skip badge increment for the thread the user is currently viewing. */
  currentUserId?: string | null;
  activeThreadId?: string | null;
  enabled?: boolean;
};

function sortByLastMessage(list: InternalThread[]): InternalThread[] {
  return [...list].sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0;
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export function useInternalThreads({
  organizationId,
  source,
  campaignId,
  currentUserId,
  activeThreadId,
  enabled = true,
}: Options) {
  const [threads, setThreads] = useState<InternalThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDatabase, setFromDatabase] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Stable ref so Realtime callbacks always see the latest activeThreadId
  // without needing to re-subscribe when selection changes.
  const activeThreadIdRef = useRef<string | null | undefined>(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!organizationId || !enabled) {
      setThreads([]);
      setFromDatabase(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await fetchThreadsBySource({ organizationId, source, campaignId });
    setThreads(result.threads);
    setFromDatabase(result.fromDatabase);
    setLoading(false);

    // Load unread counts right after the thread list (single RPC call)
    if (result.fromDatabase) {
      const counts = await fetchThreadUnreadCounts(organizationId);
      setUnreadCounts(counts);
    }
  }, [organizationId, source, campaignId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Realtime: thread UPDATEs + new message INSERTs for badge ───────────────
  useEffect(() => {
    if (!organizationId || !enabled) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `threads_and_badges:org:${organizationId}`;

    const channel = supabase
      .channel(channelName)
      // ── Thread metadata updates (last_message_at, status, etc.) ───────────
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "internal_threads",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const updated = payload.new as DbInternalThreadRow;

          // If a source filter is active, ignore threads of other sources
          if (source && updated.source !== source) return;

          setThreads((prev) => {
            const exists = prev.some((t) => t.id === updated.id);
            if (!exists) {
              return sortByLastMessage([mapDbThreadToUi(updated), ...prev]);
            }
            const next = prev.map((t) => {
              if (t.id !== updated.id) return t;
              return {
                ...mapDbThreadToUi(updated),
                participantName: t.participantName, // preserve enriched name
              };
            });
            return sortByLastMessage(next);
          });
        },
      )
      // ── New messages → increment badge for background threads ─────────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const row = payload.new as {
            thread_id: string;
            sender_user_id: string | null;
            message_type: string;
          };

          // Skip own messages
          if (row.sender_user_id && row.sender_user_id === currentUserId) return;
          // Skip system / deleted
          if (row.message_type === "system" || row.message_type === "deleted") return;
          // Skip if user is currently viewing this thread (they'll mark it read)
          if (activeThreadIdRef.current === row.thread_id) return;

          setUnreadCounts((prev) => ({
            ...prev,
            [row.thread_id]: (prev[row.thread_id] ?? 0) + 1,
          }));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [organizationId, source, currentUserId, enabled]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  /** Zero the badge for a thread the user just opened. */
  const zeroUnreadCount = useCallback((threadId: string) => {
    setUnreadCounts((prev) => ({ ...prev, [threadId]: 0 }));
  }, []);

  return { threads, loading, fromDatabase, refetch, unreadCounts, zeroUnreadCount };
}
