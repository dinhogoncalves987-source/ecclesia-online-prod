import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OwnProfile = {
  full_name: string | null;
  phone: string | null;
  role_title: string | null;
  avatar_url: string | null;
};

export function ownProfileQueryKey(userId?: string | null) {
  return ["own-profile", userId] as const;
}

/**
 * Fonte única do próprio perfil (nome/telefone/função/foto) — usada tanto
 * pela tela de Perfil quanto pelo cabeçalho/sidebar do AdminLayout. Como
 * ambos compartilham a mesma queryKey do React Query, salvar em Perfil.tsx
 * atualiza o header/avatar imediatamente, sem precisar recarregar a página.
 */
export function useOwnProfile(userId?: string | null) {
  return useQuery({
    queryKey: ownProfileQueryKey(userId),
    queryFn: async (): Promise<OwnProfile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, role_title, avatar_url")
        .eq("user_id", userId)
        .single();
      if (error) {
        console.warn("[useOwnProfile]", error.message);
        return null;
      }
      return data;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useInvalidateOwnProfile() {
  const queryClient = useQueryClient();
  return (userId?: string | null) => queryClient.invalidateQueries({ queryKey: ownProfileQueryKey(userId) });
}
