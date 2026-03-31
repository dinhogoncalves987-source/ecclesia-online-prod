import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "superadmin" | "admin" | "tesoureiro" | "obreiro" | "lider" | "membro";

// Which roles can access which modules
const MODULE_ACCESS: Record<string, AppRole[]> = {
  "/admin": ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/financeiro": ["superadmin", "admin", "tesoureiro"],
  "/admin/membros": ["superadmin", "admin"],
  "/admin/agenda": ["superadmin", "admin", "obreiro", "lider", "membro"],
  "/admin/biblia": ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/hinario": ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/oracoes": ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/comunicacao": ["superadmin", "admin", "obreiro", "membro"],
  "/admin/grupos": ["superadmin", "admin", "lider"],
  "/admin/documentos": ["superadmin", "admin", "obreiro"],
  "/admin/relatorios": ["superadmin", "admin", "tesoureiro"],
  "/admin/assembleia-geral": ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/escalas": ["superadmin", "admin", "obreiro", "membro"],
  "/admin/perfil": ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"],
  "/admin/gerenciar-acessos": ["superadmin", "admin"],
  "/admin/congregacoes": ["superadmin", "admin"],
  "/admin/super-admin": ["superadmin"],
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
        const priority: AppRole[] = ["superadmin", "admin", "tesoureiro", "obreiro", "lider", "membro"];
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

  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";

  return { role, loading, canAccess, isAdmin, isSuperAdmin };
}
