import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PresenceContextValue = {
  isOnline: (userId?: string | null) => boolean;
  onlineUserIds: Set<string>;
};

const PresenceContext = createContext<PresenceContextValue>({
  isOnline: () => false,
  onlineUserIds: new Set(),
});

/**
 * Presença real em tempo real por organização, via Supabase Realtime
 * Presence — canal efêmero (sem tabela): cada cliente conectado transmite
 * "estou online" enquanto o WebSocket estiver aberto; ao desconectar
 * (fechar aba, perder rede), o Realtime remove automaticamente o usuário
 * do estado de presença dos demais participantes.
 *
 * Também mantém um heartbeat real (RPC touch_user_presence) que grava
 * profiles.last_seen_at, usado para "visto por último" quando o usuário
 * não estiver online agora.
 *
 * Regra obrigatória do produto: não existe opção de ocultar online/visto
 * por último — este provider sempre rastreia e transmite a presença de
 * quem está autenticado, sem qualquer opt-out. Deve ser montado uma única
 * vez (ex: AdminLayout) para toda a sessão do usuário.
 */
export function PresenceProvider({
  organizationId,
  currentUserId,
  children,
}: {
  organizationId?: string | null;
  currentUserId?: string | null;
  children: React.ReactNode;
}) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!organizationId || !currentUserId) {
      setOnlineUserIds(new Set());
      return;
    }

    const channel = supabase.channel(`presence:org:${organizationId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnlineUserIds(new Set(Object.keys(state)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    const touch = () => { void supabase.rpc("touch_user_presence" as never); };
    touch();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") touch();
    }, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        touch();
        void channel.track({ online_at: new Date().toISOString() });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [organizationId, currentUserId]);

  const isOnline = useCallback(
    (userId?: string | null) => Boolean(userId && onlineUserIds.has(userId)),
    [onlineUserIds],
  );

  return (
    <PresenceContext.Provider value={{ isOnline, onlineUserIds }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceStatus(): PresenceContextValue {
  return useContext(PresenceContext);
}
