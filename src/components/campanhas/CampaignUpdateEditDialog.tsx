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
import { CampaignUpdateForm } from "@/components/campanhas/CampaignUpdateForm";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { updateCampaignUpdate } from "@/lib/campaignUpdateMutations";
import {
  emptyUpdateForm,
  isPersistedUpdateId,
  updateToFormValues,
  validateUpdateForm,
} from "@/lib/campaignUpdateUtils";
import type { CampaignUpdate } from "@/lib/campaignsDemo";

type Props = {
  update: CampaignUpdate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void | Promise<void>;
};

export function CampaignUpdateEditDialog({ update, open, onOpenChange, onSuccess }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { church } = useChurch();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(emptyUpdateForm());
  const [errors, setErrors] = useState<ReturnType<typeof validateUpdateForm>>({});

  useEffect(() => {
    if (update && open) {
      setValues(updateToFormValues(update));
      setErrors({});
    }
  }, [update, open]);

  const handleSave = async () => {
    if (!update || !church?.id) return;

    if (!isPersistedUpdateId(update.id)) {
      toast({
        title: t("Atualização demonstrativa"),
        description: t("Somente atualizações do banco podem ser editadas"),
        variant: "destructive",
      });
      return;
    }

    const nextErrors = validateUpdateForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const result = await updateCampaignUpdate(church.id, update.id, values);
    setSaving(false);

    if (!result.ok) {
      toast({
        title: t("Erro ao salvar atualização"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("Atualização atualizada com sucesso") });
    onOpenChange(false);
    await onSuccess?.();
  };

  if (!update) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("Editar atualização")}</DialogTitle>
          <DialogDescription>{update.campaignTitle}</DialogDescription>
        </DialogHeader>

        <CampaignUpdateForm values={values} onChange={setValues} errors={errors} idPrefix="edit-update" />

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
