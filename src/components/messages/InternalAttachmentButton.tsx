import { useEffect, useRef, useState } from "react";
import { FileText, Image, Music, Paperclip, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

const ACCEPT = {
  image:    "image/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt",
  video:    "video/*",
  audio:    "audio/*",
} as const;

type AttachType = keyof typeof ACCEPT;

const MENU_ITEMS: { type: AttachType; Icon: React.ElementType; label: string }[] = [
  { type: "image",    Icon: Image,    label: "Imagem / Foto" },
  { type: "document", Icon: FileText, label: "Documento"     },
  { type: "video",    Icon: Video,    label: "Vídeo"         },
  { type: "audio",    Icon: Music,    label: "Áudio"         },
];

type Props = {
  disabled?: boolean;
  onFileSelect: (file: File) => void;
};

export function InternalAttachmentButton({ disabled = false, onFileSelect }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fechar menu ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Fechar com Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  const openPicker = (type: AttachType) => {
    setOpen(false);
    if (!inputRef.current) return;
    inputRef.current.accept = ACCEPT[type];
    inputRef.current.value  = "";
    inputRef.current.click();
  };

  return (
    <div ref={wrapperRef} className="relative flex-shrink-0">
      {/* Input oculto — accept definido dinamicamente antes de click() */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
          e.target.value = "";
        }}
      />

      {/* Botão de clipe */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        disabled={disabled}
        aria-label={t("Anexar")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Paperclip size={18} />
      </Button>

      {/* Menu absoluto — abre acima do botão, sem portal */}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full left-0 mb-1 z-[200]",
            "min-w-[160px] rounded-lg border border-border bg-popover shadow-md py-1",
            "animate-in fade-in-0 zoom-in-95 duration-100",
          )}
        >
          {MENU_ITEMS.map(({ type, Icon, label }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-sm",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
              )}
              onClick={() => openPicker(type)}
            >
              <Icon size={15} className="flex-shrink-0 text-muted-foreground" />
              {t(label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
