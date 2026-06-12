import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import {
  CAMPAIGN_UPDATE_TYPES,
  type CampaignUpdateFormErrors,
  type CampaignUpdateFormValues,
} from "@/lib/campaignUpdateUtils";

type Props = {
  values: CampaignUpdateFormValues;
  onChange: (values: CampaignUpdateFormValues) => void;
  errors?: CampaignUpdateFormErrors;
  idPrefix?: string;
};

export function CampaignUpdateForm({
  values,
  onChange,
  errors = {},
  idPrefix = "update",
}: Props) {
  const { t } = useLanguage();

  const set = <K extends keyof CampaignUpdateFormValues>(key: K, value: CampaignUpdateFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="grid gap-4 py-1">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t("Título")} *</Label>
        <Input
          id={`${idPrefix}-title`}
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={t("Resumo da atualização")}
          className={errors.title ? "border-destructive" : undefined}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{t("Título obrigatório")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-content`}>{t("Conteúdo")}</Label>
        <Textarea
          id={`${idPrefix}-content`}
          value={values.content}
          onChange={(e) => set("content", e.target.value)}
          rows={4}
          placeholder={t("Detalhes da atualização")}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("Tipo")}</Label>
        <Select
          value={values.updateType}
          onValueChange={(v) => set("updateType", v as CampaignUpdateFormValues["updateType"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAMPAIGN_UPDATE_TYPES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {t(item.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
