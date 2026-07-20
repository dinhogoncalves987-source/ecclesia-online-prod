import { AdminLayout } from "@/components/AdminLayout";
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { FinanceOverview } from "@/components/financeiro/FinanceOverview";
import { TransactionList } from "@/components/financeiro/TransactionList";
import {
  BarChart3, ChevronLeft, ChevronRight, Wallet, Heart, Megaphone, ArrowLeftRight, PieChart,
  Building2, FileCheck, ShieldCheck, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TreasuryTransaction } from "@/lib/finance";
import { isModuleEnabled, type ModuleId } from "@/config/modules";

// FASE 6 (separação de bundle por build) — estas 8 abas dependem de
// financeDemo/campaignsDemo e são staging-only (ver ALL_TABS/TABS abaixo e
// src/config/modules.ts). Import condicional + lazy: em produção,
// `IS_STAGING_BUILD` é `false` (literal, substituído em build-time — mesmo
// mecanismo de src/App.tsx), então nenhuma dessas chamadas `import()` entra
// no grafo de módulos do build de produção e nenhum chunk é emitido.
const IS_STAGING_BUILD = import.meta.env.VITE_APP_ENV === "staging";

// CORREÇÃO 2026-07-24 (Fase G — restauração do Financeiro) — "Executivo"
// passou a agregar transactions/campanhas/finance_budgets reais e a árvore
// real de organizações para o consolidado por hierarquia — ver
// src/components/financeiro/FinanceExecutive.tsx. Por isso carregada
// sempre, nunca condicionada a IS_STAGING_BUILD.
const FinanceExecutive = lazy(() => import("@/components/financeiro/FinanceExecutive").then(m => ({ default: m.FinanceExecutive })));
// CORREÇÃO 2026-07-20 (Fase C — restauração do Financeiro) — "Dízimos &
// Ofertas" foi removida do render em 07/07/2026 (commit d394a1d) antes
// mesmo da separação de bundle por ambiente; nunca deveria ter saído, pois
// os valores agora vêm de `transactions` real, classificados por categoria
// (Dízimos/Ofertas/Missões) — ver
// src/components/financeiro/FinanceTithesOfferings.tsx. Carregada sempre.
const FinanceTithesOfferings = lazy(() => import("@/components/financeiro/FinanceTithesOfferings").then(m => ({ default: m.FinanceTithesOfferings })));
// CORREÇÃO 2026-07-20 (Fase B — restauração do Financeiro) — "Campanhas"
// consulta campaigns/campaign_contributions reais via useCampaigns() (mesma
// fonte de /admin/campanhas); taxa operacional passou a somar fees reais em
// vez de estimativa fixa — ver src/components/financeiro/FinanceCampaigns.tsx.
// Por isso carregada sempre, nunca condicionada a IS_STAGING_BUILD.
const FinanceCampaigns = lazy(() => import("@/components/financeiro/FinanceCampaigns").then(m => ({ default: m.FinanceCampaigns })));
// CORREÇÃO 2026-07-17 — "Contas" passou a consultar `transactions` real
// (contas a pagar/receber derivadas de status/data reais, sem nenhum dado
// fictício) — ver src/components/financeiro/FinanceAccounts.tsx. Por isso
// carregada sempre, nunca condicionada a IS_STAGING_BUILD.
const FinanceAccounts = lazy(() => import("@/components/financeiro/FinanceAccounts").then(m => ({ default: m.FinanceAccounts })));
// CORREÇÃO 2026-07-20 (Fase D — restauração do Financeiro) — "Orçamento"
// passou a ler/gravar public.finance_budgets real (migration
// 20260721090000_finance_budgets.sql), com "realizado" agregado de
// `transactions` por centro de custo — ver
// src/components/financeiro/FinanceBudget.tsx. Por isso carregada sempre,
// nunca condicionada a IS_STAGING_BUILD.
const FinanceBudget = lazy(() => import("@/components/financeiro/FinanceBudget").then(m => ({ default: m.FinanceBudget })));
// CORREÇÃO 2026-07-22 (Fase E — restauração do Financeiro) — "Patrimônio"
// passou a fazer CRUD real sobre public.finance_assets (migration
// 20260722090000_finance_assets.sql) — ver
// src/components/financeiro/FinanceAssets.tsx. Por isso carregada sempre,
// nunca condicionada a IS_STAGING_BUILD.
const FinanceAssets = lazy(() => import("@/components/financeiro/FinanceAssets").then(m => ({ default: m.FinanceAssets })));
// CORREÇÃO 2026-07-23 (Fase F — restauração do Financeiro) — "Prestação de
// Contas" tinha os "Relatórios históricos" 100% fictícios
// (ACCOUNTABILITY_REPORTS de financeDemo.ts). Agora vêm de
// public.finance_accountability_reports/_approvals real (migration
// 20260723090000_finance_accountability.sql) — ver
// src/components/financeiro/FinanceAccountability.tsx. Os "Relatórios
// Contábeis" (FinanceReports.tsx) já usavam dados reais. Por isso carregada
// sempre, nunca condicionada a IS_STAGING_BUILD.
const FinanceAccountability = lazy(() => import("@/components/financeiro/FinanceAccountability").then(m => ({ default: m.FinanceAccountability })));
// CORREÇÃO 2026-07-20 (Fase A — restauração do Financeiro) — "Auditoria"
// passou a consultar `finance_transaction_audit_logs` real (populada por
// trigger em todo INSERT/UPDATE/DELETE de `transactions`), sem nenhum dado
// fictício — ver src/components/financeiro/FinanceAudit.tsx. Por isso
// carregada sempre, nunca condicionada a IS_STAGING_BUILD.
const FinanceAudit = lazy(() => import("@/components/financeiro/FinanceAudit").then(m => ({ default: m.FinanceAudit })));
const FinanceIntelligence = IS_STAGING_BUILD
  ? lazy(() => import("@/components/financeiro/FinanceIntelligence").then(m => ({ default: m.FinanceIntelligence })))
  : null;

