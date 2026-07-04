/**
 * end-livekit-room — Encerra sala de estúdio LiveKit.
 *
 * Atualiza o banco e, se LiveKit estiver configurado,
 * encerra a sala no servidor LiveKit via API.
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const { studioRoomId } = await req.json() as { studioRoomId: string };
    if (!studioRoomId) {
      return new Response(JSON.stringify({ error: "studioRoomId obrigatório" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Buscar nome da sala
    const { data: room } = await supabase
      .from("tv_studio_rooms")
      .select("room_name")
      .eq("id", studioRoomId)
      .single();

    if (!room) {
      return new Response(JSON.stringify({ error: "Sala não encontrada" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Atualizar DB: encerrar sala e todas as câmeras
    await Promise.all([
      supabase.from("tv_studio_rooms")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", studioRoomId),
      supabase.from("tv_camera_sessions")
        .update({ status: "disconnected", is_on_air: false, disconnected_at: new Date().toISOString() })
        .eq("studio_room_id", studioRoomId)
        .in("status", ["connected", "live", "waiting"]),
    ]);

    // Encerrar sala no servidor LiveKit (não crítico)
    const apiKey    = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";

    if (apiKey && apiSecret && livekitUrl && room.room_name) {
      try {
        const serverToken = await makeServerToken(apiKey, apiSecret);
        await fetch(`${livekitUrl}/twirp/livekit.RoomService/DeleteRoom`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serverToken}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({ room: room.room_name }),
        });
      } catch (e) {
        console.warn("[end-livekit-room] LiveKit delete error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error("[end-livekit-room]", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
