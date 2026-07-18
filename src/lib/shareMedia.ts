import type { InternalMessage } from "@/lib/internalMessages";

export type ShareResult =
  | { ok: true; method: "share" | "clipboard" }
  | { ok: false; method: "share" | "clipboard" | "none"; error: "cancelled" | "unsupported" | "fetch_failed" };

type NavigatorWithShare = Navigator & {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
};

/**
 * Compartilha uma mensagem (texto e/ou anexo) com outros apps do dispositivo
 * (WhatsApp, e-mail, etc.) via Web Share API — o "compartilhar" nativo do
 * celular/computador, diferente de "reenviar" (que manda para outra conversa
 * dentro da própria plataforma, ver forwardInternalMessage).
 *
 * Estratégia em cascata:
 *   1. navigator.share com o arquivo (imagem/vídeo/documento) — abre o menu
 *      nativo de compartilhamento (WhatsApp, Telegram, e-mail, etc.).
 *   2. Se o navegador não suportar compartilhar arquivos, compartilha o link
 *      público + texto.
 *   3. Se Web Share API não existir (ex: desktop sem suporte), copia o link
 *      ou o texto para a área de transferência como último recurso.
 */
export async function shareInternalMessage(message: InternalMessage): Promise<ShareResult> {
  const nav = navigator as NavigatorWithShare;
  const attachment = message.attachments[0];
  const text = message.body?.trim() || undefined;

  if (attachment?.publicUrl && nav.share) {
    try {
      const response = await fetch(attachment.publicUrl);
      const blob = await response.blob();
      const file = new File(
        [blob],
        attachment.fileName || "arquivo",
        { type: attachment.fileType || blob.type || "application/octet-stream" },
      );

      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text });
        return { ok: true, method: "share" };
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return { ok: false, method: "share", error: "cancelled" };
      }
      // Segue para os fallbacks abaixo (ex: fetch cross-origin bloqueado)
    }
  }

  if (nav.share) {
    try {
      await nav.share({ text, url: attachment?.publicUrl ?? undefined });
      return { ok: true, method: "share" };
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return { ok: false, method: "share", error: "cancelled" };
      }
    }
  }

  const clipboardValue = attachment?.publicUrl ?? text;
  if (clipboardValue && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(clipboardValue);
      return { ok: true, method: "clipboard" };
    } catch {
      return { ok: false, method: "clipboard", error: "unsupported" };
    }
  }

  return { ok: false, method: "none", error: "unsupported" };
}
