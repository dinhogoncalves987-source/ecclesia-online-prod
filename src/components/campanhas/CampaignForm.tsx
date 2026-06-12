import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker, parseYmd } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import {
  CAMPAIGN_CATEGORIES,
  type CampaignDbStatus,
  type CampaignFormValues,
  type CampaignFormErrors,
  type CampaignPriority,
} from "@/lib/campaignFormUtils";

type Props = {
  values: CampaignFormValues;
  onChange: (values: CampaignFormValues) => void;
  errors?: CampaignFormErrors;
  showStatus?: boolean;
  idPrefix?: string;
};

const PRIORITIES: CampaignPriority[] = ["low", "normal", "high", "urgent"];
const STATUSES: CampaignDbStatus[] = ["draft", "active", "paused", "closed"];

const PRIORITY_LABEL: Record<CampaignPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Destaque",
  urgent: "Urgente",
};

const STATUS_LABEL: Record<CampaignDbStatus, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  closed: "Encerrada",
  archived: "Encerrada",
};

export function CampaignForm({
  values,
  onChange,
  errors = {},
  showStatus = true,
  idPrefix = "campaign",
}: Props) {
  const { t } = useLanguage();

  const set = <K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const startDateValue = parseYmd(values.startDate);
  const endDateValue = parseYmd(values.endDate);

  return (
    <div className="grid gap-4 py-1">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t("Título")} *</Label>
        <Input
          id={`${idPrefix}-title`}
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={t("Nome da campanha")}
          className={errors.title ? "border-destructive" : undefined}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{t("Título obrigatório")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>{t("Descrição")}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={4}
          placeholder={t("Descreva o objetivo da campanha")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("Categoria")}</Label>
          <Select value={values.category} onValueChange={(v) => set("category", v as CampaignFormValues["category"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {t(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-goal`}>{t("Meta (valor)")} *</Label>
          <Input
            id={`${idPrefix}-goal`}
            type="text"
            inputMode="decimal"
            value={values.goalAmount}
            onChange={(e) => set("goalAmount", e.target.value)}
            placeholder="0"
            className={errors.goalAmount ? "border-destructive" : undefined}
          />
          {errors.goalAmount && (
            <p className="text-xs text-destructive">{t("Meta inválida")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-start`}>{t("Data inicial")}</Label>
          <DatePicker
            id={`${idPrefix}-start`}
            value={values.startDate}
            onChange={(v) => set("startDate", v)}
            maxDate={endDateValue}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-end`}>{t("Data final")}</Label>
          <DatePicker
            id={`${idPrefix}-end`}
            value={values.endDate}
            onChange={(v) => set("endDate", v)}
            minDate={startDateValue}
            error={Boolean(errors.endDate)}
          />
          {errors.endDate && (
            <p className="text-xs text-destructive">{t("Data final deve ser após a inicial")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("Prioridade")}</Label>
          <Select
            value={values.priority}
            onValueChange={(v) => set("priority", v as CampaignPriority)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(PRIORITY_LABEL[p])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showStatus && (
          <div className="space-y-2">
            <Label>{t("Status")}</Label>
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as CampaignDbStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(STATUS_LABEL[s])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-secondary/20 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("Campanha em destaque")}</p>
            <p className="text-xs text-muted-foreground">{t("Uma campanha em destaque por organização")}</p>
          </div>
          <Switch
            checked={values.isFeatured}
            onCheckedChange={(checked) => set("isFeatured", checked)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("Chat da campanha")}</p>
            <p className="text-xs font-medium text-foreground/90">
              {values.allowReplies ? t("Chat aberto") : t("Chat fechado")}
            </p>
            <p className="text-xs text-muted-foreground">
              {values.allowReplies
                ? t("Membros podem conversar com a equipe responsável pela campanha.")
                : t("A campanha será apenas informativa, sem respostas dos membros.")}
            </p>
          </div>
          <Switch
            checked={values.allowReplies}
            onCheckedChange={(checked) => set("allowReplies", checked)}
            aria-label={values.allowReplies ? t("Chat aberto") : t("Chat fechado")}
          />
        </div>
      </div>
    </div>
  );
}

export function campaignStatusBadgeClass(status: string): string {
  switch (status) {
    case "Ativa":
      return "bg-green-500/15 text-green-600";
    case "Encerrada":
      return "bg-muted/90 text-muted-foreground";
    case "Pausada":
      return "bg-amber-500/15 text-amber-700";
    case "Rascunho":
    case "Planejada":
      return "bg-blue-500/15 text-blue-600";
    default:
      return "bg-amber-500/15 text-amber-600";
  }
}
