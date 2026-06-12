import {
  Download,
  Mail,
  MessageSquare,
  Printer,
  Share2,
} from "lucide-react";
import { useDocExport } from "@/hooks/useDocExport";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import type { DocExportActionType, DocExportItem } from "@/lib/docExport";

// Ícone padrão por tipo de ação
const ICONS: Record<DocExportActionType, React.ElementType> = {
  pdf:      Printer,
  csv:      Download,
  share:    Share2,
  whatsapp: MessageSquare,
  email:    Mail,
  download: Download,
};

// Rótulo padrão por tipo (fallback quando item.label não é fornecido)
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
  /** "sm" (padrão): xs/compacto para toolbars | "md": botões normais para cards */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Linha de botões de ação de documento.
 * Renderiza cada item como um botão visível — sem dropdown.
 *
 * Use em toolbars (FinanceReports, TransactionList) ou em rodapés de cards.
 *
 * @example
 * <DocumentActions items={[
 *   { type: "pdf" },
 *   { type: "csv", csvData: myCSV, csvFilename: "relatorio.csv" },
 *   { type: "share", shareTitle: "Relatório", shareUrl: window.location.href },
 * ]} />
 */
export function DocumentActions({ items, size = "sm", className }: Props) {
  const { t } = useLanguage();
  const { execute, busy } = useDocExport();

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((item, idx) => {
        const Icon = ICONS[item.type];
        const label = item.label ?? t(DEFAULT_LABELS[item.type]);
        const isDisabled = item.disabled || busy;

        return (
          <button
            key={`${item.type}-${idx}`}
            type="button"
            disabled={isDisabled}
            onClick={() => void execute(item)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg bg-secondary font-medium",
              "hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              size === "sm"
                ? "px-3 py-1.5 text-xs"
                : "px-4 py-2 text-sm",
            )}
          >
            <Icon
              size={size === "sm" ? 13 : 15}
              strokeWidth={1.5}
              className="flex-shrink-0"
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
