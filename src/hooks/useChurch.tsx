import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ChurchContext, type Church } from "./useChurchContext";
import { ensureOrganizationMembership } from "@/lib/organizationMembership";

const ACTIVE_CHURCH_STORAGE_KEY = "ecclesia.activeChurchId";

type OrganizationRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  organization_type: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  active: boolean | null;
};

const mapOrganizationToChurch = (org: OrganizationRow): Church => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo_url: org.logo_url,
  primary_color: null,
  parent_church_id: org.parent_id,
  is_matriz: org.organization_type === "matriz" || org.organization_type === "sede",
  address: null,
  city: org.city,
  state: org.state,
  phone: org.phone,
  email: org.email,
  pastor_name: null,
});

export function ChurchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [church, setChurch] = useState<Church | null>(null);
  const [profileChurchId, setProfileChurchId] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const linkingRef = useRef(false);

  const fetchChurches = useCallback(async () => {
    if (!user) {
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: memberships, error: membershipsError } = await supabase
      .from("organization_users")
      .select("organization_id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (membershipsError) {
      console.error("Erro ao buscar organizações do usuário:", membershipsError);
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setLoading(false);
      return;
    }

    let organizationIds = (memberships || [])
      .map((membership) => membership.organization_id)
      .filter(Boolean);

    if (organizationIds.length === 0 && !linkingRef.current) {
      linkingRef.current = true;
      try {
        const { linked } = await ensureOrganizationMembership(user);
        if (linked) {
          const { data: retryMemberships, error: retryError } = await supabase
            .from("organization_users")
            .select("organization_id, role, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true);

          if (!retryError && retryMemberships?.length) {
            organizationIds = retryMemberships
              .map((membership) => membership.organization_id)
              .filter(Boolean);
          }
        }
      } finally {
        linkingRef.current = false;
      }
    }

    if (organizationIds.length === 0) {
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setLoading(false);
      return;
    }

    const { data: organizations, error: organizationsError } = await supabase
      .from("organizations")
      .select("id,parent_id,name,slug,organization_type,city,state,email,phone,logo_url,active")
      .in("id", organizationIds)
      .eq("active", true)
      .order("name");

    if (organizationsError) {
      console.error("Erro ao buscar organizações:", organizationsError);
      setChurch(null);
      setProfileChurchId(null);
      setChurches([]);
      setLoading(false);
      return;
    }

    const visibleChurches = ((organizations || []) as OrganizationRow[]).map(mapOrganizationToChurch);
    const storedChurchId = localStorage.getItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`);
    const fallbackChurch = visibleChurches[0] || null;
    const activeChurch = visibleChurches.find((c) => c.id === storedChurchId) || fallbackChurch;

    setProfileChurchId(fallbackChurch?.id || null);
    setChurches(visibleChurches);
    setChurch(activeChurch);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchChurches();
  }, [fetchChurches]);

  const switchChurch = (churchId: string) => {
    const found = churches.find((c) => c.id === churchId);
    if (!found) return false;

    setChurch(found);
    if (user) {
      localStorage.setItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`, found.id);
    }
    return true;
  };

  const clearActiveChurch = () => {
    if (user) {
      localStorage.removeItem(`${ACTIVE_CHURCH_STORAGE_KEY}.${user.id}`);
    }
    const profileChurch = churches.find((c) => c.id === profileChurchId) || churches[0] || null;
    setChurch(profileChurch);
  };

  const isMatriz = church?.is_matriz ?? false;
  const congregations = churches.filter((c) => c.parent_church_id === church?.id);

  return (
    <ChurchContext.Provider
      value={{
        church,
        activeChurch: church,
        activeChurchId: church?.id || null,
        profileChurchId,
        churches,
        loading,
        isMatriz,
        congregations,
        switchChurch,
        clearActiveChurch,
        refetch: fetchChurches,
      }}
    >
      {children}
    </ChurchContext.Provider>
  );
}
