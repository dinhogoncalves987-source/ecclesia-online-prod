/**
 * DocumentActions — barra de ações padrão para documentos institucionais.
 *
 * Ações suportadas: pdf | share | whatsapp | email | print
 *
 * Quando `onGeneratePdfBlob` é fornecido, os botões Share / WhatsApp / Email
 * geram o PDF real e o incluem no compartilhamento (Web Share API com arquivo
 * em dispositivos que suportam, ou download automático nos demais).
 */

import { useState } from "react";
import { Download, Loader2, Mail, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export type DocumentAction = "pdf" | "share" | "whatsapp" | "email" | "print";

export type DocumentActionsProps = {
  actions?: DocumentAction[];
  className?: string;
  printElementId?: string;
  shareTitle?: string;
  shareText?: string;
  shareUrl?: string;
  whatsappText?: string;
  whatsappPhone?: string;
  emailSubject?: string;
  emailBody?: string;
  /** Callback para baixar o PDF (apenas salvar). */
  onGeneratePdf?: () => void | Promise<void>;
  /**
   * Callback que retorna o PDF como Blob (sem salvar automaticamente).
   * Quando fornecido, Share / WhatsApp / Email usam o arquivo real.
   */
  onGeneratePdfBlob?: () => Promise<{ blob: Blob; fileName: string } | null>;
  /** Notifica o pai quando a geração começa/termina (útil para spinner externo). */
  onGeneratingChange?: (v: boolean) => void;
  size?: "sm" | "default";
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

/** Força o download de um Blob sem abrir nova aba. */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  onGeneratePdfBlob,
  onGeneratingChange,
  size = "sm",
  variant = "outline",
}: DocumentActionsProps) {
  const [generating, setGenerating] = useState(false);

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  const withGenerating = async (fn: () => Promise<void>) => {
    setGenerating(true);
    onGeneratingChange?.(true);
    try {
      await fn();
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  const handlePrint = () => {
    if (printElementId) isolatePrint(printElementId);
    else window.print();
  };

  // ── PDF: gerar e baixar ──────────────────────────────────────────────────

  const handlePdf = async () => {
    if (onGeneratePdf) { await onGeneratePdf(); return; }
    if (onGeneratePdfBlob) {
      await withGenerating(async () => {
        const result = await onGeneratePdfBlob();
        if (result) downloadBlob(result.blob, result.fileName);
        else handlePrint();
      });
      return;
    }
    handlePrint();
  };

  // ── Compartilhar: Web Share API com arquivo PDF ─────────────────────────

  const handleShare = async () => {
    if (onGeneratePdfBlob) {
      await withGenerating(async () => {
        const result = await onGeneratePdfBlob();
        if (result) {
          const pdfFile = new File([result.blob], result.fileName, { type: "application/pdf" });
          const canShareFiles =
            typeof navigator.canShare === "function" && navigator.canShare({ files: [pdfFile] });

          if (canShare && canShareFiles) {
            try {
              await navigator.share({ title: shareTitle, text: shareText, files: [pdfFile] });
              return;
            } catch (err) {
              // Usuário cancelou → não mostrar erro
              if ((err as DOMException)?.name === "AbortError") return;
            }
          }

          // Fallback: baixar PDF + copiar link de validação
          downloadBlob(result.blob, result.fileName);
          if (shareUrl) {
            try { await navigator.clipboard.writeText(shareUrl); } catch { /* sem permissão */ }
          }
          toast.info(
            "Seu navegador não permite compartilhar arquivos diretamente. " +
            "O PDF foi baixado. O link de validação foi copiado."
          );
          return;
        }
        // PDF não gerado: compartilhar texto/URL
        if (canShare) {
          try { await navigator.share({ title: shareTitle, text: shareText, url: shareUrl ?? window.location.href }); } catch { /* cancelado */ }
        }
      });
      return;
    }

    // Sem gerador de blob: compartilhar texto/URL
    if (canShare) {
      try {
        await navigator.share({ title: shareTitle, text: shareText || shareTitle, url: shareUrl ?? window.location.href });
      } catch { /* cancelado */ }
    }
  };

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  //
  // wa.me NÃO aceita PDF como anexo. O fluxo correto:
  //   1. Gerar e baixar o PDF.
  //   2. Abrir WhatsApp com mensagem explicativa.
  //   3. Se o dispositivo suportar Web Share com arquivos, usar o compartilhamento
  //      nativo (que pode direcionar para o WhatsApp com o arquivo).

  const handleWhatsApp = async () => {
    if (onGeneratePdfBlob) {
      await withGenerating(async () => {
        const result = await onGeneratePdfBlob();

        if (result) {
          const pdfFile = new File([result.blob], result.fileName, { type: "application/pdf" });
          const canShareFiles =
            typeof navigator.canShare === "function" && navigator.canShare({ files: [pdfFile] });

          if (canShare && canShareFiles) {
            // Mobile com suporte a arquivos: share nativo (usuário pode escolher WhatsApp)
            try {
              await navigator.share({ title: shareTitle, text: whatsappText || shareTitle, files: [pdfFile] });
              return;
            } catch (err) {
              if ((err as DOMException)?.name === "AbortError") return;
              // Falhou: continua para wa.me
            }
          }

          // Desktop / sem suporte a arquivos: baixar PDF primeiro
          downloadBlob(result.blob, result.fileName);
        }

        // Abrir WhatsApp com mensagem + aviso do PDF
        const notice = result
          ? "\n\nO PDF da Carteira de Membro foi baixado. Por favor, anexe o arquivo ao enviar."
          : "";
        const text = encodeURIComponent((whatsappText || shareTitle) + notice);
        const waUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${text}` : `https://wa.me/?text=${text}`;
        window.open(waUrl, "_blank", "noopener,noreferrer");
      });
      return;
    }

    // Sem gerador de blob: apenas abrir WhatsApp com texto
    const text = encodeURIComponent(whatsappText || shareTitle);
    const waUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  // ── Email ────────────────────────────────────────────────────────────────
  //
  // mailto: não suporta anexo. O fluxo correto:
  //   1. Gerar e baixar o PDF.
  //   2. Abrir cliente de email com assunto e corpo.
  //   3. Informar que o PDF deve ser anexado manualmente.

  const handleEmail = async () => {
    if (onGeneratePdfBlob) {
      await withGenerating(async () => {
        const result = await onGeneratePdfBlob();
        if (result) downloadBlob(result.blob, result.fileName);

        const note = result
          ? "\n\n[O PDF da Carteira de Membro foi baixado. Por favor, anexe o arquivo a este e-mail antes de enviar.]"
          : "";
        const subject = encodeURIComponent(emailSubject);
        const body = encodeURIComponent((emailBody || shareText || shareTitle) + note);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      });
      return;
    }

    const subject = encodeURIComponent(emailSubject);
    const body = encodeURIComponent(emailBody || shareText || shareTitle);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shownActions = actions.filter((a) => {
    if (a === "share" && !canShare) return false;
    return true;
  });

  const btnProps = { size, variant, disabled: generating } as const;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {shownActions.includes("pdf") && (
        <Button type="button" {...btnProps} onClick={() => void handlePdf()} className="gap-1.5">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          PDF
        </Button>
      )}

      {shownActions.includes("share") && (
        <Button type="button" {...btnProps} onClick={() => void handleShare()} className="gap-1.5">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
          Compartilhar
        </Button>
      )}

      {shownActions.includes("whatsapp") && (
        <Button
          type="button"
          {...btnProps}
          onClick={() => void handleWhatsApp()}
          className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950/30"
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />}
          WhatsApp
        </Button>
      )}

      {shownActions.includes("email") && (
        <Button type="button" {...btnProps} onClick={() => void handleEmail()} className="gap-1.5">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Email
        </Button>
      )}

      {shownActions.includes("print") && (
        <Button type="button" size={size} variant={variant} onClick={handlePrint} className="gap-1.5">
          <Printer size={14} />
          Imprimir
        </Button>
      )}
    </div>
  );
}
