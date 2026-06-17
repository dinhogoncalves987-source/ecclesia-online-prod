import { useCallback, useEffect, useState } from "react";

import {
  fetchRecommendationLetters,
  type RecommendationLetter,
} from "@/lib/recommendationLetters";
import {
  approveRecommendationLetter,
  createRecommendationLetter,
  markRecommendationUnderReview,
  rejectRecommendationLetter,
  updateRecommendationLetter,
  type CreateRecommendationLetterInput,
  type UpdateRecommendationLetterInput,
  type RecommendationLetterMutationResult,
} from "@/lib/recommendationLetterMutations";

type Options = {
  organizationId: string | null | undefined;
  /** Current user's auth id — used as approver/reviewer and request author. */
  currentUserId?: string | null;
  enabled?: boolean;
};

export function useRecommendationLetters({
  organizationId,
  currentUserId,
  enabled = true,
}: Options) {
  const [letters, setLetters] = useState<RecommendationLetter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDatabase, setFromDatabase] = useState(false);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId || !enabled) {
      setLetters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { letters: rows, fromDatabase: ok } = await fetchRecommendationLetters(organizationId);
    setLetters(rows);
    setFromDatabase(ok);
    setLoading(false);
  }, [organizationId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (
      input: CreateRecommendationLetterInput,
    ): Promise<RecommendationLetterMutationResult> => {
      if (!organizationId) return { ok: false, error: "missing_organization" };
      setMutating(true);
      const result = await createRecommendationLetter(organizationId, {
        ...input,
        memberId: input.memberId ?? currentUserId ?? null,
      });
      setMutating(false);
      if (result.ok) await load();
      return result;
    },
    [organizationId, currentUserId, load],
  );

  const setUnderReview = useCallback(
    async (letterId: string): Promise<RecommendationLetterMutationResult> => {
      if (!organizationId) return { ok: false, error: "missing_organization" };
      setMutating(true);
      const result = await markRecommendationUnderReview(organizationId, letterId, currentUserId ?? null);
      setMutating(false);
      if (result.ok) await load();
      return result;
    },
    [organizationId, currentUserId, load],
  );

  const approve = useCallback(
    async (letterId: string): Promise<RecommendationLetterMutationResult> => {
      if (!organizationId) return { ok: false, error: "missing_organization" };
      setMutating(true);
      const result = await approveRecommendationLetter(organizationId, letterId, currentUserId ?? null);
      setMutating(false);
      if (result.ok) await load();
      return result;
    },
    [organizationId, currentUserId, load],
  );

  const reject = useCallback(
    async (letterId: string): Promise<RecommendationLetterMutationResult> => {
      if (!organizationId) return { ok: false, error: "missing_organization" };
      setMutating(true);
      const result = await rejectRecommendationLetter(organizationId, letterId, currentUserId ?? null);
      setMutating(false);
      if (result.ok) await load();
      return result;
    },
    [organizationId, currentUserId, load],
  );

  const update = useCallback(
    async (
      letterId: string,
      input: UpdateRecommendationLetterInput,
    ): Promise<RecommendationLetterMutationResult> => {
      if (!organizationId) return { ok: false, error: "missing_organization" };
      setMutating(true);
      const result = await updateRecommendationLetter(organizationId, letterId, input);
      setMutating(false);
      if (result.ok) await load();
      return result;
    },
    [organizationId, load],
  );

  return {
    letters,
    loading,
    error,
    fromDatabase,
    mutating,
    refetch: load,
    create,
    update,
    setUnderReview,
    approve,
    reject,
  };
}
