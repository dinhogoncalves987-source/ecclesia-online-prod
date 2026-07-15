import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, BarChart3, BookOpen, Building2, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardList, Clock, Copy, Eye, Key,
  Loader2, Mail, MessageSquare, Phone, Plus, Search, Send, Shield,
  Sparkles, User, UserCheck, UserPlus, Users, UserX, Wallet, X, XCircle,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
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
  | "secretary" | "leader" | "porteiro" | "member";

interface OrgMemberRow {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: OrgMembershipRole;
  is_active: boolean;
  created_at?: string;
}

interface SearchedMember {
  id: string;
  full_name: string;
  user_id: string | null;
  member_role: string | null;
  status: string;
  photo_url: string | null;
  congregation_id: string | null;
  sector_id: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSIGNABLE_ROLES: OrgMembershipRole[] = [
  "church_admin", "pastor", "secretary", "tesoureiro", "contador", "leader", "porteiro", "member",
];

// App access roles with labels
const APP_ACCESS_OPTIONS: { value: OrgMembershipRole; label: string }[] = [
  { value: "church_admin", label: "Administrador" },
  { value: "pastor",       label: "Pastor" },
  { value: "secretary",    label: "Secretaria" },
  { value: "tesoureiro",   label: "Tesoureiro" },
  { value: "contador",     label: "Contador" },
  { value: "leader",       label: "Líder" },
  { value: "porteiro",     label: "Porteiro" },
  { value: "member",       label: "Membro" },
];

// Church roles/cargos (eclesiásticos — não dão permissão automática no app)
const CHURCH_ROLES: string[] = [
  "Membro",
  "Auxiliar",
  "Obreiro",
  "Diácono",
  "Presbítero",
  "Evangelista",
  "Pastor",
  "Pastor auxiliar",
  "Cooperador",
  "Missionário",
  "Missionária",
  "Dirigente",
  "Dirigente auxiliar",
  "Secretário",
  "Subsecretário",
  "2º Secretário",
  "Tesoureiro",
  "2º Tesoureiro",
  "Contador",
  "Líder",
  "Vice-líder",
  "Líder de jovens",
  "Líder de adolescentes",
  "Líder infantil",
  "Líder de louvor",
  "Líder de intercessão",
  "Líder de recepção",
  "Porteiro",
  "Recepcionista",
  "Personalizado",
];

const ROLE_LABELS: Record<OrgMembershipRole, string> = {
  church_admin: "Administrador",
  pastor:       "Pastor",
  secretary:    "Secretário(a)",
  tesoureiro:   "Tesoureiro",
  contador:     "Contador",
  leader:       "Líder",
  member:       "Membro",
  porteiro:     "Porteiro",
};

const ROLE_COLORS: Record<OrgMembershipRole, string> = {
  church_admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  pastor:       "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  secretary:    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  tesoureiro:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  contador:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  leader:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  porteiro:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  member:       "bg-secondary text-muted-foreground",
};

const ROLE_DESC: Record<OrgMembershipRole, string> = {
  church_admin: "Acesso total. Pode gerenciar usuários e todos os módulos.",
  pastor:       "Acesso a Membros, Comunicação e gestão pastoral.",
  secretary:    "Acesso a Membros, Comunicação e documentos.",
  tesoureiro:   "Acesso a Financeiro e Relatórios.",
  contador:     "Acesso somente leitura a Financeiro e Relatórios.",
  leader:       "Acesso a Agenda, Grupos e módulos de liderança.",
  member:       "Acesso aos módulos básicos da comunidade.",
  porteiro:     "Acesso restrito ao Modo Porteiro para leitura de QR Code de membros.",
};

type RoleCardConfig = {
  role: OrgMembershipRole;
  Icon: React.ElementType;
  iconColor: string;
  cardAccent: string;
  future?: boolean;
};

const ROLE_CARDS: RoleCardConfig[] = [
  { role: "church_admin", Icon: Shield,      iconColor: "text-red-500",     cardAccent: "group-hover:border-red-300 dark:group-hover:border-red-700" },
  { role: "pastor",       Icon: BookOpen,    iconColor: "text-amber-500",   cardAccent: "group-hover:border-amber-300 dark:group-hover:border-amber-700" },
  { role: "secretary",    Icon: ClipboardList, iconColor: "text-indigo-500", cardAccent: "group-hover:border-indigo-300 dark:group-hover:border-indigo-700" },
  { role: "tesoureiro",   Icon: Wallet,      iconColor: "text-blue-500",    cardAccent: "group-hover:border-blue-300 dark:group-hover:border-blue-700" },
  { role: "contador",     Icon: BarChart3,   iconColor: "text-cyan-500",    cardAccent: "group-hover:border-cyan-300 dark:group-hover:border-cyan-700" },
  { role: "leader",       Icon: Users,       iconColor: "text-purple-500",  cardAccent: "group-hover:border-purple-300 dark:group-hover:border-purple-700" },
  { role: "member",       Icon: User,        iconColor: "text-slate-500",   cardAccent: "group-hover:border-slate-300 dark:group-hover:border-slate-700" },
  { role: "porteiro",     Icon: Key,         iconColor: "text-emerald-500", cardAccent: "group-hover:border-emerald-300 dark:group-hover:border-emerald-700" },
];

const INVITE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente", accepted: "Aceito", expired: "Expirado", revoked: "Revogado",
};

const INVITE_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  expired:  "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400",
  revoked:  "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeRole(role: string | null | undefined): OrgMembershipRole {
  switch (role) {
    case "church_admin": case "admin": return "church_admin";
    case "tesoureiro": return "tesoureiro";
    case "contador":   return "contador";
    case "pastor":     return "pastor";
    case "secretary":  return "secretary";
    case "leader": case "lider": case "obreiro": return "leader";
    case "porteiro": return "porteiro";
    default: return "member";
  }
}

