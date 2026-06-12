import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Mail,
  MessageSquare,
  Printer,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocExport } from "@/hooks/useDocExport";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import type { DocExportActionType, DocExportItem } from "@/lib/docExport";

const ICONS: Record<DocExportActionType, React.ElementType> = {
  pdf:      Printer,
  csv:      Download,
  share:    Share2,
  whatsapp: MessageSquare,
  email:    Mail,
  download: Download,
};

const DEFAULT_LABELS: Record<DocExportActionType, string> = {
  pdf:      "PDF",
  csv:      "CSV",
  share:    "Compartilhar",
  whatsapp: "WhatsApp",
  email:    "E-mail",
  download: "Baixar",
};

type Props = {
  items: DocExportItem[];
  /** Botão trigger customizado. Padrão: "Exportar ▾". */
  trigger?: React.ReactNode;
  /** Alinhar menu à esquerda ou direita do trigger. Padrão: "start". */
  align?: "start" | "end";
  /** Abrir acima (top) ou abaixo (bottom). Padrão: "bottom". */
  side?: "top" | "bottom";
  disabled?: boolean;
  className?: string;
};

/**
 * Botão compacto com menu dropdown de ações de exportação.
 * Implementação manual (sem portal Radix) — funciona dentro de modais.
 *
 * Use em cabeçalhos de cards/seções onde o espaço é limitado.
 *
 * @example
 * <DocExportMenu items={[
 *   { type: "pdf", label: "Gerar PDF" },
 *   { type: "share", shareTitle: "Campanha", shareUrl: campaignUrl },
 *   { type: "whatsapp", whatsappMessage: `Veja: ${campaignUrl}` },
 * ]} />
 */
export function DocExportMenu({
  items,
  trigger,
  align = "start",
  side = "bottom",
  disabled = false,
  className,
}: Props) {
  const { t } = useLanguage();
  const { execute, busy } = useDocExport();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
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

  if (items.length === 0) return null;

  const handleItem = async (item: DocExportItem) => {
    setOpen(false);
    await execute(item);
  };

  return (
    <div ref={wrapperRef} className={cn("relative inline-block", className)}>
      {/* Trigger */}
      {trigger ? (
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={(e) => e.key === "Enter" && !disabled && setOpen((v) => !v)}
        >
          {trigger}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="gap-1.5 text-xs h-8"
        >
          <Share2 size={13} />
          {t("Exportar")}
          <ChevronDown
            size={12}
            className={cn("transition-transform", open ? "rotate-180" : "")}
          />
        </Button>
      )}

      {/* Menu absoluto — sem portal, sem problemas de z-index em modais */}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-[200] min-w-[168px] rounded-lg border border-border",
            "bg-popover shadow-md py-1",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            side === "top" ? "bottom-full mb-1" : "top-full mt-1",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, idx) => {
            const Icon = ICONS[item.type];
            const label = item.label ?? t(DEFAULT_LABELS[item.type]);

            return (
              <button
                key={`${item.type}-${idx}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => void handleItem(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm",
                  "hover:bg-accent hover:text-accent-foreground transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <Icon size={15} className="flex-shrink-0 text-muted-foreground" />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