const ALL_TABS = [
  { key: "executive",      icon: BarChart3,    labelKey: "Executivo",           moduleId: "finance.executive" },
  { key: "treasury",       icon: Wallet,       labelKey: "Tesouraria",          moduleId: "finance.treasury" },
  { key: "tithes",         icon: Heart,        labelKey: "Dízimos & Ofertas",   moduleId: "finance.tithes" },
  { key: "campaigns",      icon: Megaphone,    labelKey: "Campanhas",           moduleId: "finance.campaigns" },
  { key: "accounts",       icon: ArrowLeftRight, labelKey: "Contas",            moduleId: "finance.accounts" },
  { key: "budget",         icon: PieChart,     labelKey: "Orçamento",           moduleId: "finance.budget" },
  { key: "assets",         icon: Building2,    labelKey: "Patrimônio",          moduleId: "finance.assets" },
  { key: "accountability", icon: FileCheck,    labelKey: "Prestação de Contas", moduleId: "finance.accountability" },
  { key: "audit",          icon: ShieldCheck,  labelKey: "Auditoria",           moduleId: "finance.audit" },
  { key: "intelligence",   icon: Sparkles,     labelKey: "Inteligência",        moduleId: "finance.intelligence" },
] as const satisfies ReadonlyArray<{ key: string; icon: unknown; labelKey: string; moduleId: ModuleId }>;

// Apenas Tesouraria usa dados reais na allowlist urgente de produção; as
// demais abas dependem de financeDemo/campaignsDemo e ficam restritas a
// staging (ver src/config/modules.ts). Filtrado aqui — nunca uma regra
// paralela de gating.
const TABS = ALL_TABS.filter(tab => isModuleEnabled(tab.moduleId));

type TabKey = typeof ALL_TABS[number]["key"];

export default function Financeiro() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>(TABS[0]?.key ?? "treasury");

  // ── Tab scroll state ────────────────────────────────────────────────────
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkScroll();
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", checkScroll);
    };
  }, [checkScroll]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = tabsRef.current;
    const btn = el?.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null;
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTab]);

  const scrollTabs = (dir: "left" | "right") => {
    tabsRef.current?.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  // ── Data loading ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !church) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("organization_id", church.id)
        .order("date", { ascending: false });
      if (error) { console.error("[Financeiro] Erro ao carregar transações:", error); toast.error(t("Erro ao carregar transações")); }
      else setTransactions((data as TreasuryTransaction[]) || []);
      setLoading(false);
    };
    load();
  }, [user, church, t]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Financeiro")}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            {t("Gestão financeira, campanhas, prestação de contas e inteligência ministerial")}
          </p>
        </div>

        {/* Tab bar with scroll arrows */}
        <div className="relative">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabs("left")}
              aria-label="Abas anteriores"
              className="absolute left-0 inset-y-0 z-10 px-1.5 flex items-center rounded-l-xl bg-gradient-to-r from-secondary via-secondary/90 to-transparent pointer-events-auto"
            >
              <ChevronLeft size={16} className="text-muted-foreground" />
            </button>
          )}
          <div
            ref={tabsRef}
            className="flex gap-1 bg-secondary/50 rounded-xl p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  data-tab={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isActive ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span className="hidden sm:inline">{t(tab.labelKey)}</span>
                </button>
              );
            })}
          </div>
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTabs("right")}
              aria-label="Próximas abas"
              className="absolute right-0 inset-y-0 z-10 px-1.5 flex items-center rounded-r-xl bg-gradient-to-l from-secondary via-secondary/90 to-transparent pointer-events-auto"
            >
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {activeTab === "treasury" && (
          <div className="space-y-6">
            {/* Operacional primeiro — tabela, filtros, ações */}
            <TransactionList transactions={transactions} setTransactions={setTransactions} loading={loading} />
            {/* Dashboard / visão geral depois da operação */}
            <div className="pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-4 px-1">
                {t("Visão Geral")}
              </p>
              <FinanceOverview transactions={transactions} />
            </div>
          </div>
        )}
        {/* Abas staging-only — ver IS_STAGING_BUILD acima. Suspense próprio
            porque estes componentes são lazy apenas quando existem. */}
        <Suspense fallback={null}>
          {activeTab === "executive" && <FinanceExecutive onTabChange={setActiveTab} transactions={transactions} />}
          {activeTab === "tithes" && <FinanceTithesOfferings transactions={transactions} />}
          {activeTab === "campaigns" && FinanceCampaigns && <FinanceCampaigns />}
          {activeTab === "accounts" && FinanceAccounts && <FinanceAccounts />}
          {activeTab === "budget" && <FinanceBudget transactions={transactions} />}
          {activeTab === "assets" && <FinanceAssets />}
          {activeTab === "accountability" && <FinanceAccountability transactions={transactions} />}
          {activeTab === "audit" && FinanceAudit && <FinanceAudit />}
          {activeTab === "intelligence" && FinanceIntelligence && <FinanceIntelligence onTabChange={setActiveTab} />}
        </Suspense>
      </div>
    </AdminLayout>
  );
}
