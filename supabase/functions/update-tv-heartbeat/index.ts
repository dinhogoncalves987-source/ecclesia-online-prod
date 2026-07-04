/**
 * update-tv-heartbeat
 *
 * Chamada periodicamente pelo heartbeat_monitor.sh (a cada ~30s).
 * Mantém last_heartbeat_at atualizado enquanto a transmissão está ativa.
 * Se parar de chegar → check_stale_live_sessions() marca como error.
 *
 * POST /functions/v1/update-tv-heartbeat
 * Body: { session_id: string, viewer_count?: number }
 * Headers: x-mediamtx-secret: <MEDIAMTX_WEBHOOK_SECRET>
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEDIAMTX_WEBHOOK_SECRET   = Deno.env.get("MEDIAMTX_WEBHOOK_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-mediamtx-secret",
  "Content-Type":                 "application/json",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = req.headers.get("x-mediamtx-secret") ?? "";
  if (MEDIAMTX_WEBHOOK_SECRET && secret !== MEDIAMTX_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_secret" }), {
      status: 401, headers: CORS,
    });
  }

  let body: { session_id?: string; viewer_count?: number };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: CORS });
  }

  const { session_id, viewer_count } = body;
  if (!session_id) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_session_id" }), {
      status: 400, headers: CORS,
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await admin.rpc("update_live_session_heartbeat", {
    p_session_id:   session_id,
    p_viewer_count: viewer_count ?? null,
  });

  if (error) {
    console.error("[update-tv-heartbeat]", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: CORS,
    });
  }

  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
    status: 200, headers: CORS,
  });
});
