import { ArrowDown, TrendingUp, Wallet } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { campaignProgress, formatCampaignCurrency, type Campaign } from "@/lib/campaignsDemo";

const OPERATING_FEE_RATE = 0.025;

type Props = { campaign: Campaign };

export function CampaignFinancialProgress({ campaign }: Props) {
  const { t, lang } = useLanguage();
  const pct = campaignProgress(campaign);
  const remaining = Math.max(0, campaign.goalAmount - campaign.raisedAmount);
  const operatingFee = Math.round(campaign.raisedAmount * OPERATING_FEE_RATE);
  const netTransfer = campaign.raisedAmount - operatingFee;

  return (
    <section className="rounded-xl border border-border/50 p-4 sm:p-5 bg-secondary/15 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <TrendingUp size={16} className="text-accent" />
        {t("Progresso financeiro")}
      </h3>

      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">{t("Progresso da campanha")}</span>
          <span className="font-semibold text-accent">{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-3 border border-border/40">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Meta")}</p>
          <p className="text-lg font-semibold tabular-nums mt-0.5">{formatCampaignCurrency(campaign.goalAmount, lang)}</p>
        </div>
        <div className="rounded-lg bg-card p-3 border border-border/40">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Total Arrecadado")}</p>
          <p className="text-lg font-semibold tabular-nums mt-0.5 text-green-600">{formatCampaignCurrency(campaign.raisedAmount, lang)}</p>
        </div>
        <div className="rounded-lg bg-card p-3 border border-border/40">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Saldo restante")}</p>
          <p className="text-lg font-semibold tabular-nums mt-0.5">{formatCampaignCurrency(remaining, lang)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2 rounded-lg bg-card/80 p-3 border border-border/30">
          <Wallet size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-muted-foreground text-xs">{t("Taxa operacional estimada")} (2,5%)</p>
            <p className="font-semibold tabular-nums">{formatCampaignCurrency(operatingFee, lang)}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-card/80 p-3 border border-border/30">
          <Wallet size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-muted-foreground text-xs">{t("Repasse líquido estimado")}</p>
            <p className="font-semibold tabular-nums text-green-600">{formatCampaignCurrency(netTransfer, lang)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
        <ArrowDown size={12} className="flex-shrink-0 mt-0.5 rotate-[-90deg]" />
        <p>
          {t("Campanhas")} → {t("Financeiro")} → {t("Relatórios")} → {t("Prestação de Contas")}
        </p>
      </div>
    </section>
  );
}
