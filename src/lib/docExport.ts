/**
 * Ecclesia — DocExport
 * Utilitários puros de exportação, impressão e compartilhamento.
 * Sem dependências externas. Zero libs novas.
 *
 * Uso futuro (V2, quando necessário):
 *   - Carta de Recomendação / Carteira Ecclesia → @react-pdf/renderer
 *   - PDF com layout exato sem diálogo → html2canvas + jspdf
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DocExportActionType =
  | "pdf"       // window.print() → "Salvar como PDF" no diálogo nativo
  | "csv"       // download de arquivo CSV via Blob
  | "share"     // Web Share API (navigator.share) com fallback clipboard
  | "whatsapp"  // abre wa.me com mensagem pré-preenchida
  | "email"     // mailto: link
  | "download"; // download genérico via onAction callback

export type DocExportItem = {
  type: DocExportActionType;
  /** Rótulo exibido no menu/botão. Fallback: nome do tipo. */
  label?: string;
  /** CSV como string pré-construída (usado quando type = "csv" sem onAction). */
  csvData?: string;
  /** Nome do arquivo sem extensão, ou com .csv. */
  csvFilename?: string;
  /** Título para share / email. */
  shareTitle?: string;
  /** Texto para share / WhatsApp / email body. */
  shareText?: string;
  /** URL para share. Padrão: window.location.href. */
  shareUrl?: string;
  /** Mensagem pré-preenchida para WhatsApp. */
  whatsappMessage?: string;
  /** Assunto do e-mail. */
  emailSubject?: string;
  /** Corpo do e-mail. */
  emailBody?: string;
  /** Destinatário opcional (mailto:). */
  emailTo?: string;
  /**
   * Callback customizado — tem prioridade sobre qualquer lógica interna.
   * Usar quando o CSV precisa ser construído dinamicamente no componente.
   */
  onAction?: () => void | Promise<void>;
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Impressão / PDF
// ---------------------------------------------------------------------------

/**
 * Abre o diálogo de impressão nativo do browser.
 * No desktop: File → Save as PDF. No mobile: share sheet.
 */
export function printPage(): void {
  window.print();
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Dispara o download de uma string CSV já construída.
 * papaparse já está instalado no projeto para builds mais complexos.
 */
export function downloadCSVRaw(csvString: string, filename: string): void {
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export function openWhatsApp(message: string, phone?: string): void {
  const base = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

export function openMailto(subject: string, body: string, to = ""): void {
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

// ---------------------------------------------------------------------------
// Share (Web Share API)
// ---------------------------------------------------------------------------

/**
 * Aciona a Web Share API nativa. Fallback: copia URL para o clipboard.
 * Retorna "shared" | "copied" | "cancelled".
 */
export async function shareContent(params: {
  url?: string;
  title?: string;
  text?: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  const url = params.url ?? window.location.href;

  if (typeof navigator === "undefined") return "cancelled";

  if (navigator.share) {
    try {
      await navigator.share({ title: params.title ?? "Ecclesia", text: params.text, url });
      return "shared";
    } catch {
      return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(params.text ? `${params.text}\n${url}` : url);
    return "copied";
  } catch {
    return "cancelled";
  }
}

// ---------------------------------------------------------------------------
// Executor central — processa um DocExportItem
// ---------------------------------------------------------------------------

export async function executeDocExportItem(item: DocExportItem): Promise<void> {
  if (item.disabled) return;

  // onAction tem prioridade absoluta
  if (item.onAction) {
    await item.onAction();
    return;
  }

  switch (item.type) {
    case "pdf":
      printPage();
      break;

    case "csv":
      if (item.csvData != null && item.csvFilename) {
        downloadCSVRaw(item.csvData, item.csvFilename);
      }
      break;

    case "share":
      await shareContent({
        url: item.shareUrl,
        title: item.shareTitle,
        text: item.shareText,
      });
      break;

    case "whatsapp":
      openWhatsApp(
        item.whatsappMessage ?? (item.shareUrl ?? window.location.href),
      );
      break;

    case "email":
      openMailto(
        item.emailSubject ?? "",
        item.emailBody ?? "",
        item.emailTo,
      );
      break;

    case "download":
      // Sem onAction não há como saber o que baixar — no-op intencional.
      break;
  }
}

// ---------------------------------------------------------------------------
// Finance module helper — gera conjunto padrão de 5 itens de exportação
// ---------------------------------------------------------------------------

export type FinanceExportOptions = {
  /** Título do módulo — aparece como subject de e-mail e título de share. */
  moduleTitle: string;
  /** Linha de resumo opcional anexada ao texto de share/WA/e-mail. */
  summary?: string;
  /** Função que retorna o CSV como string (opcional). */
  csvFn?: () => string;
  /** Nome do arquivo CSV (sem extensão ou com .csv). */
  csvFilename?: string;
};

/**
 * Gera os itens padrão PDF + (CSV opcional) + Share + WhatsApp + E-mail
 * para uso em qualquer DocExportMenu do módulo Financeiro.
 */
export function buildFinanceExportItems(opts: FinanceExportOptions): DocExportItem[] {
  const text = opts.summary
    ? `${opts.moduleTitle}\n${opts.summary}`
    : opts.moduleTitle;

  const items: DocExportItem[] = [{ type: "pdf" }];

  if (opts.csvFn) {
    const fn = opts.csvFn;
    const filename =
      opts.csvFilename ??
      opts.moduleTitle.toLowerCase().replace(/\s+/g, "_") + ".csv";
    items.push({ type: "csv", onAction: () => downloadCSVRaw(fn(), filename) });
  }

  items.push(
    { type: "share", shareTitle: opts.moduleTitle, shareText: text },
    { type: "whatsapp", whatsappMessage: text },
    { type: "email", emailSubject: opts.moduleTitle, emailBody: text },
  );

  return items;
}
