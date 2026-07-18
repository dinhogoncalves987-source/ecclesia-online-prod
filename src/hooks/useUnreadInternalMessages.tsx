import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Badge de mensagens não lidas do chat interno (internal_messages).
 *
 * Contagem via SELECT simples — a RLS de "internal messages thread read"
 * já restringe às threads que o usuário pode ver, então não precisamos
 * replicar a lógica de visibilidade aqui.
 *
 * Atualização quase em tempo real via Supabase Realtime (habilitado na
 * migration 20260717210000) enquanto o app estiver aberto (aba em primeiro
 * ou segundo plano). Isso NÃO cobre o app totalmente fechado/encerrado —
 * isso exigiria Web Push (VAPID) + Service Worker, fora deste escopo.
 *
 * Quando suportado pelo navegador/PWA instalado, espelha a contagem no
 * ícone do app via Badging API (navigator.setAppBadge).
 */
export function useUnreadInternalMessages(organizationId?: string | null, userId?: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["internal-messages-unread-count", organizationId, userId];
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchUnreadCount = useCallback(async (): Promise<number> => {
    if (!organizationId || !userId) return 0;

    const { count, error } = await supabase
      .from("internal_messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("read_at", null)
      .neq("sender_user_id", userId);

    if (error) {
      console.warn("[useUnreadInternalMessages]", error.message);
      return 0;
    }

    return count ?? 0;
  }, [organizationId, userId]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey,
    queryFn: fetchUnreadCount,
    enabled: Boolean(organizationId && userId),
    // Fallback além do Realtime — cobre navegadores/abas onde o WebSocket
    // do Realtime cair silenciosamente.
    refetchInterval: 45_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!organizationId || !userId) return;

    const channel = supabase
      .channel(`internal-messages-unread-${organizationId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages", filter: `organization_id=eq.${organizationId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId]);

  // Badging API — ícone do app com número (PWA instalado / navegador compatível).
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;

    if (unreadCount > 0) {
      nav.setAppBadge(unreadCount).catch(() => { /* best-effort */ });
    } else {
      nav.clearAppBadge?.().catch(() => { /* best-effort */ });
    }
  }, [unreadCount]);

  return { unreadCount };
}
