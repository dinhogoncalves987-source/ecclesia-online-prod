import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchThreadsBySource,
  type InternalThread,
  type InternalThreadSource,
} from "@/lib/internalMessages";
import { supabase } from "@/integrations/supabase/client";

type Options = {
  organizationId?: string;
  source?: InternalThreadSource;
  campaignId?: string;
  currentUserId?: string | null;
  enabled?: boolean;
};

export function useInternalThreads({
  organizationId,
  source,
  campaignId,
  currentUserId,
  enabled = true,
}: Options) {
  const [threads, setThreads] = useState<InternalThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDatabase, setFromDatabase] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!organizationId || !enabled) {
      setThreads([]);
      setFromDatabase(false);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    const result = await fetchThreadsBySource({ organizationId, source, campaignId, currentUserId });
    setThreads(result.threads);
    setFromDatabase(result.fromDatabase);
    if (!silent) setLoading(false);
  }, [organizationId, source, campaignId, currentUserId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(async () => {
    await load(false);
  }, [load]);

  // Remoção otimista local (ex.: "apagar para mim" já confirmado pelo
  // servidor) — evita depender só do refetch para o item sumir da lista, e
  // garante que ele não volte a aparecer caso o refetch seguinte falhe
  // silenciosamente ou demore.
  const removeThreadsLocally = useCallback((threadIds: string[]) => {
    if (threadIds.length === 0) return;
    const idSet = new Set(threadIds);
    setThreads((prev) => prev.filter((t) => !idSet.has(t.id)));
  }, []);

  // Tempo real: qualquer INSERT/UPDATE em internal_threads ou
  // internal_messages desta organização re-sincroniza a lista (última
  // mensagem, ordenação, contador de não lidas). Debounced para evitar
  // rajadas de refetch quando várias mensagens chegam em sequência.
  useEffect(() => {
    if (!organizationId || !enabled) return;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(true), 250);
    };

    const channel = supabase
      .channel(`internal-threads-list-${organizationId}-${source ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_threads", filter: `organization_id=eq.${organizationId}` },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages", filter: `organization_id=eq.${organizationId}` },
        scheduleRefetch,
      )
      .subscribe();

    // Recupera sincronização após queda de conexão/aba em segundo plano.
    const onVisible = () => { if (document.visibilityState === "visible") void load(true); };
    const onOnline = () => void load(true);
    const fallbackPoll = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void load(true);
      }
    }, 5_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(fallbackPoll);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
    // `load` já inclui organizationId/source/campaignId/currentUserId em suas
    // próprias deps — incluí-lo aqui evita que scheduleRefetch capture um
    // closure desatualizado (ex.: currentUserId ainda nulo no primeiro
    // subscribe) enquanto ainda recria o canal quando algum desses valores
    // realmente muda.
  }, [organizationId, source, enabled, load]);

  return { threads, loading, fromDatabase, refetch, removeThreadsLocally };
}
