import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store, private",
  Vary: "Origin",
};

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  const configured = Deno.env.get("TURN_ALLOWED_ORIGINS")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  return configured.includes(origin) ? origin : null;
}

function responseHeaders(req: Request) {
  const origin = allowedOrigin(req);
  return origin
    ? { ...baseHeaders, "Access-Control-Allow-Origin": origin }
    : baseHeaders;
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(req), "Content-Type": "application/json" },
  });
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

serve(async (req) => {
  const requestOrigin = req.headers.get("Origin");
  if (requestOrigin && !allowedOrigin(req)) {
    return jsonResponse(req, { error: "origin_not_allowed" }, 403);
  }
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authHeader.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data.user) return jsonResponse(req, { error: "unauthorized" }, 401);

  const payload = await req.json().catch(() => null) as { callId?: unknown } | null;
  const callId = typeof payload?.callId === "string" ? payload.callId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)) {
    return jsonResponse(req, { error: "invalid_call_id" }, 400);
  }

  // A RLS de internal_calls só deixa o chamador e o destinatário lerem a
  // chamada. Isso impede que um usuário autenticado use o relay fora de uma
  // ligação real e ativa da Eclésia.
  const { data: call, error: callError } = await callerClient
    .from("internal_calls")
    .select("id,status,caller_user_id,callee_user_id")
    .eq("id", callId)
    .in("status", ["ringing", "accepted"])
    .maybeSingle();
  if (callError || !call) {
    return jsonResponse(req, { error: "active_call_not_found" }, 403);
  }
  if (call.caller_user_id !== data.user.id && call.callee_user_id !== data.user.id) {
    return jsonResponse(req, { error: "forbidden" }, 403);
  }

  const rawUrls = Deno.env.get("TURN_URLS")?.trim();
  const sharedSecret = Deno.env.get("TURN_SHARED_SECRET")?.trim();
  if (!rawUrls || !sharedSecret) {
    return jsonResponse(req, { error: "turn_not_configured" }, 503);
  }

  const urls = rawUrls.split(",").map((value) => value.trim()).filter(Boolean);
  if (
    urls.length === 0
    || urls.length > 6
    || urls.some((url) => !/^turns?:[^,\s]+$/i.test(url))
  ) {
    return jsonResponse(req, { error: "invalid_turn_configuration" }, 500);
  }

  // Coturn TURN REST API: credencial HMAC temporária, sem expor o segredo.
  const configuredTtl = Number(Deno.env.get("TURN_CREDENTIAL_TTL_SECONDS") ?? "600");
  const ttlSeconds = Number.isFinite(configuredTtl)
    ? Math.min(1800, Math.max(300, Math.trunc(configuredTtl)))
    : 600;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiresAt}:${callId}:${data.user.id}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sharedSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(username),
  );

  const relayRequired = Deno.env.get("TURN_FORCE_RELAY")?.trim().toLowerCase() !== "false";

  return jsonResponse(req, {
    iceServers: [{ urls, username, credential: base64(signature) }],
    relayConfigured: true,
    relayRequired,
    expiresAt,
  });
});
