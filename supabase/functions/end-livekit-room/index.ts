/**
 * end-livekit-room — PARTE A (TV Digital / Ecclesia Studio).
 *
 * Encerra sala de estúdio chamando a RPC transacional `end_live_production`
 * (20260802130000) com o contexto do PRÓPRIO usuário autenticado — não
 * service_role — porque aquela RPC decide a permissão a partir de
 * `auth.uid()` (dono do dispositivo diretor OU capability tv.manage). A
 * versão histórica fazia UPDATE direto nas tabelas via service_role sem
 * checar se quem chamou tinha qualquer relação com a sala; esta versão fecha
 * essa lacuna.
 *
 * Variáveis necessárias:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIVEKIT_API_KEY,
 *   LIVEKIT_API_SECRET, LIVEKIT_URL (LiveKit é opcional — não crítico)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function makeServerToken(apiKey: string, apiSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: apiKey, sub: "server", iat: now, exp: now + 300,
    video: { roomCreate: true, roomList: true, roomDelete: true },
  })));
  const message = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return `${message}.${base64url(new Uint8Array(sig))}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: corsHeaders });
    }

    const { studioRoomId } = await req.json() as { studioRoomId?: string };
    if (!studioRoomId) {
      return new Response(JSON.stringify({ error: "studioRoomId obrigatório" }), { status: 400, headers: corsHeaders });
    }

    const { data: room, error: roomErr } = await userClient
      .from("tv_studio_rooms")
      .select("room_name, live_session_id")
      .eq("id", studioRoomId)
      .maybeSingle();

    if (roomErr || !room) {
      return new Response(JSON.stringify({ error: "Sala não encontrada" }), { status: 404, headers: corsHeaders });
    }

    // Passa director_device_id vazio: se o usuário não for o diretor dono do
    // dispositivo, a RPC só permite a operação via capability tv.manage —
    // nunca por "conhecer" o studioRoomId sozinho.
    const { data: ended, error: endErr } = await userClient.rpc("end_live_production", {
      p_live_session_id: room.live_session_id,
      p_director_device_id: "",
    });

    if (endErr) {
      console.error("[end-livekit-room] rpc error", endErr.message);
      return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500, headers: corsHeaders });
    }
    if (!ended) {
      return new Response(JSON.stringify({ error: "Sem permissão para encerrar esta sala" }), { status: 403, headers: corsHeaders });
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";

    if (apiKey && apiSecret && livekitUrl && room.room_name) {
      try {
        const serverToken = await makeServerToken(apiKey, apiSecret);
        await fetch(`${livekitUrl.replace(/\/$/, "")}/twirp/livekit.RoomService/DeleteRoom`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serverToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ room: room.room_name }),
        });
      } catch (e) {
        console.warn("[end-livekit-room] LiveKit delete error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[end-livekit-room]", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500, headers: corsHeaders });
  }
});
