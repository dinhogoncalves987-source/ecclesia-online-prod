import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CampaignForm } from "@/components/campanhas/CampaignForm";
import { CampaignMediaUploadSection } from "@/components/campanhas/CampaignMediaUploadSection";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { updateCampaign } from "@/lib/campaignMutations";
import {
  campaignToFormValues,
  emptyCampaignForm,
  isPersistedCampaignId,
  validateCampaignForm,
} from "@/lib/campaignFormUtils";
import type { Campaign } from "@/lib/campaignsDemo";

type Props = {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void | Promise<void>;
};

export function CampaignEditDialog({ campaign, open, onOpenChange, onSuccess }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { church } = useChurch();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(emptyCampaignForm());
  const [errors, setErrors] = useState<ReturnType<typeof validateCampaignForm>>({});

  useEffect(() => {
    if (campaign && open) {
      setValues(campaignToFormValues(campaign));
      setErrors({});
    }
  }, [campaign, open]);

  const handleSave = async () => {
    if (!campaign || !church?.id) return;

    if (!isPersistedCampaignId(campaign.id)) {
      toast({
        title: t("Campanha demonstrativa"),
        description: t("Crie uma nova campanha para salvar no banco"),
        variant: "destructive",
      });
      return;
    }

    const nextErrors = validateCampaignForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const result = await updateCampaign(church.id, campaign.id, values);
    setSaving(false);

    if (!result.ok) {
      toast({
        title: t("Erro ao salvar campanha"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("Campanha atualizada com sucesso") });
    onOpenChange(false);
    await onSuccess?.();
  };

  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("Editar campanha")}</DialogTitle>
          <DialogDescription>{campaign.title}</DialogDescription>
        </DialogHeader>

        <CampaignForm values={values} onChange={setValues} errors={errors} idPrefix="edit" showStatus />

        {church?.id && isPersistedCampaignId(campaign.id) && (
          <CampaignMediaUploadSection
            organizationId={church.id}
            campaignId={campaign.id}
            userId={user?.id}
            onUploaded={onSuccess}
            disabled={saving}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("Cancelar")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
