/**
 * create-livekit-room — Cria sala de estúdio LiveKit no banco.
 *
 * Também pré-cria a sala no servidor LiveKit via REST API, se disponível.
 * Sala LiveKit é criada automaticamente quando o primeiro participante entra,
 * então esse endpoint foca principalmente em criar o registro no banco.
 *
 * Variáveis:
 *   LIVEKIT_API_KEY
 *   LIVEKIT_API_SECRET
 *   LIVEKIT_URL              (ex: https://livekit.meusite.com)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function makeServerToken(apiKey: string, apiSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: apiKey, sub: "server", iat: now, exp: now + 300,
    video: { roomCreate: true, roomList: true, roomDelete: true },
  })));
  const message = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return `${message}.${base64url(new Uint8Array(sig))}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey     = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret  = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Validar auth (obrigatório para criar sala)
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const body = await req.json() as { liveSessionId?: string };

    // Criar sala no banco via RPC
    const { data: roomData, error: rpcErr } = await supabase.rpc("create_tv_studio_room", {
      p_live_session_id: body.liveSessionId ?? null,
    });

    if (rpcErr || !roomData || roomData.length === 0) {
      return new Response(JSON.stringify({ error: rpcErr?.message ?? "Erro ao criar sala" }), {
        status: 500, headers: corsHeaders,
      });
    }

    const { studio_room_id, room_name } = roomData[0] as { studio_room_id: string; room_name: string };

    // Tentar pré-criar sala no servidor LiveKit (não crítico — falha silenciosa)
    let livekitRoomCreated = false;
    if (apiKey && apiSecret && livekitUrl) {
      try {
        const serverToken = await makeServerToken(apiKey, apiSecret);
        const resp = await fetch(`${livekitUrl}/twirp/livekit.RoomService/CreateRoom`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serverToken}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({ name: room_name, max_participants: 10, empty_timeout: 600 }),
        });
        livekitRoomCreated = resp.ok;
      } catch (e) {
        console.warn("[create-livekit-room] LiveKit API não disponível:", e);
      }
    }

    return new Response(JSON.stringify({
      studioRoomId:     studio_room_id,
      roomName:         room_name,
      livekitConfigured: !!(apiKey && apiSecret),
      livekitRoomCreated,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error("[create-livekit-room]", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
