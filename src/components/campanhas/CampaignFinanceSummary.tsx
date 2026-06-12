import { ArrowDown, Wallet } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { formatCampaignCurrency, getCampaignStats, type Campaign } from "@/lib/campaignsDemo";

/**
 * Resumo financeiro demo — preparação para integração futura:
 *
 * Campanha → Financeiro → Relatórios → Prestação de Contas
 *
 * Quando houver tabela `campaigns` e vínculo com `transactions`,
 * substituir DEMO por queries Supabase filtradas por campaign_id.
 */

type Props = { campaigns: Campaign[] };

export function CampaignFinanceSummary({ campaigns }: Props) {
  const { t, lang } = useLanguage();
  const stats = getCampaignStats(campaigns);
  const gap = Math.max(0, stats.totalGoal - stats.totalRaised);

  return (
    <section className="bg-card rounded-xl border border-border/50 shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} className="text-primary" />
        <h2 className="font-serif text-lg font-semibold">{t("Resumo Financeiro")}</h2>
      </div>

      <div className="space-y-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Total Arrecadado")}</span>
          <span className="font-semibold tabular-nums">{formatCampaignCurrency(stats.totalRaised, lang)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Meta das campanhas ativas")}</span>
          <span className="font-semibold tabular-nums">{formatCampaignCurrency(stats.totalGoal, lang)}</span>
        </div>
        <div className="flex justify-between border-t border-border/50 pt-3">
          <span className="text-muted-foreground">{t("Saldo a alcançar")}</span>
          <span className="font-semibold text-accent tabular-nums">{formatCampaignCurrency(gap, lang)}</span>
        </div>
      </div>

      <div className="mt-5 p-3 rounded-lg bg-secondary/40 text-xs text-muted-foreground flex items-start gap-2">
        <ArrowDown size={14} className="flex-shrink-0 mt-0.5 rotate-[-90deg]" />
        <p>{t("Integração futura: lançamentos no Financeiro vinculados à campanha alimentarão relatórios e prestação de contas.")}</p>
      </div>
    </section>
  );
}
