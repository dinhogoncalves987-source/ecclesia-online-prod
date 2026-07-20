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

// RESTAURAÇÃO DO FINANCEIRO (2026-07-20 a 2026-07-24, Fases A-H) — em
// 15/07/2026 estas 9 abas foram ocultadas de produção (FASE 6) por
// dependerem de financeDemo/campaignsDemo (dado fictício). Cada uma foi
// religada a dados reais do Supabase, fase a fase — ver o histórico de
// comentários "CORREÇÃO 2026-07-2x (Fase X)" nos próprios componentes
// (src/components/financeiro/*.tsx) e em src/config/modules.ts. Nenhuma
// depende mais de IS_STAGING_BUILD: todas são carregadas sempre, em
// qualquer ambiente.
const FinanceExecutive = lazy(() => import("@/components/financeiro/FinanceExecutive").then(m => ({ default: m.FinanceExecutive })));
const FinanceTithesOfferings = lazy(() => import("@/components/financeiro/FinanceTithesOfferings").then(m => ({ default: m.FinanceTithesOfferings })));
const FinanceCampaigns = lazy(() => import("@/components/financeiro/FinanceCampaigns").then(m => ({ default: m.FinanceCampaigns })));
const FinanceAccounts = lazy(() => import("@/components/financeiro/FinanceAccounts").then(m => ({ default: m.FinanceAccounts })));
const FinanceBudget = lazy(() => import("@/components/financeiro/FinanceBudget").then(m => ({ default: m.FinanceBudget })));
const FinanceAssets = lazy(() => import("@/components/financeiro/FinanceAssets").then(m => ({ default: m.FinanceAssets })));
const FinanceAccountability = lazy(() => import("@/components/financeiro/FinanceAccountability").then(m => ({ default: m.FinanceAccountability })));
const FinanceAudit = lazy(() => import("@/components/financeiro/FinanceAudit").then(m => ({ default: m.FinanceAudit })));
const FinanceIntelligence = lazy(() => import("@/components/financeiro/FinanceIntelligence").then(m => ({ default: m.FinanceIntelligence })));

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

// Todas as abas usam dados reais desde a restauração completa (Fases A-H,
// ver src/config/modules.ts) — filtro aqui apenas reflete a allowlist de
// módulos por ambiente, nunca uma regra paralela de gating.
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
        {/* Demais abas — todas lazy-loaded, todas com dados reais (Fases A-H). */}
        <Suspense fallback={null}>
          {activeTab === "executive" && <FinanceExecutive onTabChange={setActiveTab} transactions={transactions} />}
          {activeTab === "tithes" && <FinanceTithesOfferings transactions={transactions} />}
          {activeTab === "campaigns" && <FinanceCampaigns />}
          {activeTab === "accounts" && <FinanceAccounts />}
          {activeTab === "budget" && <FinanceBudget transactions={transactions} />}
          {activeTab === "assets" && <FinanceAssets />}
          {activeTab === "accountability" && <FinanceAccountability transactions={transactions} />}
          {activeTab === "audit" && <FinanceAudit />}
          {activeTab === "intelligence" && <FinanceIntelligence onTabChange={setActiveTab} transactions={transactions} />}
        </Suspense>
      </div>
    </AdminLayout>
  );
}
