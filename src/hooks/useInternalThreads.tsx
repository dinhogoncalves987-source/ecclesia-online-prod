import { useCallback, useEffect, useState } from "react";
import {
  fetchThreadsBySource,
  type InternalThread,
  type InternalThreadSource,
} from "@/lib/internalMessages";

type Options = {
  organizationId?: string;
  source?: InternalThreadSource;
  campaignId?: string;
  enabled?: boolean;
};

export function useInternalThreads({
  organizationId,
  source,
  campaignId,
  enabled = true,
}: Options) {
  const [threads, setThreads] = useState<InternalThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDatabase, setFromDatabase] = useState(false);

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
  }, [organizationId, source, campaignId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  return { threads, loading, fromDatabase, refetch };
}
