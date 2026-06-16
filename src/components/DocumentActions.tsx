/**
 * DocumentActions — barra de ações padrão para documentos institucionais.
 *
 * Ações suportadas: pdf | share | whatsapp | email | print
 *
 * Uso:
 *   <DocumentActions
 *     printElementId="wallet-card"
 *     shareTitle="Carteira de Membro"
 *     whatsappText="Minha Carteira de Membro"
 *   />
 */

import { Download, Mail, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// WhatsApp SVG icon (inline, nenhuma dependência extra)
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export type DocumentAction = "pdf" | "share" | "whatsapp" | "email" | "print";

export type DocumentActionsProps = {
  /** Quais ações exibir. Padrão: todas exceto share se Web Share API não disponível. */
  actions?: DocumentAction[];
  className?: string;
  /** ID do elemento HTML a isolar durante a impressão/PDF */
  printElementId?: string;
  /** Título para compartilhamento */
  shareTitle?: string;
  /** Texto para compartilhamento */
  shareText?: string;
  /** URL para compartilhamento */
  shareUrl?: string;
  /** Texto pré-preenchido para WhatsApp */
  whatsappText?: string;
  /** Número WhatsApp (com DDD, sem espaços/traços) */
  whatsappPhone?: string;
  /** Assunto do email */
  emailSubject?: string;
  /** Corpo do email */
  emailBody?: string;
  /** Callback personalizado para geração de PDF */
  onGeneratePdf?: () => void | Promise<void>;
  /** Tamanho dos botões */
  size?: "sm" | "default";
  /** Estilo dos botões */
  variant?: "default" | "outline" | "ghost";
};

const DEFAULT_ACTIONS: DocumentAction[] = ["pdf", "share", "whatsapp", "email", "print"];

function isolatePrint(elementId: string) {
  const prev = document.getElementById("__doc-print-css");
  if (prev) prev.remove();
  const style = document.createElement("style");
  style.id = "__doc-print-css";
  style.textContent = `
    @media print {
      body > * { visibility: hidden !important; }
      #${elementId}, #${elementId} * { visibility: visible !important; }
      #${elementId} {
        position: fixed !important;
        top: 0 !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 99999 !important;
      }
    }
  `;
  document.head.appendChild(style);
  window.print();
  setTimeout(() => document.getElementById("__doc-print-css")?.remove(), 1500);
}

export function DocumentActions({
  actions = DEFAULT_ACTIONS,
  className,
  printElementId,
  shareTitle = "Documento Ecclesia",
  shareText = "",
  shareUrl,
  whatsappText,
  whatsappPhone,
  emailSubject = "Documento Ecclesia",
  emailBody = "",
  onGeneratePdf,
  size = "sm",
  variant = "outline",
}: DocumentActionsProps) {
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  const handlePrint = () => {
    if (printElementId) {
      isolatePrint(printElementId);
    } else {
      window.print();
    }
  };

  const handlePdf = async () => {
    if (onGeneratePdf) {
      await onGeneratePdf();
      return;
    }
    // Fallback: usa impressão como PDF
    handlePrint();
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText || shareTitle,
        url: shareUrl ?? window.location.href,
      });
    } catch {
      // usuário cancelou ou API não disponível
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(whatsappText || shareTitle);
    const url = whatsappPhone
      ? `https://wa.me/${whatsappPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(emailSubject);
    const body = encodeURIComponent(emailBody || shareText || shareTitle);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shownActions = actions.filter((a) => {
    if (a === "share" && !canShare) return false;
    return true;
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {shownActions.includes("pdf") && (
        <Button
          type="button"
          size={size}
          variant={variant}
          onClick={() => void handlePdf()}
          className="gap-1.5"
        >
          <Download size={14} />
          PDF
        </Button>
      )}

      {shownActions.includes("share") && (
        <Button
          type="button"
          size={size}
          variant={variant}
          onClick={() => void handleShare()}
          className="gap-1.5"
        >
          <Share2 size={14} />
          Compartilhar
        </Button>
      )}

      {shownActions.includes("whatsapp") && (
        <Button
          type="button"
          size={size}
          variant={variant}
          onClick={handleWhatsApp}
          className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950/30"
        >
          <WhatsAppIcon size={14} />
          WhatsApp
        </Button>
      )}

      {shownActions.includes("email") && (
        <Button
          type="button"
          size={size}
          variant={variant}
          onClick={handleEmail}
          className="gap-1.5"
        >
          <Mail size={14} />
          Email
        </Button>
      )}

      {shownActions.includes("print") && (
        <Button
          type="button"
          size={size}
          variant={variant}
          onClick={handlePrint}
          className="gap-1.5"
        >
          <Printer size={14} />
          Imprimir
        </Button>
      )}
    </div>
  );
}
