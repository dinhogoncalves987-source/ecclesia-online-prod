import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Navigate } from "react-router-dom";

/** Roles stored in organization_users.role for the active organization */
type OrgMembershipRole =
  | "church_admin"
  | "tesoureiro"
  | "contador"
  | "pastor"
  | "secretary"
  | "leader"
  | "member";

interface OrgMemberRow {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: OrgMembershipRole;
  is_active: boolean;
}

const ASSIGNABLE_ROLES: OrgMembershipRole[] = [
  "church_admin",
  "tesoureiro",
  "contador",
  "pastor",
  "secretary",
  "leader",
  "member",
];

const ROLE_LABEL_KEYS: Record<OrgMembershipRole, string> = {
  church_admin: "Admin",
  tesoureiro: "Tesoureiro",
  contador: "Contador",
  pastor: "Pastor",
  secretary: "Secretário",
  leader: "Líder",
  member: "Membro",
};

const ROLE_COLORS: Record<OrgMembershipRole, string> = {
  church_admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  tesoureiro: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  contador: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  pastor: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  secretary: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  leader: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  member: "bg-secondary text-muted-foreground",
};

const ROLE_DESC_KEYS: Record<OrgMembershipRole, string> = {
  church_admin: "Acesso total à organização. Pode gerenciar usuários e módulos administrativos.",
  tesoureiro: "Acesso a Financeiro e Relatórios.",
  contador: "Acesso a Financeiro e Relatórios.",
  pastor: "Acesso a Membros, Comunicação e gestão pastoral.",
  secretary: "Acesso a Membros, Comunicação e documentos.",
  leader: "Acesso a Agenda, Grupos e módulos de liderança.",
  member: "Acesso aos módulos básicos da comunidade.",
};

const normalizeMembershipRole = (role: string | null | undefined): OrgMembershipRole => {
  switch (role) {
    case "church_admin":
    case "admin":
      return "church_admin";
    case "tesoureiro":
      return "tesoureiro";
    case "contador":
      return "contador";
    case "pastor":
      return "pastor";
    case "secretary":
      return "secretary";
    case "leader":
    case "lider":
    case "obreiro":
      return "leader";
    case "member":
    case "membro":
    default:
      return "member";
  }
};

export default function GerenciarAcessos() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { church, loading: churchLoading } = useChurch();
  const { t } = useLanguage();
  const [users, setUsers] = useState<OrgMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!church?.id) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: memberships, error: membershipsError } = await supabase
      .from("organization_users")
      .select("id, user_id, role, is_active")
      .eq("organization_id", church.id)
      .order("created_at", { ascending: true });

    if (membershipsError) {
      toast({
        title: t("Erro ao carregar"),
        description: membershipsError.message,
        variant: "destructive",
      });
      setUsers([]);
      setLoading(false);
      return;
    }

    const rows = memberships || [];
    if (rows.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const userIds = rows.map((m) => m.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, email")
      .in("user_id", userIds);

    if (profilesError) {
      toast({
        title: t("Erro ao carregar"),
        description: profilesError.message,
        variant: "destructive",
      });
      setUsers([]);
      setLoading(false);
      return;
    }

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    const merged: OrgMemberRow[] = rows.map((m) => {
      const profile = profileMap.get(m.user_id);
      return {
        membership_id: m.id,
        user_id: m.user_id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: normalizeMembershipRole(m.role),
        is_active: m.is_active ?? true,
      };
    });

    merged.sort((a, b) => {
      const roleOrder = ASSIGNABLE_ROLES.indexOf(a.role) - ASSIGNABLE_ROLES.indexOf(b.role);
      if (roleOrder !== 0) return roleOrder;
      return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pt-BR");
    });

    setUsers(merged);
    setLoading(false);
  }, [church?.id, t]);

  useEffect(() => {
    if (roleLoading || churchLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void loadUsers();
  }, [user, roleLoading, churchLoading, loadUsers]);

  const handleRoleChange = async (
    membershipId: string,
    userId: string,
    newRole: OrgMembershipRole,
  ) => {
    if (!church?.id) return;
    setUpdatingId(userId);

    const { error } = await supabase
      .from("organization_users")
      .update({ role: newRole })
      .eq("id", membershipId)
      .eq("organization_id", church.id);

    if (error) {
      toast({ title: t("Erro ao atualizar"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${t("Função atualizada para")} ${t(ROLE_LABEL_KEYS[newRole])}` });
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)),
      );
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
          <p className="text-sm text-muted-foreground mt-1">
            {church
              ? `${t("Usuários vinculados a")} ${church.name}`
              : t("Defina quem pode acessar cada módulo do sistema")}
          </p>
        </div>

        <div className="bg-card rounded-xl shadow-executive p-5">
          <h2 className="font-medium text-sm mb-3">{t("Funções disponíveis")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ASSIGNABLE_ROLES.map((role) => (
              <div key={role} className="p-3 rounded-lg bg-secondary/30">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[role]}`}>
                  {t(ROLE_LABEL_KEYS[role])}
                </span>
                <p className="text-xs text-muted-foreground mt-1.5">{t(ROLE_DESC_KEYS[role])}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {church ? t("Nenhum usuário vinculado a esta organização") : t("Selecione uma organização")}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => {
                const initials = u.full_name
                  ? u.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  : u.email?.charAt(0).toUpperCase() || "?";
                const isCurrentUser = u.user_id === user?.id;

                return (
                  <div
                    key={u.membership_id}
                    className={`flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors ${!u.is_active ? "opacity-60" : ""}`}
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        {initials}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.full_name || t("Sem nome")}
                        {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">{t("(você)")}</span>}
                        {!u.is_active && (
                          <span className="text-xs text-muted-foreground ml-1">({t("inativo")})</span>
                        )}
                      </p>
                      {u.email && (
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      )}
                    </div>

                    <div className="relative flex-shrink-0">
                      {updatingId === u.user_id ? (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                      ) : (
                        <div className="relative">
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleRoleChange(u.membership_id, u.user_id, e.target.value as OrgMembershipRole)
                            }
                            disabled={isCurrentUser}
                            className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-semibold border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30 bg-card text-foreground ${isCurrentUser ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {t(ROLE_LABEL_KEYS[r])}
                              </option>
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


