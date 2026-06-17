import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, ChevronDown, Clock, Copy, Loader2, Mail,
  Phone, Plus, Send, Shield, UserPlus, UserX, X, XCircle,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  createAccessInvite, getAccessInvites, revokeAccessInvite,
  buildAccessInviteUrl, buildAccessWhatsAppLink,
  type AccessInviteRecord,
} from "@/lib/accessInvites";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgMembershipRole =
  | "church_admin" | "tesoureiro" | "contador" | "pastor"
  | "secretary" | "leader" | "member";

interface OrgMemberRow {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: OrgMembershipRole;
  is_active: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSIGNABLE_ROLES: OrgMembershipRole[] = [
  "church_admin", "tesoureiro", "contador", "pastor",
  "secretary", "leader", "member",
];

const ROLE_LABELS: Record<OrgMembershipRole, string> = {
  church_admin: "Administrador",
  tesoureiro:   "Tesoureiro",
  contador:     "Contador",
  pastor:       "Pastor",
  secretary:    "Secretário(a)",
  leader:       "Líder",
  member:       "Membro",
};

const ROLE_COLORS: Record<OrgMembershipRole, string> = {
  church_admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  tesoureiro:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  contador:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  pastor:       "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  secretary:    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  leader:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  member:       "bg-secondary text-muted-foreground",
};

const ROLE_DESC: Record<OrgMembershipRole, string> = {
  church_admin: "Acesso total. Pode gerenciar usuários e todos os módulos.",
  tesoureiro:   "Acesso a Financeiro e Relatórios.",
  contador:     "Acesso somente leitura a Financeiro e Relatórios.",
  pastor:       "Acesso a Membros, Comunicação e gestão pastoral.",
  secretary:    "Acesso a Membros, Comunicação e documentos.",
  leader:       "Acesso a Agenda, Grupos e módulos de liderança.",
  member:       "Acesso aos módulos básicos da comunidade.",
};

const INVITE_STATUS_LABELS: Record<string, string> = {
  pending:  "Pendente",
  accepted: "Aceito",
  expired:  "Expirado",
  revoked:  "Revogado",
};

const INVITE_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  expired:  "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400",
  revoked:  "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalizeRole(role: string | null | undefined): OrgMembershipRole {
  switch (role) {
    case "church_admin": case "admin": return "church_admin";
    case "tesoureiro": return "tesoureiro";
    case "contador":   return "contador";
    case "pastor":     return "pastor";
    case "secretary":  return "secretary";
    case "leader": case "lider": case "obreiro": return "leader";
    default: return "member";
  }
}

// ── WhatsApp icon ─────────────────────────────────────────────────────────────

