import { Music } from "lucide-react";
import type { InternalMessageAttachment } from "@/lib/internalMessages";

type Props = {
  attachment: InternalMessageAttachment;
};

export function InternalAudioPreview({ attachment }: Props) {
  if (!attachment.publicUrl) {
    return (
      <div className="flex items-center gap-2 mt-1.5 rounded-lg bg-black/10 px-3 py-2 max-w-[240px]">
        <Music size={14} className="opacity-60 flex-shrink-0" />
        <span className="text-xs opacity-70 truncate">{attachment.fileName ?? "Áudio"}</span>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <audio
        controls
        preload="metadata"
        className="w-full max-w-[260px] h-10 rounded-md"
        src={attachment.publicUrl}
      >
        <a href={attachment.publicUrl} download={attachment.fileName ?? "audio"}>
          Baixar áudio
        </a>
      </audio>
      {attachment.fileName && (
        <p className="text-[10px] mt-0.5 opacity-60 truncate max-w-[260px]">
          {attachment.fileName}
        </p>
      )}
    </div>
  );
}