function UserAvatar({ user, size = "md" }: { user: OrgMemberRow; size?: "sm" | "md" | "lg" }) {
  const initials = user.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user.email?.charAt(0).toUpperCase() ?? "?";
  const cls = size === "lg" ? "w-14 h-14 text-base" : size === "sm" ? "w-8 h-8 text-[10px]" : "w-10 h-10 text-xs";
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className={`${cls} rounded-full object-cover flex-shrink-0`} />
  ) : (
    <div className={`${cls} rounded-full bg-accent/20 flex items-center justify-center font-bold text-accent flex-shrink-0`}>
      {initials}
    </div>
  );
}

function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}


// ── Platform Team Manager ─────────────────────────────────────────────────────

import { ALL_PLATFORM_ROLES, PLATFORM_ROLE_LABELS, isPlatformRole } from "@/lib/platformSupportPermissions";
import type { PlatformRole } from "@/lib/platformSupportPermissions";
import { SupportOrganizationSelector } from "@/components/platform/SupportOrganizationSelector";
import { useSupportContext } from "@/contexts/SupportContext";
import { useNavigate as _useNavigate } from "react-router-dom";

interface PlatformAgent {
  user_id: string;
  full_name: string | null;
  email: string | null;
  platform_role: string;
  departments: { id: string; name: string; is_primary: boolean }[];
}

