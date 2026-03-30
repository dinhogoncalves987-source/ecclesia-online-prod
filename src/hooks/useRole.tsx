import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "tesoureiro" | "obreiro" | "lider" | "membro";

// Which roles can access which modules
const MODULE_ACCESS: Record<string, AppRole[]> = {
  "/admin": ["admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/financeiro": ["admin", "tesoureiro"],
  "/admin/membros": ["admin"],
  "/admin/agenda": ["admin", "obreiro", "lider"],
  "/admin/biblia": ["admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/oracoes": ["admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/comunicacao": ["admin", "obreiro"],
  "/admin/grupos": ["admin", "lider"],
  "/admin/documentos": ["admin", "obreiro"],
  "/admin/relatorios": ["admin", "tesoureiro"],
  "/admin/escalas": ["admin", "obreiro"],
  "/admin/perfil": ["admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/gerenciar-acessos": ["admin"],
  "/admin/congregacoes": ["admin"],
};

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .order("role")
        .limit(1);

      if (data && data.length > 0) {
        // Priority: admin first
        const roles = (data as any[]).map((r: any) => r.role as AppRole);
        const priority: AppRole[] = ["admin", "tesoureiro", "obreiro", "lider", "membro"];
        const best = priority.find(p => roles.includes(p)) || "membro";
        setRole(best);
      } else {
        setRole("membro");
      }
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  const canAccess = (path: string): boolean => {
    if (!role) return false;
    const allowed = MODULE_ACCESS[path];
    if (!allowed) return true; // unknown paths are open
    return allowed.includes(role);
  };

  const isAdmin = role === "admin";

  return { role, loading, canAccess, isAdmin };
}
