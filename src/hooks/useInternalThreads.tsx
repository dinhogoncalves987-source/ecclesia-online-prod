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

  const load = useCallback(async () => {
    if (!organizationId || !enabled) {
      setThreads([]);
      setFromDatabase(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await fetchThreadsBySource({ organizationId, source, campaignId, currentUserId });
    setThreads(result.threads);
    setFromDatabase(result.fromDatabase);
    setLoading(false);
  }, [organizationId, source, campaignId, currentUserId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  // Tempo real: qualquer INSERT/UPDATE em internal_threads ou
  // internal_messages desta organização re-sincroniza a lista (última
  // mensagem, ordenação, contador de não lidas). Debounced para evitar
  // rajadas de refetch quando várias mensagens chegam em sequência.
  useEffect(() => {
    if (!organizationId || !enabled) return;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(), 250);
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
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, source, enabled]);

  return { threads, loading, fromDatabase, refetch };
}
