import { FileText } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { InternalMessageAttachment } from "@/lib/internalMessages";

type Props = {
  attachment: InternalMessageAttachment;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InternalDocumentPreview({ attachment }: Props) {
  const { t } = useLanguage();
  const url = attachment.publicUrl;

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2 max-w-full hover:bg-background/60 transition-colors"
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
    >
      <div className="flex-shrink-0 h-9 w-9 rounded-md bg-accent/15 flex items-center justify-center">
        <FileText size={18} className="text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{attachment.fileName ?? t("Documento")}</p>
        {attachment.fileSize ? (
          <p className="text-[10px] text-muted-foreground">{formatSize(attachment.fileSize)}</p>
        ) : null}
      </div>
    </a>
  );
}
