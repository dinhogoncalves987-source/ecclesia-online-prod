import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, Copy, Loader2, Mail, Phone, Plus, Shield, UserPlus, UserX, X } from "lucide-react";
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

// Convite pendente local (sem auth user real)
type PendingInvite = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: OrgMembershipRole;
  inviteLink: string;
  createdAt: string;
};

export default function GerenciarAcessos() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { church, loading: churchLoading } = useChurch();
  const { t } = useLanguage();
  const [users, setUsers] = useState<OrgMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Estado do modal "Novo Acesso"
  const [newAccessModal, setNewAccessModal] = useState(false);
  const [newAccessForm, setNewAccessForm] = useState({ name: "", email: "", phone: "", role: "member" as OrgMembershipRole });
  const [savingInvite, setSavingInvite] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

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

  const handleRemoveAccess = async (membershipId: string, userId: string) => {
    if (!church?.id) return;
    if (!confirm(t("Remover acesso desta pessoa à organização? Esta ação não pode ser desfeita."))) return;

    setRemovingId(userId);
    const { error } = await supabase
      .from("organization_users")
      .update({ is_active: false })
      .eq("id", membershipId)
      .eq("organization_id", church.id);

    if (error) {
      toast({ title: t("Erro ao remover acesso"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Acesso removido"), description: t("Usuário desativado desta organização") });
      setUsers((prev) => prev.map((u) => u.membership_id === membershipId ? { ...u, is_active: false } : u));
      setExpandedId(null);
    }
    setRemovingId(null);
  };

  const handleCreateInvite = async () => {
    if (!newAccessForm.name.trim() || !newAccessForm.email.trim()) {
      toast({ title: t("Nome e email são obrigatórios"), variant: "destructive" });
      return;
    }
    setSavingInvite(true);
    // Verificar se usuário já existe no sistema pelo email
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("email", newAccessForm.email.trim())
      .maybeSingle();

    if (existingProfile && church?.id) {
      // Usuário já existe: criar vínculo real na organization_users
      const { error } = await supabase
        .from("organization_users")
        .upsert({
          user_id: existingProfile.user_id,
          organization_id: church.id,
          role: newAccessForm.role,
          is_active: true,
        }, { onConflict: "user_id,organization_id" });

      if (error) {
        toast({ title: t("Erro ao vincular usuário"), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t("Usuário vinculado com sucesso!"), description: `${existingProfile.full_name || newAccessForm.email} adicionado como ${t(ROLE_LABEL_KEYS[newAccessForm.role])}` });
        void loadUsers();
      }
    } else {
      // Usuário não existe: gerar convite pendente local
      const inviteLink = `${window.location.origin}/signup?invite=${encodeURIComponent(newAccessForm.email)}&church=${encodeURIComponent(church?.slug || "")}`;
      const invite: PendingInvite = {
        id: crypto.randomUUID(),
        name: newAccessForm.name.trim(),
        email: newAccessForm.email.trim(),
        phone: newAccessForm.phone.trim(),
        role: newAccessForm.role,
        inviteLink,
        createdAt: new Date().toISOString(),
      };
      setPendingInvites((prev) => [invite, ...prev]);
      navigator.clipboard.writeText(inviteLink).catch(() => {});
      toast({
        title: t("Convite criado!"),
        description: t("Link de convite copiado para a área de transferência. O usuário deve se cadastrar via link."),
      });
    }

    setNewAccessForm({ name: "", email: "", phone: "", role: "member" });
    setNewAccessModal(false);
    setSavingInvite(false);
  };

  if (!roleLoading && !isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
          {isAdmin && (
            <button
              type="button"
              onClick={() => setNewAccessModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <UserPlus size={16} />
              {t("Novo Acesso")}
            </button>
          )}
        </div>

        {/* Modal Novo Acesso */}
        {newAccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <UserPlus size={16} className="text-accent" />
                  {t("Novo Acesso")}
                </h2>
                <button
                  type="button"
                  onClick={() => setNewAccessModal(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("Se o email já estiver cadastrado, o vínculo é criado imediatamente. Caso contrário, um link de convite será gerado.")}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("Nome completo")} *</label>
                  <input
                    value={newAccessForm.name}
                    onChange={(e) => setNewAccessForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("Nome completo")}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("Email")} *</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={newAccessForm.email}
                      onChange={(e) => setNewAccessForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("Telefone")} ({t("opcional")})</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={newAccessForm.phone}
                      onChange={(e) => setNewAccessForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="(00) 00000-0000"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("Função")}</label>
                  <select
                    value={newAccessForm.role}
                    onChange={(e) => setNewAccessForm((f) => ({ ...f, role: e.target.value as OrgMembershipRole }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">{t(ROLE_DESC_KEYS[newAccessForm.role])}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingInvite}
                  onClick={() => void handleCreateInvite()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingInvite ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {t("Criar acesso")}
                </button>
                <button
                  type="button"
                  onClick={() => setNewAccessModal(false)}
                  className="px-4 py-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/80 transition-colors"
                >
                  {t("Cancelar")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Convites pendentes */}
        {pendingInvites.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
              <Mail size={14} />
              {t("Convites pendentes")} ({pendingInvites.length})
            </h3>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 bg-background/60 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                    <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_COLORS[inv.role]}`}>
                      {t(ROLE_LABEL_KEYS[inv.role])}
                    </span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inv.inviteLink).catch(() => {});
                        toast({ title: t("Link copiado!") });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                    >
                      <Copy size={12} />
                      {t("Copiar link")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingInvites((p) => p.filter((i) => i.id !== inv.id))}
                      className="px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                const userInitials = u.full_name
                  ? u.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  : u.email?.charAt(0).toUpperCase() || "?";
                const isCurrentUser = u.user_id === user?.id;
                const isExpanded = expandedId === u.membership_id;

                return (
                  <div key={u.membership_id} className={!u.is_active ? "opacity-60" : ""}>
                    {/* Linha principal — clicável para expandir */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : u.membership_id)}
                      onKeyDown={(e) => e.key === "Enter" && setExpandedId(isExpanded ? null : u.membership_id)}
                      className="flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors cursor-pointer select-none"
                    >
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                          {userInitials}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.full_name || t("Sem nome")}
                          {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">{t("(você)")}</span>}
                          {!u.is_active && (
                            <span className="text-xs text-destructive ml-1">({t("inativo")})</span>
                          )}
                        </p>
                        {u.email && (
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                          {t(ROLE_LABEL_KEYS[u.role])}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>

                    {/* Painel expandido — editar função e ações */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t border-border/30 px-4 pb-4 pt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Alterar função</p>
                          <div className="relative inline-block">
                            {updatingId === u.user_id ? (
                              <Loader2 size={16} className="animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <select
                                  value={u.role}
                                  onChange={(e) =>
                                    handleRoleChange(u.membership_id, u.user_id, e.target.value as OrgMembershipRole)
                                  }
                                  disabled={isCurrentUser}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-semibold border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30 bg-card text-foreground ${isCurrentUser ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  {ASSIGNABLE_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {t(ROLE_LABEL_KEYS[r])}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {t(ROLE_DESC_KEYS[u.role])}
                          </p>
                        </div>

                        {!isCurrentUser && (
                          <div className="flex gap-2 flex-wrap flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = `${window.location.origin}/signup?invite=${encodeURIComponent(u.email || "")}&church=${encodeURIComponent(church?.slug || "")}`;
                                navigator.clipboard.writeText(link).catch(() => {});
                                toast({ title: t("Link de reenvio copiado!") });
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors border border-border"
                            >
                              <Copy size={13} />
                              {t("Reenviar convite")}
                            </button>
                            {u.is_active && (
                              <button
                                type="button"
                                disabled={removingId === u.user_id}
                                onClick={(e) => { e.stopPropagation(); void handleRemoveAccess(u.membership_id, u.user_id); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors border border-destructive/30 disabled:opacity-40"
                              >
                                {removingId === u.user_id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <UserX size={13} />
                                )}
                                {t("Revogar acesso")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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


