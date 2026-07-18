/**
 * Web Push real (RFC 8291/8292) — notificação de mensagem nova mesmo com o
 * app/navegador totalmente fechado ou o celular travado.
 *
 * Diferente de src/lib/chatNotifications.ts (Notification API simples, só
 * funciona com a aba/app ainda carregado em memória), aqui o navegador se
 * inscreve uma vez (PushManager) e o disparo real acontece no servidor
 * (Edge Function send-chat-push), entregue pelo serviço de push do próprio
 * navegador (FCM no Chrome/Android, Mozilla no Firefox, APNs web push no
 * Safari/iOS 16.4+ com o app adicionado à Tela de Início).
 *
 * Nunca finge sucesso: se o navegador não suportar, ou a chave pública
 * VAPID não estiver configurada, as funções retornam `false`/`null` sem
 * lançar e sem simular uma inscrição que não existe.
 */
import { supabase } from "@/integrations/supabase/client";
import { environment } from "@/config/environment";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Garante que este dispositivo/navegador tem uma inscrição de Web Push
 * salva para o usuário atual. Deve ser chamada só depois que a permissão
 * de notificação já foi concedida (Notification.permission === "granted").
 * Best-effort: nunca lança para o chamador — retorna false em qualquer
 * impedimento real (sem suporte, sem chave, sem permissão, erro de rede).
 */
export async function subscribeToWebPush(userId: string): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });
    }

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) return false;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh,
        auth_key: auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

    return !error;
  } catch {
    return false;
  }
}

/** Remove a inscrição deste dispositivo (do navegador e do banco). Best-effort. */
export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => undefined);
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    // Best-effort.
  }
}

/**
 * Dispara o envio real de Web Push para os destinatários de uma mensagem
 * recém-enviada. Fire-and-forget: chamado depois que a mensagem já foi
 * gravada com sucesso — uma falha aqui nunca é reportada como falha de
 * envio de mensagem, e o chamador não precisa (nem deve) esperar por isto.
 */
export function triggerChatPush(messageId: string): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      await fetch(`${environment.supabaseUrl}/functions/v1/send-chat-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: environment.supabasePublishableKey,
        },
        body: JSON.stringify({ messageId }),
      });
    } catch {
      // Best-effort — chat já foi entregue por Realtime; push é um extra.
    }
  })();
}
