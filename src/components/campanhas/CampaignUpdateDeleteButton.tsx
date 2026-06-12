import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { deleteCampaignUpdate } from "@/lib/campaignUpdateMutations";
import { isPersistedUpdateId } from "@/lib/campaignUpdateUtils";
import type { CampaignUpdate } from "@/lib/campaignsDemo";

type Props = {
  update: CampaignUpdate;
  onSuccess?: () => void | Promise<void>;
};

export function CampaignUpdateDeleteButton({ update, onSuccess }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { church } = useChurch();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!church?.id) return;

    if (!isPersistedUpdateId(update.id)) {
      toast({
        title: t("Atualização demonstrativa"),
        description: t("Somente atualizações do banco podem ser excluídas"),
        variant: "destructive",
      });
      return;
    }

    setDeleting(true);
    const result = await deleteCampaignUpdate(church.id, update.id);
    setDeleting(false);

    if (!result.ok) {
      toast({
        title: t("Erro"),
        description: result.error ?? t("Tente novamente"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("Atualização excluída") });
    await onSuccess?.();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label={t("Excluir")}
          disabled={deleting}
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Excluir atualização?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Esta ação não pode ser desfeita.")}
            <span className="block mt-2 font-medium text-foreground">{update.message}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("Excluir")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
