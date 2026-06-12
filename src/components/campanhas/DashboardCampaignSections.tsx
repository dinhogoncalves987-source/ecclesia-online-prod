import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, Clock, Megaphone } from "lucide-react";
import { DashboardCampaignCarousel } from "@/components/campanhas/DashboardCampaignCarousel";
import { useLanguage } from "@/hooks/useLanguage";
import { useDashboardCampaigns } from "@/hooks/useDashboardCampaigns";
import { campaignStatusBadgeClass } from "@/components/campanhas/CampaignForm";

export function DashboardCampaignSections() {
  const { t, lang } = useLanguage();
  const { carouselCampaigns, recentCampaigns, loading } = useDashboardCampaigns();

  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  return (
    <div className="space-y-6">
      <DashboardCampaignCarousel campaigns={carouselCampaigns} loading={loading} />

      {/* Campanhas acompanhadas — visual only, sem backend */}
      <section className="bg-card rounded-xl shadow-executive border border-border/50 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg flex items-center gap-2">
            <Bookmark size={18} className="text-accent" />
            {t("Campanhas que você acompanha")}
          </h2>
          <Link
            to="/admin/campanhas"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {t("Ver todas")} <ChevronRight size={12} />
          </Link>
        </div>
        <p className="text-sm text-muted-foreground rounded-lg bg-secondary/30 px-4 py-3">
          {t("Você ainda não acompanha nenhuma campanha.")}
        </p>
      </section>

      {/* Últimas campanhas */}
      <section className="bg-card rounded-xl shadow-executive border border-border/50 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg flex items-center gap-2">
            <Megaphone size={18} className="text-accent" />
            {t("Últimas campanhas")}
          </h2>
          <Link
            to="/admin/campanhas"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {t("Ver todas")} <ChevronRight size={12} />
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t("Carregando...")}</p>
        ) : recentCampaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t("Nenhuma campanha cadastrada")}</p>
        ) : (
          <ul className="space-y-2">
            {recentCampaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  to={`/admin/campanhas?campanha=${campaign.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="w-1 h-10 bg-accent rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{campaign.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock size={11} />
                      {new Date(campaign.createdAt).toLocaleDateString(dateLoc, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      · {campaign.organization}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${campaignStatusBadgeClass(campaign.status)}`}
                  >
                    {t(campaign.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
