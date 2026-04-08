import { QrCode, Copy } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

export function PixCard() {
  const { t } = useLanguage();
  const PIX_KEY = "sua-chave-pix@igreja.com";

  return (
    <div className="bg-card rounded-xl shadow-executive p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 bg-accent/10 rounded-xl">
          <QrCode size={24} className="text-accent" />
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold">{t("Dizimar via PIX")}</h3>
          <p className="text-xs text-muted-foreground">{t("Chave PIX da Igreja")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-3">
        <code className="flex-1 text-sm font-mono break-all">{PIX_KEY}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(PIX_KEY); toast.success(t("Chave copiada!")); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          <Copy size={14} /> {t("Copiar Chave PIX")}
        </button>
      </div>
    </div>
  );
}
