import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignUpdateCreateDialog } from "@/components/campanhas/CampaignUpdateCreateDialog";
import { CampaignUpdateEditDialog } from "@/components/campanhas/CampaignUpdateEditDialog";
import { CampaignUpdateDeleteButton } from "@/components/campanhas/CampaignUpdateDeleteButton";
import { useLanguage } from "@/hooks/useLanguage";
import type { Campaign, CampaignUpdate } from "@/lib/campaignsDemo";
import { DEMO_CAMPAIGN_UPDATES } from "@/lib/campaignsDemo";
import {
  getUpdateTypeIcon,
  isPersistedUpdateId,
  updateTypeI18nKey,
} from "@/lib/campaignUpdateUtils";

type Props = {
  campaignId: string;
  updates?: CampaignUpdate[];
  campaigns?: Campaign[];
  fromDatabase?: boolean;
  canManage?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export function CampaignTimeline({
  campaignId,
  updates = [],
  campaigns = [],
  fromDatabase = false,
  canManage = false,
  onRefresh,
}: Props) {
  const { t, lang } = useLanguage();
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";
  const [createOpen, setCreateOpen] = useState(false);
  const [editUpdate, setEditUpdate] = useState<CampaignUpdate | null>(null);

  const filtered = useMemo(
    () =>
      [...updates]
        .filter((u) => u.campaignId === campaignId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [updates, campaignId],
  );

  const entries =
    filtered.length > 0
      ? filtered
      : fromDatabase
        ? []
        : DEMO_CAMPAIGN_UPDATES.filter((u) => u.campaignId === campaignId).map((u) => ({
            ...u,
            updateType: u.updateType ?? "progress",
          }));

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="font-semibold text-sm">{t("Atualizações")}</h3>
        {canManage && (
          <>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              {t("Nova atualização")}
            </Button>
            <CampaignUpdateCreateDialog
              campaigns={campaigns}
              defaultCampaignId={campaignId}
              hideCampaignSelect
              open={createOpen}
              onOpenChange={setCreateOpen}
              onSuccess={onRefresh}
            />
          </>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 p-3">
          {t("Nenhum comunicado publicado")}
        </p>
      ) : (
        <ol className="relative border-l border-border/60 ml-3 space-y-4">
          {entries.map((entry) => {
            const Icon = getUpdateTypeIcon(entry.updateType ?? "progress");
            const persisted = isPersistedUpdateId(entry.id);

            return (
              <li key={entry.id} className="ml-5 relative group">
                <span className="absolute -left-[1.65rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 border border-accent/30">
                  <Icon size={12} className="text-accent" />
                </span>

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{entry.message}</p>
                    {entry.content && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">
                        {entry.content}
                      </p>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                      {t(updateTypeI18nKey(entry.updateType ?? "progress"))}
                    </p>
                    <time className="text-[11px] text-muted-foreground mt-1 block">
                      {new Date(entry.createdAt).toLocaleDateString(dateLoc, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>

                  {canManage && persisted && (
                    <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        aria-label={t("Editar")}
                        onClick={() => setEditUpdate(entry)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <CampaignUpdateDeleteButton update={entry} onSuccess={onRefresh} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <CampaignUpdateEditDialog
        update={editUpdate}
        open={Boolean(editUpdate)}
        onOpenChange={(open) => {
          if (!open) setEditUpdate(null);
        }}
        onSuccess={onRefresh}
      />
    </section>
  );
}
