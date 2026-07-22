import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const POLL_MS = 20_000;

/**
 * "Visto por último" atualizado enquanto a conversa está aberta, sem precisar
 * sair e voltar à tela.
 *
 * `profiles` não está na publication do Supabase Realtime (só
 * internal_messages/internal_threads estão), então não existe
 * postgres_changes disponível para observar `last_seen_at` em tempo real.
 * Como o valor já vem de um heartbeat de ~45s (touch_user_presence), um poll
 * leve de 20s aqui é suficiente para refletir o dado real sem esperar um
 * refetch completo da lista de conversas (que só acontece em eventos de
 * mensagem/thread, não quando alguém simplesmente fica offline).
 */
export function useLiveLastSeen(
  userId: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const [lastSeen, setLastSeen] = useState<string | null>(fallback ?? null);

  // Nova conversa/participante ou novo snapshot vindo da lista: adota como
  // ponto de partida (o poll só refina a partir daqui).
  useEffect(() => {
    setLastSeen(fallback ?? null);
  }, [userId, fallback]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const fetchLastSeen = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase
        .from("profiles")
        .select("last_seen_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled && !error && data?.last_seen_at) setLastSeen(data.last_seen_at);
    };

    const interval = setInterval(fetchLastSeen, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void fetchLastSeen(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  return lastSeen;
}
