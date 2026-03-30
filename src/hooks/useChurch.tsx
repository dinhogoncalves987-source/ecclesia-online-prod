import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Church {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  parent_church_id: string | null;
  is_matriz: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  pastor_name: string | null;
}

interface ChurchContextType {
  church: Church | null;
  churches: Church[];
  loading: boolean;
  isMatriz: boolean;
  congregations: Church[];
  switchChurch: (churchId: string) => void;
  refetch: () => void;
}

const ChurchContext = createContext<ChurchContextType>({
  church: null,
  churches: [],
  loading: true,
  isMatriz: false,
  congregations: [],
  switchChurch: () => {},
  refetch: () => {},
});

export function ChurchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [church, setChurch] = useState<Church | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChurches = async () => {
    if (!user) {
      setChurch(null);
      setChurches([]);
      setLoading(false);
      return;
    }

    // Get user's church_id from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("church_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.church_id) {
      setLoading(false);
      return;
    }

    // Get all churches user can see
    const { data: allChurches } = await supabase
      .from("churches" as any)
      .select("*");

    if (allChurches) {
      const typed = (allChurches as any[]).map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        primary_color: c.primary_color,
        parent_church_id: c.parent_church_id,
        is_matriz: c.is_matriz,
        address: c.address,
        city: c.city,
        state: c.state,
        phone: c.phone,
        email: c.email,
        pastor_name: c.pastor_name,
      })) as Church[];

      setChurches(typed);
      const userChurch = typed.find(c => c.id === profile.church_id);
      setChurch(userChurch || null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchChurches();
  }, [user]);

  const switchChurch = (churchId: string) => {
    const found = churches.find(c => c.id === churchId);
    if (found) setChurch(found);
  };

  const isMatriz = church?.is_matriz ?? false;
  const congregations = churches.filter(c => c.parent_church_id === church?.id);

  return (
    <ChurchContext.Provider value={{ church, churches, loading, isMatriz, congregations, switchChurch, refetch: fetchChurches }}>
      {children}
    </ChurchContext.Provider>
  );
}

export const useChurch = () => useContext(ChurchContext);
