import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, Loader2, Upload, Sparkles, Download, Trash2, Edit2, Lock, ChevronDown, AlertTriangle } from "lucide-react";
import { downloadCSVRaw } from "@/lib/docExport";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { BulkImportModal } from "@/components/BulkImportModal";
import { AIImportModal } from "@/components/AIImportModal";
import { SpreadsheetImportModal } from "@/components/financeiro/SpreadsheetImportModal";
import { FinanceImportHistory } from "@/components/financeiro/FinanceImportHistory";
import { OperationalAssistant } from "@/components/OperationalAssistant";
import { getOrganizationScopeIds, insertWithOrganizationScope, runScopedOrganizationQuery } from "@/lib/organizationScope";
import {
  buildManualTransactionPayload,
  createEmptyManualTransactionDraft,
  parseManualTransactionAmount,
  type ManualTransactionDraft,
} from "@/lib/financeManualPayload";
import { buildFinanceCsv } from "@/lib/financeCsv";
import { buildGenericFinanceImportPayload } from "@/lib/importers/financeImportPayload";
import { buildFinanceTransactionRowView, type FinanceSecondaryField, type FinanceTransactionViewLookups } from "@/lib/financeTransactionView";
import {
  DEFAULT_ACCOUNT_CATEGORIES,
  DEFAULT_COST_CENTERS,
  DEFAULT_FINANCIAL_ACCOUNTS,
  PAYMENT_METHODS,
  getTransactionMonth,
  isExpense,
  type FinanceAccount,
  type FinanceAccountCategory,
  type FinanceAccountingGroup,
  type FinanceCostCenter,
  type FinanceDocumentType,
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
type OrganizationOption = { id: string; name: string; organization_type: string | null };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Renderiza os campos secundários (históricos da planilha CONFIADCS) abaixo
 * da coluna principal, na tabela desktop e nos cartões mobile — a mesma
 * hierarquia visual nos dois, nunca escondendo dados relevantes.
 */
function SecondaryFields({
  fields,
  t,
  formatDate,
}: {
  fields: FinanceSecondaryField[];
  t: (s: string) => string;
  formatDate: (d: string) => string;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="mt-0.5 space-y-0.5">
      {fields.map(field => (
        <p key={field.key} className="text-[10px] leading-tight text-muted-foreground">
          <span className="opacity-70">{t(field.label)}:</span>{" "}
          {ISO_DATE_RE.test(field.value) ? formatDate(field.value) : field.value}
        </p>
      ))}
    </div>
  );
}

// FASE 1D-C3 — listagem server-side real (mesmo padrão de
// src/pages/Membros.tsx + supabase/migrations/20260808170000_..., ver
// docs/PERFORMANCE_CONTRACT.md). Página de 100 registros, ordenação estável
// (data contábil, carimbo, id), busca com pageSize+1 para detectar próxima
// página sem count:"exact", filtros/busca 100% no servidor, cache curto
// (60s) por chave de filtros+página, cancelamento de requisições obsoletas.
const TRANSACTIONS_PAGE_SIZE = 100;
const TRANSACTIONS_CACHE_TTL_MS = 60_000;

type TransactionsCacheEntry = { items: TreasuryTransaction[]; hasNextPage: boolean; ts: number };

function saidaTypeVariants(filterType: "all" | "Entrada" | "Saida"): string[] | null {
  if (filterType === "Saida") return ["Saida", "Saída"];
  if (filterType === "Entrada") return ["Entrada"];
  return null;
}

/** Remove caracteres que quebrariam a sintaxe de filtro `.or()` do PostgREST
 * (`,`, `(`, `)`, `%`) — busca continua funcional para o texto normal do
 * usuário, apenas sem esses símbolos literais. */
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%]/g, " ").trim();
}

