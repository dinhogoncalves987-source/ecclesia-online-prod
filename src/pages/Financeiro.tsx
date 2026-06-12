import { AdminLayout } from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { FinanceOverview } from "@/components/financeiro/FinanceOverview";
import { TransactionList } from "@/components/financeiro/TransactionList";
import { FinanceExecutive } from "@/components/financeiro/FinanceExecutive";
import { FinanceTithesOfferings } from "@/components/financeiro/FinanceTithesOfferings";
import { FinanceCampaigns } from "@/components/financeiro/FinanceCampaigns";
import { FinanceAccounts } from "@/components/financeiro/FinanceAccounts";
import { FinanceBudget } from "@/components/financeiro/FinanceBudget";
import { FinanceAssets } from "@/components/financeiro/FinanceAssets";
import { FinanceAccountability } from "@/components/financeiro/FinanceAccountability";
import { FinanceAudit } from "@/components/financeiro/FinanceAudit";
import { FinanceIntelligence } from "@/components/financeiro/FinanceIntelligence";
import {
  BarChart3, Wallet, Heart, Megaphone, ArrowLeftRight, PieChart,
  Building2, FileCheck, ShieldCheck, Sparkles,
} from "lucide-react";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import type { TreasuryTransaction } from "@/lib/finance";

const TABS = [
  { key: "executive", icon: BarChart3, labelKey: "Executivo" },
  { key: "treasury", icon: Wallet, labelKey: "Tesouraria" },
  { key: "tithes", icon: Heart, labelKey: "Dízimos & Ofertas" },
  { key: "campaigns", icon: Megaphone, labelKey: "Campanhas" },
  { key: "accounts", icon: ArrowLeftRight, labelKey: "Contas" },
  { key: "budget", icon: PieChart, labelKey: "Orçamento" },
  { key: "assets", icon: Building2, labelKey: "Patrimônio" },
  { key: "accountability", icon: FileCheck, labelKey: "Prestação de Contas" },
  { key: "audit", icon: ShieldCheck, labelKey: "Auditoria" },
  { key: "intelligence", icon: Sparkles, labelKey: "Inteligência" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function Financeiro() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("executive");

  useEffect(() => {
    if (!user || !church) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const { data, error } = await runScopedOrganizationQuery<TreasuryTransaction[]>("transactions", church.id, query =>
        query.select("*").order("date", { ascending: false })
      );
      if (error) { console.error(error); toast.error(t("Erro ao carregar transações")); }
      else setTransactions(data || []);
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

        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
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

        {activeTab === "executive" && <FinanceExecutive />}
        {activeTab === "treasury" && (
          <div className="space-y-6">
            <FinanceOverview transactions={transactions} />
            <TransactionList transactions={transactions} setTransactions={setTransactions} loading={loading} />
          </div>
        )}
        {activeTab === "tithes" && <FinanceTithesOfferings />}
        {activeTab === "campaigns" && <FinanceCampaigns />}
        {activeTab === "accounts" && <FinanceAccounts />}
        {activeTab === "budget" && <FinanceBudget />}
        {activeTab === "assets" && <FinanceAssets />}
        {activeTab === "accountability" && <FinanceAccountability transactions={transactions} />}
        {activeTab === "audit" && <FinanceAudit />}
        {activeTab === "intelligence" && <FinanceIntelligence />}
      </div>
    </AdminLayout>
  );
}
