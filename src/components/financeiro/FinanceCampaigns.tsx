import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { useCampaigns } from "@/hooks/useCampaigns";
import { CampaignCover } from "@/components/campanhas/CampaignCover";
import { useCampaignMedia } from "@/hooks/useCampaignMedia";
import { useChurch } from "@/hooks/useChurchContext";
import {
  activeCampaigns,
  campaignProgress,
  formatCampaignCurrency,
  getCampaignStats,
} from "@/lib/campaignsDemo";
import { formatFinanceCurrency } from "@/lib/financeDemo";
import { ArrowDown, ChevronRight, Megaphone } from "lucide-react";

const OPERATING_FEE_RATE = 0.025;

export function FinanceCampaigns() {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { campaigns } = useCampaigns();
  const { mediaByCampaign } = useCampaignMedia({
    organizationId: church?.id,
    campaignIds: campaigns.map((c) => c.id),
  });
  const stats = getCampaignStats(campaigns);
  const active = activeCampaigns(campaigns);
  const gap = Math.max(0, stats.totalGoal - stats.totalRaised);
  const operatingFee = Math.round(stats.totalRaised * OPERATING_FEE_RATE);
  const netTransfer = stats.totalRaised - operatingFee;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("Campanhas Ativas"), value: String(stats.activeCount) },
          { label: t("Meta total"), value: formatCampaignCurrency(stats.totalGoal, lang) },
          { label: t("Total Arrecadado"), value: formatCampaignCurrency(stats.totalRaised, lang) },
          { label: t("Saldo a alcançar"), value: formatCampaignCurrency(gap, lang) },
        ].map((item) => (
          <div key={item.label} className="bg-card rounded-xl p-5 shadow-sm border border-border/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</p>
            <p className="text-2xl font-semibold mt-1.5 tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl p-5 border border-border/50">
          <p className="text-sm text-muted-foreground">{t("Taxa operacional estimada")} (2,5%)</p>
          <p className="text-xl font-semibold mt-1 tabular-nums">{formatFinanceCurrency(operatingFee, lang)}</p>
        </div>
        <div className="bg-card rounded-xl p-5 border border-border/50">
          <p className="text-sm text-muted-foreground">{t("Repasse líquido estimado")}</p>
          <p className="text-xl font-semibold mt-1 tabular-nums text-green-600">{formatFinanceCurrency(netTransfer, lang)}</p>
        </div>
      </div>

      <section className="bg-card rounded-xl shadow-executive p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
            <Megaphone size={18} className="text-accent" /> {t("Campanhas ativas")}
          </h3>
          <Link to="/admin/campanhas" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
            {t("Abrir Campanhas")} <ChevronRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {active.map((c) => {
            const pct = campaignProgress(c);
            return (
              <div key={c.id} className="p-4 rounded-lg bg-secondary/30 flex gap-4">
                <div className="w-20 h-14 sm:w-24 sm:h-16 rounded-lg overflow-hidden flex-shrink-0 border border-border/40">
                  <CampaignCover
                    campaign={c}
                    media={mediaByCampaign.get(c.id)}
                    variant="banner"
                    className="h-full w-full"
                    imageOnly
                  />
                </div>
                <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2 mb-2">
                  <p className="font-medium truncate">{c.title}</p>
                  <span className="text-sm font-semibold text-accent flex-shrink-0">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatCampaignCurrency(c.raisedAmount, lang)} / {formatCampaignCurrency(c.goalAmount, lang)}
                </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="p-4 rounded-xl bg-secondary/40 text-sm text-muted-foreground flex items-start gap-2">
        <ArrowDown size={14} className="flex-shrink-0 mt-0.5 rotate-[-90deg]" />
        <div>
          <p className="font-medium text-foreground mb-1">{t("Fluxo de integração")}</p>
          <p>{t("Campanhas")} → {t("Financeiro")} → {t("Relatórios")} → {t("Prestação de Contas")}</p>
        </div>
      </div>
    </div>
  );
}
