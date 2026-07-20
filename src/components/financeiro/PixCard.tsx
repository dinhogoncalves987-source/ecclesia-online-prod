import { useEffect, useState } from "react";
import { QrCode, Copy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { runScopedOrganizationQuery } from "@/lib/organizationScope";
import type { FinanceAccount } from "@/lib/finance";

export function PixCard({ refreshKey }: { refreshKey?: number } = {}) {
  const { t } = useLanguage();
  const { church } = useChurch();
  const [pixAccount, setPixAccount] = useState<FinanceAccount | null>(null);

  useEffect(() => {
    if (!church) return;
    const loadPixAccount = async () => {
      const { data } = await runScopedOrganizationQuery<FinanceAccount[]>("finance_accounts", church.id, query =>
        query.select("*").eq("type", "pix").eq("is_active", true).limit(1),
      );
      setPixAccount(data?.[0] || null);
    };
    loadPixAccount();
    // refreshKey força reconsulta após salvar a configuração de PIX em
    // FinanceTithesOfferings (mesma tabela finance_accounts).
  }, [church, refreshKey]);

  const pixKey = pixAccount?.pix_key || "";

  return (
    <div className="bg-card rounded-xl shadow-executive p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 bg-accent/10 rounded-xl">
          <QrCode size={24} className="text-accent" />
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold">{t("Conta PIX")}</h3>
          <p className="text-xs text-muted-foreground">{t("Conta financeira vinculada a tesouraria")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
        <Wallet size={18} className="text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{pixAccount?.name || "PIX"}</p>
          <code className="block text-xs font-mono break-all text-muted-foreground">
            {pixKey || t("Chave PIX ainda nao configurada")}
          </code>
        </div>
        <button
          disabled={!pixKey}
          onClick={() => { navigator.clipboard.writeText(pixKey); toast.success(t("Chave copiada!")); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50"
        >
          <Copy size={14} /> {t("Copiar")}
        </button>
      </div>
    </div>
  );
}
