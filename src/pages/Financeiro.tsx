import { AdminLayout } from "@/components/AdminLayout";
import { ExecutiveCard } from "@/components/ExecutiveCard";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, Download, X, Search, Loader2, Copy, QrCode, Upload } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { BulkImportModal } from "@/components/BulkImportModal";
import { AIImportModal } from "@/components/AIImportModal";
import { Sparkles } from "lucide-react";

type Transaction = {
  id: string;
  date: string;
  description: string;
  type: string;
  amount: number;
  status: string;
  category: string;
};

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatDate = (d: string) => {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export default function Financeiro() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const PIX_KEY = "sua-chave-pix@igreja.com";
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "Entrada" | "Saída">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newTx, setNewTx] = useState({ desc: "", type: "Entrada" as "Entrada" | "Saída", value: "", category: "" });
  const [showImport, setShowImport] = useState(false);

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
        user_id: user.id, church_id: church.id,
        description: row.description, type, amount,
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

  useEffect(() => {
    if (!user || !church) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("church_id", church.id)
        .order("date", { ascending: false });
      if (error) { console.error(error); toast.error(t("Erro ao carregar transações")); }
      else setTransactions(data || []);
      setLoading(false);
    };
    load();
  }, [user, church]);

  const filtered = transactions.filter(t => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (searchQuery && !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const summary = useMemo(() => {
    const totalReceita = transactions.filter(t => t.type === "Entrada").reduce((s, t) => s + Number(t.amount), 0);
    const totalDespesa = transactions.filter(t => t.type === "Saída").reduce((s, t) => s + Number(t.amount), 0);
    const saldo = totalReceita - totalDespesa;
    return [
      { title: t("Receita Total"), value: formatCurrency(totalReceita), trend: "+10,8%", icon: TrendingUp },
      { title: t("Despesas Totais"), value: formatCurrency(totalDespesa), trend: "-3,2%", trendLabel: t("redução"), icon: TrendingDown },
      { title: t("Saldo Atual"), value: formatCurrency(saldo), icon: Wallet },
      { title: t("Reserva"), value: "R$ 85.200", icon: PiggyBank },
    ];
  }, [transactions, t]);

  const addTransaction = async () => {
    if (!newTx.desc || !newTx.value || !user || !church) return;
    const raw = newTx.value.replace(/[^\d,\.]/g, "").replace(",", ".");
    const amount = parseFloat(raw) || 0;
    if (amount <= 0) return;
    setSaving(true);
    const { data, error } = await supabase.from("transactions").insert({
      user_id: user.id,
      church_id: church.id,
      description: newTx.desc,
      type: newTx.type,
      amount,
      category: newTx.category || "Geral",
      status: "Pendente",
    }).select().single();
    if (error) { toast.error(t("Erro ao salvar")); console.error(error); }
    else {
      setTransactions([data, ...transactions]);
      toast.success(t("Lançamento salvo!"));
    }
    setNewTx({ desc: "", type: "Entrada", value: "", category: "" });
    setShowForm(false);
    setSaving(false);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addTransaction(); }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Financeiro")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("Tesouraria e controle contábil")}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Download size={14} strokeWidth={1.5} /> {t("Exportar")}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <Upload size={14} strokeWidth={1.5} /> {t("Importar CSV")}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={16} strokeWidth={1.5} /> {t("Lançamento")}
            </button>
          </div>
        </div>

        {/* PIX Card */}
        <div className="bg-card rounded-xl shadow-executive p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-accent/10 rounded-xl">
              <QrCode size={24} className="text-accent" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold">{t("Dizimar via PIX")}</h3>
              <p className="text-xs text-muted-foreground">{t("Chave PIX da Igreja")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
            <code className="flex-1 text-sm font-mono break-all">{PIX_KEY}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(PIX_KEY); toast.success(t("Chave copiada!")); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
            >
              <Copy size={14} /> {t("Copiar Chave PIX")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summary.map((s, i) => (
            <ExecutiveCard key={s.title} {...s} index={i} />
          ))}
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl shadow-executive p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-base">{t("Novo Lançamento")}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onKeyDown={handleFormKeyDown}>
                  <input placeholder={t("Descrição")} value={newTx.desc} onChange={(e) => setNewTx({ ...newTx, desc: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <input placeholder={t("Valor (ex: 1500)")} value={newTx.value} onChange={(e) => setNewTx({ ...newTx, value: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <select value={newTx.type} onChange={(e) => setNewTx({ ...newTx, type: e.target.value as "Entrada" | "Saída" })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option>{t("Entrada")}</option>
                    <option>{t("Saída")}</option>
                  </select>
                  <input placeholder={t("Categoria")} value={newTx.category} onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <button onClick={addTransaction} disabled={saving}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {t("Salvar Lançamento")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-serif text-lg">{t("Movimentações Recentes")}</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input placeholder={t("Buscar...")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-input bg-background text-xs w-full sm:w-40 focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="flex bg-secondary/50 rounded-lg p-0.5">
                  {(["all", "Entrada", "Saída"] as const).map(f => (
                    <button key={f} onClick={() => setFilterType(f)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${filterType === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                      {f === "all" ? t("Todos") : f === "Entrada" ? t("Entradas") : t("Saídas")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                     <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                       <th className="px-5 py-3 font-medium">{t("Data")}</th>
                       <th className="px-5 py-3 font-medium">{t("Descrição")}</th>
                       <th className="px-5 py-3 font-medium">{t("Tipo")}</th>
                       <th className="px-5 py-3 font-medium">{t("Valor")}</th>
                       <th className="px-5 py-3 font-medium">{t("Status")}</th>
                     </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 text-muted-foreground tabular-nums">{formatDate(t.date)}</td>
                        <td className="px-5 py-3 font-medium">{t.description}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium ${t.type === "Entrada" ? "text-success" : "text-destructive"}`}>{t.type}</span>
                        </td>
                        <td className="px-5 py-3 font-medium tabular-nums">{formatCurrency(Number(t.amount))}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            t.status === "Confirmado" ? "bg-success/10 text-success" :
                            t.status === "Pago" ? "bg-primary/10 text-primary" :
                            "bg-accent/10 text-accent"
                          }`}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden p-4 space-y-2">
                {filtered.map((t) => (
                  <div key={t.id} className="p-3 rounded-lg bg-secondary/30">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{formatDate(t.date)}</span>
                      <span className={t.type === "Entrada" ? "text-success font-medium" : "text-destructive font-medium"}>{t.type}</span>
                    </div>
                    <p className="text-sm font-medium">{t.description}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(Number(t.amount))}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        t.status === "Confirmado" ? "bg-success/10 text-success" :
                        t.status === "Pago" ? "bg-primary/10 text-primary" :
                        "bg-accent/10 text-accent"
                      }`}>{t.status}</span>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhuma movimentação encontrada.")}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <BulkImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleBulkImport}
        fields={financeFields}
        templateData={financeTemplate}
        title={t("Importar Lançamentos")}
      />
    </AdminLayout>
  );
}
