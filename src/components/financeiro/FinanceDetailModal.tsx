import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg";
};

/**
 * Slide-up modal para detalhes de itens financeiros.
 * Mobile: bottom-sheet. Desktop: diálogo centrado.
 * Fecha com Escape ou clique no backdrop.
 */
export function FinanceDetailModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "md",
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const widthClass = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[maxWidth];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative bg-card w-full rounded-t-2xl sm:rounded-2xl shadow-2xl",
          "flex flex-col max-h-[88vh] sm:max-h-[80vh]",
          widthClass,
        )}
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-semibold leading-snug">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 ml-3 flex-shrink-0 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