function PlatformTeamManager() {
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const { activeSupportOrg, clearSupportOrg } = useSupportContext();
  const nav = _useNavigate();

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, platform_role")
      .not("platform_role", "is", null)
      .order("full_name");

    const agentRows: PlatformAgent[] = await Promise.all(
      (data ?? [])
        .filter((r) => r.platform_role && isPlatformRole(r.platform_role))
        .map(async (r) => {
          const { data: deptLinks } = await supabase
            .from("platform_support_agent_departments" as any)
            .select("is_primary, department:platform_support_departments(id, name)")
            .eq("agent_user_id", r.user_id);
          const departments = ((deptLinks || []) as any[])
            .map((d) => ({ id: d.department?.id, name: d.department?.name, is_primary: d.is_primary }))
            .filter((d) => d.id);
          return { user_id: r.user_id, full_name: r.full_name, email: r.email, platform_role: r.platform_role!, departments };
        })
    );

    setAgents(agentRows);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  // SEGURANÇA: profiles.platform_role não é mais editável por UPDATE direto
  // (grants por coluna revogados de `authenticated` — ver migration
  // 20260715130000_harden_platform_role_escalation.sql). A única forma
  // autorizada de conceder/revogar platform_role é a RPC SECURITY DEFINER
  // admin_set_platform_role, que internamente exige que quem chama já seja
  // is_platform_admin (fonte de autoridade: super_admins — nunca a própria
  // coluna profiles.platform_role ou user_roles legado).
  const handleUpdateRole = async (userId: string, newRole: PlatformRole) => {
    const { data, error } = await supabase.rpc("admin_set_platform_role", {
      _target_user_id: userId,
      _new_role: newRole,
    });
    const result = data as { ok?: boolean; error?: string } | null;
    if (error || !result?.ok) {
      toast({ title: "Não foi possível atualizar a função", description: error?.message ?? result?.error ?? "", variant: "destructive" });
      return;
    }
    toast({ title: `Função atualizada para ${PLATFORM_ROLE_LABELS[newRole]}` });
    void loadAgents();
  };

  const handleDeactivate = async (userId: string, name: string | null) => {
    if (!confirm(`Remover ${name || "este agente"} da equipe da plataforma?`)) return;
    setDeactivatingId(userId);
    const { data, error } = await supabase.rpc("admin_set_platform_role", {
      _target_user_id: userId,
      _new_role: null,
    });
    const result = data as { ok?: boolean; error?: string } | null;
    if (error || !result?.ok) {
      toast({ title: "Não foi possível remover o agente", description: error?.message ?? result?.error ?? "", variant: "destructive" });
      setDeactivatingId(null);
      return;
    }
    await supabase.from("platform_support_agent_departments" as any).delete().eq("agent_user_id", userId);
    toast({ title: `${name || "Agente"} removido da equipe` });
    setDeactivatingId(null);
    void loadAgents();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
              <Shield size={28} className="text-accent" />
              Gerenciar Acessos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Equipe da plataforma Ecclesia — funções, departamentos e permissões de acesso.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => nav("/admin/super-admin", { state: { openTeam: true } })}
              className="inline-flex items-center gap-2 px-3 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors border border-border"
            >
              <UserPlus size={15} />
              Novo agente
            </button>
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Building2 size={15} />
              Atender organização
            </button>
          </div>
        </div>

        {/* Current support context */}
        {activeSupportOrg && (
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-0.5">Modo suporte ativo</p>
              <p className="text-sm font-medium">{activeSupportOrg.name}</p>
              <p className="text-xs text-muted-foreground">{activeSupportOrg.organization_type} — {[activeSupportOrg.city, activeSupportOrg.state].filter(Boolean).join(", ")}</p>
            </div>
            <button type="button" onClick={clearSupportOrg} className="text-xs text-destructive hover:underline flex items-center gap-1">
              <X size={12} /> Sair
            </button>
          </div>
        )}

        <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Selecione uma organização para gerenciar seus acessos</p>
          <p>Clique em <strong>Atender organização</strong> para gerenciar acessos de uma Igreja específica (pastor, secretária, tesoureiro, etc).</p>
          <p>O painel abaixo mostra e gerencia a equipe interna da plataforma Ecclesia.</p>
        </div>

        {/* Agents table */}
        <div className="bg-card rounded-xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users size={15} className="text-accent" />
              Agentes da plataforma
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{agents.length} agente{agents.length !== 1 ? "s" : ""}</span>
              <button onClick={() => nav("/admin/super-admin")} className="text-xs text-accent hover:underline flex items-center gap-1">
                Ver Cockpit completo <ChevronRight size={11} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum agente da plataforma configurado.</p>
              <p className="text-xs mt-1">Acesse o Cockpit → Equipe para adicionar o primeiro agente.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {agents.map((agent) => {
                const initials = agent.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
                const roleLabel = PLATFORM_ROLE_LABELS[agent.platform_role as PlatformRole] || agent.platform_role;
                return (
                  <div key={agent.user_id} className="px-4 py-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent mt-0.5">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{agent.full_name || agent.email || agent.user_id}</p>
                      <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                      {agent.departments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.departments.map((d) => (
                            <span key={d.id} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${d.is_primary ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                              {d.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={agent.platform_role}
                        onChange={(e) => void handleUpdateRole(agent.user_id, e.target.value as PlatformRole)}
                        className="text-xs border border-border/60 rounded-md px-2 py-1 bg-background"
                      >
                        {ALL_PLATFORM_ROLES.map((r) => (
                          <option key={r} value={r}>{PLATFORM_ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={deactivatingId === agent.user_id}
                        onClick={() => void handleDeactivate(agent.user_id, agent.full_name)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-destructive/60 hover:text-destructive"
                        title="Remover da equipe"
                      >
                        {deactivatingId === agent.user_id ? <Loader2 size={13} className="animate-spin" /> : <UserX size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-muted/40 rounded-xl p-4 text-xs text-muted-foreground space-y-1 border border-border/30">
          <p className="font-medium text-foreground">Como adicionar novos agentes</p>
          <p>1. Acesse <strong>Cockpit → Equipe</strong> e clique em "Novo agente da plataforma".</p>
          <p>2. O agente deve ter uma conta ativa no Ecclesia (e-mail cadastrado).</p>
          <p>3. Configure a função e os departamentos de atuação.</p>
          <p>4. O agente aparecerá aqui e poderá selecionar organizações para atendimento.</p>
        </div>
      </div>

      <SupportOrganizationSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </AdminLayout>
  );
}

// ── Navigation state from Hierarquia ─────────────────────────────────────────

type HierarchyNavigationState = {
  openNewAccess?: boolean;
  presetRole?: string;
  contextOrganizationId?: string;
  contextOrganizationName?: string;
  contextOrganizationType?: string;
  source?: string;
} | null;

function readHierarchyContext(state: HierarchyNavigationState) {
  if (!state?.contextOrganizationId) return null;
  return {
    id: state.contextOrganizationId,
    name: state.contextOrganizationName ?? "Unidade",
    type: state.contextOrganizationType,
    source: state.source,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GerenciarAcessos() {
  const { user }                          = useAuth();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useRole();
  const { church, loading: churchLoading } = useChurch();
  const { t }                             = useLanguage();
  const navigate                          = useNavigate();
  const location                          = useLocation();

  const navigationState = location.state as HierarchyNavigationState;
  const contextOrganizationId   = navigationState?.contextOrganizationId ?? null;
  const contextOrganizationName = navigationState?.contextOrganizationName ?? null;
  const contextOrganizationType = navigationState?.contextOrganizationType ?? null;
  const navigationSource        = navigationState?.source ?? null;
  const navigationPresetRole    = navigationState?.presetRole ?? null;

  // Ref persiste o ID contextual — não reseta ao abrir modal ou trocar role
  const hierarchyContextOrgIdRef   = useRef<string | null>(contextOrganizationId);
  const hierarchyContextOrgNameRef = useRef<string | null>(contextOrganizationName);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [users, setUsers]                   = useState<OrgMemberRow[]>([]);
  const [invites, setInvites]               = useState<AccessInviteRecord[]>([]);
  const [loading, setLoading]               = useState(true);
  const [invitesSupported, setInvitesSupported] = useState(true);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selectedRole, setSelectedRole]     = useState<OrgMembershipRole | null>(null);
  const [detailUser, setDetailUser]         = useState<OrgMemberRow | null>(null);
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [updatingId, setUpdatingId]         = useState<string | null>(null);
  const [removingId, setRemovingId]         = useState<string | null>(null);
  const [revokingId, setRevokingId]         = useState<string | null>(null);
  const [newAccessModal, setNewAccessModal] = useState(false);
  const [newAccessForm, setNewAccessForm]   = useState({
    name: "", email: "", phone: "", role: "member" as OrgMembershipRole,
  });
  const [savingInvite, setSavingInvite]     = useState(false);

  // Autorizar membro existente
  const [authorizeModal, setAuthorizeModal]   = useState(false);
  const [memberSearch, setMemberSearch]       = useState("");
  const [searchResults, setSearchResults]     = useState<SearchedMember[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [authorizingId, setAuthorizingId]     = useState<string | null>(null);
  const [authorizeRole, setAuthorizeRole]     = useState<OrgMembershipRole>("member");
  const [selectedMember, setSelectedMember]   = useState<SearchedMember | null>(null);
  const [appAccessRole, setAppAccessRole]     = useState<OrgMembershipRole | "">("");
  const [churchRole, setChurchRole]           = useState("");
  const [customChurchRole, setCustomChurchRole] = useState("");

  // Contexto de unidade vindo da Hierarquia — inicializado sincronamente do state
  const [contextOrg, setContextOrg] = useState<
    { id: string; name: string; type?: string; source?: string } | null
  >(() => readHierarchyContext(navigationState));

  // Sincroniza contexto e modal quando navega de Congregacoes (+ Definir)
  useEffect(() => {
    const state = location.state as HierarchyNavigationState;
    const ctx = readHierarchyContext(state);
    if (ctx?.id) {
      hierarchyContextOrgIdRef.current = ctx.id;
      hierarchyContextOrgNameRef.current = ctx.name;
      setContextOrg(ctx);
    }
    if (state?.openNewAccess) {
      const preset = state.presetRole ? normalizeRole(state.presetRole) : "secretary";
      setNewAccessForm((f) => ({ ...f, role: preset }));
      setNewAccessModal(true);
    }
  }, [location.state, location.key]);

  // Organização efetiva: contexto da Hierarquia tem prioridade máxima sobre church.id
  const effectiveOrgId =
    hierarchyContextOrgIdRef.current
    ?? contextOrganizationId
    ?? contextOrg?.id
    ?? church?.id
    ?? null;

  const effectiveOrgName =
    hierarchyContextOrgNameRef.current
    ?? contextOrganizationName
    ?? contextOrg?.name
    ?? church?.name
    ?? "Organização atual";

  const isHierarchyContext = Boolean(
    hierarchyContextOrgIdRef.current ?? contextOrganizationId ?? contextOrg?.id,
  );
  const isContextScoped = isHierarchyContext && effectiveOrgId !== church?.id;

  // ── Derived ────────────────────────────────────────────────────────────────
  const roleCounts = useMemo(() => {
    const counts: Partial<Record<OrgMembershipRole, number>> = {};
    for (const u of users) {
      if (u.is_active) counts[u.role] = (counts[u.role] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  const filteredUsers = useMemo(
    () => selectedRole ? users.filter((u) => u.role === selectedRole) : users,
    [users, selectedRole],
  );

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!effectiveOrgId) { setUsers([]); return; }

    const { data: memberships, error: membErr } = await supabase
      .from("organization_users")
      .select("id, user_id, role, is_active, created_at")
      .eq("organization_id", effectiveOrgId)
      .order("created_at", { ascending: true });

    if (membErr) {
      toast({ title: t("Erro ao carregar usuários"), description: membErr.message, variant: "destructive" });
      setUsers([]); return;
    }

    const rows = memberships || [];
    if (rows.length === 0) { setUsers([]); return; }

    const userIds = rows.map((m) => m.user_id);

    // Name resolution priority: for members activated via invite (e.g. Modo
    // Porteiro, Carteira), the reliable name lives in members.full_name
    // (members.user_id = organization_users.user_id) — profiles.full_name may
    // be empty/stale for accounts created through the invite Edge Function,
    // which never had a "cadastro livre" step to fill it in.
    const [{ data: profiles }, { data: linkedMembers }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, email")
        .in("user_id", userIds),
      supabase
        .from("members")
        .select("user_id, full_name")
        .eq("organization_id", effectiveOrgId)
        .in("user_id", userIds),
    ]);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const memberNameMap = new Map(
      (linkedMembers || [])
        .filter((m): m is { user_id: string; full_name: string | null } => !!m.user_id)
        .map((m) => [m.user_id, m.full_name]),
    );

    // Use the functional updater to safely read the previous list as a last
    // resort fallback (`existingName`), without needing `users` in the
    // dependency array — that would redefine `loadUsers` on every update and
    // could re-trigger the loading effect in a loop.
    setUsers((prev) => {
      const existingNameMap = new Map(prev.map((u) => [u.user_id, u.full_name]));

      const merged: OrgMemberRow[] = rows.map((m) => {
        const p = profileMap.get(m.user_id);
        const displayName =
          memberNameMap.get(m.user_id) ||
          p?.full_name ||
          existingNameMap.get(m.user_id) ||
          p?.email ||
          null;
        return {
          membership_id: m.id, user_id: m.user_id,
          full_name: displayName, email: p?.email ?? null,
          avatar_url: p?.avatar_url ?? null,
          role: normalizeRole(m.role), is_active: m.is_active ?? true,
          created_at: m.created_at,
        };
      });

      merged.sort((a, b) => {
        const diff = ASSIGNABLE_ROLES.indexOf(a.role) - ASSIGNABLE_ROLES.indexOf(b.role);
        return diff !== 0 ? diff : (a.full_name || "").localeCompare(b.full_name || "", "pt-BR");
      });

      return merged;
    });
  }, [effectiveOrgId, t]);

  const loadInvites = useCallback(async () => {
    if (!effectiveOrgId) { setInvites([]); return; }
    try {
      setInvites(await getAccessInvites(effectiveOrgId));
    } catch {
      setInvitesSupported(false);
      setInvites([]);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    if (roleLoading || churchLoading) return;
    if (!user) { setLoading(false); return; }
    setLoading(true);
    Promise.all([loadUsers(), loadInvites()]).finally(() => setLoading(false));
  }, [user, roleLoading, churchLoading, loadUsers, loadInvites]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleChatWith = (u: OrgMemberRow) => {
    navigate("/admin/chat", {
      state: { openDm: true, userId: u.user_id, userName: u.full_name || u.email || "Usuário" },
    });
  };

  const openNewAccess = (role?: OrgMembershipRole) => {
    setNewAccessForm((f) => ({ ...f, role: role ?? selectedRole ?? "member" }));
    setNewAccessModal(true);
  };

  const openAuthorizeExisting = (role?: OrgMembershipRole) => {
    setAuthorizeRole(role ?? selectedRole ?? "member");
    setAppAccessRole(role ?? selectedRole ?? "member");
    setChurchRole("");
    setCustomChurchRole("");
    setSelectedMember(null);
    setAuthorizeModal(true);
    setMemberSearch("");
    setSearchResults([]);
  };

  const searchMembers = async (query: string) => {
    setMemberSearch(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearchingMembers(true);
    const orgId = effectiveOrgId;
    if (!orgId) { setSearchingMembers(false); return; }
    const { data, error } = await supabase
      .from("members")
      .select("id, full_name, user_id, member_role, status, photo_url, congregation_id, sector_id")
      .eq("organization_id", orgId)
      .ilike("full_name", `%${query.trim()}%`)
      .order("full_name")
      .limit(20);
    if (!error && data) {
      setSearchResults(data as SearchedMember[]);
    }
    setSearchingMembers(false);
  };

  const handleSelectMember = (member: SearchedMember) => {
    if (!member.user_id) {
      toast({
        title: "Membro sem login",
        description: "Este membro ainda não possui acesso ao aplicativo. Crie o acesso do membro antes de autorizar esta função.",
        variant: "destructive",
      });
      return;
    }
    setSelectedMember(member);
  };

  const handleConfirmAuthorize = async () => {
    if (!selectedMember || !selectedMember.user_id || !effectiveOrgId) return;
    if (!appAccessRole) {
      toast({ title: "Acesso não selecionado", description: "Selecione o acesso no aplicativo.", variant: "destructive" });
      return;
    }
    if (!churchRole) {
      toast({ title: "Cargo não selecionado", description: "Selecione a função/cargo na igreja.", variant: "destructive" });
      return;
    }
    if (churchRole === "Personalizado" && !customChurchRole.trim()) {
      toast({ title: "Função personalizada vazia", description: "Digite a função/cargo personalizada.", variant: "destructive" });
      return;
    }

    const effectiveChurchRole = churchRole === "Personalizado" ? customChurchRole.trim() : churchRole;
    setAuthorizingId(selectedMember.id);

    // 1) Save app access (organization_users.role)
    const { error: orgErr } = await supabase
      .from("organization_users")
      .upsert({
        user_id: selectedMember.user_id,
        organization_id: effectiveOrgId,
        role: appAccessRole,
        is_active: true,
      }, { onConflict: "user_id,organization_id" });

    if (orgErr) {
      toast({ title: "Erro ao autorizar", description: orgErr.message, variant: "destructive" });
      setAuthorizingId(null);
      return;
    }

    // 2) Save church role (members.member_role)
    const { error: memErr } = await supabase
      .from("members")
      .update({ member_role: effectiveChurchRole })
      .eq("id", selectedMember.id);

    if (memErr) {
      toast({ title: "Acesso criado, mas erro ao salvar cargo", description: memErr.message, variant: "destructive" });
    }

    const roleLabel = ROLE_LABELS[appAccessRole] || appAccessRole;
    toast({ title: `${roleLabel} autorizado com sucesso.` });
    await loadUsers();
    setAuthorizeModal(false);
    setMemberSearch("");
    setSearchResults([]);
    setSelectedMember(null);
    setChurchRole("");
    setCustomChurchRole("");
    setAuthorizingId(null);
  };

  const handleRoleChange = async (membershipId: string, userId: string, newRole: OrgMembershipRole) => {
    if (!effectiveOrgId) return;
    setUpdatingId(userId);
    const { error } = await supabase
      .from("organization_users")
      .update({ role: newRole })
      .eq("id", membershipId)
      .eq("organization_id", effectiveOrgId);
    if (error) {
      toast({ title: t("Erro ao atualizar"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Função atualizada para ${ROLE_LABELS[newRole]}` });
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role: newRole } : u));
      if (detailUser?.user_id === userId) setDetailUser((d) => d ? { ...d, role: newRole } : d);
    }
    setUpdatingId(null);
  };

  const handleRemoveAccess = async (membershipId: string, userId: string) => {
    if (!effectiveOrgId) return;
    if (!confirm(t("Remover acesso desta pessoa à organização?"))) return;
    setRemovingId(userId);
    const { error } = await supabase
      .from("organization_users")
      .update({ is_active: false })
      .eq("id", membershipId)
      .eq("organization_id", effectiveOrgId);
    if (error) {
      toast({ title: t("Erro ao remover acesso"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Acesso removido") });
      setUsers((prev) => prev.map((u) => u.membership_id === membershipId ? { ...u, is_active: false } : u));
      setExpandedId(null);
      setDetailUser(null);
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
    navigator.clipboard.writeText(buildAccessInviteUrl(token)).catch(() => {});
    toast({ title: "Link copiado!" });
  };

  const handleWhatsAppInvite = (inv: AccessInviteRecord) => {
    if (!effectiveOrgName) return;
    if (!inv.phone) { handleCopyInviteLink(inv.token); toast({ title: "Sem WhatsApp. Link copiado!" }); return; }
    window.open(buildAccessWhatsAppLink({ phone: inv.phone, name: inv.full_name, roleLabel: ROLE_LABELS[normalizeRole(inv.role)], orgName: effectiveOrgName, token: inv.token }), "_blank", "noopener,noreferrer");
  };

  const handleCreateInvite = async () => {
    if (!newAccessForm.name.trim()) { toast({ title: "Nome é obrigatório.", variant: "destructive" }); return; }

    const inviteOrgId =
      hierarchyContextOrgIdRef.current
      ?? contextOrganizationId
      ?? contextOrg?.id
      ?? church?.id
      ?? null;

    if (!inviteOrgId) {
      toast({
        title: "Organização não definida",
        description: "Não foi possível identificar em qual unidade o acesso será criado.",
        variant: "destructive",
      });
      return;
    }
    if (!user?.id) return;

    if (!newAccessForm.email.trim()) {
      toast({
        title: "E-mail obrigatório",
        description: "Convites de acesso administrativo exigem um e-mail para vincular a conta correta.",
        variant: "destructive",
      });
      return;
    }

    setSavingInvite(true);

    if (newAccessForm.email.trim()) {
      const { data: existingProfile } = await supabase
        .from("profiles").select("user_id, full_name").eq("email", newAccessForm.email.trim()).maybeSingle();
      if (existingProfile) {
        const { error } = await supabase.from("organization_users").upsert({
          user_id: existingProfile.user_id, organization_id: inviteOrgId,
          role: newAccessForm.role, is_active: true,
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

    const { data: inv, error: invErr } = await createAccessInvite({
      organization_id: inviteOrgId, invited_by: user.id,
      full_name: newAccessForm.name.trim(),
      email: newAccessForm.email.trim(),
      phone: newAccessForm.phone.trim() || undefined,
      role: newAccessForm.role,
    });

    if (invErr || !inv) {
      const isTableMissing = invErr?.includes("relation") || invErr?.includes("does not exist") || invErr?.includes("42P01");
      toast({
        title: isTableMissing ? "Migração pendente" : "Erro ao criar convite",
        description: isTableMissing ? "Aplique 20260618120000_access_invites.sql no Supabase." : invErr ?? "",
        variant: "destructive",
      });
    } else {
      navigator.clipboard.writeText(buildAccessInviteUrl(inv.token)).catch(() => {});
      toast({ title: "Convite criado!", description: "Link copiado para a área de transferência." });
      await loadInvites();
    }

    setNewAccessForm({ name: "", email: "", phone: "", role: "member" });
    setNewAccessModal(false);
    setSavingInvite(false);
  };

  if (!roleLoading && !isAdmin) return <Navigate to="/admin" replace />;

  // ── Platform Team Manager (Super Admin view, only when no org context) ─────
  // Shows when: super admin, no hierarchy context, no support org active (no church)
  if (!roleLoading && !churchLoading && isSuperAdmin && !hierarchyContextOrgIdRef.current && !contextOrganizationId && !church) {
    return <PlatformTeamManager />;
  }

  const pendingInvites  = invites.filter((i) => i.status === "pending");
  const historicInvites = invites.filter((i) => i.status !== "pending");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
              <Shield size={28} className="text-accent" />
              {t("Gerenciar Acessos")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {effectiveOrgName ? `Usuários e convites de ${effectiveOrgName}` : t("Defina quem pode acessar cada módulo")}
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => openAuthorizeExisting()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <UserCheck size={16} />
              Autorizar Acesso
            </button>
          )}
        </div>

        {/* ── Banner de contexto de unidade ─────────────────────────────────── */}
        {isHierarchyContext && contextOrg && (
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Shield size={18} className="text-accent flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">
                    Gerenciando acessos de: {contextOrg.name}
                  </p>
                  {(contextOrg.source === "hierarquia" || navigationSource === "hierarquia") && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                      Origem: Hierarquia
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Convites e vínculos criados aqui pertencem a esta unidade
                  {contextOrg.type ? ` (${contextOrg.type})` : ""}
                  {isContextScoped ? " — não à Matriz." : "."}
                </p>
              </div>
            </div>
            {church && isContextScoped && (
              <button
                type="button"
                onClick={() => {
                  hierarchyContextOrgIdRef.current = null;
                  hierarchyContextOrgNameRef.current = null;
                  setContextOrg(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-medium hover:bg-secondary transition-colors flex-shrink-0"
              >
                <ArrowLeft size={13} /> Voltar para {church.name}
              </button>
            )}
          </div>
        )}

        {/* ── Migration warning ─────────────────────────────────────────────── */}
        {!invitesSupported && (
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Migração necessária</p>
            <p className="text-muted-foreground mt-0.5">
              Aplique <code className="bg-secondary px-1 rounded text-xs">20260618120000_access_invites.sql</code> para habilitar convites persistentes.
            </p>
          </div>
        )}

        {/* ── Funções — Role grid ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Funções disponíveis
            </h2>
            {selectedRole && (
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={12} /> Ver todas
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ROLE_CARDS.map(({ role, Icon, iconColor, cardAccent, future }) => {
              const isSelected = selectedRole === role;
              const count      = future ? 0 : (roleCounts[role as OrgMembershipRole] ?? 0);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    if (future) {
                      toast({ title: "Em breve", description: "A função Porteiro será habilitada futuramente com leitor de QR Code." });
                      return;
                    }
                    setSelectedRole(isSelected ? null : (role as OrgMembershipRole));
                  }}
                  className={`group relative flex flex-col gap-2 p-3.5 rounded-xl border transition-all text-left ${
                    isSelected
                      ? "border-accent bg-accent/10 shadow-sm"
                      : `border-border/60 bg-card hover:bg-secondary/50 ${cardAccent}`
                  } ${future ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <Icon size={20} className={`${isSelected ? "text-accent" : iconColor} transition-colors`} />
                    {future ? (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Em breve
                      </span>
                    ) : (
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : count > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {count}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold leading-tight">{ROLE_LABELS[role]}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                      {ROLE_DESC[role]}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="absolute bottom-2 right-2">
                      <ChevronRight size={12} className="text-accent" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Pending invites ───────────────────────────────────────────────── */}
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
                const roleNorm  = normalizeRole(inv.role);
                const inviteUrl = buildAccessInviteUrl(inv.token);
                const expires   = inv.expires_at ? format(new Date(inv.expires_at), "dd/MM/yyyy", { locale: ptBR }) : "—";
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
                        <button type="button" onClick={() => handleWhatsAppInvite(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors border border-green-300 dark:border-green-800">
                          <WhatsAppIcon size={12} /> WhatsApp
                        </button>
                      )}
                      <button type="button" onClick={() => handleCopyInviteLink(inv.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-secondary hover:bg-secondary/80 transition-colors border border-border">
                        <Copy size={11} /> Copiar link
                      </button>
                      <button type="button" disabled={revokingId === inv.id} onClick={() => void handleRevokeInvite(inv.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-destructive hover:bg-destructive/10 transition-colors border border-destructive/30 disabled:opacity-40">
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

        {/* ── User list ─────────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-500" />
              {selectedRole ? (
                <>
                  <button type="button" onClick={() => setSelectedRole(null)}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft size={13} />
                    Todas as funções
                  </button>
                  <span className="text-muted-foreground">/</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[selectedRole]}`}>
                    {ROLE_LABELS[selectedRole]}
                  </span>
                </>
              ) : (
                <>
                  Usuários com Acesso
                  {!loading && <span className="text-muted-foreground text-xs font-normal">({users.length})</span>}
                </>
              )}
            </h2>
            {selectedRole && (
              <button type="button" onClick={() => openAuthorizeExisting(selectedRole)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
                <UserCheck size={13} /> Autorizar {ROLE_LABELS[selectedRole]}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
              {selectedRole ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    {(() => { const cfg = ROLE_CARDS.find((c) => c.role === selectedRole); return cfg ? <cfg.Icon size={22} className={cfg.iconColor} /> : <User size={22} />; })()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">Nenhum {ROLE_LABELS[selectedRole]} cadastrado</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Autorize um membro existente para assumir esta função nesta unidade.</p>
                  </div>
                  <button type="button" onClick={() => openAuthorizeExisting(selectedRole)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                    <UserCheck size={15} /> Autorizar {ROLE_LABELS[selectedRole]}
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {effectiveOrgId ? "Nenhum usuário vinculado." : "Selecione uma organização."}
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredUsers.map((u) => {
                const isCurrentUser = u.user_id === user?.id;
                const isExpanded    = expandedId === u.membership_id;
                return (
                  <div key={u.membership_id} className={!u.is_active ? "opacity-50" : ""}>
                    {/* Row header */}
                    <div
                      role="button" tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : u.membership_id)}
                      onKeyDown={(e) => e.key === "Enter" && setExpandedId(isExpanded ? null : u.membership_id)}
                      className="flex items-center gap-3 p-4 hover:bg-secondary/30 transition-colors cursor-pointer select-none"
                    >
                      <UserAvatar user={u} />
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
                        {/* Quick actions (visible without expanding) */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDetailUser(u); }}
                          title="Ver acesso"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleChatWith(u); }}
                          title="Conversar"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                        >
                          <MessageSquare size={14} />
                        </button>
                        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t border-border/30 px-4 pb-4 pt-3 flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex-1 space-y-2">
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
                                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{ROLE_DESC[u.role]}</p>
                        </div>

                        <div className="flex gap-2 flex-wrap flex-shrink-0">
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); setDetailUser(u); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 border border-border">
                            <Eye size={13} /> Ver Acesso
                          </button>
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); handleChatWith(u); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 border border-accent/30">
                            <MessageSquare size={13} /> Conversar
                          </button>
                          {!isCurrentUser && (
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); void handleRemoveAccess(u.membership_id, u.user_id); }}
                              disabled={removingId === u.user_id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 border border-destructive/30 disabled:opacity-40">
                              {removingId === u.user_id ? <Loader2 size={13} className="animate-spin" /> : <UserX size={13} />}
                              Revogar acesso
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Invite history ───────────────────────────────────────────────── */}
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
                const roleNorm  = normalizeRole(inv.role);
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

      </div>

      {/* ── New Access Modal ────────────────────────────────────────────────── */}
      {newAccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <UserPlus size={16} className="text-accent" /> Novo Acesso
              </h2>
              <button type="button" onClick={() => setNewAccessModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se o usuário já existir e puder ser localizado pelo e-mail cadastrado em perfis, o vínculo será criado imediatamente. Caso contrário, será gerado um convite pendente.
              {isHierarchyContext && (
                <> Unidade alvo: <strong>{effectiveOrgName}</strong>.</>
              )}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Nome completo *</label>
                <input value={newAccessForm.name} onChange={(e) => setNewAccessForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Email <span className="text-destructive">*</span></label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="email" required value={newAccessForm.email} onChange={(e) => setNewAccessForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">WhatsApp (opcional)</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={newAccessForm.phone} onChange={(e) => setNewAccessForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(54) 99999-9999"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Função</label>
                <select value={newAccessForm.role} onChange={(e) => setNewAccessForm((f) => ({ ...f, role: e.target.value as OrgMembershipRole }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">{ROLE_DESC[newAccessForm.role]}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={savingInvite} onClick={() => void handleCreateInvite()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {savingInvite ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar acesso
              </button>
              <button type="button" onClick={() => setNewAccessModal(false)}
                className="px-4 py-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/80">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User detail sheet (right drawer) ──────────────────────────────── */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setDetailUser(null)} />
          <div className="w-full max-w-sm bg-card shadow-2xl flex flex-col h-full overflow-y-auto">
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Eye size={16} className="text-accent" /> Detalhe do Acesso
              </h2>
              <button type="button" onClick={() => setDetailUser(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Sheet body */}
            <div className="flex-1 px-5 py-6 space-y-6">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <UserAvatar user={detailUser} size="lg" />
                <div>
                  <p className="font-semibold text-base">{detailUser.full_name || "Sem nome"}</p>
                  {detailUser.email && <p className="text-sm text-muted-foreground">{detailUser.email}</p>}
                </div>
              </div>

              {/* Info grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2.5 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">Função</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[detailUser.role]}`}>
                    {ROLE_LABELS[detailUser.role]}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${detailUser.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
                    {detailUser.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                {detailUser.created_at && (
                  <div className="flex items-center justify-between py-2.5 border-b border-border/40">
                    <span className="text-xs text-muted-foreground">Vinculado em</span>
                    <span className="text-xs font-medium">
                      {format(new Date(detailUser.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2.5 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">Unidade</span>
                  <span className="text-xs font-medium">{effectiveOrgName ?? "—"}</span>
                </div>
              </div>

              {/* Permissions summary */}
              <div className="bg-secondary/40 rounded-xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles size={11} /> Permissões principais
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{ROLE_DESC[detailUser.role]}</p>
              </div>

              {/* Alterar função */}
              {detailUser.user_id !== user?.id && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Alterar função</p>
                  <div className="relative">
                    {updatingId === detailUser.user_id ? (
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <select
                          value={detailUser.role}
                          onChange={(e) => void handleRoleChange(detailUser.membership_id, detailUser.user_id, e.target.value as OrgMembershipRole)}
                          className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border border-border focus:outline-none focus:ring-2 focus:ring-accent/30 bg-card text-foreground cursor-pointer"
                        >
                          {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sheet actions */}
            <div className="px-5 py-4 border-t border-border/50 flex flex-col gap-2 flex-shrink-0">
              <button type="button" onClick={() => { handleChatWith(detailUser); setDetailUser(null); }}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors border border-accent/30">
                <MessageSquare size={15} /> Abrir Conversa
              </button>
              {detailUser.user_id !== user?.id && (
                <button type="button"
                  disabled={removingId === detailUser.user_id}
                  onClick={() => void handleRemoveAccess(detailUser.membership_id, detailUser.user_id)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/10 transition-colors border border-destructive/30 disabled:opacity-40">
                  {removingId === detailUser.user_id ? <Loader2 size={15} className="animate-spin" /> : <UserX size={15} />}
                  Revogar Acesso
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Authorize Existing Member Modal ────────────────────────────────── */}
      {authorizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between flex-shrink-0">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <UserCheck size={16} className="text-accent" /> Autorizar acesso
              </h2>
              <button type="button" onClick={() => { setAuthorizeModal(false); setSearchResults([]); setMemberSearch(""); setSelectedMember(null); setChurchRole(""); setCustomChurchRole(""); }}
                className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {!selectedMember ? (
              <>
                <p className="text-xs text-muted-foreground flex-shrink-0">
                  Selecione um membro já cadastrado para autorizar o acesso no aplicativo.
                  {isHierarchyContext && (
                    <> Unidade alvo: <strong>{effectiveOrgName}</strong>.</>
                  )}
                </p>

                {/* Search input */}
                <div className="relative flex-shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => { searchMembers(e.target.value); }}
                    placeholder="Buscar membro por nome"
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
                  {searchingMembers ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : memberSearch.trim().length < 2 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Digite pelo menos 2 caracteres para buscar membros.
                    </p>
                  ) : searchResults.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhum membro encontrado com este nome.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {searchResults.map((m) => {
                        const hasLogin = Boolean(m.user_id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={!hasLogin}
                            onClick={() => { handleSelectMember(m); }}
                            title={!hasLogin ? "Membro sem acesso ao aplicativo" : "Selecionar este membro"}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                              hasLogin
                                ? "border-border/60 bg-card hover:bg-secondary/30 cursor-pointer"
                                : "border-border/30 bg-muted/30 cursor-not-allowed opacity-60"
                            }`}
                          >
                            {m.photo_url ? (
                              <img src={m.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-border" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                                {m.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.full_name}</p>
                              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                                {m.member_role ?? "Membro"}
                                {m.status && (
                                  <span className="text-[10px] px-1 py-0 rounded bg-muted">{m.status}</span>
                                )}
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              {hasLogin ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                                  Com login
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-medium">
                                  Sem login
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-1 flex-shrink-0 border-t border-border/40">
                  <button type="button"
                    onClick={() => { setAuthorizeModal(false); setSearchResults([]); setMemberSearch(""); }}
                    className="w-full px-4 py-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/80">
                    Fechar
                  </button>
                  <button type="button"
                    onClick={() => { setAuthorizeModal(false); setSearchResults([]); setMemberSearch(""); openNewAccess(authorizeRole); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                    <UserPlus size={12} className="inline mr-1" />
                    Precisa convidar alguém externo? Criar convite
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Selected member card */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/20 flex-shrink-0">
                  {selectedMember.photo_url ? (
                    <img src={selectedMember.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-1 ring-border" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                      {selectedMember.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedMember.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedMember.member_role ?? "Membro"}
                      {selectedMember.status && (
                        <span className="ml-1.5 text-[10px] px-1 py-0 rounded bg-muted">{selectedMember.status}</span>
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={() => { setSelectedMember(null); setAppAccessRole(authorizeRole); setChurchRole(""); setCustomChurchRole(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                    Trocar
                  </button>
                </div>

                <div className="space-y-3 flex-shrink-0">
                  {/* Acesso no aplicativo */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Acesso no aplicativo</label>
                    <select
                      value={appAccessRole}
                      onChange={(e) => setAppAccessRole(e.target.value as OrgMembershipRole)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      <option value="" disabled>Selecione o acesso no aplicativo</option>
                      {APP_ACCESS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {appAccessRole && (
                      <p className="text-[11px] text-muted-foreground mt-1">{ROLE_DESC[appAccessRole]}</p>
                    )}
                  </div>

                  {/* Função/Cargo na igreja */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Função/Cargo na igreja</label>
                    <select
                      value={churchRole}
                      onChange={(e) => {
                        setChurchRole(e.target.value);
                        if (e.target.value !== "Personalizado") setCustomChurchRole("");
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      <option value="" disabled>Selecione a função/cargo</option>
                      {CHURCH_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {/* Função personalizada */}
                  {churchRole === "Personalizado" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Digite a função/cargo</label>
                      <input
                        type="text"
                        value={customChurchRole}
                        onChange={(e) => setCustomChurchRole(e.target.value)}
                        placeholder="Ex.: Coordenador de recepção"
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  )}
                </div>

                {/* Security note */}
                <p className="text-[11px] text-muted-foreground flex-shrink-0">
                  Cargo eclesiástico não concede permissão automática. O acesso ao app é definido exclusivamente pelo campo acima.
                </p>

                <div className="flex gap-2 pt-1 flex-shrink-0 border-t border-border/40">
                  <button type="button"
                    onClick={() => { setSelectedMember(null); setAppAccessRole(authorizeRole); setChurchRole(""); setCustomChurchRole(""); }}
                    className="flex-1 px-4 py-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/80">
                    Voltar
                  </button>
                  <button type="button"
                    disabled={authorizingId !== null || !appAccessRole || !churchRole || (churchRole === "Personalizado" && !customChurchRole.trim())}
                    onClick={() => { handleConfirmAuthorize(); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {authorizingId !== null ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                    Autorizar {appAccessRole ? ROLE_LABELS[appAccessRole] : "acesso"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
