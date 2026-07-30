import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authHeader.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data.user) return jsonResponse({ error: "unauthorized" }, 401);

  const rawUrls = Deno.env.get("TURN_URLS")?.trim();
  const sharedSecret = Deno.env.get("TURN_SHARED_SECRET")?.trim();
  if (!rawUrls || !sharedSecret) {
    return jsonResponse({ iceServers: [], relayConfigured: false });
  }

  const urls = rawUrls.split(",").map((value) => value.trim()).filter(Boolean);
  if (urls.length === 0 || urls.some((url) => !/^turns?:/i.test(url))) {
    return jsonResponse({ error: "invalid_turn_configuration" }, 500);
  }

  // Coturn TURN REST API: credencial HMAC temporária, sem expor o segredo.
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
  const username = `${expiresAt}:${data.user.id}`;
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

  return jsonResponse({
    iceServers: [{ urls, username, credential: base64(signature) }],
    relayConfigured: true,
    expiresAt,
  });
});
