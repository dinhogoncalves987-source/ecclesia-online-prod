/**
 * validate-tv-stream-key
 *
 * Chamada pelo script on_publish.sh do MediaMTX quando uma nova transmissão inicia.
 * 1. Recebe a stream key em texto plano (vinda do OBS/celular).
 * 2. Calcula SHA-256 da chave.
 * 3. Busca em tv_stream_keys pelo hash.
 * 4. Cria ou atualiza tv_live_sessions com status_transmissao = live.
 * 5. Retorna 200 (válido) ou 401 (inválido) para o MediaMTX decidir se aceita.
 *
 * POST /functions/v1/validate-tv-stream-key
 * Body: { stream_key: string, source_type?: string, ingest_base_url?: string, hls_base_url?: string }
 * Headers: x-mediamtx-secret: <MEDIAMTX_WEBHOOK_SECRET>
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEDIAMTX_WEBHOOK_SECRET  = Deno.env.get("MEDIAMTX_WEBHOOK_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-mediamtx-secret",
  "Content-Type":                 "application/json",
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Validar segredo compartilhado MediaMTX ↔ Supabase
  const secret = req.headers.get("x-mediamtx-secret") ?? "";
  if (MEDIAMTX_WEBHOOK_SECRET && secret !== MEDIAMTX_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ valid: false, reason: "invalid_secret" }), {
      status: 401, headers: CORS,
    });
  }

  let body: { stream_key?: string; source_type?: string; ingest_base_url?: string; hls_base_url?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ valid: false, reason: "invalid_json" }), {
      status: 400, headers: CORS,
    });
  }

  const { stream_key, source_type = "obs", ingest_base_url = "", hls_base_url = "" } = body;
  if (!stream_key) {
    return new Response(JSON.stringify({ valid: false, reason: "missing_stream_key" }), {
      status: 400, headers: CORS,
    });
  }

  // Calcular hash da stream key
  const keyHash = await sha256Hex(stream_key);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Buscar chave pelo hash
  const { data: keyRow, error: keyErr } = await admin
    .from("tv_stream_keys")
    .select("id, tv_channel_id, organization_id, church_id, is_active, stream_key_last4, stream_source_type")
    .eq("stream_key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (keyErr || !keyRow) {
    console.warn("[validate-tv-stream-key] Key not found or inactive", { hash: keyHash.slice(0, 8) });
    return new Response(JSON.stringify({ valid: false, reason: "key_not_found" }), {
      status: 401, headers: CORS,
    });
  }

  // Verificar canal ativo
  const { data: channel, error: chErr } = await admin
    .from("tv_channels")
    .select("id, name, slug, status")
    .eq("id", keyRow.tv_channel_id)
    .eq("status", "active")
    .maybeSingle();

  if (chErr || !channel) {
    return new Response(JSON.stringify({ valid: false, reason: "channel_inactive" }), {
      status: 401, headers: CORS,
    });
  }

  // Atualizar last_used_at na chave
  await admin.from("tv_stream_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  // Construir URLs da transmissão
  const hlsPath  = `${hls_base_url}/hls/live/${stream_key}/index.m3u8`;
  const rtmpPath = `rtmp://${new URL(ingest_base_url || "rtmp://localhost/live").hostname}/live/${stream_key}`;
  const now      = new Date().toISOString();

  // Verificar se já há sessão live para este canal
  const { data: existing } = await admin
    .from("tv_live_sessions")
    .select("id, status_transmissao")
    .eq("tv_channel_id", keyRow.tv_channel_id)
    .eq("status_transmissao", "live")
    .maybeSingle();

  let sessionId: string;

  if (existing) {
    // Reativar sessão existente
    await admin.from("tv_live_sessions").update({
      status_transmissao: "live",
      stream_key_id: keyRow.id,
      stream_source_type: source_type,
      hls_url: hlsPath,
      rtmp_url: rtmpPath,
      hls_path: hlsPath,
      rtmp_path: rtmpPath,
      started_at: now,
      last_heartbeat_at: now,
      error_message: null,
    }).eq("id", existing.id);
    sessionId = existing.id;
  } else {
    // Criar nova sessão
    const { data: newSession, error: insErr } = await admin
      .from("tv_live_sessions")
      .insert({
        organization_id: keyRow.organization_id,
        church_id: keyRow.church_id,
        tv_channel_id: keyRow.tv_channel_id,
        stream_key_id: keyRow.id,
        stream_source_type: source_type,
        status_transmissao: "live",
        hls_url: hlsPath,
        rtmp_url: rtmpPath,
        hls_path: hlsPath,
        rtmp_path: rtmpPath,
        playback_url: hlsPath,
        started_at: now,
        last_heartbeat_at: now,
        recording_status: "idle",
      })
      .select("id")
      .single();

    if (insErr || !newSession) {
      console.error("[validate-tv-stream-key] Failed to create session", insErr);
      return new Response(JSON.stringify({ valid: false, reason: "session_create_failed" }), {
        status: 500, headers: CORS,
      });
    }
    sessionId = newSession.id;
  }

  return new Response(JSON.stringify({
    valid:           true,
    session_id:      sessionId,
    tv_channel_id:   keyRow.tv_channel_id,
    organization_id: keyRow.organization_id,
    church_id:       keyRow.church_id,
    channel_slug:    channel.slug,
    hls_url:         hlsPath,
    rtmp_url:        rtmpPath,
    key_last4:       keyRow.stream_key_last4,
  }), { status: 200, headers: CORS });
});
