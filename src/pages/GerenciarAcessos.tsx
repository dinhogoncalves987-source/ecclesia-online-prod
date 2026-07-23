import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronRight,
  ClipboardCopy,
  Loader2,
  Mail,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { SupportOrganizationSelector } from "@/components/platform/SupportOrganizationSelector";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCESS_RESPONSIBILITIES,
  ACCESS_RESPONSIBILITY_BY_KEY,
  RESPONSIBILITY_CATEGORY_LABELS,
  isAccessResponsibility,
  mergeAccessResponsibilities,
  type AccessResponsibility,
  type ResponsibilityCategory,
} from "@/lib/accessControl";
import { buildAccessInviteUrl } from "@/lib/accessInvites";
import { buildInviteUrl } from "@/lib/memberInvites";
import { isModuleEnabled } from "@/config/modules";

type HierarchyNavigationState = {
  openNewAccess?: boolean;
  presetRole?: string;
  contextOrganizationId?: string;
  contextOrganizationName?: string;
  contextOrganizationType?: string;
  source?: string;
  presetMemberId?: string;
  presetMemberName?: string;
} | null;

interface ManagedAccessUser {
  membership_id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  member_id: string | null;
  ecclesiastical_role: string | null;
  responsibility_types: AccessResponsibility[];
}

interface SearchedMember {
  id: string;
  full_name: string;
  user_id: string | null;
  ecclesiastical_role: string | null;
  status: string | null;
  photo_url: string | null;
  organization_id: string;
  sector_id: string | null;
  congregation_id: string | null;
  email: string | null;
}

interface PendingAccessInvite {
  id: string;
  token: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  responsibility_types: AccessResponsibility[];
}

type JsonResult = Record<string, unknown> | null;

const LEGACY_PRESET_MAP: Record<string, AccessResponsibility> = {
  admin: "church_admin",
  church_admin: "church_admin",
  pastor: "responsible_pastor",
  secretary: "secretary",
  tesoureiro: "treasurer",
  contador: "accountant",
  leader: "group_manager",
  lider: "group_manager",
  porteiro: "gatekeeper",
};

const CATEGORY_ORDER: ResponsibilityCategory[] = [
  "governance",
  "secretariat",
  "finance",
  "operations",
  "ministries",
];

function normalizeResponsibilities(values: unknown): AccessResponsibility[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is AccessResponsibility =>
    typeof value === "string" && isAccessResponsibility(value),
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function describeRpcError(message: string): string {
  if (message.includes("local manager cannot grant governance")) {
    return "Administrador, pastor responsável e gestor de acessos deste nível devem ser definidos pela unidade superior.";
  }
  if (message.includes("outside organization scope")) return "Esse membro está fora da estrutura desta unidade.";
  if (message.includes("member email is required")) return "Cadastre o e-mail do membro antes de gerar o convite.";
  if (message.includes("access denied")) return "Sua autorização não alcança esta unidade da hierarquia.";
  return message;
}

function ResponsibilityBadge({ responsibility }: { responsibility: AccessResponsibility }) {
  const { t } = useLanguage();
  const definition = ACCESS_RESPONSIBILITY_BY_KEY.get(responsibility);
  if (!definition) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/60 px-2 py-1 text-[11px] font-medium text-foreground">
      {t(definition.label)}
    </span>
  );
}

