import type { InternalMessageAttachment } from "@/lib/internalMessages";

type Props = {
  attachment: InternalMessageAttachment;
};

export function InternalImagePreview({ attachment }: Props) {
  const url = attachment.publicUrl;
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-lg overflow-hidden max-w-full"
    >
      <img
        src={url}
        alt={attachment.fileName ?? "Imagem"}
        className="w-full max-h-64 sm:max-h-80 object-cover rounded-lg"
        loading="lazy"
      />
    </a>
  );
}
