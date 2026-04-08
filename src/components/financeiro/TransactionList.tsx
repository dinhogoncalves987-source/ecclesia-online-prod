import { useState } from "react";
import { Search, Plus, X, Loader2, Upload, Sparkles, Download, Trash2, CheckCircle, Edit2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { BulkImportModal } from "@/components/BulkImportModal";
import { AIImportModal } from "@/components/AIImportModal";

type Transaction = {
  id: string; date: string; description: string; type: string; amount: number; status: string; category: string;
};

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d: string) => {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CATEGORIES = ["Dízimo", "Oferta", "Campanha", "Doação", "Aluguel", "Água/Luz", "Material", "Salário", "Manutenção", "Infraestrutura", "Eventos", "Missões", "Ação Social", "Geral"];

export function TransactionList({
  transactions, setTransactions, loading
}: {
  transactions: Transaction[];
  setTransactions: (txs: Transaction[]) => void;
  loading: boolean;
}) {
  const { user } = useAuth();
  const { church } = useChurch();
  const { t } = useLanguage();
  const [filterType, setFilterType] = useState<"all" | "Entrada" | "Saída">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "Pendente" | "Confirmado" | "Pago">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTx, setNewTx] = useState({ desc: "", type: "Entrada" as "Entrada" | "Saída", value: "", category: "Dízimo", date: "", status: "Pendente" });
  const [showImport, setShowImport] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 25;

  const financeFields = [
    { key: "description", label: t("Descrição"), required: true },
    { key: "amount", label: t("Valor"), required: true },
    { key: "type", label: t("Tipo (Entrada/Saída)"), required: true },
    { key: "category", label: t("Categoria") },
    { key: "date", label: t("Data (AAAA-MM-DD)") },
  ];
  const financeTemplate = [
    { description: "Dízimo", amount: "1500", type: "Entrada", category: "Dízimo", date: "2026-03-01" },
    { description: "Aluguel", amount: "2000", type: "Saída", category: "Infraestrutura", date: "2026-03-05" },
  ];

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    if (!user || !church) return { success: 0, errors: 0 };
    let success = 0, errors = 0;
    for (const row of rows) {
      const amount = parseFloat(row.amount?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      if (!row.description || amount <= 0) { errors++; continue; }
      const type = row.type?.toLowerCase().includes("sa") ? "Saída" : "Entrada";
      const { error } = await supabase.from("transactions").insert({
        user_id: user.id, church_id: church.id, description: row.description, type, amount,
        category: row.category || "Geral", status: "Pendente",
        date: row.date || new Date().toISOString().split("T")[0],
      });
      if (error) errors++; else success++;
    }
    if (success > 0) {
      const { data } = await supabase.from("transactions").select("*").eq("church_id", church.id).order("date", { ascending: false });
      setTransactions(data || []);
    }
    return { success, errors };
  };

  const filtered = transactions.filter(tx => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterStatus !== "all" && tx.status !== filterStatus) return false;
    if (filterCategory !== "all" && tx.category !== filterCategory) return false;
    if (searchQuery && !tx.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const addOrUpdateTransaction = async () => {
    if (!newTx.desc || !newTx.value || !user || !church) return;
    const raw = newTx.value.replace(/[^\d,\.]/g, "").replace(",", ".");
    const amount = parseFloat(raw) || 0;
    if (amount <= 0) return;
    setSaving(true);

    if (editingId) {
      const { error } = await supabase.from("transactions").update({
        description: newTx.desc, type: newTx.type, amount, category: newTx.category || "Geral",
        status: newTx.status, date: newTx.date || new Date().toISOString().split("T")[0],
      }).eq("id", editingId);
      if (error) { toast.error(t("Erro ao salvar")); }
      else {
        setTransactions(transactions.map(tx => tx.id === editingId ? { ...tx, description: newTx.desc, type: newTx.type, amount, category: newTx.category || "Geral", status: newTx.status, date: newTx.date || tx.date } : tx));
        toast.success(t("Lançamento atualizado!"));
      }
    } else {
      const { data, error } = await supabase.from("transactions").insert({
        user_id: user.id, church_id: church.id, description: newTx.desc, type: newTx.type, amount,
        category: newTx.category || "Geral", status: newTx.status || "Pendente",
        date: newTx.date || undefined,
      }).select().single();
      if (error) { toast.error(t("Erro ao salvar")); }
      else { setTransactions([data, ...transactions]); toast.success(t("Lançamento salvo!")); }
    }

    resetForm();
    setSaving(false);
  };

  const resetForm = () => {
    setNewTx({ desc: "", type: "Entrada", value: "", category: "Dízimo", date: "", status: "Pendente" });
    setShowForm(false);
    setEditingId(null);
  };

  const editTransaction = (tx: Transaction) => {
    setNewTx({ desc: tx.description, type: tx.type as "Entrada" | "Saída", value: String(tx.amount), category: tx.category, date: tx.date, status: tx.status });
    setEditingId(tx.id);
    setShowForm(true);
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(t("Erro ao remover"));
    else { setTransactions(transactions.filter(tx => tx.id !== id)); toast.success(t("Removido!")); }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("transactions").update({ status }).eq("id", id);
    if (error) toast.error(t("Erro ao atualizar"));
    else { setTransactions(transactions.map(tx => tx.id === id ? { ...tx, status } : tx)); toast.success(t("Status atualizado!")); }
  };

  const exportCSV = () => {
    const header = "Data,Descrição,Tipo,Categoria,Valor,Status\n";
    const rows = filtered.map(tx => `${tx.date},"${tx.description}",${tx.type},${tx.category},${tx.amount},${tx.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financeiro_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("Exportado!"));
  };

  const categories = [...new Set(transactions.map(tx => tx.category).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
          <Download size={14} strokeWidth={1.5} /> {t("Exportar")}
        </button>
        <button onClick={() => setShowAIImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent/10 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors">
          <Sparkles size={14} strokeWidth={1.5} /> {t("Importar com IA")}
        </button>
        <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
          <Upload size={14} strokeWidth={1.5} /> {t("Importar CSV")}
        </button>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus size={16} strokeWidth={1.5} /> {t("Lançamento")}
        </button>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-card rounded-xl shadow-executive p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-base">{editingId ? t("Editar Lançamento") : t("Novo Lançamento")}</h3>
                <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOrUpdateTransaction(); } }}>
                <input placeholder={t("Descrição")} value={newTx.desc} onChange={e => setNewTx({ ...newTx, desc: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <input placeholder={t("Valor (ex: 1500)")} value={newTx.value} onChange={e => setNewTx({ ...newTx, value: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <select value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value as "Entrada" | "Saída" })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="Entrada">{t("Entrada")}</option>
                  <option value="Saída">{t("Saída")}</option>
                </select>
                <select value={newTx.category} onChange={e => setNewTx({ ...newTx, category: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}
                </select>
                <input type="date" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <select value={newTx.status} onChange={e => setNewTx({ ...newTx, status: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="Pendente">{t("Pendente")}</option>
                  <option value="Confirmado">{t("Confirmado")}</option>
                  <option value="Pago">{t("Pago")}</option>
                </select>
              </div>
              <button onClick={addOrUpdateTransaction} disabled={saving}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingId ? t("Atualizar") : t("Salvar Lançamento")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-executive p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder={t("Buscar...")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-lg border border-input bg-background text-xs w-full focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {(["all", "Entrada", "Saída"] as const).map(f => (
              <button key={f} onClick={() => { setFilterType(f); setPage(0); }}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filterType === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {f === "all" ? t("Todos") : f === "Entrada" ? t("Entradas") : t("Saídas")}
              </button>
            ))}
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as any); setPage(0); }}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <option value="all">{t("Status")}: {t("Todos")}</option>
            <option value="Pendente">{t("Pendente")}</option>
            <option value="Confirmado">{t("Confirmado")}</option>
            <option value="Pago">{t("Pago")}</option>
          </select>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0); }}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs max-w-[140px]">
            <option value="all">{t("Categoria")}: {t("Todos")}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-[11px] text-muted-foreground">{filtered.length} {t("registros")}</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("Data")}</th>
                  <th className="px-4 py-3 font-medium">{t("Descrição")}</th>
                  <th className="px-4 py-3 font-medium">{t("Categoria")}</th>
                  <th className="px-4 py-3 font-medium">{t("Tipo")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("Valor")}</th>
                  <th className="px-4 py-3 font-medium">{t("Status")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("Ações")}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(tx => (
                  <tr key={tx.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3 font-medium text-xs">{tx.description}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tx.category}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${tx.type === "Entrada" ? "text-success" : "text-destructive"}`}>{tx.type}</span>
                    </td>
                    <td className={`px-4 py-3 font-medium tabular-nums text-xs text-right ${tx.type === "Entrada" ? "text-success" : "text-destructive"}`}>
                      {tx.type === "Entrada" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <select value={tx.status} onChange={e => updateStatus(tx.id, e.target.value)}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${
                          tx.status === "Confirmado" ? "bg-success/10 text-success" :
                          tx.status === "Pago" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                        }`}>
                        <option value="Pendente">{t("Pendente")}</option>
                        <option value="Confirmado">{t("Confirmado")}</option>
                        <option value="Pago">{t("Pago")}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => editTransaction(tx)} className="p-1 rounded hover:bg-secondary" title={t("Editar")}>
                          <Edit2 size={13} className="text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteTransaction(tx.id)} className="p-1 rounded hover:bg-destructive/10" title={t("Remover")}>
                          <Trash2 size={13} className="text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden p-4 space-y-2">
            {paged.map(tx => (
              <div key={tx.id} className="p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{formatDate(tx.date)}</span>
                  <span className={tx.type === "Entrada" ? "text-success font-medium" : "text-destructive font-medium"}>{tx.type}</span>
                </div>
                <p className="text-sm font-medium">{tx.description}</p>
                <p className="text-[11px] text-muted-foreground">{tx.category}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-sm font-medium tabular-nums ${tx.type === "Entrada" ? "text-success" : "text-destructive"}`}>
                    {tx.type === "Entrada" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      tx.status === "Confirmado" ? "bg-success/10 text-success" :
                      tx.status === "Pago" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                    }`}>{tx.status}</span>
                    <button onClick={() => editTransaction(tx)} className="p-1 rounded hover:bg-secondary"><Edit2 size={12} /></button>
                    <button onClick={() => deleteTransaction(tx.id)} className="p-1 rounded hover:bg-destructive/10"><Trash2 size={12} className="text-destructive" /></button>
                  </div>
                </div>
              </div>
            ))}
            {paged.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhuma movimentação encontrada.")}</p>}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border/50">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40">
                {t("Anterior")}
              </button>
              <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40">
                {t("Próximo")}
              </button>
            </div>
          )}
        </div>
      )}

      <BulkImportModal open={showImport} onClose={() => setShowImport(false)} onImport={handleBulkImport} fields={financeFields} templateData={financeTemplate} title={t("Importar Lançamentos")} />
      <AIImportModal open={showAIImport} onClose={() => setShowAIImport(false)} onImport={handleBulkImport} fields={financeFields} title={t("Importar Lançamentos com IA")} moduleName="Financeiro" />
    </div>
  );
}
