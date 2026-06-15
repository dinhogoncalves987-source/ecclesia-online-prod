import { useState } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Campaign } from "@/lib/campaignsDemo";
import type { CampaignMediaItem } from "@/lib/campaignMedia";
import { CAMPAIGN_MANAGE_ROLES, isPersistedCampaignId } from "@/lib/campaignFormUtils";
import { updateCampaignCoverImage } from "@/lib/campaignMutations";
import { CampaignImagePickerModal } from "@/components/campanhas/CampaignImagePickerModal";

type Props = {
  campaign: Campaign;
  media?: CampaignMediaItem[];
  onRefresh?: () => void | Promise<void>;
  /** Extra Tailwind classes applied to the button cluster container */
  className?: string;
};

/**
 * Overlay controls that appear on campaign cover images for managers.
 *
 * • Pencil  → opens image picker (selects from local manifest library)
 * • Trash   → shown only when a manual cover_image_url is set; clears it
 *             to restore the automatic manifest pick.
 *
 * Both actions update `campaigns.cover_image_url` in Supabase and call
 * `onRefresh()` so the parent re-fetches and re-renders.
 */
export function CampaignCoverControls({ campaign, onRefresh, className }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { church } = useChurch();
  const { hasRole } = useRole();

  const canManage = hasRole([...CAMPAIGN_MANAGE_ROLES]);
  const persisted = isPersistedCampaignId(campaign.id);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  const hasManualUrl = Boolean(campaign.coverImageUrl?.trim());

  const notifyDemo = () =>
    toast({
      title: t("Campanha demonstrativa"),
      description: t("Ações operacionais exigem campanha salva no banco"),
      variant: "destructive",
    });

  const handleSelect = async (url: string) => {
    if (!persisted) { notifyDemo(); return; }
    if (!church?.id) return;
    setBusy(true);
    const result = await updateCampaignCoverImage(church.id, campaign.id, url);
    setBusy(false);
    if (!result.ok) {
      toast({ title: t("Erro"), description: result.error ?? t("Tente novamente"), variant: "destructive" });
      return;
    }
    toast({ title: t("Imagem da campanha atualizada") });
    await onRefresh?.();
  };

  const handleClear = async () => {
    if (!persisted) { notifyDemo(); return; }
    if (!church?.id) return;
    setBusy(true);
    const result = await updateCampaignCoverImage(church.id, campaign.id, null);
    setBusy(false);
    if (!result.ok) {
      toast({ title: t("Erro"), description: result.error ?? t("Tente novamente"), variant: "destructive" });
      return;
    }
    toast({ title: t("Imagem automática restaurada") });
    await onRefresh?.();
  };

  return (
    <>
      {/* ── Button cluster ─────────────────────────────────────────── */}
      <div
        className={cn("absolute bottom-3 right-3 z-20 flex gap-1.5", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pencil — always shown */}
        <button
          type="button"
          aria-label={t("Trocar imagem da campanha")}
          disabled={busy}
          onClick={() => {
            if (!persisted) { notifyDemo(); return; }
            setPickerOpen(true);
          }}
          className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors disabled:opacity-40"
          title={t("Trocar imagem")}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
        </button>

        {/* Trash — only shown when a manual override exists */}
        {hasManualUrl && (
          <button
            type="button"
            aria-label={t("Remover imagem manual")}
            disabled={busy}
            onClick={() => {
              if (!persisted) { notifyDemo(); return; }
              setConfirmClearOpen(true);
            }}
            className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-600/80 backdrop-blur-sm transition-colors disabled:opacity-40"
            title={t("Restaurar imagem automática")}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* ── Image picker modal ─────────────────────────────────────── */}
      <CampaignImagePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        campaign={campaign}
        currentUrl={campaign.coverImageUrl ?? null}
        onSelect={handleSelect}
        onClear={() => {
          setPickerOpen(false);
          void handleClear();
        }}
      />

      {/* ── Confirm restore auto ───────────────────────────────────── */}
      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remover imagem manual?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A imagem da campanha voltará a ser selecionada automaticamente pela biblioteca.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                setConfirmClearOpen(false);
                void handleClear();
              }}
            >
              {t("Restaurar automática")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
