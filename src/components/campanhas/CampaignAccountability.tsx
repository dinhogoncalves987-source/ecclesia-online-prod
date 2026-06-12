import { CheckCircle2, Clock, FileDown, FileText, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@/lib/campaignsDemo";

type Props = { campaign: Campaign };

export function CampaignAccountability({ campaign }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  const isClosed = campaign.status === "Encerrada";
  const statusLabel = isClosed ? t("Prestação publicada") : t("Em andamento");
  const lastUpdate = new Date(campaign.deadline).toLocaleDateString(dateLoc, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const handlePdf = () => {
    toast({ title: t("Gerar PDF"), description: t("Em breve disponível") });
  };

  return (
    <section className="rounded-xl border border-border/50 p-4 sm:p-5 bg-secondary/15 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <FileText size={16} className="text-accent" />
        {t("Prestação de Contas")}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          {isClosed ? (
            <CheckCircle2 size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Clock size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className="text-xs text-muted-foreground">{t("Status da prestação")}</p>
            <p className="font-medium">{statusLabel}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <User size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">{t("Responsável")}</p>
            <p className="font-medium truncate">{campaign.organization}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <Clock size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">{t("Última atualização")}</p>
            <p className="font-medium">{lastUpdate}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-card/80 border border-border/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">{t("Comprovantes e relatório financeiro")}</p>
        <p>
          {t("Campanhas")} → {t("Financeiro")} → {t("Relatórios")} → {t("Prestação de Contas")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/financeiro"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
        >
          {t("Ver relatório")}
        </Link>
        <button
          type="button"
          onClick={handlePdf}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border/50 text-sm font-medium hover:bg-secondary/50 transition-colors"
        >
          <FileDown size={14} /> {t("Gerar PDF")}
        </button>
      </div>
    </section>
  );
}
