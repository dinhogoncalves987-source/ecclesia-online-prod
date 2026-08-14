import { AdminLayout } from "@/components/AdminLayout";
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { FinanceOverview } from "@/components/financeiro/FinanceOverview";
import { TransactionList } from "@/components/financeiro/TransactionList";
import {
  BarChart3, ChevronLeft, ChevronRight, Wallet, Heart, Megaphone, ArrowLeftRight, PieChart,
  Building2, FileCheck, ShieldCheck, Sparkles,
} from "lucide-react";
import { isModuleEnabled } from "@/config/modules";
import {
  FINANCE_TAB_DEFINITIONS,
  getFinanceTabDefinition,
  type FinanceTabKey,
} from "@/config/financeTabs";

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

// Ícones por aba — mantidos aqui (não em financeTabs.ts) porque o módulo de
// configuração é puro/sem React para ser testável sem montar UI. Título e
// descrição de cada aba vêm de FINANCE_TAB_DEFINITIONS (fonte única).
const TAB_ICONS: Record<FinanceTabKey, typeof BarChart3> = {
  executive: BarChart3,
  treasury: Wallet,
  tithes: Heart,
  campaigns: Megaphone,
  accounts: ArrowLeftRight,
  budget: PieChart,
  assets: Building2,
  accountability: FileCheck,
  audit: ShieldCheck,
  intelligence: Sparkles,
};

const ALL_TABS = FINANCE_TAB_DEFINITIONS.map(tab => ({ ...tab, icon: TAB_ICONS[tab.key] }));

// Todas as abas usam dados reais desde a restauração completa (Fases A-H,
// ver src/config/modules.ts) — filtro aqui apenas reflete a allowlist de
// módulos por ambiente, nunca uma regra paralela de gating.
const TABS = ALL_TABS.filter(tab => isModuleEnabled(tab.moduleId));

type TabKey = FinanceTabKey;

export default function Financeiro() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>(TABS[0]?.key ?? "treasury");
  // Incrementado após criar/editar/excluir/importar/zerar — dispara a
  // releitura dos dados agregados (RPC) e do array completo (quando
  // necessário) sem depender de refresh de página.
  const [reloadToken, setReloadToken] = useState(0);
  const handleDataChanged = useCallback(() => setReloadToken(token => token + 1), []);
  const navigateToTab = (tab: string) => {
    if (ALL_TABS.some(candidate => candidate.key === tab)) {
      setActiveTab(tab as TabKey);
    }
  };

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

  // CORREÇÃO C3.1 (eliminar fetch-all): nenhuma aba do Financeiro baixa
  // mais o array completo de `transactions`. Tesouraria (TransactionList)
  // usa paginação server-side própria; Visão Geral, Executivo, Dízimos &
  // Ofertas, Orçamento, Prestação de Contas e Inteligência usam
  // finance_dashboard_aggregates (ou uma consulta escopada por
  // organização + intervalo de datas, sempre com `.limit()`, quando
  // precisam de um extrato de UM mês/período). `reloadToken` é a única
  // dependência compartilhada — ele revalida os dados agregados/paginados
  // de cada componente após criar/editar/excluir/importar/zerar.
  const activeTabDefinition = getFinanceTabDefinition(activeTab);

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
                  aria-label={t(tab.labelKey)}
                  aria-current={isActive ? "true" : undefined}
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

        {/* PASSO 4 (FASE 1D-C3): no celular, o rótulo de texto de cada aba
            fica oculto (hidden sm:inline) — só o ícone aparece na barra
            horizontal, o que deixava ambíguo qual seção estava ativa. Este
            bloco (visível só em telas pequenas, sm:hidden) exibe o nome e a
            descrição da aba ativa, lidos de FINANCE_TAB_DEFINITIONS (fonte
            única), atualizado imediatamente ao trocar de aba. */}
        {activeTabDefinition && (
          <div key={activeTab} className="sm:hidden -mt-1" aria-live="polite">
            <h2 className="text-base font-serif font-semibold tracking-tight">{t(activeTabDefinition.labelKey)}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t(activeTabDefinition.descriptionKey)}</p>
          </div>
        )}

        {activeTab === "treasury" && (
          <div className="space-y-6">
            {/* Operacional primeiro — tabela, filtros, ações */}
            <TransactionList onDataChanged={handleDataChanged} />
            {/* Dashboard / visão geral depois da operação */}
            <div className="pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-4 px-1">
                {t("Visão Geral")}
              </p>
              <FinanceOverview reloadToken={reloadToken} />
            </div>
          </div>
        )}
        {/* Demais abas — todas lazy-loaded, todas com dados reais (Fases A-H).
            Nenhuma delas recebe mais o array completo de transactions —
            cada uma busca seus próprios dados agregados/paginados/escopados
            por período, então cada componente controla seu próprio estado
            de carregamento internamente (sem "zero falso" de array vazio). */}
        <Suspense fallback={null}>
          {activeTab === "executive" && <FinanceExecutive onTabChange={navigateToTab} reloadToken={reloadToken} />}
          {activeTab === "tithes" && <FinanceTithesOfferings reloadToken={reloadToken} />}
          {activeTab === "campaigns" && <FinanceCampaigns />}
          {activeTab === "accounts" && <FinanceAccounts />}
          {activeTab === "budget" && <FinanceBudget reloadToken={reloadToken} />}
          {activeTab === "assets" && <FinanceAssets />}
          {activeTab === "accountability" && <FinanceAccountability reloadToken={reloadToken} />}
          {activeTab === "audit" && <FinanceAudit />}
          {activeTab === "intelligence" && <FinanceIntelligence onTabChange={navigateToTab} reloadToken={reloadToken} />}
        </Suspense>
      </div>
    </AdminLayout>
  );
}
