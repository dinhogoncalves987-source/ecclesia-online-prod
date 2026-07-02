import { useEffect, useMemo, useState } from "react";
import { Search, Plus, X, Loader2, Upload, Sparkles, Download, Trash2, Edit2, Lock } from "lucide-react";
import { downloadCSVRaw } from "@/lib/docExport";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { BulkImportModal } from "@/components/BulkImportModal";
import { AIImportModal } from "@/components/AIImportModal";
import { OperationalAssistant } from "@/components/OperationalAssistant";
import { insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";
import {
  DEFAULT_ACCOUNT_CATEGORIES,
  DEFAULT_COST_CENTERS,
  DEFAULT_FINANCIAL_ACCOUNTS,
  PAYMENT_METHODS,
  getTransactionMonth,
  isExpense,
  type FinanceAccount,
  type FinanceAccountCategory,
  type FinanceCostCenter,
  type FinanceMonthlyClosing,
  type TreasuryTransaction,
} from "@/lib/finance";

const CURRENCY_LOCALE: Record<string, { locale: string; currency: string }> = {
  pt: { locale: "pt-BR", currency: "BRL" },
  en: { locale: "en-US", currency: "USD" },
  es: { locale: "es-MX", currency: "MXN" },
};

const makeCurrencyFormatter = (lang: string) => (v: number) => {
  const { locale, currency } = CURRENCY_LOCALE[lang] ?? CURRENCY_LOCALE.pt;
  return v.toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const makeDateFormatter = (lang: string) => (d: string) => {
  const date = new Date(d + "T00:00:00");
  const locale = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
};

const today = () => new Date().toISOString().split("T")[0];

const getText = (value: unknown) => (typeof value === "string" ? value : "");

export function TransactionList({
  transactions,
  setTransactions,
  loading,
}: {
  transactions: TreasuryTransaction[];
  setTransactions: (txs: TreasuryTransaction[]) => void;
  loading: boolean;
}) {
  const { user } = useAuth();
  const { church } = useChurch();
  const { hasRole } = useRole();
  const { t, lang } = useLanguage();
  const formatCurrency = makeCurrencyFormatter(lang);
  const formatDate = makeDateFormatter(lang);
  const canWriteFinance = hasRole(["super_admin", "church_admin", "tesoureiro", "contador"]);
  const [accountCategories, setAccountCategories] = useState<FinanceAccountCategory[]>(DEFAULT_ACCOUNT_CATEGORIES);
  const [costCenters, setCostCenters] = useState<FinanceCostCenter[]>(DEFAULT_COST_CENTERS);
  const [financialAccounts, setFinancialAccounts] = useState<FinanceAccount[]>(DEFAULT_FINANCIAL_ACCOUNTS);
  const [closings, setClosings] = useState<FinanceMonthlyClosing[]>([]);
  const [filterType, setFilterType] = useState<"all" | "Entrada" | "Saida">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "Pendente" | "Confirmado" | "Pago">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTx, setNewTx] = useState({
    desc: "",
    type: "Entrada" as "Entrada" | "Saida",
    value: "",
    category: DEFAULT_ACCOUNT_CATEGORIES[0].name,
    accountCategoryId: "",
    costCenterId: "",
    financialAccountId: "",
    paymentMethod: "PIX",
    receiptUrl: "",
    notes: "",
    date: today(),
    status: "Pendente",
  });
  const [showImport, setShowImport] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 25;

  useEffect(() => {
    if (!church) return;

    const loadTreasurySetup = async () => {
      const [categoryResult, centerResult, accountResult, closingResult] = await Promise.all([
        runScopedOrganizationQuery<FinanceAccountCategory[]>("finance_account_categories", church.id, query =>
          query.select("*").eq("is_active", true).order("code"),
        ),
        runScopedOrganizationQuery<FinanceCostCenter[]>("finance_cost_centers", church.id, query =>
          query.select("*").eq("is_active", true).order("name"),
        ),
        runScopedOrganizationQuery<FinanceAccount[]>("finance_accounts", church.id, query =>
          query.select("*").eq("is_active", true).order("name"),
        ),
        runScopedOrganizationQuery<FinanceMonthlyClosing[]>("finance_monthly_closings", church.id, query =>
          query.select("*").order("month", { ascending: false }),
        ),
      ]);

      if (categoryResult.data?.length) setAccountCategories(categoryResult.data);
      if (centerResult.data?.length) setCostCenters(centerResult.data);
      if (accountResult.data?.length) setFinancialAccounts(accountResult.data);
      if (closingResult.data?.length) setClosings(closingResult.data);
    };

    loadTreasurySetup();
  }, [church]);

  const closedMonths = useMemo(() => new Set(closings.map(c => c.month)), [closings]);
  const isClosed = (date: string) => closedMonths.has(getTransactionMonth(date));

  const financeFields = [
                { key: "description", label: t("Descrição"), required: true },
    { key: "amount", label: t("Valor"), required: true },
    { key: "type", label: t("Tipo (Entrada/Saída)"), required: true },
    { key: "category", label: t("Categoria"), required: true },
    { key: "date", label: t("Data (AAAA-MM-DD)") },
    { key: "payment_method", label: t("Forma de pagamento") },
    { key: "receipt_url", label: t("Comprovante") },
    { key: "notes", label: t("Observações") },
  ];

  const financeTemplate = [
    { description: "Dizimo culto domingo", amount: "1500", type: "Entrada", category: "Dizimos", date: "2026-03-01", payment_method: "PIX" },
    { description: "Manutencao predial", amount: "800", type: "Saida", category: "Manutencao", date: "2026-03-05", payment_method: "Banco" },
  ];

  const reloadTransactions = async () => {
    if (!church) return;
    const { data } = await runScopedOrganizationQuery<TreasuryTransaction[]>("transactions", church.id, query =>
      query.select("*").order("date", { ascending: false }),
    );
    setTransactions(data || []);
  };

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    if (!user || !church || !canWriteFinance) return { success: 0, errors: rows.length };
    let success = 0;
    let errors = 0;

    for (const row of rows) {
      const amount = parseFloat(row.amount?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      const date = row.date || today();
      if (!row.description || amount <= 0 || isClosed(date)) {
        errors++;
        continue;
      }

      const type = row.type?.toLowerCase().includes("sai") ? "Saida" : "Entrada";
      const category = row.category || (type === "Entrada" ? "Dizimos" : "Administrativo");
      const categoryRef = accountCategories.find(c => c.name === category);
      const centerRef = costCenters[0];
      const accountRef = financialAccounts[0];

      const { error } = await insertWithOrganizationScope("transactions", church.id, {
        user_id: user.id,
        created_by: user.id,
        responsible_id: user.id,
        description: row.description,
        type,
        amount,
        category,
        account_category_id: categoryRef?.id || null,
        cost_center_id: centerRef?.id || null,
        financial_account_id: accountRef?.id || null,
        payment_method: row.payment_method || "PIX",
        receipt_url: row.receipt_url || null,
        notes: row.notes || null,
        status: "Pendente",
        date,
      });
      if (error) errors++;
      else success++;
    }

    if (success > 0) await reloadTransactions();
    return { success, errors };
  };

  const filtered = transactions.filter(tx => {
    const normalizedType = isExpense(tx.type) ? "Saida" : "Entrada";
    if (filterType !== "all" && normalizedType !== filterType) return false;
    if (filterStatus !== "all" && tx.status !== filterStatus) return false;
    if (filterCategory !== "all" && tx.category !== filterCategory) return false;
    if (searchQuery && !tx.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const addOrUpdateTransaction = async () => {
    if (!canWriteFinance) return;
    if (!newTx.desc || !newTx.value || !newTx.category || !user || !church) return;
    if (isClosed(newTx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }

    const raw = newTx.value.replace(/[^\d,.]/g, "").replace(",", ".");
    const amount = parseFloat(raw) || 0;
    if (amount <= 0) return;
    setSaving(true);

    const payload = {
      description: newTx.desc,
      type: newTx.type,
      amount,
      category: newTx.category,
      account_category_id: newTx.accountCategoryId || null,
      cost_center_id: newTx.costCenterId || null,
      financial_account_id: newTx.financialAccountId || null,
      responsible_id: user.id,
      payment_method: newTx.paymentMethod,
      receipt_url: newTx.receiptUrl || null,
      notes: newTx.notes || null,
      status: newTx.status,
      date: newTx.date || today(),
      updated_by: user.id,
    };

    if (editingId) {
      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", editingId)
        .eq("organization_id", church.id);

      if (error) {
        toast.error(t("Erro ao salvar"));
      } else {
        setTransactions(transactions.map(tx => tx.id === editingId ? { ...tx, ...payload } : tx));
        toast.success(t("Lançamento atualizado!"));
      }
    } else {
      const { data, error } = await insertWithOrganizationScope<TreasuryTransaction>("transactions", church.id, {
        ...payload,
        user_id: user.id,
        created_by: user.id,
      }, query => query.select().single());

      if (error) {
        toast.error(t("Erro ao salvar"));
      } else if (data) {
        setTransactions([data, ...transactions]);
        toast.success(t("Lançamento salvo!"));
      }
    }

    resetForm();
    setSaving(false);
  };

  const resetForm = () => {
    const firstCategory = accountCategories[0];
    setNewTx({
      desc: "",
      type: "Entrada",
      value: "",
      category: firstCategory?.name || "Dizimos",
      accountCategoryId: firstCategory?.id || "",
      costCenterId: costCenters[0]?.id || "",
      financialAccountId: financialAccounts[0]?.id || "",
      paymentMethod: "PIX",
      receiptUrl: "",
      notes: "",
      date: today(),
      status: "Pendente",
    });
    setShowForm(false);
    setEditingId(null);
  };

  const editTransaction = (tx: TreasuryTransaction) => {
    if (!canWriteFinance) return;
    if (isClosed(tx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }

    setNewTx({
      desc: tx.description,
      type: isExpense(tx.type) ? "Saida" : "Entrada",
      value: String(tx.amount),
      category: tx.category || accountCategories[0]?.name || "Dizimos",
      accountCategoryId: tx.account_category_id || "",
      costCenterId: tx.cost_center_id || "",
      financialAccountId: tx.financial_account_id || "",
      paymentMethod: tx.payment_method || "PIX",
      receiptUrl: tx.receipt_url || "",
      notes: tx.notes || "",
      date: tx.date,
      status: getText(tx.status) || "Pendente",
    });
    setEditingId(tx.id);
    setShowForm(true);
  };

  const deleteTransaction = async (tx: TreasuryTransaction) => {
    if (!canWriteFinance) return;
    if (!church || isClosed(tx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }

    const { error } = await supabase.from("transactions").delete().eq("id", tx.id).eq("organization_id", church.id);
    if (error) toast.error(t("Erro ao remover"));
    else {
      setTransactions(transactions.filter(item => item.id !== tx.id));
      toast.success(t("Removido!"));
    }
  };

  const updateStatus = async (tx: TreasuryTransaction, status: string) => {
    if (!canWriteFinance) return;
    if (!church || isClosed(tx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }

    const { error } = await supabase
      .from("transactions")
      .update({ status, updated_by: user?.id || null })
      .eq("id", tx.id)
      .eq("organization_id", church.id);
    if (error) toast.error(t("Erro ao atualizar"));
    else {
      setTransactions(transactions.map(item => item.id === tx.id ? { ...item, status } : item));
      toast.success(t("Status atualizado!"));
    }
  };

  const exportCSV = () => {
    const header = "Data,Descricao,Tipo,Categoria,Centro de custo,Conta,Forma,Valor,Status,Comprovante,Observacoes\n";
    const rows = filtered.map(tx => {
      const center = costCenters.find(c => c.id === tx.cost_center_id)?.name || "";
      const account = financialAccounts.find(a => a.id === tx.financial_account_id)?.name || "";
      return `${tx.date},"${tx.description}",${tx.type},${tx.category || ""},"${center}","${account}",${tx.payment_method || ""},${tx.amount},${tx.status},"${tx.receipt_url || ""}","${tx.notes || ""}"`;
    }).join("\n");
    downloadCSVRaw(header + rows, `tesouraria_${today()}.csv`);
    toast.success(t("Exportado!"));
  };

  const categories = [...new Set(accountCategories.map(c => c.name).concat(transactions.map(tx => tx.category || "")).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
          <Download size={14} strokeWidth={1.5} /> {t("Exportar CSV")}
        </button>
        {canWriteFinance && (
          <>
            <OperationalAssistant
              module="financial"
              fields={[
                { key: "desc", label: t("Descrição"), required: true },
                { key: "value", label: t("Valor"), required: true, type: "number" },
                { key: "type", label: t("Tipo"), options: ["Entrada", "Saida"] },
                { key: "category", label: t("Categoria"), options: accountCategories.map(c => c.name) },
                { key: "date", label: t("Data") },
                { key: "notes", label: t("Observações") },
              ]}
              onEdit={(data) => {
                setNewTx(prev => ({
                  ...prev,
                  desc: data.desc || "",
                  value: data.value || "",
                  type: (data.type === "Saida" || data.type === "Saída") ? "Saida" : "Entrada",
                  category: data.category || DEFAULT_ACCOUNT_CATEGORIES[0].name,
                  date: data.date || today(),
                  notes: data.notes || "",
                }));
                setEditingId(null);
                setShowForm(true);
              }}
            />
            <button onClick={() => setShowAIImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Sparkles size={14} strokeWidth={1.5} /> {t("Importar com IA")}
            </button>
            <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
              <Upload size={14} strokeWidth={1.5} /> {t("Importar CSV")}
            </button>
            <button onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus size={16} strokeWidth={1.5} /> {t("Lançamento")}
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {showForm && canWriteFinance && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-card rounded-xl shadow-executive p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-base">{editingId ? t("Editar Lançamento") : t("Novo Lançamento")}</h3>
                <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input placeholder={t("Descrição")} value={newTx.desc} onChange={e => setNewTx({ ...newTx, desc: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <input placeholder={t("Valor")} value={newTx.value} onChange={e => setNewTx({ ...newTx, value: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <select value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value as "Entrada" | "Saida" })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="Entrada">{t("Entrada")}</option>
                  <option value="Saida">{t("Saída")}</option>
                </select>
                <select value={newTx.accountCategoryId} onChange={e => {
                  const selected = accountCategories.find(c => c.id === e.target.value);
                  setNewTx({ ...newTx, accountCategoryId: e.target.value, category: selected?.name || newTx.category });
                }} className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {accountCategories.map(c => <option key={c.id || c.code} value={c.id || ""}>{c.code} - {t(c.name)}</option>)}
                </select>
                <select value={newTx.costCenterId} onChange={e => setNewTx({ ...newTx, costCenterId: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">{t("Centro de custo")}</option>
                  {costCenters.map(c => <option key={c.id || c.name} value={c.id || ""}>{t(c.name)}</option>)}
                </select>
                <select value={newTx.financialAccountId} onChange={e => setNewTx({ ...newTx, financialAccountId: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">{t("Conta financeira")}</option>
                  {financialAccounts.map(a => <option key={a.id || a.name} value={a.id || ""}>{t(a.name)}</option>)}
                </select>
                <select value={newTx.paymentMethod} onChange={e => setNewTx({ ...newTx, paymentMethod: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {PAYMENT_METHODS.map(method => <option key={method} value={method}>{t(method)}</option>)}
                </select>
                <input type="date" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <select value={newTx.status} onChange={e => setNewTx({ ...newTx, status: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="Pendente">{t("Pendente")}</option>
                  <option value="Confirmado">{t("Confirmado")}</option>
                  <option value="Pago">{t("Pago")}</option>
                </select>
                <input placeholder={t("URL do comprovante")} value={newTx.receiptUrl} onChange={e => setNewTx({ ...newTx, receiptUrl: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <textarea placeholder={t("Observações")} value={newTx.notes} onChange={e => setNewTx({ ...newTx, notes: e.target.value })}
                  className="sm:col-span-2 px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[42px]" />
              </div>
              <button onClick={addOrUpdateTransaction} disabled={saving || isClosed(newTx.date)}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isClosed(newTx.date) && <Lock size={14} />}
                {editingId ? t("Atualizar") : t("Salvar Lançamento")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-card rounded-xl shadow-executive p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder={t("Buscar...")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-lg border border-input bg-background text-xs w-full focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {(["all", "Entrada", "Saida"] as const).map(f => (
              <button key={f} onClick={() => { setFilterType(f); setPage(0); }}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filterType === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {f === "all" ? t("Todos") : f === "Entrada" ? t("Entradas") : t("Saídas")}
              </button>
            ))}
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as "all" | "Pendente" | "Confirmado" | "Pago"); setPage(0); }}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <option value="all">{t("Status")}: {t("Todos")}</option>
            <option value="Pendente">{t("Pendente")}</option>
            <option value="Confirmado">{t("Confirmado")}</option>
            <option value="Pago">{t("Pago")}</option>
          </select>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0); }}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs max-w-[170px]">
            <option value="all">{t("Categoria")}: {t("Todos")}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-[11px] text-muted-foreground">{filtered.length} {t("registros")}</span>
        </div>
      </div>

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
                  <th className="px-4 py-3 font-medium">{t("Conta")}</th>
                  <th className="px-4 py-3 font-medium">{t("Tipo")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("Valor")}</th>
                  <th className="px-4 py-3 font-medium">{t("Status")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("Ações")}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(tx => {
                  const expense = isExpense(tx.type);
                  const closed = isClosed(tx.date);
                  const account = financialAccounts.find(a => a.id === tx.financial_account_id)?.name || tx.payment_method || "-";
                  return (
                    <tr key={tx.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">{formatDate(tx.date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-xs">{tx.description}</p>
                        {tx.receipt_url && <a href={tx.receipt_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">{t("Comprovante")}</a>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{tx.category}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{account}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${expense ? "text-destructive" : "text-success"}`}>{expense ? t("Saída") : t("Entrada")}</span>
                      </td>
                      <td className={`px-4 py-3 font-medium tabular-nums text-xs text-right ${expense ? "text-destructive" : "text-success"}`}>
                        {expense ? "-" : "+"}{formatCurrency(Number(tx.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <select value={tx.status} onChange={e => updateStatus(tx, e.target.value)} disabled={closed || !canWriteFinance}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer disabled:opacity-60 ${
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
                          {closed && <Lock size={13} className="text-muted-foreground" />}
                          {canWriteFinance && (
                            <>
                              <button onClick={() => editTransaction(tx)} disabled={closed} className="p-1 rounded hover:bg-secondary disabled:opacity-40" title={t("Editar")}>
                                <Edit2 size={13} className="text-muted-foreground" />
                              </button>
                              <button onClick={() => deleteTransaction(tx)} disabled={closed} className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40" title={t("Remover")}>
                                <Trash2 size={13} className="text-destructive" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paged.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden p-4 space-y-2">
            {paged.map(tx => {
              const expense = isExpense(tx.type);
              const closed = isClosed(tx.date);
              return (
                <div key={tx.id} className="p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{formatDate(tx.date)}</span>
                    <span className={expense ? "text-destructive font-medium" : "text-success font-medium"}>{expense ? t("Saída") : t("Entrada")}</span>
                  </div>
                  <p className="text-sm font-medium">{tx.description}</p>
                  <p className="text-[11px] text-muted-foreground">{tx.category} | {tx.payment_method || "-"}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-sm font-medium tabular-nums ${expense ? "text-destructive" : "text-success"}`}>
                      {expense ? "-" : "+"}{formatCurrency(Number(tx.amount))}
                    </span>
                    <div className="flex items-center gap-1">
                      {closed && <Lock size={12} className="text-muted-foreground" />}
                      {canWriteFinance && (
                        <>
                          <button onClick={() => editTransaction(tx)} disabled={closed} className="p-1 rounded hover:bg-secondary disabled:opacity-40"><Edit2 size={12} /></button>
                          <button onClick={() => deleteTransaction(tx)} disabled={closed} className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40"><Trash2 size={12} className="text-destructive" /></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {paged.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhuma movimentação encontrada.")}</p>}
          </div>

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

      {canWriteFinance && (
        <>
          <BulkImportModal open={showImport} onClose={() => setShowImport(false)} onImport={handleBulkImport} fields={financeFields} templateData={financeTemplate} title={t("Importar Lançamentos")} />
          <AIImportModal open={showAIImport} onClose={() => setShowAIImport(false)} onImport={handleBulkImport} fields={financeFields} title={t("Importar Lançamentos com IA")} moduleName="Financeiro" />
        </>
      )}
    </div>
  );
}
