import { AdminLayout } from "@/components/AdminLayout";
import { Users, Search, Plus, Phone, X, Trash2, Loader2, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { BulkImportModal } from "@/components/BulkImportModal";
import { AIImportModal } from "@/components/AIImportModal";
import { Sparkles } from "lucide-react";

type Member = {
  id: string;
  name: string;
  role: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  since: string | null;
};

export default function Membros() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "Ativo" | "Visitante" | "Inativo">("all");
  const [showForm, setShowForm] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", role: "", phone: "", email: "" });
  const [showImport, setShowImport] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);

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
    let success = 0, errors = 0;
    for (const row of rows) {
      if (!row.name) { errors++; continue; }
      const { error } = await supabase.from("members").insert({
        user_id: user.id, church_id: church.id,
        name: row.name, role: row.role || "Membro",
        phone: row.phone || null, email: row.email || null,
        since: new Date().getFullYear().toString(),
        status: row.status || "Ativo",
      });
      if (error) errors++; else success++;
    }
    if (success > 0) {
      const { data } = await supabase.from("members").select("*").eq("church_id", church.id).order("name");
      setMembers(data || []);
    }
    return { success, errors };
  };

  useEffect(() => {
    if (!user || !church) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("members").select("*").eq("church_id", church.id).order("name");
      if (error) { console.error(error); toast.error(t("Erro ao carregar membros")); }
      else setMembers(data || []);
      setLoading(false);
    };
    load();
  }, [user, church]);

  const filtered = members.filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return m.name.toLowerCase().includes(q) || (m.role || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q);
    }
    return true;
  });

  const addMember = async () => {
    if (!newMember.name || !user || !church) return;
    setSaving(true);
    const { data, error } = await supabase.from("members").insert({
      user_id: user.id,
      church_id: church.id,
      name: newMember.name,
      role: newMember.role || "Membro",
      phone: newMember.phone || null,
      email: newMember.email || null,
      since: new Date().getFullYear().toString(),
      status: "Ativo",
    }).select().single();
    if (error) { toast.error(t("Erro ao salvar")); console.error(error); }
    else {
      setMembers([data, ...members]);
      toast.success(t("Membro cadastrado!"));
    }
    setNewMember({ name: "", role: "", phone: "", email: "" });
    setShowForm(false);
    setSaving(false);
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) { toast.error(t("Erro ao remover")); console.error(error); }
    else {
      setMembers(members.filter(m => m.id !== id));
      toast.success(t("Membro removido"));
    }
  };

  const toggleStatus = async (id: string) => {
    const member = members.find(m => m.id === id);
    if (!member) return;
    const next: Record<string, string> = { Ativo: "Inativo", Inativo: "Ativo", Visitante: "Ativo" };
    const newStatus = next[member.status] || "Ativo";
    const { error } = await supabase.from("members").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error(t("Erro ao atualizar")); }
    else setMembers(members.map(m => m.id === id ? { ...m, status: newStatus } : m));
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addMember(); }
  };

  const activeCount = members.filter(m => m.status === "Ativo").length;
  const visitanteCount = members.filter(m => m.status === "Visitante").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Membros")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length} {t("cadastrados")} · {activeCount} {t("ativos")} · {visitanteCount} {t("visitantes")}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAIImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors">
              <Sparkles size={14} strokeWidth={1.5} /> {t("Importar com IA")}
            </button>
            <button onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Upload size={14} strokeWidth={1.5} /> {t("Importar CSV")}
            </button>
            <button onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity self-start">
              <Plus size={16} strokeWidth={1.5} /> {t("Novo Membro")}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">{t("Cadastrar Membro")}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} strokeWidth={1.5} /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={handleFormKeyDown}>
                  <input placeholder={t("Nome completo")} value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder={t("Função")} value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder={t("Telefone")} value={newMember.phone} onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder={t("E-mail")} value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <button onClick={addMember} disabled={saving}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2">
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
            <input placeholder={t("Buscar por nome, função ou e-mail...")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card rounded-lg shadow-[var(--shadow-sm)] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {(["all", "Ativo", "Visitante", "Inativo"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === s ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {s === "all" ? t("Todos") : t(s)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
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
                     <th className="px-5 py-3 font-medium w-16">{t("Ações")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-medium text-accent">
                            {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{m.role}</td>
                      <td className="px-5 py-3 text-muted-foreground">{m.phone}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => toggleStatus(m.id)}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                          m.status === "Ativo" ? "bg-success/10 text-success hover:bg-success/20" :
                          m.status === "Visitante" ? "bg-accent/10 text-accent hover:bg-accent/20" :
                          "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}>{m.status}</button>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground tabular-nums">{m.since}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => removeMember(m.id)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Remover">
                          <Trash2 size={14} className="text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhum membro encontrado.")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden space-y-2">
              {filtered.map((m, i) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <div className="bg-card rounded-xl shadow-executive p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent flex-shrink-0">
                      {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <button onClick={() => toggleStatus(m.id)}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                          m.status === "Ativo" ? "bg-success/10 text-success" :
                          m.status === "Visitante" ? "bg-accent/10 text-accent" :
                          "bg-muted text-muted-foreground"
                        }`}>{m.status}</button>
                      </div>
                      <p className="text-xs text-muted-foreground">{m.role}</p>
                      {m.phone && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone size={10} /> {m.phone}
                          </span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeMember(m.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors flex-shrink-0" title="Remover">
                      <Trash2 size={14} className="text-muted-foreground" />
                    </button>
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