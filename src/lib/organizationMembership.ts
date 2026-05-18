import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const PENDING_CHURCH_SLUG_KEY = "ecclesia.pendingChurchSlug";

export function normalizeChurchSlug(slug: string | null | undefined): string | null {
  const normalized = slug?.trim();
  return normalized || null;
}

export function persistPendingChurchSlug(slug: string | null | undefined) {
  const normalized = normalizeChurchSlug(slug);
  if (!normalized) return;
  localStorage.setItem(PENDING_CHURCH_SLUG_KEY, normalized);
}

/** Prefer URL param, then persisted invite slug (survives Login ↔ Signup navigation). */
export function resolveInviteChurchSlug(urlSlug: string | null | undefined): string | null {
  return normalizeChurchSlug(urlSlug) ?? peekPendingChurchSlug();
}

export function signupPathWithChurch(slug: string | null | undefined): string {
  const resolved = resolveInviteChurchSlug(slug);
  return resolved ? `/signup?church=${encodeURIComponent(resolved)}` : "/signup";
}

export function loginPathWithChurch(slug: string | null | undefined): string {
  const resolved = resolveInviteChurchSlug(slug);
  return resolved ? `/login?church=${encodeURIComponent(resolved)}` : "/login";
}

export function peekPendingChurchSlug(): string | null {
  const slug = localStorage.getItem(PENDING_CHURCH_SLUG_KEY)?.trim();
  return slug || null;
}

export function clearPendingChurchSlug() {
  localStorage.removeItem(PENDING_CHURCH_SLUG_KEY);
}

export function getInviteChurchSlug(user: User): string | null {
  const fromMeta = user.user_metadata?.church_slug;
  return normalizeChurchSlug(typeof fromMeta === "string" ? fromMeta : null) ?? peekPendingChurchSlug();
}

export function buildSignupMetadata(fullName: string, churchSlug: string | null | undefined) {
  const metadata: Record<string, string> = { full_name: fullName.trim() };
  const inviteSlug = resolveInviteChurchSlug(churchSlug);
  if (inviteSlug) {
    metadata.church_slug = inviteSlug;
    persistPendingChurchSlug(inviteSlug);
  }
  return metadata;
}

type JoinOrganizationResult = {
  ok?: boolean;
  organization_id?: string;
  error?: string;
};

export async function ensureOrganizationMembership(user: User): Promise<{
  linked: boolean;
  organizationId?: string;
  error?: string;
}> {
  const slug = getInviteChurchSlug(user);
  if (!slug) {
    return { linked: false };
  }

  const { data, error } = await supabase.rpc("join_organization_by_slug", { _slug: slug });

  if (error) {
    console.error("join_organization_by_slug failed:", error);
    return { linked: false, error: error.message };
  }

  const result = data as JoinOrganizationResult | null;
  if (result?.ok) {
    clearPendingChurchSlug();
    return { linked: true, organizationId: result.organization_id };
  }

  return { linked: false, error: result?.error };
}
