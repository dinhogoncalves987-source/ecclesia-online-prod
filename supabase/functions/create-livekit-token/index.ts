/**
 * create-livekit-token — PARTE A (TV Digital / Ecclesia Studio).
 *
 * Gera token JWT para participante do Ecclesia Studio. Dois roles:
 *   director — sempre autenticado; identity = "director:{userId}".
 *   camera   — exige um `cameraSessionId` que já exista em
 *              `tv_camera_sessions` (criado pela RPC autenticada e validada
 *              `join_production_as_camera`, 20260802130000). Isso fecha a
 *              lacuna da versão histórica, que aceitava um
 *              `cameraSessionId` livre/anônimo e emitia token sem checar se
 *              aquele dispositivo já havia sido autorizado a entrar na
 *              produção — qualquer um que soubesse o studioRoomId podia
 *              publicar câmera sem ter passado pela checagem de organização.
 *
 * Se LiveKit não estiver configurado, retorna `{ mock: true, token: null }`
 * com mensagem explícita — nunca fabrica um token funcional.
 *
 * Variáveis necessárias:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIVEKIT_API_KEY,
 *   LIVEKIT_API_SECRET, LIVEKIT_URL
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function jsonToBase64url(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = jsonToBase64url({ alg: "HS256", typ: "JWT" });
  const body = jsonToBase64url(payload);
  const message = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
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
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";

    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({
        mock: true,
        token: null,
        livekitUrl: null,
        message: "LiveKit não configurado — integração pendente de credenciais",
      }), { status: 200, headers: corsHeaders });
    }

    const body = await req.json() as {
      studioRoomId: string;
      role: "director" | "camera";
      cameraSessionId?: string;
      cameraName?: string;
    };

    if (!body.studioRoomId || !body.role || !["director", "camera"].includes(body.role)) {
      return new Response(JSON.stringify({ error: "studioRoomId e role são obrigatórios" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: room, error: roomErr } = await admin
      .from("tv_studio_rooms")
      .select("room_name, is_active, live_session_id")
      .eq("id", body.studioRoomId)
      .maybeSingle();

    if (roomErr || !room) {
      return new Response(JSON.stringify({ error: "Sala não encontrada" }), { status: 404, headers: corsHeaders });
    }
    if (!room.is_active) {
      return new Response(JSON.stringify({ error: "Sala encerrada" }), { status: 403, headers: corsHeaders });
    }

    // Ambos os papéis exigem um usuário Supabase autenticado (defesa em
    // profundidade — o gateway já exige verify_jwt=true para esta função).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: corsHeaders });
    }
    const { data: callerData, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), { status: 401, headers: corsHeaders });
    }
    const callerId = callerData.user.id;

    const isDirector = body.role === "director";
    let identity: string;
    let userId: string | null = null;

    if (isDirector) {
      userId = callerId;
      identity = `director:${userId}`;
    } else {
      // Câmera: o cameraSessionId PRECISA ser uma tv_camera_session real,
      // criada pela RPC autenticada join_production_as_camera para esta
      // mesma sala — nunca um identificador anônimo livre.
      if (!body.cameraSessionId) {
        return new Response(JSON.stringify({ error: "cameraSessionId obrigatório" }), { status: 400, headers: corsHeaders });
      }
      const { data: camSession, error: camErr } = await admin
        .from("tv_camera_sessions")
        .select("id, live_session_id, status, user_id")
        .eq("id", body.cameraSessionId)
        .maybeSingle();

      if (camErr || !camSession || camSession.live_session_id !== room.live_session_id) {
        return new Response(JSON.stringify({ error: "Sessão de câmera inválida para esta sala" }), { status: 403, headers: corsHeaders });
      }
      if (camSession.status === "disconnected") {
        return new Response(JSON.stringify({ error: "Sessão de câmera desconectada" }), { status: 403, headers: corsHeaders });
      }
      // A sessão de câmera só pode ser resgatada pelo MESMO usuário que a
      // criou via join_production_as_camera — evita que outro usuário
      // autenticado, só por conhecer/adivinhar o cameraSessionId (uuid),
      // assuma a identidade daquela câmera.
      if (camSession.user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Sessão de câmera pertence a outro usuário" }), { status: 403, headers: corsHeaders });
      }

      identity = `camera:${camSession.id}`;
      userId = camSession.user_id;
    }

    const now = Math.floor(Date.now() / 1000);
    const grants = {
      roomJoin: true,
      room: room.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };

    const payload: Record<string, unknown> = {
      iss: apiKey,
      sub: identity,
      iat: now,
      nbf: now,
      exp: now + 3600,
      video: grants,
      metadata: JSON.stringify({
        role: body.role,
        name: body.cameraName ?? (isDirector ? "Diretor" : "Câmera"),
        user_id: userId,
        session_id: body.cameraSessionId ?? null,
      }),
    };

    const token = await signJwt(payload, apiSecret);

    return new Response(JSON.stringify({
      mock: false,
      token,
      livekitUrl: livekitUrl.replace(/\/$/, ""),
      identity,
      roomName: room.room_name,
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[create-livekit-token]", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500, headers: corsHeaders });
  }
});
