/**
 * send-chat-push — dispara notificação real de mensagem nova via Web Push
 * (RFC 8291/8292), mesmo com o app/navegador totalmente fechado no celular
 * (diferente de src/lib/chatNotifications.ts, que só funciona com a
 * aba/app ainda carregado em memória).
 *
 * Chamada pelo próprio cliente que ACABOU de enviar a mensagem (ver
 * src/lib/internalMessageMutations.ts), de forma "fire-and-forget" — nunca
 * bloqueia o envio da mensagem em si, e uma falha aqui nunca é reportada
 * como falha de envio de mensagem.
 *
 * Segurança:
 *  - exige Authorization: Bearer <jwt> do próprio remetente;
 *  - a mensagem só é lida com um client anon+JWT do chamador — ou seja,
 *    RLS (public.can_read_internal_thread) decide se a linha existe para
 *    ele, exatamente como o restante do app;
 *  - só dispara push se sender_user_id da mensagem == usuário autenticado
 *    (não permite disparar push "em nome" de mensagem de outra pessoa);
 *  - só depois disso usa a service role para descobrir destinatários
 *    (public.internal_thread_notification_recipients) e ler
 *    push_subscriptions (tabela restrita ao próprio dono por RLS —
 *    inacessível para o cliente, só a service role lê entre usuários).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush, type PushSubscriptionKeys, type VapidKeys } from "./webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function messagePreview(messageType: string, body: string | null): string | null {
  switch (messageType) {
    case "image":
      return "📷 Foto";
    case "audio":
      return "🎵 Áudio";
    case "video":
      return "🎬 Vídeo";
    case "document":
      return "📄 Documento";
    case "system":
      return null;
    default:
      return (body ?? "").slice(0, 140) || "Nova mensagem";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:suporte@ecclesiabr.online";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase secrets not configured" }, 500);
    }
    if (!vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse({ error: "push_not_configured", sent: 0 }, 200);
    }
    const vapid: VapidKeys = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey };

    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body?.messageId;
    if (!messageId) {
      return jsonResponse({ error: "messageId is required" }, 400);
    }

    // Client "no papel do usuário": RLS decide se ele pode mesmo ler esta mensagem.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const callerId = authData.user.id;

    const { data: message, error: messageError } = await callerClient
      .from("internal_messages")
      .select("id, thread_id, sender_user_id, sender_role, message_type, body")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError || !message) {
      // RLS bloqueou (ou a mensagem não existe) — nunca revelamos qual dos dois.
      return jsonResponse({ error: "not_found_or_forbidden" }, 404);
    }

    if (message.sender_user_id !== callerId) {
      return jsonResponse({ error: "forbidden: not the sender" }, 403);
    }

    const preview = messagePreview(message.message_type, message.body);
    if (!preview) {
      return jsonResponse({ sent: 0, skipped: "system_message" });
    }

    // A partir daqui, service role — só para resolver destinatários e ler
    // inscrições de OUTROS usuários, o que a RLS de push_subscriptions
    // nunca permitiria para o client comum (cada um só vê a própria linha).
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: recipientRows, error: recipientsError } = await adminClient.rpc(
      "internal_thread_notification_recipients",
      { _thread_id: message.thread_id, _sender_user_id: callerId },
    );
    if (recipientsError) {
      return jsonResponse({ error: recipientsError.message }, 500);
    }
    const recipientIds: string[] = (recipientRows ?? []).map((r: { user_id?: string } | string) =>
      typeof r === "string" ? r : (r.user_id as string),
    ).filter(Boolean);

    if (recipientIds.length === 0) {
      return jsonResponse({ sent: 0, skipped: "no_recipients" });
    }

    const [{ data: subscriptions }, { data: senderProfile }] = await Promise.all([
      adminClient
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth_key")
        .in("user_id", recipientIds),
      adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", callerId)
        .maybeSingle(),
    ]);

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ sent: 0, skipped: "no_subscriptions", recipients: recipientIds.length });
    }

    const title = senderProfile?.full_name
      ? `Nova mensagem de ${senderProfile.full_name}`
      : "Nova mensagem — Ecclesia Online";

    const staleIds: string[] = [];
    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub: { id: string; endpoint: string; p256dh: string; auth_key: string }) => {
        const subscriptionKeys: PushSubscriptionKeys = {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth_key,
        };
        const result = await sendWebPush(
          subscriptionKeys,
          { title, body: preview, threadId: message.thread_id },
          vapid,
          vapidSubject,
        );
        if (result.ok) {
          sent += 1;
        } else {
          failed += 1;
          if (result.gone) staleIds.push(sub.id);
        }
      }),
    );

    if (staleIds.length > 0) {
      await adminClient.from("push_subscriptions").delete().in("id", staleIds);
    }

    return jsonResponse({ sent, failed, staleRemoved: staleIds.length, recipients: recipientIds.length });
  } catch (error) {
    console.error("send-chat-push error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
