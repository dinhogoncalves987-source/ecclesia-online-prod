import { Share2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";

type Props = {
  campaignTitle: string;
  campaignId: string;
};

export function CampaignActions({ campaignTitle, campaignId }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const handleFollow = () => {
    toast({ title: t("Acompanhar"), description: t("Você será notificado sobre esta campanha") });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/admin/campanhas?campanha=${campaignId}`;
    const shareData = { title: campaignTitle, text: campaignTitle, url };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: t("Compartilhar"), description: t("Link copiado para a área de transferência") });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast({ title: t("Compartilhar"), description: t("Não foi possível compartilhar agora") });
    }
  };

  const handleContribute = () => {
    toast({ title: t("Contribuir"), description: t("Contribuição online em breve") });
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50 sticky bottom-0 z-20 bg-card/95 backdrop-blur-md py-3 -mx-5 px-5 sm:static sm:z-auto sm:bg-transparent sm:py-0 sm:mx-0 sm:px-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
      <button
        type="button"
        onClick={handleFollow}
        className="flex-1 min-w-[100px] py-2.5 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
      >
        {t("Acompanhar")}
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="flex-1 min-w-[100px] py-2.5 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors inline-flex items-center justify-center gap-1.5"
      >
        <Share2 size={14} /> {t("Compartilhar")}
      </button>
      <button
        type="button"
        onClick={handleContribute}
        className="flex-1 min-w-[100px] py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        {t("Contribuir")}
      </button>
    </div>
  );
}
