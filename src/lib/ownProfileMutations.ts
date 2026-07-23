import { supabase } from "@/integrations/supabase/client";

export type OwnProfilePatch = Partial<{
  full_name: string | null;
  phone: string | null;
  role_title: string | null;
  avatar_url: string | null;
}>;

export async function updateOwnProfile(
  patch: OwnProfilePatch,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("update_own_profile", {
    _patch: patch,
  });

  if (error) return { ok: false, error: error.message };

  if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true) {
    return { ok: false, error: "profile_update_not_confirmed" };
  }

  return { ok: true };
}
