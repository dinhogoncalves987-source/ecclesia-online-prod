import { ExternalLink, FileSpreadsheet, FileText, Plus, Receipt, ScrollText } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { Campaign } from "@/lib/campaignsDemo";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import { getCampaignDocuments, resolveMediaItemUrl } from "@/lib/campaignMedia";

type Props = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  onEdit?: () => void;
};

const DOC_TYPES = [
  { key: "budget", icon: FileSpreadsheet, labelKey: "Orçamentos" },
  { key: "receipt", icon: Receipt, labelKey: "Recibos" },
  { key: "invoice", icon: FileText, labelKey: "Notas fiscais" },
  { key: "report", icon: ScrollText, labelKey: "Relatórios" },
  { key: "authorization", icon: FileText, labelKey: "Autorizações" },
] as const;

function docIconForName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return FileSpreadsheet;
  if (lower.endsWith(".pdf")) return FileText;
  return ScrollText;
}

export function CampaignDocuments({ campaign, media = [], onEdit }: Props) {
  const { t } = useLanguage();
  const documents = getCampaignDocuments(campaign, media);

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm">{t("Documentos")}</h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Plus size={14} /> {t("Adicionar documento")}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {campaign.title} — {t("Documentos da campanha")}
      </p>

      {documents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {documents.map((doc) => {
            const url = resolveMediaItemUrl(doc);
            const Icon = docIconForName(doc.title ?? doc.storagePath);
            return (
              <a
                key={doc.id}
                href={url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center flex-shrink-0 border border-border/30">
                  <Icon size={16} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{doc.title ?? doc.storagePath.split("/").pop()}</p>
                  <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <ExternalLink size={10} /> {t("Abrir documento")}
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DOC_TYPES.map(({ key, icon: Icon, labelKey }) => (
            <div
              key={key}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-secondary/20 text-left opacity-60"
            >
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center flex-shrink-0 border border-border/30">
                <Icon size={16} className="text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t(labelKey)}</p>
                <p className="text-[10px] text-muted-foreground">{t("Nenhum documento enviado")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
