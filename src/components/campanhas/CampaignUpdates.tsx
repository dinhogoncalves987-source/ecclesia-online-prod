import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { updateTypeI18nKey } from "@/lib/campaignUpdateUtils";
import { type CampaignUpdate } from "@/lib/campaignsDemo";

type Props = {
  updates: CampaignUpdate[];
  maxItems?: number;
};

export function CampaignUpdates({ updates, maxItems = 8 }: Props) {
  const { t, lang } = useLanguage();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const visible = updates.slice(0, maxItems);

  return (
    <section className="bg-card rounded-xl border border-border/50 shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-accent" />
        <h2 className="font-serif text-lg font-semibold">{t("Últimas Atualizações")}</h2>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 p-3">
          {t("Nenhuma atualização recente")}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex gap-3 p-3 rounded-lg bg-secondary/30"
            >
              <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground line-clamp-2">{u.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{u.campaignTitle}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-[10px] uppercase tracking-wide text-accent/80">
                    {t(updateTypeI18nKey(u.updateType ?? "progress"))}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString(dateLoc, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