export function TransactionList({
  onDataChanged,
}: {
  /** Notifica o pai (Financeiro.tsx) após qualquer escrita bem-sucedida
   * (criar/editar/excluir/mudar status/importar) para que os cards
   * agregados (FinanceOverview) também revalidem — sem reintroduzir um
   * fetch-all compartilhado. */
  onDataChanged?: () => void;
}) {
  const { user } = useAuth();
  const { church } = useChurch();
  const { hasRole, hasCapability } = useRole();
  const { t, lang } = useLanguage();
  const formatCurrency = makeCurrencyFormatter(lang);
  const formatDate = makeDateFormatter(lang);
  const canWriteFinance = hasCapability("finance.write")
    || hasRole(["super_admin", "church_admin", "tesoureiro"]);
  const [accountCategories, setAccountCategories] = useState<FinanceAccountCategory[]>(DEFAULT_ACCOUNT_CATEGORIES);
  const [costCenters, setCostCenters] = useState<FinanceCostCenter[]>(DEFAULT_COST_CENTERS);
  const [financialAccounts, setFinancialAccounts] = useState<FinanceAccount[]>(DEFAULT_FINANCIAL_ACCOUNTS);
  const [accountingGroups, setAccountingGroups] = useState<FinanceAccountingGroup[]>([]);
  const [documentTypes, setDocumentTypes] = useState<FinanceDocumentType[]>([]);
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationOption[]>([]);
  const [closings, setClosings] = useState<FinanceMonthlyClosing[]>([]);
  const [periods, setPeriods] = useState<{ id: string; label: string }[]>([]);
  const [treasurySetupReady, setTreasurySetupReady] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "Entrada" | "Saida">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "Pendente" | "Confirmado" | "Pago">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFinancialAccountId, setFilterFinancialAccountId] = useState("all");
  const [filterPeriodId, setFilterPeriodId] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // valor após debounce — usado na consulta ao servidor
  const [showForm, setShowForm] = useState(false);
  const [showAccountingDetails, setShowAccountingDetails] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTx, setNewTx] = useState<ManualTransactionDraft>(() =>
    createEmptyManualTransactionDraft({ category: DEFAULT_ACCOUNT_CATEGORIES[0].name }),
  );
  const [showImport, setShowImport] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [showSpreadsheetImport, setShowSpreadsheetImport] = useState(false);

  // ── Paginação server-side ────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageRows, setPageRows] = useState<TreasuryTransaction[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, TransactionsCacheEntry>());

  useEffect(() => {
    if (!church) return;
    setTreasurySetupReady(false);
    setAccountCategories(DEFAULT_ACCOUNT_CATEGORIES);
    setCostCenters(DEFAULT_COST_CENTERS);
    setFinancialAccounts(DEFAULT_FINANCIAL_ACCOUNTS);
    setAccountingGroups([]);
    setDocumentTypes([]);
    setOrganizationOptions([]);
    setClosings([]);
    setPeriods([]);
    setNewTx(createEmptyManualTransactionDraft({ category: DEFAULT_ACCOUNT_CATEGORIES[0].name }));

    const loadTreasurySetup = async () => {
      const scopeIds = await getOrganizationScopeIds(church.id);
      const [categoryResult, centerResult, accountResult, closingResult, groupResult, documentResult, orgResult, periodResult] = await Promise.all([
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
        supabase
          .from("finance_accounting_groups")
          .select("*")
          .eq("is_active", true)
          .or(`organization_id.is.null,organization_id.eq.${church.id}`)
          .order("code"),
        supabase
          .from("finance_document_types")
          .select("*")
          .eq("is_active", true)
          .or(`organization_id.is.null,organization_id.eq.${church.id}`)
          .order("code"),
        supabase
          .from("organizations")
          .select("id, name, organization_type")
          .in("id", scopeIds)
          .eq("active", true)
          .order("name"),
        runScopedOrganizationQuery<{ id: string; label: string }[]>("finance_periods", church.id, query =>
          query.select("id, label").eq("is_active", true).order("label"),
        ),
      ]);

      if (
        categoryResult.error
        || centerResult.error
        || accountResult.error
        || closingResult.error
        || groupResult.error
        || documentResult.error
        || orgResult.error
        || periodResult.error
      ) {
        toast.error(t("Não foi possível carregar toda a estrutura financeira. Tente novamente."));
        return;
      }

      const loadedCategories = categoryResult.data?.length ? categoryResult.data : DEFAULT_ACCOUNT_CATEGORIES;
      const loadedCenters = centerResult.data?.length ? centerResult.data : DEFAULT_COST_CENTERS;
      const loadedAccounts = accountResult.data?.length ? accountResult.data : DEFAULT_FINANCIAL_ACCOUNTS;
      setAccountCategories(loadedCategories);
      setCostCenters(loadedCenters);
      setFinancialAccounts(loadedAccounts);
      setClosings(closingResult.data ?? []);
      setAccountingGroups((groupResult.data ?? []) as unknown as FinanceAccountingGroup[]);
      setDocumentTypes((documentResult.data ?? []) as unknown as FinanceDocumentType[]);
      setOrganizationOptions((orgResult.data ?? []) as OrganizationOption[]);
      setPeriods(periodResult.data ?? []);
      setNewTx(createEmptyManualTransactionDraft({
        category: loadedCategories[0]?.name || "Dizimos",
        accountCategoryId: loadedCategories[0]?.id || "",
        costCenterId: loadedCenters[0]?.id || "",
        financialAccountId: loadedAccounts[0]?.id || "",
      }));
      setTreasurySetupReady(true);
    };

    loadTreasurySetup().catch(() => toast.error(t("Não foi possível carregar a estrutura financeira.")));
  }, [church, t]);

  const closedMonths = useMemo(() => new Set(closings.map(c => c.month)), [closings]);
  const isClosed = (date: string) => !treasurySetupReady || closedMonths.has(getTransactionMonth(date));

  const financeFields = [
    { key: "legacy_record_number", label: t("Registro nº") },
    { key: "period_label", label: t("Período") },
    { key: "date", label: t("Data contábil (AAAA-MM-DD)"), required: true },
    { key: "issue_date", label: t("Data de emissão (AAAA-MM-DD)") },
    { key: "description", label: t("Descrição"), required: true },
    { key: "amount", label: t("Valor"), required: true },
    { key: "type", label: t("Tipo (Entrada/Saída)"), required: true },
    { key: "accounting_group", label: t("Grupo contábil") },
    { key: "category", label: t("Conta contábil / categoria"), required: true },
    { key: "cost_center", label: t("Centro de custo") },
    { key: "financial_account", label: t("Conta financeira / portador") },
    { key: "document_type", label: t("Tipo de documento") },
    { key: "document_number", label: t("Número do documento") },
    { key: "supplier_beneficiary_name", label: t("Fornecedor/beneficiário") },
    { key: "supplier_beneficiary_document", label: t("CPF/CNPJ do fornecedor") },
    { key: "contributor_name", label: t("Contribuinte") },
    { key: "contributor_document", label: t("CPF/CNPJ do contribuinte") },
    { key: "district", label: t("Distrito / Subdistrito") },
    { key: "congregation", label: t("Congregação") },
    { key: "collector_name", label: t("Coletor") },
    { key: "treasurer_name", label: t("Tesoureiro") },
    { key: "payment_method", label: t("Forma de pagamento") },
    { key: "receipt_url", label: t("Comprovante") },
    { key: "notes", label: t("Observações") },
  ];

  const financeTemplate = [
    { description: "Dizimo culto domingo", amount: "1500", type: "Entrada", category: "Dizimos", date: "2026-03-01", payment_method: "PIX" },
    { description: "Manutencao predial", amount: "800", type: "Saida", category: "Manutencao", date: "2026-03-05", payment_method: "Banco" },
  ];

  // ── Listagem server-side (FASE 1D-C3) ───────────────────────────────────
  // Substitui o antigo reloadTransactions (select("*") completo, sem
  // .range()/.limit()) + filtro client-side sobre o array inteiro. Cada
  // requisição busca no máximo TRANSACTIONS_PAGE_SIZE + 1 linhas — a linha
  // 101 nunca é exibida, só prova que existe próxima página sem count:"exact"
  // (mesma técnica de src/pages/Membros.tsx). Filtros, busca e ordenação
  // (data contábil → carimbo → id, todos DESC, id como desempate final
  // sempre único) executam inteiramente no Postgres.
  const filtersKey = `${filterType}|${filterStatus}|${filterCategory}|${filterFinancialAccountId}|${filterPeriodId}`;

  const fetchPage = useCallback(async (page: number, opts: { silent?: boolean } = {}) => {
    if (!church) return;
    const trimmedSearch = sanitizeSearchTerm(searchQuery);
    const cacheKey = `${church.id}|${filtersKey}|${trimmedSearch}|${page}`;

    const requestId = ++requestIdRef.current;
    abortRef.current?.abort(); // cancela qualquer requisição de página/filtro anterior ainda em voo
    const controller = new AbortController();
    abortRef.current = controller;

    if (!opts.silent) setPageTransitioning(true);
    try {
      const from = (page - 1) * TRANSACTIONS_PAGE_SIZE;
      const to = from + TRANSACTIONS_PAGE_SIZE; // pede PAGE_SIZE + 1 linhas — nunca count:"exact"

      let query = supabase.from("transactions").select("*").eq("organization_id", church.id);
      const typeVariants = saidaTypeVariants(filterType);
      if (typeVariants) query = query.in("type", typeVariants);
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterCategory !== "all") query = query.eq("category", filterCategory);
      if (filterFinancialAccountId !== "all") query = query.eq("financial_account_id", filterFinancialAccountId);
      if (filterPeriodId !== "all") query = query.eq("period_id", filterPeriodId);
      if (trimmedSearch) {
        const term = `%${trimmedSearch}%`;
        query = query.or([
          `description.ilike.${term}`,
          `document_number.ilike.${term}`,
          `legacy_record_number.ilike.${term}`,
          `supplier_beneficiary_name.ilike.${term}`,
          `contributor_name.ilike.${term}`,
        ].join(","));
      }

      const { data, error } = await query
        .order("date", { ascending: false })
        .order("raw_timestamp", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(from, to)
        .abortSignal(controller.signal);

      if (requestId !== requestIdRef.current) return; // resposta obsoleta — outra página/filtro já foi solicitada

      if (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        console.error("[TransactionList] fetchPage:", error);
        if (!opts.silent) {
          // Erro visível: nunca deixa "Próxima" habilitada com base numa
          // resposta anterior obsoleta — limpa o estado de paginação.
          setHasNextPage(false);
          setListError(error.message || t("Erro ao carregar transações"));
        }
        return;
      }

      const rows = (data as TreasuryTransaction[]) ?? [];
      const pageHasNext = rows.length > TRANSACTIONS_PAGE_SIZE;
      const items = pageHasNext ? rows.slice(0, TRANSACTIONS_PAGE_SIZE) : rows;
      cacheRef.current.set(cacheKey, { items, hasNextPage: pageHasNext, ts: Date.now() });
      setPageRows(items);
      setHasNextPage(pageHasNext);
      setListError(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setPageTransitioning(false);
      }
    }
  }, [church, filtersKey, filterType, filterStatus, filterCategory, filterFinancialAccountId, filterPeriodId, searchQuery, t]);

  // Debounce curto (300ms) do campo de busca — evita 1 requisição por tecla.
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Reset para página 1 sempre que busca ou qualquer filtro muda.
  useEffect(() => {
    setCurrentPage(1);
  }, [filtersKey, searchQuery]);

  // Busca a página atual — usa cache "morno" (< 60s) imediatamente (nunca
  // zero falso, nenhum novo spinner) e revalida em segundo plano; cache
  // "frio" ou ausente dispara busca visível.
  useEffect(() => {
    if (!church) { setPageRows([]); setHasNextPage(false); setLoading(false); return; }
    const trimmedSearch = sanitizeSearchTerm(searchQuery);
    const cacheKey = `${church.id}|${filtersKey}|${trimmedSearch}|${currentPage}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPageRows(cached.items);
      setHasNextPage(cached.hasNextPage);
      setListError(null);
      setLoading(false);
      setPageTransitioning(false);
      if (Date.now() - cached.ts > TRANSACTIONS_CACHE_TTL_MS) {
        void fetchPage(currentPage, { silent: true });
      }
      return;
    }
    void fetchPage(currentPage);
  }, [church, filtersKey, searchQuery, currentPage, fetchPage]);

  // Spinner de página inteira somente na 1ª carga real (nenhuma linha ainda)
  // — trocas de página/filtro subsequentes mantêm a tabela anterior visível.
  useEffect(() => {
    if (pageRows.length === 0 && pageTransitioning) setLoading(true);
    else if (pageRows.length > 0) setLoading(false);
  }, [pageRows.length, pageTransitioning]);

  // Invalida o cache e recarrega — usado após qualquer escrita (criar/
  // editar/excluir/mudar status/importar/zerar). Nunca reintroduz o
  // fetch-all: repete apenas a mesma consulta paginada, e avisa o pai
  // (Financeiro.tsx) para revalidar os cards agregados (FinanceOverview).
  const refreshAfterMutation = useCallback(async (opts: { resetToFirstPage?: boolean } = {}) => {
    cacheRef.current.clear();
    const targetPage = opts.resetToFirstPage ? 1 : currentPage;
    if (opts.resetToFirstPage && currentPage !== 1) setCurrentPage(1);
    else await fetchPage(targetPage);
    onDataChanged?.();
  }, [currentPage, fetchPage, onDataChanged]);

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    if (!user || !church || !canWriteFinance) return { success: 0, errors: rows.length };
    if (!treasurySetupReady) return { success: 0, errors: rows.length };
    let success = 0;
    let errors = 0;

    const payloads = rows.map(row => buildGenericFinanceImportPayload(row, church.id, {
      accountCategories,
      costCenters,
      financialAccounts,
      accountingGroups,
      documentTypes,
      organizations: organizationOptions,
    }));
    errors += payloads.filter(payload => !payload).length;
    const validPayloads = payloads.filter(
      (payload): payload is Record<string, unknown> => Boolean(payload),
    );

    for (let index = 0; index < validPayloads.length; index += 200) {
      const batch = validPayloads.slice(index, index + 200);
      const { data, error } = await supabase.rpc("import_finance_transactions_bulk", {
        p_rows: batch as Json,
      });
      if (error) {
        errors += batch.length;
        continue;
      }
      const result = (data ?? {}) as {
        inserted?: number;
        failed?: number;
        skipped_closed_month?: number;
      };
      success += Number(result.inserted ?? 0);
      errors += Number(result.failed ?? 0) + Number(result.skipped_closed_month ?? 0);
    }

    if (success > 0) await refreshAfterMutation({ resetToFirstPage: true });
    return { success, errors };
  };

  const addOrUpdateTransaction = async () => {
    if (!canWriteFinance) return;
    if (!treasurySetupReady) {
      toast.error(t("A estrutura financeira ainda não está disponível."));
      return;
    }
    if (!newTx.desc || !newTx.value || !newTx.category || !user || !church) return;
    if (isClosed(newTx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }

    const amount = parseManualTransactionAmount(newTx.value);
    if (amount <= 0) return;
    setSaving(true);

    const payload = buildManualTransactionPayload(newTx, user.id, {
      preserveOrigin: Boolean(editingId),
    });
    let saved = false;

    if (editingId) {
      const { error } = await supabase
        .from("transactions" as never)
        .update(payload as never)
        .eq("id", editingId)
        .eq("organization_id", church.id);

      if (error) {
        toast.error(t("Erro ao salvar"));
      } else {
        await refreshAfterMutation();
        toast.success(t("Lançamento atualizado!"));
        saved = true;
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
        await refreshAfterMutation({ resetToFirstPage: true });
        toast.success(t("Lançamento salvo!"));
        saved = true;
      }
    }

    setSaving(false);
    if (saved) resetForm();
  };

  const resetForm = () => {
    const firstCategory = accountCategories[0];
    setNewTx(createEmptyManualTransactionDraft({
      category: firstCategory?.name || "Dizimos",
      accountCategoryId: firstCategory?.id || "",
      costCenterId: costCenters[0]?.id || "",
      financialAccountId: financialAccounts[0]?.id || "",
    }));
    setShowAccountingDetails(false);
    setShowForm(false);
    setEditingId(null);
  };

  const editTransaction = (tx: TreasuryTransaction) => {
    if (!canWriteFinance) return;
    if (isClosed(tx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }

    setNewTx(createEmptyManualTransactionDraft({
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
      legacyRecordNumber: tx.legacy_record_number || "",
      periodLabel: tx.period_label || "",
      issueDate: tx.issue_date || tx.date,
      documentTypeId: tx.document_type_id || "",
      documentNumber: tx.document_number || "",
      supplierBeneficiaryName: tx.supplier_beneficiary_name || "",
      supplierBeneficiaryDocument: tx.supplier_beneficiary_document || "",
      contributorName: tx.contributor_name || "",
      contributorDocument: tx.contributor_document || "",
      accountingGroupId: tx.accounting_group_id || "",
      congregationId: tx.congregation_id || "",
      districtId: tx.district_id || "",
      collectorName: tx.collector_name || "",
      treasurerName: tx.treasurer_name || "",
    }));
    setShowAccountingDetails(true);
    setEditingId(tx.id);
    setShowForm(true);
  };

  const deleteTransaction = async (tx: TreasuryTransaction) => {
    if (!canWriteFinance) return;
    if (!church || isClosed(tx.date)) {
      toast.error(t("Período fechado para edição"));
      return;
    }
    if (!window.confirm(t("Remover este lançamento financeiro? Esta ação não poderá ser desfeita."))) return;

    const { error } = await supabase.from("transactions").delete().eq("id", tx.id).eq("organization_id", church.id);
    if (error) toast.error(t("Erro ao remover"));
    else {
      await refreshAfterMutation();
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
      // Atualização otimista da linha visível — evita um round-trip extra só
      // para refletir a troca de status; o cache é invalidado mesmo assim
      // para que outras páginas/filtros não fiquem com o valor antigo.
      setPageRows(prev => prev.map(item => item.id === tx.id ? { ...item, status } : item));
      cacheRef.current.clear();
      onDataChanged?.();
      toast.success(t("Status atualizado!"));
    }
  };

  // Exporta a página atualmente exibida (até 100 linhas, com os mesmos
  // filtros/busca aplicados no servidor) — nunca um fetch-all adicional só
  // para gerar o CSV. Para exportar outro recorte, o usuário ajusta os
  // filtros/página antes de clicar em "Exportar CSV".
  const exportCSV = () => {
    downloadCSVRaw(buildFinanceCsv(pageRows, {
      costCenters,
      financialAccounts,
      accountingGroups,
      documentTypes,
      organizations: organizationOptions,
    }), `tesouraria_pagina${currentPage}_${today()}.csv`);
    toast.success(t("Exportado!"));
  };

  const categories = [...new Set(accountCategories.map(c => c.name).filter(Boolean))];
  const expectedCategoryType = newTx.type === "Entrada" ? "receita" : "despesa";
  const visibleAccountingGroups = accountingGroups.filter(group =>
    !group.type || group.type === expectedCategoryType,
  );
  const categoriesByType = accountCategories.filter(category => category.type === expectedCategoryType);
  const visibleAccountCategories = newTx.accountingGroupId
    ? categoriesByType.filter(category =>
      !category.accounting_group_id || category.accounting_group_id === newTx.accountingGroupId,
    )
    : categoriesByType;
  const districts = organizationOptions.filter(org =>
    ["distrito", "setor", "subdistrito", "subsede"].includes((org.organization_type || "").toLowerCase()),
  );
  const congregations = organizationOptions.filter(org =>
    ["congregacao", "congregação", "igreja_local"].includes((org.organization_type || "").toLowerCase()),
  );

  // Lookups compartilhados por buildFinanceTransactionRowView — mesma fonte
  // de verdade para a tabela desktop e os cartões mobile (item 6 dos testes
  // obrigatórios: hierarquia visual idêntica nos dois).
  const rowViewLookups: FinanceTransactionViewLookups = {
    financialAccounts,
    districts,
    congregations,
    documentTypes,
    accountingGroups,
  };

  const updateTransactionType = (type: "Entrada" | "Saida") => {
    const categoryType = type === "Entrada" ? "receita" : "despesa";
    const firstCategory = accountCategories.find(category => category.type === categoryType);
    setNewTx(current => ({
      ...current,
      type,
      accountingGroupId: "",
      accountCategoryId: firstCategory?.id || "",
      category: firstCategory?.name || (type === "Entrada" ? "Receita" : "Despesa"),
    }));
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho operacional da Tesouraria */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif font-semibold tracking-tight">{t("Tesouraria")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("Lançamentos financeiros, filtros, importação e conferência operacional.")}
          </p>
        </div>

        {/* Barra de ações: Exportar | Assistente IA | Importar | Importar com IA | + Lançamento */}
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
              {/* Importar — abre SpreadsheetImportModal (XLSM/XLSX/CSV via RPC) */}
              <button onClick={() => setShowSpreadsheetImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                <Upload size={14} strokeWidth={1.5} /> {t("Importar")}
              </button>
              {/* Importar com IA — fluxo separado */}
              <button onClick={() => setShowAIImport(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                <Sparkles size={14} strokeWidth={1.5} /> {t("Importar com IA")}
              </button>
              <button onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                <Plus size={16} strokeWidth={1.5} /> {t("Lançamento")}
              </button>
            </>
          )}
        </div>
      </div>

      {church && (
        <FinanceImportHistory
          churchId={church.id}
          canWriteFinance={canWriteFinance}
          onChanged={() => refreshAfterMutation({ resetToFirstPage: true })}
        />
      )}

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
                <select value={newTx.type} onChange={e => updateTransactionType(e.target.value as "Entrada" | "Saida")}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="Entrada">{t("Entrada")}</option>
                  <option value="Saida">{t("Saída")}</option>
                </select>
                <select value={newTx.accountCategoryId} onChange={e => {
                  const selected = accountCategories.find(c => c.id === e.target.value);
                  setNewTx({ ...newTx, accountCategoryId: e.target.value, category: selected?.name || newTx.category });
                }} className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {visibleAccountCategories.map(c => <option key={c.id || c.code} value={c.id || ""}>{c.code} - {t(c.name)}</option>)}
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
              <button
                type="button"
                onClick={() => setShowAccountingDetails(current => !current)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                aria-expanded={showAccountingDetails}
              >
                <ChevronDown size={16} className={`transition-transform ${showAccountingDetails ? "rotate-180" : ""}`} />
                {t("Mais detalhes contábeis")}
              </button>
              <AnimatePresence initial={false}>
                {showAccountingDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-border/50 pt-4">
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Registro nº")}</span>
                        <input value={newTx.legacyRecordNumber} onChange={e => setNewTx({ ...newTx, legacyRecordNumber: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Período")}</span>
                        <input placeholder="Ex.: JUL/26" value={newTx.periodLabel} onChange={e => setNewTx({ ...newTx, periodLabel: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Data de emissão")}</span>
                        <input type="date" value={newTx.issueDate} onChange={e => setNewTx({ ...newTx, issueDate: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Tipo de documento")}</span>
                        <select value={newTx.documentTypeId} onChange={e => setNewTx({ ...newTx, documentTypeId: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground">
                          <option value="">{t("Selecionar")}</option>
                          {documentTypes.map(item => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ""}{item.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Número do documento")}</span>
                        <input value={newTx.documentNumber} onChange={e => setNewTx({ ...newTx, documentNumber: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Grupo contábil")}</span>
                        <select value={newTx.accountingGroupId} onChange={e => {
                          const groupId = e.target.value;
                          const firstCategory = accountCategories.find(category =>
                            category.type === expectedCategoryType
                            && (!groupId || category.accounting_group_id === groupId),
                          );
                          setNewTx({
                            ...newTx,
                            accountingGroupId: groupId,
                            accountCategoryId: firstCategory?.id || "",
                            category: firstCategory?.name || newTx.category,
                          });
                        }} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground">
                          <option value="">{t("Selecionar")}</option>
                          {visibleAccountingGroups.map(item => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ""}{item.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Fornecedor/beneficiário")}</span>
                        <input value={newTx.supplierBeneficiaryName} onChange={e => setNewTx({ ...newTx, supplierBeneficiaryName: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("CPF/CNPJ do fornecedor")}</span>
                        <input value={newTx.supplierBeneficiaryDocument} onChange={e => setNewTx({ ...newTx, supplierBeneficiaryDocument: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Contribuinte")}</span>
                        <input value={newTx.contributorName} onChange={e => setNewTx({ ...newTx, contributorName: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("CPF/CNPJ do contribuinte")}</span>
                        <input value={newTx.contributorDocument} onChange={e => setNewTx({ ...newTx, contributorDocument: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Distrito / Subdistrito")}</span>
                        <select value={newTx.districtId} onChange={e => setNewTx({ ...newTx, districtId: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground">
                          <option value="">{t("Selecionar")}</option>
                          {districts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Congregação")}</span>
                        <select value={newTx.congregationId} onChange={e => setNewTx({ ...newTx, congregationId: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground">
                          <option value="">{t("Selecionar")}</option>
                          {congregations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Coletor")}</span>
                        <input value={newTx.collectorName} onChange={e => setNewTx({ ...newTx, collectorName: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                      <label className="space-y-1 text-xs text-muted-foreground">
                        <span>{t("Tesoureiro")}</span>
                        <input value={newTx.treasurerName} onChange={e => setNewTx({ ...newTx, treasurerName: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
            <input
              placeholder={t("Buscar...")}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              aria-label={t("Buscar lançamentos")}
              className="pl-8 pr-3 py-2 rounded-lg border border-input bg-background text-xs w-full focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {(["all", "Entrada", "Saida"] as const).map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filterType === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                {f === "all" ? t("Todos") : f === "Entrada" ? t("Entradas") : t("Saídas")}
              </button>
            ))}
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as "all" | "Pendente" | "Confirmado" | "Pago")}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <option value="all">{t("Status")}: {t("Todos")}</option>
            <option value="Pendente">{t("Pendente")}</option>
            <option value="Confirmado">{t("Confirmado")}</option>
            <option value="Pago">{t("Pago")}</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs max-w-[170px]">
            <option value="all">{t("Categoria")}: {t("Todos")}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterFinancialAccountId} onChange={e => setFilterFinancialAccountId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs max-w-[170px]">
            <option value="all">{t("Conta")}: {t("Todas")}</option>
            {financialAccounts.filter(a => a.id).map(a => <option key={a.id} value={a.id as string}>{t(a.name)}</option>)}
          </select>
          <select value={filterPeriodId} onChange={e => setFilterPeriodId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs max-w-[170px]">
            <option value="all">{t("Período")}: {t("Todos")}</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="text-[11px] text-muted-foreground">
            {hasNextPage ? `${t("mais de")} ${currentPage * TRANSACTIONS_PAGE_SIZE} ${t("registros")}` : `${(currentPage - 1) * TRANSACTIONS_PAGE_SIZE + pageRows.length} ${t("registros")}`}
          </span>
        </div>
      </div>

      {listError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle size={16} />
          <span>{listError}</span>
          <button
            type="button"
            onClick={() => fetchPage(currentPage)}
            className="ml-auto px-2.5 py-1 rounded-md bg-destructive/10 hover:bg-destructive/20 text-xs font-medium"
          >
            {t("Tentar novamente")}
          </button>
        </div>
      )}

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
                {pageRows.map(tx => {
                  const view = buildFinanceTransactionRowView(tx, rowViewLookups);
                  const closed = isClosed(tx.date);
                  return (
                    <tr key={tx.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors align-top">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                        <p>{formatDate(view.date.primary)}</p>
                        <SecondaryFields fields={view.date.secondary} t={t} formatDate={formatDate} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-xs">{view.description.primary}</p>
                        {tx.receipt_url && <a href={tx.receipt_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">{t("Comprovante")}</a>}
                        <SecondaryFields fields={view.description.secondary} t={t} formatDate={formatDate} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <p>{view.category.primary}</p>
                        <SecondaryFields fields={view.category.secondary} t={t} formatDate={formatDate} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <p>{view.account.primary}</p>
                        <SecondaryFields fields={view.account.secondary} t={t} formatDate={formatDate} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${view.type.isExpense ? "text-destructive" : "text-success"}`}>{t(view.type.label)}</span>
                        <SecondaryFields fields={view.type.secondary} t={t} formatDate={formatDate} />
                      </td>
                      <td className={`px-4 py-3 font-medium tabular-nums text-xs text-right ${view.type.isExpense ? "text-destructive" : "text-success"}`}>
                        {view.type.isExpense ? "-" : "+"}{formatCurrency(Number(tx.amount))}
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
                        <SecondaryFields fields={view.status.secondary} t={t} formatDate={formatDate} />
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
                {pageRows.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">{t("Nenhuma movimentação encontrada.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden p-4 space-y-2">
            {pageRows.map(tx => {
              const view = buildFinanceTransactionRowView(tx, rowViewLookups);
              const closed = isClosed(tx.date);
              const allSecondary = [
                ...view.date.secondary,
                ...view.description.secondary,
                ...view.category.secondary,
                ...view.account.secondary,
                ...view.type.secondary,
                ...view.status.secondary,
              ];
              return (
                <div key={tx.id} className="p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{formatDate(view.date.primary)}</span>
                    <span className={view.type.isExpense ? "text-destructive font-medium" : "text-success font-medium"}>{t(view.type.label)}</span>
                  </div>
                  <p className="text-sm font-medium">{view.description.primary}</p>
                  <p className="text-[11px] text-muted-foreground">{view.category.primary} | {view.account.primary}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-sm font-medium tabular-nums ${view.type.isExpense ? "text-destructive" : "text-success"}`}>
                      {view.type.isExpense ? "-" : "+"}{formatCurrency(Number(tx.amount))}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      view.status.operational === "Confirmado" ? "bg-success/10 text-success" :
                      view.status.operational === "Pago" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                    }`}>
                      {t(view.status.operational)}
                    </span>
                  </div>
                  <SecondaryFields fields={allSecondary} t={t} formatDate={formatDate} />
                  <div className="flex items-center justify-end gap-1 mt-1">
                    {closed && <Lock size={12} className="text-muted-foreground" />}
                    {canWriteFinance && (
                      <>
                        <button onClick={() => editTransaction(tx)} disabled={closed} className="p-1 rounded hover:bg-secondary disabled:opacity-40"><Edit2 size={12} /></button>
                        <button onClick={() => deleteTransaction(tx)} disabled={closed} className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40"><Trash2 size={12} className="text-destructive" /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {pageRows.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">{t("Nenhuma movimentação encontrada.")}</p>}
          </div>

          {(currentPage > 1 || hasNextPage) && (
            <div className="flex items-center justify-between p-4 border-t border-border/50">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || pageTransitioning}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40">
                {t("Anterior")}
              </button>
              <span className="text-xs text-muted-foreground">{t("Página")} {currentPage}</span>
              <button onClick={() => setCurrentPage(p => p + 1)} disabled={!hasNextPage || pageTransitioning}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40">
                {t("Próximo")}
              </button>
            </div>
          )}
        </div>
      )}

      {canWriteFinance && (
        <>
          {/* Modal CONFIADCS — .xlsm/.xlsx/.csv via RPC */}
          <SpreadsheetImportModal
            open={showSpreadsheetImport}
            onClose={() => setShowSpreadsheetImport(false)}
            onImported={() => refreshAfterMutation({ resetToFirstPage: true })}
          />
          {/* Importar com IA — fluxo genérico separado */}
          <AIImportModal open={showAIImport} onClose={() => setShowAIImport(false)} onImport={handleBulkImport} fields={financeFields} title={t("Importar Lançamentos com IA")} moduleName="Financeiro" />
          {/* BulkImport CSV manual — mantido mas não exposto na barra principal */}
          <BulkImportModal open={showImport} onClose={() => setShowImport(false)} onImport={handleBulkImport} fields={financeFields} templateData={financeTemplate} title={t("Importar Lançamentos")} />
        </>
      )}
    </div>
  );
}
