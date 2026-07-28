/**
 * update-tv-heartbeat — PARTE A (TV Digital).
 *
 * Chamada periodicamente pela VPS (cron/monitor local, não pelo navegador do
 * usuário) para provar que a transmissão continua realmente ativa. Sem esse
 * heartbeat, `check_stale_tv_live_sessions` (20260803000000) marca a sessão
 * como 'error' após 90s de silêncio — nenhum estado "ao vivo" fica preso
 * indefinidamente só porque o frontend nunca foi atualizado.
 *
 * Também recebe `action: "end"` no runOnNotReady do MediaMTX para encerrar a
 * sessão imediatamente quando o publisher desconecta.
 *
 * Autenticação: mesmo segredo compartilhado MEDIAMTX_WEBHOOK_SECRET usado por
 * validate-tv-stream-key. Aceita header em testes ou `webhook_secret` na URL
 * configurada na VPS, pois o MediaMTX não injeta headers arbitrários.
 *
 * Variáveis necessárias:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEDIAMTX_WEBHOOK_SECRET
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const webhookSecret = Deno.env.get("MEDIAMTX_WEBHOOK_SECRET");
    if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
      return jsonResponse({ ok: false, error: "not_configured" }, 500);
    }

    const requestUrl = new URL(req.url);
    const providedSecret = req.headers.get("x-webhook-secret")
      ?? requestUrl.searchParams.get("webhook_secret")
      ?? "";
    if (providedSecret.length === 0 || providedSecret !== webhookSecret) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    const action = body?.action === "end" ? "end" : "heartbeat";
    const viewerCount = typeof body?.viewer_count === "number" && body.viewer_count >= 0
      ? Math.floor(body.viewer_count)
      : null;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return jsonResponse({ ok: false, error: "missing_session_id" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = action === "end"
      ? await admin.rpc("stop_tv_stream_by_session", { p_session_id: sessionId })
      : await admin.rpc("update_live_session_heartbeat", {
        p_session_id: sessionId,
        p_viewer_count: viewerCount,
      });

    if (error) {
      console.error("update-tv-heartbeat: rpc error", error.message);
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }

    if (action === "end" && data !== true) {
      return jsonResponse({ ok: false, error: "session_not_active" }, 409);
    }

    return jsonResponse({ ok: true, action });
  } catch (error) {
    console.error("update-tv-heartbeat error:", error);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