function ResponsibilityPicker({
  selected,
  onChange,
  allowGovernance,
}: {
  selected: Set<AccessResponsibility>;
  onChange: (next: Set<AccessResponsibility>) => void;
  allowGovernance: boolean;
}) {
  const { t } = useLanguage();
  const toggle = (responsibility: AccessResponsibility) => {
    const next = new Set(selected);
    if (next.has(responsibility)) next.delete(responsibility);
    else next.add(responsibility);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((category) => {
        const definitions = ACCESS_RESPONSIBILITIES.filter(
          (item) =>
            item.category === category
            && (
              isModuleEnabled("discipleship")
              || !item.key.startsWith("discipleship_")
            )
            && (
              isModuleEnabled("theology")
              || !item.key.startsWith("theology_")
            ),
        );
        return (
          <section key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(RESPONSIBILITY_CATEGORY_LABELS[category])}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {definitions.map((definition) => {
                const checked = selected.has(definition.key);
                const disabled = definition.governance && !allowGovernance;
                return (
                  <button
                    key={definition.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(definition.key)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      checked
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-card hover:border-primary/40"
                    } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                        {checked && <Check size={13} />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{t(definition.label)}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{t(definition.description)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!allowGovernance && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          {t("Funções de governo desta unidade são definidas pela unidade superior. Aqui você pode distribuir todos os trabalhos operacionais.")}
        </p>
      )}
    </div>
  );
}

export default function GerenciarAcessos() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { church, loading: churchLoading } = useChurch();
  const { canAccess, isSuperAdmin, loading: roleLoading } = useRole();
  const location = useLocation();
  const navigationState = location.state as HierarchyNavigationState;

  const effectiveOrgId = navigationState?.contextOrganizationId ?? church?.id ?? null;
  const effectiveOrgName = navigationState?.contextOrganizationName ?? church?.name ?? t("Organização");
  const effectiveOrgType = navigationState?.contextOrganizationType ?? church?.organization_type ?? null;
  const allowGovernance = isSuperAdmin || Boolean(church?.id && effectiveOrgId && church.id !== effectiveOrgId);

  const [organizationSelectorOpen, setOrganizationSelectorOpen] = useState(false);
  const [users, setUsers] = useState<ManagedAccessUser[]>([]);
  const [invites, setInvites] = useState<PendingAccessInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedAccessUser | null>(null);
  const [selectedResponsibilities, setSelectedResponsibilities] = useState<Set<AccessResponsibility>>(new Set());
  const [saving, setSaving] = useState(false);

  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<SearchedMember[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const memberSearchSequence = useRef(0);
  const [selectedMember, setSelectedMember] = useState<SearchedMember | null>(null);

  const [externalForm, setExternalForm] = useState({ fullName: "", email: "", phone: "" });

  const pendingInvites = useMemo(() => invites.filter((invite) => invite.status === "pending"), [invites]);

  const loadAccess = useCallback(async () => {
    if (!effectiveOrgId) {
      setUsers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const [usersResult, invitesResult] = await Promise.all([
      supabase.rpc("admin_list_organization_access", { _target_organization_id: effectiveOrgId }),
      supabase.rpc("admin_list_access_invites", { _target_organization_id: effectiveOrgId }),
    ]);

    if (usersResult.error || invitesResult.error) {
      const message = usersResult.error?.message ?? invitesResult.error?.message ?? "Falha ao carregar acessos.";
      setLoadError(t(describeRpcError(message)));
      setUsers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    const usersPayload = usersResult.data as JsonResult;
    const invitePayload = invitesResult.data as JsonResult;
    const rawUsers = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
    const rawInvites = Array.isArray(invitePayload?.invites) ? invitePayload.invites : [];

    setUsers(rawUsers.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        ...row,
        responsibility_types: normalizeResponsibilities(row.responsibility_types),
      } as ManagedAccessUser;
    }));
    setInvites(rawInvites.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        ...row,
        responsibility_types: normalizeResponsibilities(row.responsibility_types),
      } as PendingAccessInvite;
    }));
    setLoading(false);
  }, [effectiveOrgId, t]);

  useEffect(() => {
    if (roleLoading || churchLoading) return;
    void loadAccess();
  }, [roleLoading, churchLoading, loadAccess]);

  useEffect(() => {
    if (!navigationState?.openNewAccess) return;
    const preset = navigationState.presetRole
      ? LEGACY_PRESET_MAP[navigationState.presetRole]
      : undefined;
    setSelectedResponsibilities(new Set(preset ? [preset] : []));
    setMemberModalOpen(true);
    if (navigationState.presetMemberId && navigationState.presetMemberName && effectiveOrgId) {
      void supabase.rpc("admin_search_members_for_access", {
        _target_organization_id: effectiveOrgId,
        _query: navigationState.presetMemberName,
      }).then(({ data, error }) => {
        if (error) return;
        const payload = data as JsonResult;
        const matches = (Array.isArray(payload?.members) ? payload.members : []) as unknown as SearchedMember[];
        const match = matches.find((member) => member.id === navigationState.presetMemberId);
        if (match) {
          setSelectedMember(match);
          setMemberQuery(match.full_name);
          setMemberResults(matches);
        }
      });
    }
  }, [effectiveOrgId, navigationState?.openNewAccess, navigationState?.presetMemberId, navigationState?.presetMemberName, navigationState?.presetRole]);

  const resetMemberModal = () => {
    setMemberModalOpen(false);
    setMemberQuery("");
    setMemberResults([]);
    setSelectedMember(null);
    setSelectedResponsibilities(new Set());
  };

  const resetExternalModal = () => {
    setExternalModalOpen(false);
    setExternalForm({ fullName: "", email: "", phone: "" });
    setSelectedResponsibilities(new Set());
  };

  const searchMembers = async (query: string) => {
    const sequence = ++memberSearchSequence.current;
    setMemberQuery(query);
    if (!effectiveOrgId || query.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    setMemberSearching(true);
    const { data, error } = await supabase.rpc("admin_search_members_for_access", {
      _target_organization_id: effectiveOrgId,
      _query: query.trim(),
    });
    if (sequence !== memberSearchSequence.current) return;
    if (error) {
      toast({ title: t("Não foi possível buscar"), description: t(describeRpcError(error.message)), variant: "destructive" });
      setMemberResults([]);
    } else {
      const payload = data as JsonResult;
      setMemberResults((Array.isArray(payload?.members) ? payload.members : []) as unknown as SearchedMember[]);
    }
    setMemberSearching(false);
  };

  const saveExistingUser = async (targetUserId: string, responsibilities: Set<AccessResponsibility>) => {
    if (!effectiveOrgId) return false;
    const { error } = await supabase.rpc("admin_set_organization_responsibilities", {
      _target_organization_id: effectiveOrgId,
      _target_user_id: targetUserId,
      _responsibility_types: [...responsibilities],
    });
    if (error) {
      toast({ title: t("Não foi possível salvar"), description: t(describeRpcError(error.message)), variant: "destructive" });
      return false;
    }
    return true;
  };

  const authorizeSelectedMember = async () => {
    if (!effectiveOrgId || !selectedMember || selectedResponsibilities.size === 0) return;
    setSaving(true);

    if (selectedMember.user_id) {
      const currentResponsibilities = users.find(
        (accessUser) => accessUser.user_id === selectedMember.user_id,
      )?.responsibility_types ?? [];
      const cumulativeResponsibilities = mergeAccessResponsibilities(
        currentResponsibilities,
        selectedResponsibilities,
      );
      const ok = await saveExistingUser(selectedMember.user_id, cumulativeResponsibilities);
      if (ok) {
        toast({ title: t("Responsabilidades concedidas"), description: t("O perfil de membro foi preservado.") });
        resetMemberModal();
        await loadAccess();
      }
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc("admin_create_member_access_invite", {
      _member_id: selectedMember.id,
      _target_organization_id: effectiveOrgId,
      _responsibility_types: [...selectedResponsibilities],
    });
    if (error) {
      toast({ title: t("Não foi possível criar o convite"), description: t(describeRpcError(error.message)), variant: "destructive" });
      setSaving(false);
      return;
    }

    const payload = data as JsonResult;
    const token = typeof payload?.token === "string" ? payload.token : "";
    if (token) await navigator.clipboard.writeText(buildInviteUrl(token)).catch(() => undefined);
    toast({ title: t("Convite seguro criado"), description: t("O link foi copiado. O membro usará o e-mail já cadastrado.") });
    resetMemberModal();
    setSaving(false);
  };

  const createExternalInvite = async () => {
    if (!effectiveOrgId || selectedResponsibilities.size === 0 || !externalForm.fullName.trim() || !externalForm.email.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_create_external_access_invite", {
      _target_organization_id: effectiveOrgId,
      _full_name: externalForm.fullName.trim(),
      _email: externalForm.email.trim(),
      _phone: externalForm.phone.trim(),
      _responsibility_types: [...selectedResponsibilities],
    });
    if (error) {
      toast({ title: t("Não foi possível criar o convite"), description: t(describeRpcError(error.message)), variant: "destructive" });
      setSaving(false);
      return;
    }
    const payload = data as JsonResult;
    const token = typeof payload?.token === "string" ? payload.token : "";
    if (token) await navigator.clipboard.writeText(buildAccessInviteUrl(token)).catch(() => undefined);
    toast({ title: t("Convite criado"), description: t("O link foi copiado e está preso ao e-mail informado.") });
    resetExternalModal();
    await loadAccess();
    setSaving(false);
  };

  const saveEditedUser = async () => {
    if (!editUser) return;
    setSaving(true);
    const ok = await saveExistingUser(editUser.user_id, selectedResponsibilities);
    if (ok) {
      toast({ title: t("Acessos atualizados"), description: t("As demais funções do membro continuam intactas.") });
      setEditUser(null);
      setSelectedResponsibilities(new Set());
      await loadAccess();
    }
    setSaving(false);
  };

  const revokeAllResponsibilities = async (accessUser: ManagedAccessUser) => {
    if (!confirm(`${t("Remover os trabalhos delegados a")} ${accessUser.full_name}? ${t("O cadastro de membro será preservado.")}`)) return;
    setSaving(true);
    const ok = await saveExistingUser(accessUser.user_id, new Set());
    if (ok) {
      toast({ title: t("Responsabilidades removidas"), description: t("A pessoa continua como membro da igreja.") });
      setEditUser(null);
      await loadAccess();
    }
    setSaving(false);
  };

  const revokeInvite = async (invite: PendingAccessInvite) => {
    const { error } = await supabase.rpc("admin_revoke_access_invite", { _invite_id: invite.id });
    if (error) {
      toast({ title: t("Não foi possível revogar"), description: t(describeRpcError(error.message)), variant: "destructive" });
      return;
    }
    toast({ title: t("Convite revogado") });
    await loadAccess();
  };

  const copyInvite = async (invite: PendingAccessInvite) => {
    await navigator.clipboard.writeText(buildAccessInviteUrl(invite.token)).catch(() => undefined);
    toast({ title: t("Link copiado") });
  };

  if (!roleLoading && !canAccess("/admin/gerenciar-acessos")) return <Navigate to="/admin" replace />;

  if (!roleLoading && !churchLoading && !effectiveOrgId) {
    return (
      <AdminLayout>
        <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 size={30} /></div>
          <h1 className="text-2xl font-serif font-bold">{t("Selecione uma organização")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("O Super Admin precisa escolher a igreja que será administrada antes de abrir o Gerenciador de Acessos.")}</p>
          <button type="button" onClick={() => setOrganizationSelectorOpen(true)} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            {t("Escolher organização")}
          </button>
        </div>
        <SupportOrganizationSelector open={organizationSelectorOpen} onClose={() => setOrganizationSelectorOpen(false)} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield size={26} className="text-primary" />
              <h1 className="text-2xl font-serif font-bold sm:text-3xl">{t("Gerenciador de Acessos")}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("Delegação hierárquica de trabalhos — sem alterar o perfil-base do membro.")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">{effectiveOrgName}</span>
              {effectiveOrgType && <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">{effectiveOrgType}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <button type="button" onClick={() => setOrganizationSelectorOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                <Building2 size={15} /> {t("Trocar organização")}
              </button>
            )}
            <button type="button" onClick={() => { setSelectedResponsibilities(new Set()); setMemberModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              <UserCheck size={15} /> {t("Autorizar membro")}
            </button>
            <button type="button" onClick={() => { setSelectedResponsibilities(new Set()); setExternalModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary">
              <UserPlus size={15} /> {t("Convidar externo")}
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">{t("Pessoas com trabalhos")}</p><p className="mt-1 text-2xl font-bold">{users.filter((item) => item.responsibility_types.length > 0).length}</p></div>
          <div className="rounded-xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">{t("Responsabilidades ativas")}</p><p className="mt-1 text-2xl font-bold">{users.reduce((total, item) => total + item.responsibility_types.length, 0)}</p></div>
          <div className="rounded-xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">{t("Convites pendentes")}</p><p className="mt-1 text-2xl font-bold">{pendingInvites.length}</p></div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">{t("Não foi possível confirmar os acessos")}</p>
            <p className="mt-1">{loadError}</p>
            <button type="button" onClick={() => void loadAccess()} className="mt-3 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold">{t("Tentar novamente")}</button>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Users size={16} /> {t("Equipe autorizada")}</h2>
            <span className="text-xs text-muted-foreground">{users.length} {users.length === 1 ? t("pessoa") : t("pessoas")}</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("Nenhuma pessoa autorizada nesta unidade.")}</div>
          ) : (
            <div className="divide-y divide-border/40">
              {users.map((accessUser) => (
                <button
                  key={accessUser.user_id}
                  type="button"
                  onClick={() => { setEditUser(accessUser); setSelectedResponsibilities(new Set(accessUser.responsibility_types)); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30"
                >
                  {accessUser.avatar_url ? (
                    <img src={accessUser.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(accessUser.full_name)}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{accessUser.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t("Função eclesiástica:")} {t(accessUser.ecclesiastical_role || "Membro")}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {accessUser.responsibility_types.length > 0
                        ? accessUser.responsibility_types.map((responsibility) => <ResponsibilityBadge key={responsibility} responsibility={responsibility} />)
                        : <span className="text-[11px] text-muted-foreground">{t("Somente acesso-base de membro")}</span>}
                    </span>
                  </span>
                  <ChevronRight size={17} className="flex-shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>

        {pendingInvites.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="border-b border-border/50 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Mail size={16} /> {t("Convites externos pendentes")}</h2></div>
            <div className="divide-y divide-border/40">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{invite.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{invite.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">{invite.responsibility_types.map((responsibility) => <ResponsibilityBadge key={responsibility} responsibility={responsibility} />)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void copyInvite(invite)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs"><ClipboardCopy size={13} /> {t("Copiar")}</button>
                    <button type="button" onClick={() => void revokeInvite(invite)} className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive"><X size={13} /> {t("Revogar")}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <SupportOrganizationSelector open={organizationSelectorOpen} onClose={() => setOrganizationSelectorOpen(false)} />

      {memberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div><h2 className="font-semibold">{t("Autorizar membro existente")}</h2><p className="text-xs text-muted-foreground">{effectiveOrgName}</p></div>
              <button type="button" onClick={resetMemberModal}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!selectedMember ? (
                <div className="space-y-4">
                  <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={memberQuery} onChange={(event) => void searchMembers(event.target.value)} placeholder={t("Buscar membro por nome")} autoFocus className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm" /></div>
                  {memberSearching ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : (
                    <div className="space-y-2">
                      {memberResults.map((member) => (
                        <button key={member.id} type="button" onClick={() => setSelectedMember(member)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left hover:border-primary/40">
                          {member.photo_url ? <img src={member.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(member.full_name)}</span>}
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{member.full_name}</span><span className="block text-xs text-muted-foreground">{t(member.ecclesiastical_role || "Membro")}</span></span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${member.user_id ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{member.user_id ? t("Com login") : t("Receberá convite")}</span>
                        </button>
                      ))}
                      {memberQuery.trim().length >= 2 && memberResults.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("Nenhum membro encontrado dentro desta estrutura.")}</p>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(selectedMember.full_name)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{selectedMember.full_name}</span><span className="text-xs text-muted-foreground">{t("Continua sendo")} {t(selectedMember.ecclesiastical_role || "Membro")}</span></span>
                    <button type="button" onClick={() => setSelectedMember(null)} className="text-xs text-primary">{t("Trocar")}</button>
                  </div>
                  <ResponsibilityPicker selected={selectedResponsibilities} onChange={setSelectedResponsibilities} allowGovernance={allowGovernance} />
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-border/50 p-4">
              <button type="button" onClick={resetMemberModal} className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold">{t("Cancelar")}</button>
              <button type="button" disabled={!selectedMember || selectedResponsibilities.size === 0 || saving} onClick={() => void authorizeSelectedMember()} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? t("Salvando...") : selectedMember?.user_id ? t("Conceder acessos") : t("Criar convite seguro")}</button>
            </div>
          </div>
        </div>
      )}

      {externalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4"><div><h2 className="font-semibold">{t("Convidar pessoa externa")}</h2><p className="text-xs text-muted-foreground">{t("Não cria cadastro de membro automaticamente.")}</p></div><button type="button" onClick={resetExternalModal}><X size={18} /></button></div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground sm:col-span-2">{t("Nome completo")}<input value={externalForm.fullName} onChange={(event) => setExternalForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" /></label>
                <label className="text-xs text-muted-foreground">{t("E-mail obrigatório")}<input type="email" value={externalForm.email} onChange={(event) => setExternalForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" /></label>
                <label className="text-xs text-muted-foreground">{t("Telefone / WhatsApp")}<input value={externalForm.phone} onChange={(event) => setExternalForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" /></label>
              </div>
              <ResponsibilityPicker selected={selectedResponsibilities} onChange={setSelectedResponsibilities} allowGovernance={allowGovernance} />
            </div>
            <div className="flex gap-2 border-t border-border/50 p-4"><button type="button" onClick={resetExternalModal} className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold">{t("Cancelar")}</button><button type="button" disabled={saving || !externalForm.fullName.trim() || !externalForm.email.trim() || selectedResponsibilities.size === 0} onClick={() => void createExternalInvite()} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? t("Criando...") : t("Criar convite")}</button></div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4"><div><h2 className="font-semibold">{t("Acessos de")} {editUser.full_name}</h2><p className="text-xs text-muted-foreground">{t("Função eclesiástica preservada:")} {t(editUser.ecclesiastical_role || "Membro")}</p></div><button type="button" onClick={() => setEditUser(null)}><X size={18} /></button></div>
            <div className="flex-1 overflow-y-auto p-5"><ResponsibilityPicker selected={selectedResponsibilities} onChange={setSelectedResponsibilities} allowGovernance={allowGovernance} /></div>
            <div className="space-y-2 border-t border-border/50 p-4">
              {editUser.user_id !== user?.id && <button type="button" disabled={saving} onClick={() => void revokeAllResponsibilities(editUser)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive"><UserX size={15} /> {t("Remover trabalhos delegados")}</button>}
              <div className="flex gap-2"><button type="button" onClick={() => setEditUser(null)} className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold">{t("Cancelar")}</button><button type="button" disabled={saving} onClick={() => void saveEditedUser()} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">{saving ? t("Salvando...") : t("Salvar responsabilidades")}</button></div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