function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GerenciarAcessos() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { church, loading: churchLoading } = useChurch();
  const { t } = useLanguage();

  const [users, setUsers]       = useState<OrgMemberRow[]>([]);
  const [invites, setInvites]   = useState<AccessInviteRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [invitesSupported, setInvitesSupported] = useState(true);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [newAccessModal, setNewAccessModal] = useState(false);
  const [newAccessForm, setNewAccessForm] = useState({
    name: "", email: "", phone: "", role: "member" as OrgMembershipRole,
  });
  const [savingInvite, setSavingInvite] = useState(false);

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    if (!church?.id) { setUsers([]); return; }

    const { data: memberships, error: membErr } = await supabase
      .from("organization_users")
      .select("id, user_id, role, is_active")
      .eq("organization_id", church.id)
      .order("created_at", { ascending: true });

    if (membErr) {
      toast({ title: t("Erro ao carregar usuários"), description: membErr.message, variant: "destructive" });
      setUsers([]);
      return;
    }

    const rows = memberships || [];
    if (rows.length === 0) { setUsers([]); return; }

    const userIds = rows.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, email")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const merged: OrgMemberRow[] = rows.map((m) => {
      const p = profileMap.get(m.user_id);
      return {
        membership_id: m.id, user_id: m.user_id,
        full_name: p?.full_name ?? null, email: p?.email ?? null,
        avatar_url: p?.avatar_url ?? null,
        role: normalizeRole(m.role), is_active: m.is_active ?? true,
      };
    });

    merged.sort((a, b) => {
      const diff = ASSIGNABLE_ROLES.indexOf(a.role) - ASSIGNABLE_ROLES.indexOf(b.role);
      return diff !== 0 ? diff : (a.full_name || "").localeCompare(b.full_name || "", "pt-BR");
    });
    setUsers(merged);
  }, [church?.id, t]);

  const loadInvites = useCallback(async () => {
    if (!church?.id) { setInvites([]); return; }
    try {
      const data = await getAccessInvites(church.id);
      setInvites(data);
    } catch {
      // Table may not exist yet — show empty list without error
      setInvitesSupported(false);
      setInvites([]);
    }
  }, [church?.id]);

  useEffect(() => {
    if (roleLoading || churchLoading) return;
    if (!user) { setLoading(false); return; }
    setLoading(true);
    Promise.all([loadUsers(), loadInvites()]).finally(() => setLoading(false));
  }, [user, roleLoading, churchLoading, loadUsers, loadInvites]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRoleChange = async (membershipId: string, userId: string, newRole: OrgMembershipRole) => {
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
      toast({ title: `Função atualizada para ${ROLE_LABELS[newRole]}` });
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role: newRole } : u));
    }
    setUpdatingId(null);
  };

  const handleRemoveAccess = async (membershipId: string, userId: string) => {
    if (!church?.id) return;
    if (!confirm(t("Remover acesso desta pessoa à organização?"))) return;
    setRemovingId(userId);
    const { error } = await supabase
      .from("organization_users")
      .update({ is_active: false })
      .eq("id", membershipId)
      .eq("organization_id", church.id);
    if (error) {
      toast({ title: t("Erro ao remover acesso"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Acesso removido") });
      setUsers((prev) => prev.map((u) => u.membership_id === membershipId ? { ...u, is_active: false } : u));
      setExpandedId(null);
    }
    setRemovingId(null);
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Revogar este convite? O link deixará de funcionar.")) return;
    setRevokingId(inviteId);
    const ok = await revokeAccessInvite(inviteId);
    if (ok) {
      toast({ title: "Convite revogado." });
      setInvites((prev) => prev.map((i) => i.id === inviteId ? { ...i, status: "revoked" } : i));
    } else {
      toast({ title: "Erro ao revogar convite.", variant: "destructive" });
    }
    setRevokingId(null);
  };

  const handleCopyInviteLink = (token: string) => {
    const url = buildAccessInviteUrl(token);
    navigator.clipboard.writeText(url).catch(() => {});
    toast({ title: "Link copiado!" });
  };

  const handleWhatsAppInvite = (inv: AccessInviteRecord) => {
    if (!church) return;
    const url = buildAccessWhatsAppLink({
      phone: inv.phone || "",
      name: inv.full_name,
      roleLabel: ROLE_LABELS[normalizeRole(inv.role)],
      orgName: church.name,
      token: inv.token,
    });
    if (!inv.phone) {
      // No phone: just copy the link
      handleCopyInviteLink(inv.token);
      toast({ title: "Sem WhatsApp cadastrado. Link copiado!" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCreateInvite = async () => {
    if (!newAccessForm.name.trim()) {
      toast({ title: "Nome é obrigatório.", variant: "destructive" }); return;
    }
    if (!church?.id || !user?.id) return;
    setSavingInvite(true);

    // Check if email already registered
    if (newAccessForm.email.trim()) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("email", newAccessForm.email.trim())
        .maybeSingle();

      if (existingProfile) {
        // Create org_users link immediately
        const { error } = await supabase.from("organization_users").upsert({
          user_id: existingProfile.user_id,
          organization_id: church.id,
          role: newAccessForm.role,
          is_active: true,
        }, { onConflict: "user_id,organization_id" });

        if (!error) {
          toast({ title: "Usuário vinculado!", description: `${existingProfile.full_name || newAccessForm.email} adicionado como ${ROLE_LABELS[newAccessForm.role]}.` });
          await loadUsers();
          setNewAccessForm({ name: "", email: "", phone: "", role: "member" });
          setNewAccessModal(false);
          setSavingInvite(false);
          return;
        }
      }
    }

    // User not found or no email → create access_invite
    const { data: inv, error: invErr } = await createAccessInvite({
      organization_id: church.id,
      invited_by: user.id,
      full_name: newAccessForm.name.trim(),
      email: newAccessForm.email.trim() || undefined,
      phone: newAccessForm.phone.trim() || undefined,
      role: newAccessForm.role,
    });

    if (invErr || !inv) {
      // access_invites table may not exist — show migration notice
      const isTableMissing = invErr?.includes("relation") || invErr?.includes("does not exist") || invErr?.includes("42P01");
      if (isTableMissing) {
        toast({
          title: "Migração pendente",
          description: "Aplique 20260618120000_access_invites.sql no Supabase para salvar convites.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Erro ao criar convite", description: invErr ?? "", variant: "destructive" });
      }
    } else {
      const inviteUrl = buildAccessInviteUrl(inv.token);
      navigator.clipboard.writeText(inviteUrl).catch(() => {});
      toast({ title: "Convite criado!", description: "Link copiado para a área de transferência." });
      await loadInvites();
    }

    setNewAccessForm({ name: "", email: "", phone: "", role: "member" });
    setNewAccessModal(false);
    setSavingInvite(false);
  };

  if (!roleLoading && !isAdmin) return <Navigate to="/admin" replace />;

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const historicInvites = invites.filter((i) => i.status !== "pending");

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
              <Shield size={28} className="text-accent" />
              {t("Gerenciar Acessos")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {church ? `Usuários e convites de ${church.name}` : t("Defina quem pode acessar cada módulo")}
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setNewAccessModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <UserPlus size={16} />
              Novo Acesso
            </button>
          )}
        </div>

        {/* Migration warning */}
        {!invitesSupported && (
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Migração necessária</p>
            <p className="text-muted-foreground mt-0.5">
              Aplique <code className="bg-secondary px-1 rounded text-xs">20260618120000_access_invites.sql</code> no Supabase para habilitar convites persistentes.
            </p>
          </div>
        )}

        {/* Modal Novo Acesso */}
        {newAccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <UserPlus size={16} className="text-accent" />
                  Novo Acesso
                </h2>
                <button type="button" onClick={() => setNewAccessModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Se o email já estiver cadastrado, o vínculo é criado imediatamente. Caso contrário, um link de convite é gerado e salvo.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Nome completo *</label>
                  <input
                    value={newAccessForm.name}
                    onChange={(e) => setNewAccessForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome completo"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Email</label>
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
                  <label className="text-xs text-muted-foreground block mb-1">WhatsApp (opcional)</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={newAccessForm.phone}
                      onChange={(e) => setNewAccessForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="(54) 99999-9999"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Função</label>
                  <select
                    value={newAccessForm.role}
                    onChange={(e) => setNewAccessForm((f) => ({ ...f, role: e.target.value as OrgMembershipRole }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">{ROLE_DESC[newAccessForm.role]}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingInvite}
                  onClick={() => void handleCreateInvite()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingInvite ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Criar acesso
                </button>
                <button
                  type="button"
                  onClick={() => setNewAccessModal(false)}
                  className="px-4 py-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/80"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Convites Pendentes */}
        {pendingInvites.length > 0 && (
          <div className="bg-card rounded-xl shadow-executive overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Clock size={15} className="text-amber-500" />
                Convites Pendentes
                <span className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingInvites.length}
                </span>
              </h2>
            </div>
            <div className="divide-y divide-border/40">
              {pendingInvites.map((inv) => {
                const roleNorm = normalizeRole(inv.role);
                const inviteUrl = buildAccessInviteUrl(inv.token);
                const expires = inv.expires_at ? format(new Date(inv.expires_at), "dd/MM/yyyy", { locale: ptBR }) : "—";
                return (
                  <div key={inv.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{inv.full_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ROLE_COLORS[roleNorm]}`}>
                          {ROLE_LABELS[roleNorm]}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${INVITE_STATUS_COLORS.pending}`}>
                          {INVITE_STATUS_LABELS.pending}
                        </span>
                      </div>
                      {inv.email && <p className="text-xs text-muted-foreground">{inv.email}</p>}
                      <p className="text-[10px] text-muted-foreground truncate max-w-xs">{inviteUrl}</p>
                      <p className="text-[10px] text-muted-foreground">Expira: {expires}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                      {inv.phone && (
                        <button
                          type="button"
                          onClick={() => handleWhatsAppInvite(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors border border-green-300 dark:border-green-800"
                        >
                          <WhatsAppIcon size={12} />
                          WhatsApp
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyInviteLink(inv.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-secondary hover:bg-secondary/80 transition-colors border border-border"
                      >
                        <Copy size={11} />
                        Copiar link
                      </button>
                      <button
                        type="button"
                        disabled={revokingId === inv.id}
                        onClick={() => void handleRevokeInvite(inv.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-destructive hover:bg-destructive/10 transition-colors border border-destructive/30 disabled:opacity-40"
                      >
                        {revokingId === inv.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                        Revogar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Usuários ativos */}
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-500" />
              Usuários com Acesso
              {!loading && <span className="text-muted-foreground text-xs font-normal">({users.length})</span>}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {church ? "Nenhum usuário vinculado." : "Selecione uma organização."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => {
                const initials = u.full_name
                  ? u.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  : u.email?.charAt(0).toUpperCase() || "?";
                const isCurrentUser = u.user_id === user?.id;
                const isExpanded    = expandedId === u.membership_id;

                return (
                  <div key={u.membership_id} className={!u.is_active ? "opacity-50" : ""}>
                    <div
                      role="button" tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : u.membership_id)}
                      onKeyDown={(e) => e.key === "Enter" && setExpandedId(isExpanded ? null : u.membership_id)}
                      className="flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors cursor-pointer select-none"
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
                          {u.full_name || "Sem nome"}
                          {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(você)</span>}
                          {!u.is_active && <span className="text-xs text-destructive ml-1">(inativo)</span>}
                        </p>
                        {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-muted/30 border-t border-border/30 px-4 pb-4 pt-3 flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Alterar função</p>
                          <div className="relative inline-block">
                            {updatingId === u.user_id ? (
                              <Loader2 size={16} className="animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <select
                                  value={u.role}
                                  onChange={(e) => void handleRoleChange(u.membership_id, u.user_id, e.target.value as OrgMembershipRole)}
                                  disabled={isCurrentUser}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-semibold border border-border focus:outline-none focus:ring-2 focus:ring-accent/30 bg-card text-foreground ${isCurrentUser ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                                >
                                  {ASSIGNABLE_ROLES.map((r) => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{ROLE_DESC[u.role]}</p>
                        </div>

                        {!isCurrentUser && (
                          <div className="flex gap-2 flex-wrap flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleRemoveAccess(u.membership_id, u.user_id); }}
                              disabled={removingId === u.user_id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 border border-destructive/30 disabled:opacity-40"
                            >
                              {removingId === u.user_id ? <Loader2 size={13} className="animate-spin" /> : <UserX size={13} />}
                              Revogar acesso
                            </button>
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

        {/* Histórico de convites */}
        {historicInvites.length > 0 && (
          <div className="bg-card rounded-xl shadow-executive overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Send size={14} className="text-muted-foreground" />
                Histórico de Convites
              </h2>
            </div>
            <div className="divide-y divide-border/40">
              {historicInvites.map((inv) => {
                const roleNorm = normalizeRole(inv.role);
                const createdAt = format(new Date(inv.created_at), "dd/MM/yyyy", { locale: ptBR });
                return (
                  <div key={inv.id} className="px-4 py-3 flex items-center gap-3 opacity-70">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm">{inv.full_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ROLE_COLORS[roleNorm]}`}>
                          {ROLE_LABELS[roleNorm]}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${INVITE_STATUS_COLORS[inv.status]}`}>
                          {INVITE_STATUS_LABELS[inv.status]}
                        </span>
                      </div>
                      {inv.email && <p className="text-xs text-muted-foreground">{inv.email}</p>}
                      <p className="text-[10px] text-muted-foreground">Enviado em {createdAt}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Funções disponíveis */}
        <div className="bg-card rounded-xl shadow-executive p-5">
          <h2 className="font-medium text-sm mb-3">Funções disponíveis</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ASSIGNABLE_ROLES.map((role) => (
              <div key={role} className="p-3 rounded-lg bg-secondary/30">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
                <p className="text-xs text-muted-foreground mt-1.5">{ROLE_DESC[role]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
