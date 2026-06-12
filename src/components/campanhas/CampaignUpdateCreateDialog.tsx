import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CampaignUpdateForm } from "@/components/campanhas/CampaignUpdateForm";
import { useAuth } from "@/hooks/useAuth";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { createCampaignUpdate } from "@/lib/campaignUpdateMutations";
import { isPersistedCampaignId } from "@/lib/campaignFormUtils";
import { emptyUpdateForm, validateUpdateForm } from "@/lib/campaignUpdateUtils";
import type { Campaign } from "@/lib/campaignsDemo";

type Props = {
  campaigns: Campaign[];
  defaultCampaignId?: string;
  hideCampaignSelect?: boolean;
  onSuccess?: () => void | Promise<void>;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CampaignUpdateCreateDialog({
  campaigns,
  defaultCampaignId,
  hideCampaignSelect = false,
  onSuccess,
  triggerClassName,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const { church } = useChurch();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const persistedCampaigns = useMemo(
    () => campaigns.filter((c) => isPersistedCampaignId(c.id)),
    [campaigns],
  );
  const [campaignId, setCampaignId] = useState(defaultCampaignId ?? persistedCampaigns[0]?.id ?? "");
  const [values, setValues] = useState(emptyUpdateForm());
  const [errors, setErrors] = useState<ReturnType<typeof validateUpdateForm>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCampaignId(defaultCampaignId ?? persistedCampaigns[0]?.id ?? "");
      setValues(emptyUpdateForm());
      setErrors({});
    }
  }, [open, defaultCampaignId, persistedCampaigns]);

  const reset = () => {
    setValues(emptyUpdateForm());
    setErrors({});
    setCampaignId(defaultCampaignId ?? persistedCampaigns[0]?.id ?? "");
  };

  const handleSave = async () => {
    const nextErrors = validateUpdateForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!church?.id || !campaignId) {
      toast({ title: t("Erro"), description: t("Selecione uma campanha"), variant: "destructive" });
      return;
    }

    if (!isPersistedCampaignId(campaignId)) {
      toast({
        title: t("Campanha demonstrativa"),
        description: t("Crie uma campanha no banco para publicar atualizações"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const result = await createCampaignUpdate(church.id, campaignId, values, user?.id);
    setSaving(false);

    if (!result.ok) {
      toast({
        title: t("Erro ao salvar atualização"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("Atualização publicada com sucesso") });
    setOpen(false);
    reset();
    await onSuccess?.();
  };

  const showTrigger = controlledOpen === undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClassName}>
            <Plus size={16} />
            {t("Nova atualização")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("Nova atualização")}</DialogTitle>
          <DialogDescription>{t("Publique um marco ou comunicado da campanha")}</DialogDescription>
        </DialogHeader>

        {!hideCampaignSelect && (
          <div className="space-y-2">
            <Label>{t("Campanha")}</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder={t("Selecione uma campanha")} />
              </SelectTrigger>
              <SelectContent>
                {persistedCampaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {persistedCampaigns.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("Nenhuma campanha salva no banco")}</p>
            )}
          </div>
        )}

        <CampaignUpdateForm values={values} onChange={setValues} errors={errors} idPrefix="create-update" />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            {t("Cancelar")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !campaignId}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("Publicar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
