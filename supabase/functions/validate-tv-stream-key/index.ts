/**
 * validate-tv-stream-key — PARTE A (TV Digital).
 *
 * Chamada pelo MediaMTX (webhook `authHTTPAddress`, ver docs/architecture/
 * auditoria-tv-canal-chat-otp.md §5 "Ativação futura do authHTTPAddress")
 * quando alguém tenta publicar em `rtmp://.../live/<liveSessionId>?user=...
 * &pass=<streamKey>`. NÃO é chamada por um usuário autenticado do app — por
 * isso não usa `auth.uid()` e exige um segredo compartilhado
 * (MEDIAMTX_WEBHOOK_SECRET) em vez de um JWT de usuário.
 *
 * Conhecer o `liveSessionId` sozinho NUNCA é suficiente para publicar: a
 * chave (`pass`) é validada por hash contra `tv_stream_keys` dentro da RPC
 * transacional `validate_and_start_tv_stream` (20260803000000), que faz
 * FOR UPDATE para eliminar corrida entre "achar a chave" e "criar/atualizar
 * a sessão ao vivo".
 *
 * Contrato de resposta esperado pelo MediaMTX authHTTPAddress: HTTP 200 =
 * autorizado, qualquer outro código = negado. Nunca revela no corpo da
 * resposta se a chave existe ou não (evita enumeração) — só o log interno
 * (nunca a chave em si) recebe o motivo.
 *
 * Variáveis necessárias:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (padrão de toda Edge Function)
 *   MEDIAMTX_WEBHOOK_SECRET — segredo compartilhado com a VPS
 *   TV_HLS_PUBLIC_BASE_URL  — ex: https://live.ecclesiabr.online/live
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const webhookSecret = Deno.env.get("MEDIAMTX_WEBHOOK_SECRET");
    const hlsBaseUrl = Deno.env.get("TV_HLS_PUBLIC_BASE_URL") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
      // Fail-closed: sem segredo compartilhado configurado, nenhuma
      // publicação é validada — nunca "abre" por falta de configuração.
      return jsonResponse({ ok: false, error: "not_configured" }, 500);
    }

    // Segredo compartilhado com a VPS — nunca logado, comparado em tempo
    // constante não é viável no runtime Edge padrão, mas o segredo tem alta
    // entropia e o endpoint é fail-closed em qualquer divergência.
    const providedSecret = req.headers.get("x-webhook-secret") ?? "";
    if (providedSecret.length === 0 || providedSecret !== webhookSecret) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    // MediaMTX authHTTPAddress envia { user, password, path, ... } — "user" é
    // usado só como rótulo (não secreto); "password" é a stream key real.
    const streamKey = typeof body?.password === "string" ? body.password : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const action = typeof body?.action === "string" ? body.action : "publish";

    if (action !== "publish") {
      // Leitura (playback) permanece aberta por política do produto — só
      // publish é validado aqui.
      return jsonResponse({ ok: true });
    }

    if (!streamKey.trim()) {
      return jsonResponse({ ok: false, error: "missing_key" }, 401);
    }

    const liveSessionId = path.replace(/^live\//, "").trim();
    const keyHash = await sha256Hex(streamKey.trim());

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const hlsUrl = hlsBaseUrl && liveSessionId ? `${hlsBaseUrl.replace(/\/$/, "")}/${liveSessionId}/index.m3u8` : null;
    const rtmpUrl = liveSessionId ? `rtmp-ingest://${liveSessionId}` : null;

    const { data, error } = await admin.rpc("validate_and_start_tv_stream", {
      p_stream_key_hash: keyHash,
      p_source_type: "obs",
      p_hls_url: hlsUrl,
      p_rtmp_url: rtmpUrl,
    });

    if (error) {
      console.error("validate-tv-stream-key: rpc error", error.message);
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }

    if (!data?.valid) {
      // Nunca revela qual foi o motivo exato ao chamador externo (MediaMTX
      // só precisa de accept/deny); o motivo fica só no log do servidor.
      console.warn("validate-tv-stream-key: denied", data?.reason ?? "unknown");
      return jsonResponse({ ok: false }, 401);
    }

    return jsonResponse({ ok: true, session_id: data.session_id });
  } catch (error) {
    console.error("validate-tv-stream-key error:", error);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
