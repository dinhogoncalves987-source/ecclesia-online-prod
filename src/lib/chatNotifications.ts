/**
 * Som e notificações reais de mensagem recebida — Chat interno.
 *
 * Regras aplicadas:
 *  - som curto gerado via Web Audio API (sem asset externo);
 *  - nunca toca para mensagem enviada pelo próprio usuário (decidido pelo
 *    chamador, que só invoca isto para mensagens de outros participantes);
 *  - notificação do navegador só é exibida com permissão concedida — se o
 *    navegador bloquear, a função simplesmente não mostra nada (nunca
 *    finge que a notificação apareceu).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** Toca um "tim" curto de notificação (sem arquivo de áudio). */
export function playMessageReceivedSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(920, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(640, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch {
    // Best-effort — nunca deve travar a experiência do chat.
  }
}

export type ChatNotificationPermission = "granted" | "denied" | "default" | "unsupported";

export function getChatNotificationPermission(): ChatNotificationPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Solicita permissão de notificação de forma explícita (deve ser chamado a partir de uma ação do usuário). */
export async function requestChatNotificationPermission(): Promise<ChatNotificationPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Exibe notificação real de nova mensagem — só se a permissão já foi concedida pelo navegador. */
export function showChatMessageNotification(opts: {
  title: string;
  body: string;
  threadId: string;
}): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(opts.title, {
      body: opts.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `ec-thread-${opts.threadId}`,
    });
    notification.onclick = () => {
      window.focus();
      window.location.assign(`/admin/chat?thread=${opts.threadId}`);
      notification.close();
    };
  } catch {
    // Best-effort — se o navegador rejeitar, não fingimos que funcionou.
  }
}
