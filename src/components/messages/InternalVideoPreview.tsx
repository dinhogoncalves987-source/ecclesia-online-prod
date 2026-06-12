import { useLanguage } from "@/hooks/useLanguage";
import type { InternalMessageAttachment } from "@/lib/internalMessages";
import { Film } from "lucide-react";

type Props = {
  attachment: InternalMessageAttachment;
};

/** V2 — preview de vídeo; V1 exibe card placeholder. */
export function InternalVideoPreview({ attachment }: Props) {
  const { t } = useLanguage();
  const url = attachment.publicUrl;

  if (url) {
    return (
      <div className="mt-2 rounded-lg overflow-hidden max-w-full">
        <video src={url} controls className="w-full max-h-64 rounded-lg bg-black/20" preload="metadata" />
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border/50 px-3 py-2 text-xs text-muted-foreground">
      <Film size={16} />
      <span>{attachment.fileName ?? t("Vídeo")}</span>
    </div>
  );
}
