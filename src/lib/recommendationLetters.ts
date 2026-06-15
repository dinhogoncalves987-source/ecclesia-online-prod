import { supabase } from "@/integrations/supabase/client";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";

// ── Status ───────────────────────────────────────────────────────────────────

export type RecommendationLetterStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "rejected";

export const RECOMMENDATION_STATUSES: RecommendationLetterStatus[] = [
  "requested",
  "under_review",
  "approved",
  "rejected",
];

// ── Types ────────────────────────────────────────────────────────────────────

export type DbRecommendationLetterRow = {
  id: string;
  organization_id: string;
  member_id: string | null;
  member_name: string;
  member_email: string | null;
  destination_church: string;
  destination_city: string;
  destination_state: string | null;
  reason: string;
  observations: string | null;
  status: string;
  public_token: string;
  origin_church_name: string;
  requested_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RecommendationLetter = {
  id: string;
  organizationId: string;
  memberId: string | null;
  memberName: string;
  memberEmail: string | null;
  destinationChurch: string;
  destinationCity: string;
  destinationState: string | null;
  reason: string;
  observations: string | null;
  status: RecommendationLetterStatus;
  publicToken: string;
  originChurchName: string;
  requestedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Mapper ───────────────────────────────────────────────────────────────────

function normalizeStatus(value: string): RecommendationLetterStatus {
  return (RECOMMENDATION_STATUSES as string[]).includes(value)
    ? (value as RecommendationLetterStatus)
    : "requested";
}

export function mapDbRecommendationLetter(
  row: DbRecommendationLetterRow,
): RecommendationLetter {
  return {
    id: row.id,
    organizationId: row.organization_id,
    memberId: row.member_id,
    memberName: row.member_name,
    memberEmail: row.member_email,
    destinationChurch: row.destination_church,
    destinationCity: row.destination_city,
    destinationState: row.destination_state,
    reason: row.reason,
    observations: row.observations,
    status: normalizeStatus(row.status),
    publicToken: row.public_token ?? "",
    originChurchName: row.origin_church_name ?? "",
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at,
    reviewedBy: row.reviewed_by,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Fetch (org-scoped, authenticated) ────────────────────────────────────────

/**
 * Fetch all recommendation letters for an organization.
 * RLS guarantees members receive only their own rows; staff receive all.
 */
export async function fetchRecommendationLetters(
  organizationId: string,
): Promise<{ letters: RecommendationLetter[]; fromDatabase: boolean }> {
  try {
    const { data, error } = await runScopedOrganizationQuery<DbRecommendationLetterRow[]>(
      "recommendation_letters",
      organizationId,
      (query) => query.select("*").order("requested_at", { ascending: false }),
    );

    if (error) {
      console.warn("[fetchRecommendationLetters]", error.message ?? error);
      return { letters: [], fromDatabase: false };
    }

    const letters = (data ?? []).map(mapDbRecommendationLetter);
    return { letters, fromDatabase: true };
  } catch (err) {
    console.warn("[fetchRecommendationLetters] unexpected", err);
    return { letters: [], fromDatabase: false };
  }
}

// ── Fetch by public token (unauthenticated — for validation page) ─────────────

/**
 * Fetch a single approved letter by its public_token.
 * Uses the anon Supabase key — does NOT require the user to be logged in.
 * Returns null if not found or not yet approved.
 */
export async function fetchLetterByToken(
  token: string,
): Promise<RecommendationLetter | null> {
  try {
    // Security: the RLS policy "recommendation_letters public read approved"
    // ensures only rows with status='approved' are accessible to the anon role.
    // The UI in ValidarCarta.tsx deliberately does not render member_email or
    // observations, keeping those fields out of public view even though they
    // are present in the DB row.
    const { data, error } = await supabase
      .from("recommendation_letters")
      .select("*")
      .eq("public_token", token)
      .eq("status", "approved")
      .maybeSingle();

    if (error || !data) return null;
    return mapDbRecommendationLetter(data as DbRecommendationLetterRow);
  } catch {
    return null;
  }
}
