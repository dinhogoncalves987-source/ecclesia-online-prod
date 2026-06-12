import { useState } from "react";

import {

  MoreHorizontal,

  Pencil,

  Play,

  Pause,

  Square,

  Star,

  Loader2,

  Trash2,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import {

  DropdownMenu,

  DropdownMenuContent,

  DropdownMenuItem,

  DropdownMenuSeparator,

  DropdownMenuTrigger,

} from "@/components/ui/dropdown-menu";

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

import { useChurch } from "@/hooks/useChurchContext";

import { useLanguage } from "@/hooks/useLanguage";

import { useRole } from "@/hooks/useRole";

import { useToast } from "@/hooks/use-toast";

import {

  deleteCampaign,

  setCampaignFeatured,

  updateCampaignStatus,

} from "@/lib/campaignMutations";

import {

  CAMPAIGN_MANAGE_ROLES,

  isPersistedCampaignId,

  uiStatusToDb,

} from "@/lib/campaignFormUtils";

import type { Campaign } from "@/lib/campaignsDemo";



type Props = {

  campaign: Campaign;

  onEdit?: (campaign: Campaign) => void;

  onRefresh?: () => void | Promise<void>;

  onDeleted?: (campaignId: string) => void | Promise<void>;

  variant?: "card" | "detail";

};



export function CampaignActionsMenu({

  campaign,

  onEdit,

  onRefresh,

  onDeleted,

  variant = "card",

}: Props) {

  const { t } = useLanguage();

  const { toast } = useToast();

  const { church } = useChurch();

  const { hasRole } = useRole();

  const [busy, setBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);



  const canManage = hasRole([...CAMPAIGN_MANAGE_ROLES]);

  if (!canManage) return null;



  const dbStatus = campaign.dbStatus ?? uiStatusToDb(campaign.status);

  const persisted = isPersistedCampaignId(campaign.id);



  const runAction = async (

    label: string,

    action: () => Promise<{ ok: boolean; error?: string }>,

    onSuccess?: () => void | Promise<void>,

  ) => {

    if (!church?.id) return;

    if (!persisted) {

      toast({

        title: t("Campanha demonstrativa"),

        description: t("Ações operacionais exigem campanha salva no banco"),

        variant: "destructive",

      });

      return;

    }



    setBusy(true);

    const result = await action();

    setBusy(false);



    if (!result.ok) {

      toast({

        title: t("Erro"),

        description: result.error ?? t("Tente novamente"),

        variant: "destructive",

      });

      return;

    }



    toast({ title: label });

    await onSuccess?.();

    await onRefresh?.();

  };



  const handleDelete = async () => {

    if (!church?.id || !persisted) return;

    setBusy(true);

    const result = await deleteCampaign(church.id, campaign.id);

    setBusy(false);

    setDeleteOpen(false);



    if (!result.ok) {

      toast({

        title: t("Erro"),

        description: t("Não foi possível excluir a campanha"),

        variant: "destructive",

      });

      return;

    }



    toast({ title: t("Campanha excluída com sucesso") });

    await onDeleted?.(campaign.id);

    await onRefresh?.();

  };



  const btnClass =

    variant === "card" || variant === "detail"

      ? "absolute top-3 left-3 z-20 h-8 w-8 bg-black/40 text-white hover:bg-black/55 hover:text-white backdrop-blur-sm border-0"

      : undefined;



  return (

    <>

      <DropdownMenu>

        <DropdownMenuTrigger asChild>

          <Button

            type="button"

            variant="ghost"

            size="icon"

            className={btnClass}

            disabled={busy}

            onClick={(e) => e.stopPropagation()}

            aria-label={t("Ações da campanha")}

          >

            {busy ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}

          </Button>

        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>

          <DropdownMenuItem onClick={() => onEdit?.(campaign)}>

            <Pencil size={14} className="mr-2" />

            {t("Editar")}

          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {(dbStatus === "draft" || dbStatus === "paused") && (

            <DropdownMenuItem

              onClick={() =>

                runAction(t("Campanha publicada"), () =>

                  updateCampaignStatus(church!.id, campaign.id, "active"),

                )

              }

            >

              <Play size={14} className="mr-2" />

              {t("Publicar")}

            </DropdownMenuItem>

          )}

          {dbStatus === "active" && (

            <DropdownMenuItem

              onClick={() =>

                runAction(t("Campanha pausada"), () =>

                  updateCampaignStatus(church!.id, campaign.id, "paused"),

                )

              }

            >

              <Pause size={14} className="mr-2" />

              {t("Pausar")}

            </DropdownMenuItem>

          )}

          {dbStatus !== "closed" && dbStatus !== "archived" && (

            <DropdownMenuItem

              onClick={() =>

                runAction(t("Campanha encerrada"), () =>

                  updateCampaignStatus(church!.id, campaign.id, "closed"),

                )

              }

            >

              <Square size={14} className="mr-2" />

              {t("Encerrar")}

            </DropdownMenuItem>

          )}

          {!campaign.featured && dbStatus === "active" && (

            <DropdownMenuItem

              onClick={() =>

                runAction(t("Campanha em destaque"), () =>

                  setCampaignFeatured(church!.id, campaign.id),

                )

              }

            >

              <Star size={14} className="mr-2" />

              {t("Destacar")}

            </DropdownMenuItem>

          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem

            className="text-destructive focus:text-destructive"

            onClick={() => {

              if (!persisted) {

                toast({

                  title: t("Campanha demonstrativa"),

                  description: t("Ações operacionais exigem campanha salva no banco"),

                  variant: "destructive",

                });

                return;

              }

              setDeleteOpen(true);

            }}

          >

            <Trash2 size={14} className="mr-2" />

            {t("Excluir campanha")}

          </DropdownMenuItem>

        </DropdownMenuContent>

      </DropdownMenu>



      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>

        <AlertDialogContent onClick={(e) => e.stopPropagation()}>

          <AlertDialogHeader>

            <AlertDialogTitle>{t("Excluir campanha?")}</AlertDialogTitle>

            <AlertDialogDescription>

              {t(

                "Esta ação removerá a campanha e seus dados vinculados. Esta ação não poderá ser desfeita.",

              )}

            </AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>

            <AlertDialogCancel disabled={busy}>{t("Cancelar")}</AlertDialogCancel>

            <AlertDialogAction

              disabled={busy}

              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"

              onClick={(e) => {

                e.preventDefault();

                void handleDelete();

              }}

            >

              {t("Excluir")}

            </AlertDialogAction>

          </AlertDialogFooter>

        </AlertDialogContent>

      </AlertDialog>

    </>

  );

}

