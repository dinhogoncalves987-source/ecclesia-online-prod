import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CampaignForm } from "@/components/campanhas/CampaignForm";
import { CampaignMediaUploadSection } from "@/components/campanhas/CampaignMediaUploadSection";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { createCampaign } from "@/lib/campaignMutations";
import { uploadPendingCampaignMedia, type PendingCampaignMedia } from "@/lib/campaignMediaMutations";
import { emptyCampaignForm, validateCampaignForm } from "@/lib/campaignFormUtils";

type Props = {
  onSuccess?: () => void | Promise<void>;
  triggerClassName?: string;
};

export function CampaignCreateDialog({ onSuccess, triggerClassName }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const { church } = useChurch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(emptyCampaignForm("draft"));
  const [errors, setErrors] = useState<ReturnType<typeof validateCampaignForm>>({});
  const [pendingMedia, setPendingMedia] = useState<PendingCampaignMedia[]>([]);

  const reset = () => {
    setValues(emptyCampaignForm("draft"));
    setErrors({});
    setPendingMedia([]);
  };

  const handleSave = async () => {
    const nextErrors = validateCampaignForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!church?.id) {
      toast({ title: t("Erro"), description: t("Organização não selecionada"), variant: "destructive" });
      return;
    }

    setSaving(true);
    const result = await createCampaign(church.id, values, user?.id);
    setSaving(false);

    if (!result.ok || !result.id) {
      toast({
        title: t("Erro ao salvar campanha"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    if (pendingMedia.length > 0) {
      setSaving(true);
      const mediaResult = await uploadPendingCampaignMedia(church.id, result.id, pendingMedia, user?.id);
      setSaving(false);

      if (!mediaResult.ok) {
        toast({
          title: t("Campanha criada com sucesso"),
          description: t("Alguns arquivos não foram enviados"),
          variant: "destructive",
        });
      } else {
        toast({ title: t("Campanha criada com sucesso") });
      }
    } else {
      toast({ title: t("Campanha criada com sucesso") });
    }    setOpen(false);
    reset();
    await onSuccess?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className={triggerClassName}>
          <Plus size={16} />
          {t("Nova Campanha")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("Nova Campanha")}</DialogTitle>
          <DialogDescription>{t("Crie um projeto ou campanha para a igreja")}</DialogDescription>
        </DialogHeader>

        <CampaignForm values={values} onChange={setValues} errors={errors} idPrefix="create" showStatus />

        {church?.id && (
          <CampaignMediaUploadSection
            organizationId={church.id}
            pending={pendingMedia}
            onPendingChange={setPendingMedia}
            disabled={saving}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
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
