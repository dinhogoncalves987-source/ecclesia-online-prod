import type { CampaignUpdate, CampaignUpdateType } from "@/lib/campaignsDemo";
import {
  Camera,
  FileText,
  Megaphone,
  Receipt,
  Trophy,
  TrendingUp,
  Video,
  type LucideIcon,
} from "lucide-react";

export type CampaignUpdateFormValues = {
  title: string;
  content: string;
  updateType: CampaignUpdateType;
};

export const CAMPAIGN_UPDATE_TYPES: { value: CampaignUpdateType; label: string }[] = [
  { value: "progress", label: "Progresso" },
  { value: "financial", label: "Financeiro" },
  { value: "photo", label: "Foto" },
  { value: "video", label: "Vídeo" },
  { value: "document", label: "Documento" },
  { value: "achievement", label: "Conquista" },
  { value: "announcement", label: "Comunicado" },
];

const LEGACY_TYPE_MAP: Record<string, CampaignUpdateType> = {
  progress: "progress",
  milestone: "achievement",
  media: "photo",
  accountability: "financial",
  purchase: "financial",
  field: "progress",
  receipt: "financial",
  financial: "financial",
  photo: "photo",
  video: "video",
  document: "document",
  achievement: "achievement",
  announcement: "announcement",
};

export function normalizeUpdateType(raw?: string | null): CampaignUpdateType {
  if (!raw) return "progress";
  return LEGACY_TYPE_MAP[raw] ?? "progress";
}

export function getUpdateTypeIcon(type: CampaignUpdateType): LucideIcon {
  switch (type) {
    case "financial":
      return Receipt;
    case "photo":
      return Camera;
    case "video":
      return Video;
    case "document":
      return FileText;
    case "achievement":
      return Trophy;
    case "announcement":
      return Megaphone;
    case "progress":
    default:
      return TrendingUp;
  }
}

export function updateTypeI18nKey(type: CampaignUpdateType): string {
  return `update_type_${type}`;
}

export function emptyUpdateForm(): CampaignUpdateFormValues {
  return {
    title: "",
    content: "",
    updateType: "progress",
  };
}

export function updateToFormValues(update: CampaignUpdate): CampaignUpdateFormValues {
  return {
    title: update.message,
    content: update.content ?? "",
    updateType: update.updateType ?? "progress",
  };
}

export type CampaignUpdateFormErrors = Partial<Record<keyof CampaignUpdateFormValues, string>>;

export function validateUpdateForm(values: CampaignUpdateFormValues): CampaignUpdateFormErrors {
  const errors: CampaignUpdateFormErrors = {};
  if (!values.title.trim()) errors.title = "required";
  return errors;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedUpdateId(id: string): boolean {
  return UUID_RE.test(id);
}
