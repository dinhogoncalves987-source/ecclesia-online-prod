import { Wallet, Target, TrendingUp, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { formatCampaignCurrency, getCampaignStats, type Campaign } from "@/lib/campaignsDemo";

type Props = { campaigns: Campaign[] };

export function CampaignOverview({ campaigns }: Props) {
  const { t, lang } = useLanguage();
  const stats = getCampaignStats(campaigns);

  const cards = [
    {
      title: t("Total Arrecadado"),
      value: formatCampaignCurrency(stats.totalRaised, lang),
      icon: Wallet,
      color: "text-green-600 bg-green-500/10",
    },
    {
      title: t("Campanhas Ativas"),
      value: String(stats.activeCount),
      icon: Target,
      color: "text-primary bg-primary/10",
    },
    {
      title: t("Meta Geral"),
      value: formatCampaignCurrency(stats.totalGoal, lang),
      icon: TrendingUp,
      color: "text-accent bg-accent/10",
    },
    {
      title: t("Participações"),
      value: stats.participations.toLocaleString(lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR"),
      icon: Users,
      color: "text-amber-600 bg-amber-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="bg-card rounded-xl p-5 shadow-sm border border-border/50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.title}</p>
              <p className="text-2xl font-semibold mt-1.5 tabular-nums">{card.value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.color}`}>
              <card.icon size={18} />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
