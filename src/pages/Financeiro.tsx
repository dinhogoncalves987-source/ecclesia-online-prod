import { AdminLayout } from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurch";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { FinanceOverview } from "@/components/financeiro/FinanceOverview";
import { TransactionList } from "@/components/financeiro/TransactionList";
import { FinanceReports } from "@/components/financeiro/FinanceReports";
import { PixCard } from "@/components/financeiro/PixCard";
import { BarChart3, List, FileText, CreditCard } from "lucide-react";

type Transaction = {
  id: string; date: string; description: string; type: string; amount: number; status: string; category: string;
};

const TABS = [
  { key: "overview", icon: BarChart3, labelKey: "Visão Geral" },
  { key: "transactions", icon: List, labelKey: "Lançamentos" },
  { key: "reports", icon: FileText, labelKey: "Relatórios Contábeis" },
  { key: "pix", icon: CreditCard, labelKey: "PIX / Dízimos" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function Financeiro() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { church } = useChurch();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Financeiro")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Tesouraria e controle contábil")}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span className="hidden sm:inline">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && <FinanceOverview transactions={transactions} />}
        {activeTab === "transactions" && <TransactionList transactions={transactions} setTransactions={setTransactions} loading={loading} />}
        {activeTab === "reports" && <FinanceReports transactions={transactions} />}
        {activeTab === "pix" && <PixCard />}
      </div>
    </AdminLayout>
  );
}
