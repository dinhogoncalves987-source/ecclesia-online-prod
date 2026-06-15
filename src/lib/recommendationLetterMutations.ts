import { supabase } from "@/integrations/supabase/client";
import { insertWithOrganizationScope } from "@/lib/organizationScope";
import type { RecommendationLetterStatus } from "@/lib/recommendationLetters";

export type RecommendationLetterMutationResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export type CreateRecommendationLetterInput = {
  memberId?: string | null;
  memberName: string;
  memberEmail?: string | null;
  /** Snapshot of the issuing church name captured at request time. */
  originChurchName?: string;
  destinationChurch: string;
  destinationCity: string;
  destinationState?: string | null;
  reason: string;
  observations?: string | null;
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? error);
  }
  return String(error);
}

/**
 * Create a new recommendation-letter request (status = "requested").
 * Always scoped by organization_id via insertWithOrganizationScope.
 */
export async function createRecommendationLetter(
  organizationId: string,
  input: CreateRecommendationLetterInput,
): Promise<RecommendationLetterMutationResult> {
  const payload = {
    member_id: input.memberId ?? null,
    member_name: input.memberName.trim(),
    member_email: input.memberEmail?.trim() || null,
    origin_church_name: input.originChurchName?.trim() ?? "",
    destination_church: input.destinationChurch.trim(),
    destination_city: input.destinationCity.trim(),
    destination_state: input.destinationState?.trim() || null,
    reason: input.reason.trim(),
    observations: input.observations?.trim() || null,
    status: "requested" as RecommendationLetterStatus,
  };

  const { data, error } = await insertWithOrganizationScope<{ id: string }>(
    "recommendation_letters",
    organizationId,
    payload,
    (query) => query.select("id").single(),
  );

  if (error) {
    return { ok: false, error: errorMessage(error) };
  }

  const id = (data as { id?: string } | null)?.id;
  return { ok: true, id };
}

async function patchLetter(
  organizationId: string,
  letterId: string,
  patch: Record<string, unknown>,
): Promise<RecommendationLetterMutationResult> {
  const { error } = await supabase
    .from("recommendation_letters")
    .update(patch)
    .eq("id", letterId)
    .eq("organization_id", organizationId);

  if (error) {
    return { ok: false, error: errorMessage(error) };
  }
  return { ok: true, id: letterId };
}

/** Move a request into review (secretary / church_admin / pastor). */
export async function markRecommendationUnderReview(
  organizationId: string,
  letterId: string,
  reviewerId: string | null,
): Promise<RecommendationLetterMutationResult> {
  return patchLetter(organizationId, letterId, {
    status: "under_review",
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
  });
}

/** Approve a request (pastor / church_admin / super_admin). */
export async function approveRecommendationLetter(
  organizationId: string,
  letterId: string,
  approverId: string | null,
): Promise<RecommendationLetterMutationResult> {
  return patchLetter(organizationId, letterId, {
    status: "approved",
    approved_at: new Date().toISOString(),
    approved_by: approverId,
  });
}

/** Reject a request (secretary / church_admin / pastor). */
export async function rejectRecommendationLetter(
  organizationId: string,
  letterId: string,
  reviewerId: string | null,
): Promise<RecommendationLetterMutationResult> {
  return patchLetter(organizationId, letterId, {
    status: "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
  });
}

/** Generic status setter — kept for flexibility/future use. */
export async function updateRecommendationLetterStatus(
  organizationId: string,
  letterId: string,
  status: RecommendationLetterStatus,
  actorId: string | null,
): Promise<RecommendationLetterMutationResult> {
  switch (status) {
    case "under_review":
      return markRecommendationUnderReview(organizationId, letterId, actorId);
    case "approved":
      return approveRecommendationLetter(organizationId, letterId, actorId);
    case "rejected":
      return rejectRecommendationLetter(organizationId, letterId, actorId);
    case "requested":
    default:
      return patchLetter(organizationId, letterId, { status: "requested" });
  }
}
