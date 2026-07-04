import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  addGroupParticipant,
  createChatGroup,
  fetchGroupParticipants,
  fetchUserChatGroups,
  removeGroupParticipant,
  type ChatGroup,
  type ChatGroupParticipant,
  type ChatGroupRole,
  type ChatGroupType,
} from "@/lib/chatGroups";

type Options = {
  organizationId?: string;
  userId?: string | null;
  enabled?: boolean;
};

export function useChatGroups({ organizationId, userId, enabled = true }: Options) {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!organizationId || !userId || !enabled) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchUserChatGroups(organizationId, userId);
    setGroups(result);
    setLoading(false);
  }, [organizationId, userId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Realtime: monitor group updates ──────────────────────────────────────
  useEffect(() => {
    if (!organizationId || !enabled) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat_groups:org:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_groups",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => void load(),
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [organizationId, enabled, load]);

  const create = useCallback(
    async (
      name: string,
      groupType: ChatGroupType,
      description?: string,
    ) => {
      if (!organizationId || !userId) return { ok: false, error: "missing_context" };
      const result = await createChatGroup(organizationId, userId, name, groupType, description);
      if (result.ok && result.group) {
        setGroups((prev) => [...prev, result.group!]);
      }
      return result;
    },
    [organizationId, userId],
  );

  const addParticipant = useCallback(
    async (groupId: string, targetUserId: string, role?: ChatGroupRole) => {
      if (!organizationId) return false;
      return addGroupParticipant(groupId, targetUserId, organizationId, role);
    },
    [organizationId],
  );

  const removeParticipant = useCallback(
    async (groupId: string, targetUserId: string) => {
      return removeGroupParticipant(groupId, targetUserId);
    },
    [],
  );

  const getParticipants = useCallback(
    async (groupId: string): Promise<ChatGroupParticipant[]> => {
      return fetchGroupParticipants(groupId);
    },
    [],
  );

  return {
    groups,
    loading,
    refetch: load,
    create,
    addParticipant,
    removeParticipant,
    getParticipants,
  };
}
