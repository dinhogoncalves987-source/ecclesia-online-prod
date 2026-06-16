import { AdminLayout } from "@/components/AdminLayout";
import { Search, Plus, Phone, X, Trash2, Loader2, Upload, Pencil, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MemberWalletCard } from "@/components/MemberWalletCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { BulkImportModal } from "@/components/BulkImportModal";
import { OperationalAssistant } from "@/components/OperationalAssistant";
import { insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  MEMBER_STATUSES,
  MEMBER_STATUSES_NO_DELETE,
  isMemberStatus,
  type MemberStatus,
} from "@/lib/secretariaConstants";

type Member = {
  id: string;
  full_name: string;
  member_role: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  joined_at: string | null;
  address: string | null;
  notes: string | null;
};

type FilterStatus = "all" | MemberStatus;

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "Ativo":
      return "bg-success/10 text-success";
    case "Visitante":
      return "bg-accent/10 text-accent";
    case "Falecido":
      return "bg-muted text-muted-foreground";
    case "Transferido":
    case "Disciplinado":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function Membros() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church, loading: churchLoading } = useChurch();
  const { canonicalRole } = useRole();
  const canWrite = canWriteSecretaria(canonicalRole);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", role: "", phone: "", email: "", status: "Ativo" as MemberStatus });
  const [showImport, setShowImport] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [walletMember, setWalletMember] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    role: "",
    phone: "",
    email: "",
    status: "Ativo" as MemberStatus,
    joined_at: "",
    address: "",
    notes: "",
  });

  const reloadMembers = useCallback(async () => {
    if (!church) return;
    const { data, error } = await runScopedOrganizationQuery<Member[]>("members", church.id, query =>
      query.select("*").order("full_name"),
    );
    if (error) {
      toast.error(t("Erro ao carregar membros"));
      return;
    }
    setMembers(data || []);
  }, [church, t]);

  const memberFields = [
    { key: "name", label: t("Nome"), required: true },
    { key: "role", label: t("Função") },
    { key: "phone", label: t("Telefone") },
    { key: "email", label: t("E-mail") },
    { key: "status", label: t("Status") },
  ];

  const memberTemplate = [
    { name: "João Silva", role: "Diácono", phone: "(11) 99999-0001", email: "joao@email.com", status: "Ativo" },
    { name: "Maria Souza", role: "Membro", phone: "(11) 99999-0002", email: "maria@email.com", status: "Ativo" },
  ];

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    if (!user || !church) return { success: 0, errors: 0 };
    let success = 0;
    let errors = 0;
    for (const row of rows) {
      if (!row.name) {
        errors++;
        continue;
      }
      const status = row.status && isMemberStatus(row.status) ? row.status : "Ativo";
      const { error } = await insertWithOrganizationScope("members", church.id, {
        created_by: user.id,
        full_name: row.name,
        member_role: row.role || "Membro",
        phone: row.phone || null,
        email: row.email || null,
        joined_at: new Date().toISOString().split("T")[0],
        status,
      });
      if (error) errors++;
      else success++;
    }
    if (success > 0) await reloadMembers();
    return { success, errors };
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (churchLoading) return;
    if (!church) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      await reloadMembers();
      setLoading(false);
    };
    load();
  }, [user, church, churchLoading, reloadMembers]);

  const filtered = members.filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.full_name.toLowerCase().includes(q) ||
        (m.member_role || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const addMember = async () => {
    if (!newMember.name || !user || !church) return;
    setSaving(true);
    const { error } = await insertWithOrganizationScope<Member>(
      "members",
      church.id,
      {
        created_by: user.id,
        full_name: newMember.name,
        member_role: newMember.role || "Membro",
        phone: newMember.phone || null,
        email: newMember.email || null,
        joined_at: new Date().toISOString().split("T")[0],
        status: newMember.status,
      },
      query => query.select().single(),
    );
    if (error) {
      toast.error(t("Erro ao salvar"), { description: String((error as { message?: string }).message || "") });
      setSaving(false);
      return;
    }
    toast.success(t("Membro cadastrado!"));
    await reloadMembers();
    setNewMember({ name: "", role: "", phone: "", email: "", status: "Ativo" });
    setShowForm(false);
    setSaving(false);
  };

  const removeMember = async (member: Member) => {
    if (MEMBER_STATUSES_NO_DELETE.includes(member.status as MemberStatus)) {
      toast.error(t("Use alteração de status em vez de remover"));
      return;
    }
    if (!window.confirm(t("Remover este membro da lista?"))) return;
    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", member.id)
      .eq("organization_id", church?.id || "");
    if (error) {
      toast.error(t("Erro ao remover"), { description: error.message });
      return;
    }
    toast.success(t("Membro removido"));
    await reloadMembers();
  };

  const updateMemberStatus = async (id: string, newStatus: MemberStatus) => {
    if (!church) return;
    const { error } = await supabase
      .from("members")
      .update({ status: newStatus })
      .eq("id", id)
      .eq("organization_id", church.id);
    if (error) {
      toast.error(t("Erro ao atualizar"), { description: error.message });
      return;
    }
    toast.success(t("Status atualizado"));
    await reloadMembers();
  };

  const openMember = (m: Member) => {
    setEditingMember(m);
    setEditForm({
      name: m.full_name,
      role: m.member_role || "",
      phone: m.phone || "",
      email: m.email || "",
      status: isMemberStatus(m.status) ? m.status : "Ativo",
      joined_at: m.joined_at || "",
      address: m.address || "",
      notes: m.notes || "",
    });
  };

  const closeMemberModal = () => setEditingMember(null);

  const saveEdit = async () => {
    if (!editingMember || !church || !editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("members")
      .update({
        full_name: editForm.name.trim(),
        member_role: editForm.role || "Membro",
        phone: editForm.phone || null,
        email: editForm.email || null,
        status: editForm.status,
        joined_at: editForm.joined_at || null,
        address: editForm.address.trim() || null,
        notes: editForm.notes.trim() || null,
      })
      .eq("id", editingMember.id)
      .eq("organization_id", church.id);
    if (error) {
      toast.error(t("Erro ao salvar"), { description: error.message });
      setSaving(false);
      return;
    }
    toast.success(t("Membro atualizado"));
    closeMemberModal();
    await reloadMembers();
    setSaving(false);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMember();
    }
  };

  const activeCount = members.filter(m => m.status === "Ativo").length;
  const visitanteCount = members.filter(m => m.status === "Visitante").length;
  const falecidoCount = members.filter(m => m.status === "Falecido").length;
  const transferidoCount = members.filter(m => m.status === "Transferido").length;

  const filterOptions: FilterStatus[] = ["all", ...MEMBER_STATUSES];

  const canDeleteMember = (m: Member) =>
    canWrite && !MEMBER_STATUSES_NO_DELETE.includes(m.status as MemberStatus);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Membros")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length} {t("cadastrados")} · {activeCount} {t("ativos")} · {visitanteCount}{" "}
              {t("visitantes")}
              {falecidoCount > 0 && ` · ${falecidoCount} ${t("falecidos")}`}
              {transferidoCount > 0 && ` · ${transferidoCount} ${t("transferidos")}`}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <OperationalAssistant
                module="member"
                fields={[
                  { key: "name", label: t("Nome"), required: true },
                  {
                    key: "role",
                    label: t("Função"),
                    options: ["Pastor", "Diácono", "Diaconisa", "Obreiro", "Membro", "Visitante"],
                  },
                  { key: "phone", label: t("Telefone") },
                  { key: "email", label: t("E-mail") },
                ]}
                onConfirm={async data => {
                  if (!data.name || !user || !church) throw new Error(t("Nome obrigatório"));
                  const { error } = await insertWithOrganizationScope("members", church.id, {
                    created_by: user.id,
                    full_name: data.name,
                    member_role: data.role || "Membro",
                    phone: data.phone || null,
                    email: data.email || null,
                    joined_at: new Date().toISOString().split("T")[0],
                    status: "Ativo",
                  });
                  if (error) throw new Error(String((error as { message?: string }).message || ""));
                  await reloadMembers();
                  toast.success(t("Membro cadastrado!"));
                }}
                onEdit={data => {
                  setNewMember({
                    name: data.name || "",
                    role: data.role || "",
                    phone: data.phone || "",
                    email: data.email || "",
                    status: "Ativo",
                  });
                  setShowForm(true);
                }}
              />
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                <Upload size={14} strokeWidth={1.5} /> {t("Importar")}
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity self-start"
              >
                <Plus size={16} strokeWidth={1.5} /> {t("Novo Membro")}
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showForm && canWrite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">{t("Cadastrar Membro")}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={handleFormKeyDown}>
                  <input
                    placeholder={t("Nome completo")}
                    value={newMember.name}
                    onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    placeholder={t("Função")}
                    value={newMember.role}
                    onChange={e => setNewMember({ ...newMember, role: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    placeholder={t("Telefone")}
                    value={newMember.phone}
                    onChange={e => setNewMember({ ...newMember, phone: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    placeholder={t("E-mail")}
                    value={newMember.email}
                    onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t("Status")}</label>
                    <select
                      value={newMember.status}
                      onChange={e =>
                        setNewMember({
                          ...newMember,
                          status: e.target.value as MemberStatus,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm"
                    >
                      {MEMBER_STATUSES.map(s => (
                        <option key={s} value={s}>
                          {t(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={addMember}
                  disabled={saving}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {t("Salvar Membro")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder={t("Buscar por nome, função ou e-mail...")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card rounded-lg shadow-[var(--shadow-sm)] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div className="flex gap-1 flex-wrap bg-secondary/50 rounded-lg p-0.5 max-w-full overflow-x-auto">
            {filterOptions.map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  filterStatus === s ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}
              >
                {s === "all" ? t("Todos") : t(s)}
              </button>
            ))}
          </div>
        </div>

        {loading || churchLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="hidden sm:block bg-card rounded-xl shadow-executive overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">{t("Nome")}</th>
                    <th className="px-5 py-3 font-medium">{t("Função")}</th>
                    <th className="px-5 py-3 font-medium">{t("Contato")}</th>
                    <th className="px-5 py-3 font-medium">{t("Status")}</th>
                    <th className="px-5 py-3 font-medium">{t("Desde")}</th>
                    <th className="px-5 py-3 font-medium w-28">{t("Ações")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr
                      key={m.id}
                      onClick={() => openMember(m)}
                      className="border-b border-border/30 hover:bg-secondary/30 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-medium text-accent">
                            {m.full_name
                              .split(" ")
                              .map(n => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <span className="font-medium">{m.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{m.member_role}</td>
                      <td className="px-5 py-3 text-muted-foreground">{m.phone}</td>
                      <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                        {canWrite ? (
                          <select
                            value={isMemberStatus(m.status) ? m.status : "Ativo"}
                            onChange={e => updateMemberStatus(m.id, e.target.value as MemberStatus)}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${statusBadgeClass(m.status)}`}
                          >
                            {MEMBER_STATUSES.map(s => (
                              <option key={s} value={s}>
                                {t(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(m.status)}`}>
                            {t(m.status)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground tabular-nums">{m.joined_at}</td>
                      <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setWalletMember(m)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-medium transition-colors"
                          >
                            <CreditCard size={12} />
                            {t("Carteira")}
                          </button>
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={() => openMember(m)}
                                className="p-1 rounded hover:bg-secondary transition-colors"
                                title={t("Editar")}
                              >
                                <Pencil size={14} className="text-muted-foreground" />
                              </button>
                              {canDeleteMember(m) ? (
                                <button
                                  type="button"
                                  onClick={() => removeMember(m)}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                  title={t("Remover")}
                                >
                                  <Trash2 size={14} className="text-muted-foreground" />
                                </button>
                              ) : (
                                <span
                                  className="p-1 text-[10px] text-muted-foreground"
                                  title={t("Use alteração de status")}
                                >
                                  —
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        {t("Nenhum membro encontrado.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden space-y-2">
              {filtered.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openMember(m)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openMember(m);
                      }
                    }}
                    className="bg-card rounded-xl shadow-executive p-4 flex items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent flex-shrink-0">
                      {m.full_name
                        .split(" ")
                        .map(n => n[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{m.full_name}</p>
                        {canWrite ? (
                          <select
                            value={isMemberStatus(m.status) ? m.status : "Ativo"}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateMemberStatus(m.id, e.target.value as MemberStatus)}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 max-w-[7rem] ${statusBadgeClass(m.status)}`}
                          >
                            {MEMBER_STATUSES.map(s => (
                              <option key={s} value={s}>
                                {t(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadgeClass(m.status)}`}>
                            {t(m.status)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.member_role}</p>
                      {m.phone && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone size={10} /> {m.phone}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setWalletMember(m)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 hover:bg-accent/20 text-accent text-[10px] font-medium transition-colors"
                      >
                        <CreditCard size={11} />
                        {t("Carteira")}
                      </button>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => openMember(m)}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                            title={t("Editar")}
                          >
                            <Pencil size={14} className="text-muted-foreground" />
                          </button>
                          {canDeleteMember(m) && (
                            <button
                              type="button"
                              onClick={() => removeMember(m)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                              title={t("Remover")}
                            >
                              <Trash2 size={14} className="text-muted-foreground" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhum membro encontrado.")}</p>
              )}
            </div>
          </>
        )}
      </div>

      {editingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          onClick={closeMemberModal}
        >
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="member-profile-title"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="member-profile-title" className="text-lg font-serif font-bold truncate pr-2">
                {editForm.name || editingMember.full_name}
              </h2>
              <button
                type="button"
                onClick={closeMemberModal}
                className="p-1.5 rounded-lg hover:bg-secondary flex-shrink-0"
                aria-label={t("Cancelar")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Nome completo")}</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  readOnly={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Função")}</label>
                <input
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                  readOnly={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Status")}</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as MemberStatus })}
                  disabled={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm disabled:opacity-80"
                >
                  {MEMBER_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Telefone")}</label>
                <input
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  readOnly={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("E-mail")}</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  readOnly={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Desde")}</label>
                <input
                  type="date"
                  value={editForm.joined_at}
                  onChange={e => setEditForm({ ...editForm, joined_at: e.target.value })}
                  readOnly={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Endereço")}</label>
                <input
                  value={editForm.address}
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                  readOnly={!canWrite}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm read-only:opacity-80"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("Observações")}</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  readOnly={!canWrite}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-y min-h-[4.5rem] read-only:opacity-80"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <button
                type="button"
                onClick={() => setWalletMember(editingMember)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                <CreditCard size={14} />
                {t("Carteira")}
              </button>
              <button
                type="button"
                onClick={closeMemberModal}
                className="flex-1 py-2 rounded-lg bg-secondary text-sm font-medium"
              >
                {canWrite ? t("Cancelar") : t("Fechar")}
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {t("Salvar")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Carteira Ecclesia */}
      <Dialog open={Boolean(walletMember)} onOpenChange={(v) => !v && setWalletMember(null)}>
        <DialogContent className="max-w-sm">
          {walletMember && (
            <MemberWalletCard
              member={walletMember}
              churchName={church?.name ?? "Ecclesia"}
              onClose={() => setWalletMember(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <BulkImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleBulkImport}
        fields={memberFields}
        templateData={memberTemplate}
        title={t("Importar Membros")}
      />
    </AdminLayout>
  );
}
