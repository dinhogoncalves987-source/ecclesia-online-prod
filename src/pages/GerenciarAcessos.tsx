import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, UserCheck, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Navigate } from "react-router-dom";

type AppRole = "admin" | "tesoureiro" | "obreiro" | "lider" | "membro";

interface UserWithRole {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  role_id: string;
}

const ROLE_LABEL_KEYS: Record<AppRole, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  obreiro: "Obreiro",
  lider: "Líder de Grupo",
  membro: "Membro",
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  tesoureiro: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  obreiro: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  lider: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  membro: "bg-secondary text-muted-foreground",
};

const ROLE_DESC_KEYS: Record<AppRole, string> = {
  admin: "Acesso total ao sistema. Pode gerenciar outros usuários.",
  tesoureiro: "Acesso a Financeiro e Relatórios.",
  obreiro: "Acesso a Agenda, Comunicação, Documentos e Escalas.",
  lider: "Acesso a Agenda e Pequenos Grupos.",
  membro: "Acesso apenas à Bíblia e Pedidos de Oração.",
};

export default function GerenciarAcessos() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || roleLoading) return;
    loadUsers();
  }, [user, roleLoading]);

  const loadUsers = async () => {
    setLoading(true);
    // Get all profiles
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
    // Get all roles
    const { data: roles } = await supabase.from("user_roles" as any).select("id, user_id, role");

    if (profiles && roles) {
      const rolesMap = new Map((roles as any[]).map((r: any) => [r.user_id, { role: r.role as AppRole, role_id: r.id }]));
      const merged: UserWithRole[] = profiles.map(p => {
        const r = rolesMap.get(p.user_id);
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          role: r?.role || "membro",
          role_id: r?.role_id || "",
        };
      });
      setUsers(merged);
    }
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, roleId: string, newRole: AppRole) => {
    setUpdatingId(userId);

    if (roleId) {
      const { error } = await supabase
        .from("user_roles" as any)
        .update({ role: newRole } as any)
        .eq("id", roleId);

      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `${t("Função atualizada para")} ${t(ROLE_LABEL_KEYS[newRole])}` });
        setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
      }
    }
    setUpdatingId(null);
  };

  if (!roleLoading && !isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
            <Shield size={28} className="text-accent" />
            {t("Gerenciar Acessos")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Defina quem pode acessar cada módulo do sistema")}</p>
        </div>

        {/* Role legend */}
        <div className="bg-card rounded-xl shadow-executive p-5">
          <h2 className="font-medium text-sm mb-3">{t("Funções disponíveis")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(Object.keys(ROLE_LABEL_KEYS) as AppRole[]).map(role => (
              <div key={role} className="p-3 rounded-lg bg-secondary/30">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[role]}`}>
                  {t(ROLE_LABEL_KEYS[role])}
                </span>
                <p className="text-xs text-muted-foreground mt-1.5">{t(ROLE_DESC_KEYS[role])}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Users list */}
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map(u => {
                const initials = u.full_name
                  ? u.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                  : "?";
                const isCurrentUser = u.user_id === user?.id;

                return (
                  <div key={u.user_id} className="flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        {initials}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.full_name || "Sem nome"}
                        {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(você)</span>}
                      </p>
                    </div>

                    <div className="relative flex-shrink-0">
                      {updatingId === u.user_id ? (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                      ) : (
                        <div className="relative">
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.user_id, u.role_id, e.target.value as AppRole)}
                            disabled={isCurrentUser}
                            className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30 ${ROLE_COLORS[u.role]} ${isCurrentUser ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            {(Object.keys(ROLE_LABEL_KEYS) as AppRole[]).map(r => (
                              <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
