import { motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { CampaignCover } from "@/components/campanhas/CampaignCover";
import { CampaignActions } from "@/components/campanhas/CampaignActions";
import { CampaignActionsMenu } from "@/components/campanhas/CampaignActionsMenu";
import { CampaignCoverControls } from "@/components/campanhas/CampaignCoverControls";
import { campaignStatusBadgeClass } from "@/components/campanhas/CampaignForm";
import { CampaignGallery } from "@/components/campanhas/CampaignGallery";
import { CampaignVideos } from "@/components/campanhas/CampaignVideos";
import { CampaignTimeline } from "@/components/campanhas/CampaignTimeline";
import { CampaignDocuments } from "@/components/campanhas/CampaignDocuments";
import { CampaignAccountability } from "@/components/campanhas/CampaignAccountability";
import { CampaignFinancialProgress } from "@/components/campanhas/CampaignFinancialProgress";
import { useLanguage } from "@/hooks/useLanguage";
import { useCampaignMediaForCampaign } from "@/hooks/useCampaignMedia";
import { useChurch } from "@/hooks/useChurchContext";
import type { Campaign, CampaignUpdate } from "@/lib/campaignsDemo";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import { useRole } from "@/hooks/useRole";
import { CAMPAIGN_MANAGE_ROLES } from "@/lib/campaignFormUtils";
import { normalizeCoverPriority } from "@/components/campanhas/campaignCoverTheme";
import { InternalChatShell } from "@/components/messages/InternalChatShell";
import { isPersistedCampaignId } from "@/lib/campaignFormUtils";
import { useState } from "react";

type Props = {
  campaign: Campaign;
  updates?: CampaignUpdate[];
  media?: CampaignMediaItem[];
  campaigns?: Campaign[];
  fromDatabase?: boolean;
  canManage?: boolean;
  onClose?: () => void;
  onEdit?: (campaign: Campaign) => void;
  onRefresh?: () => void | Promise<void>;
  onDeleted?: (campaignId: string) => void | Promise<void>;
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Destaque",
  urgent: "Urgente",
};

export function CampaignDetail({
  campaign,
  updates = [],
  media: mediaProp,
  campaigns = [],
  fromDatabase = false,
  canManage: canManageProp,
  onClose,
  onEdit,
  onRefresh,
  onDeleted,
}: Props) {
  const { t, lang } = useLanguage();
  const { church } = useChurch();
  const { hasRole } = useRole();
  const canManage = canManageProp ?? hasRole([...CAMPAIGN_MANAGE_ROLES]);
  const mediaPreloaded = mediaProp !== undefined;
  const { media: fetchedMedia, loading: mediaLoading } = useCampaignMediaForCampaign(
    mediaPreloaded ? null : campaign.id,
    church?.id,
  );
  const media = mediaPreloaded ? mediaProp : fetchedMedia;

  const [chatOpen, setChatOpen] = useState(false);

  const canUseChat = fromDatabase && isPersistedCampaignId(campaign.id) && Boolean(church?.id);
  const repliesOpen = Boolean(campaign.allowReplies);

  const priority = normalizeCoverPriority(campaign.priority, campaign.featured);
  const priorityLabel = PRIORITY_LABEL[priority] ?? "Normal";
  const dateLoc = lang === "en" ? "en-US" : lang === "es" ? "es-MX" : "pt-BR";

  const content = (
    <>
      {/* Capa full-width — foto limpa, texto abaixo */}
      <div className="relative w-full">
        <CampaignCover
          campaign={campaign}
          media={media}
          photoOnly
          className="w-full h-44 sm:h-52 md:h-60"
          overlay={
            <>
              <CampaignActionsMenu
                campaign={campaign}
                onEdit={onEdit}
                onRefresh={onRefresh}
                onDeleted={onDeleted}
                variant="detail"
              />
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/40 text-white hover:bg-black/55 backdrop-blur-sm transition-colors"
                  aria-label={t("Fechar")}
                >
                  <X size={18} />
                </button>
              ) : null}
              <CampaignCoverControls
                campaign={campaign}
                media={media}
                onRefresh={onRefresh}
              />
            </>
          }
        />
      </div>

      <div className="px-5 sm:px-6 pt-5 pb-2 border-b border-border/40">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">
            {t(campaign.type)}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${campaignStatusBadgeClass(campaign.status)}`}
          >
            {t(campaign.status)}
          </span>
          {(priority === "high" || priority === "urgent") && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                priority === "urgent"
                  ? "bg-red-500/15 text-red-600 border-red-300/50"
                  : "bg-accent/15 text-accent border-accent/30"
              }`}
            >
              {t(priorityLabel)}
            </span>
          )}
        </div>
        <h2 className="text-xl sm:text-2xl font-serif font-bold leading-tight text-foreground">
          {campaign.title}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{campaign.organization}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("Prazo")}:{" "}
          {new Date(campaign.deadline).toLocaleDateString(dateLoc, {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="px-5 sm:px-6 py-6 space-y-8 pb-28 sm:pb-8">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{campaign.description}</p>

        <CampaignFinancialProgress campaign={campaign} />
        <CampaignGallery
          campaign={campaign}
          media={media}
          loading={mediaLoading && !mediaPreloaded}
          onEdit={canManage && onEdit ? () => onEdit(campaign) : undefined}
          onRefresh={onRefresh}
        />
        <CampaignVideos
          campaign={campaign}
          media={media}
          onEdit={canManage && onEdit ? () => onEdit(campaign) : undefined}
        />
        <CampaignTimeline
          campaignId={campaign.id}
          updates={updates}
          campaigns={campaigns.length > 0 ? campaigns : [campaign]}
          fromDatabase={fromDatabase}
          canManage={canManage}
          onRefresh={onRefresh}
        />
        <CampaignDocuments
          campaign={campaign}
          media={media}
          onEdit={canManage && onEdit ? () => onEdit(campaign) : undefined}
        />
        <CampaignAccountability campaign={campaign} />

        {canUseChat ? (
          <section className="rounded-xl border border-border/50 bg-secondary/20 p-4 sm:p-5 space-y-3">
            <h3 className="font-serif font-semibold text-base flex items-center gap-2">
              <MessageCircle size={18} className="text-accent" />
              {t("Conversa")}
            </h3>
            {!repliesOpen && !canManage ? (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t("Chat fechado")}</p>
                <p>{t("Esta campanha é apenas informativa.")}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <MessageCircle size={16} />
                {t("Falar com a equipe")}
              </button>
            )}
          </section>
        ) : null}

        <CampaignActions campaignTitle={campaign.title} campaignId={campaign.id} />
      </div>
    </>
  );

  if (!onClose) {
    return (
      <>
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">{content}</div>
        {chatOpen && church?.id ? (
          <div className="fixed inset-0 z-[60] flex flex-col bg-background">
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card">
              <span className="text-sm font-semibold truncate">{campaign.title}</span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="p-2 rounded-full hover:bg-secondary"
                aria-label={t("Fechar")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <InternalChatShell
                organizationId={church.id}
                source="campaign"
                campaignId={campaign.id}
                campaignTitle={campaign.title}
                allowReplies={repliesOpen}
                isStaff={canManage}
                className="h-full border-0 rounded-none"
              />
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <motion.div
        key={`backdrop-${campaign.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
        <motion.div
          key={`panel-${campaign.id}`}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="w-full sm:max-w-2xl lg:max-w-3xl bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </motion.div>
      </div>

      {chatOpen && church?.id ? (
        <div className="fixed inset-0 z-[60] flex flex-col sm:p-4 sm:items-center sm:justify-center pointer-events-none">
          <div
            className="absolute inset-0 bg-black/60 pointer-events-auto"
            onClick={() => setChatOpen(false)}
          />
          <div className="relative flex flex-col w-full h-full sm:h-[min(85vh,720px)] sm:max-w-4xl bg-background sm:rounded-2xl overflow-hidden shadow-2xl pointer-events-auto">
            <InternalChatShell
              organizationId={church.id}
              source="campaign"
              campaignId={campaign.id}
              campaignTitle={campaign.title}
              allowReplies={repliesOpen}
              isStaff={canManage}
              onClose={() => setChatOpen(false)}
              className="h-full border-0 sm:rounded-2xl"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
