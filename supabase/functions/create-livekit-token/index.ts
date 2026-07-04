/**
 * create-livekit-token — Gera token JWT para participante do Ecclesia Studio.
 *
 * Suporta dois roles:
 *   director — pode publicar e subscrever; identity = "director:{userId}"
 *   camera   — pode publicar vídeo; identity = "camera:{sessionId}"
 *
 * A assinatura JWT é feita com HMAC-SHA256 usando a API nativa do Deno.
 *
 * Variáveis necessárias (Supabase Secrets):
 *   LIVEKIT_API_KEY
 *   LIVEKIT_API_SECRET
 *
 * Compatível com LiveKit Server SDK v1+ (JWT padrão RFC 7519).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── JWT helper (LiveKit usa HS256) ────────────────────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function jsonToBase64url(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header  = jsonToBase64url({ alg: "HS256", typ: "JWT" });
  const body    = jsonToBase64url(payload);
  const message = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return `${message}.${base64url(new Uint8Array(sig))}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",
    "Content-Type": "application/json",
  };

  try {
    const apiKey    = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";

    // Se LiveKit não está configurado, retornar mock token
    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({
        mock: true,
        token: null,
        livekitUrl: null,
        message: "LiveKit não configurado — modo demonstração ativo",
      }), { status: 200, headers: corsHeaders });
    }

    const body = await req.json() as {
      studioRoomId:     string;
      role:             "director" | "camera";
      cameraSessionId?: string;
      cameraName?:      string;
    };

    if (!body.studioRoomId || !body.role) {
      return new Response(JSON.stringify({ error: "studioRoomId e role são obrigatórios" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Buscar dados da sala no banco
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const { data: room, error: roomErr } = await supabase
      .from("tv_studio_rooms")
      .select("room_name, status, organization_id")
      .eq("id", body.studioRoomId)
      .single();

    if (roomErr || !room) {
      return new Response(JSON.stringify({ error: "Sala não encontrada" }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (room.status === "ended") {
      return new Response(JSON.stringify({ error: "Sala encerrada" }), {
        status: 403, headers: corsHeaders,
      });
    }

    // Montar identity
    const isDirector = body.role === "director";
    let identity: string;
    let userId: string | null = null;

    if (isDirector) {
      // Validar auth para diretor
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Autenticação necessária para diretor" }), {
          status: 401, headers: corsHeaders,
        });
      }
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) {
        return new Response(JSON.stringify({ error: "Usuário inválido" }), {
          status: 401, headers: corsHeaders,
        });
      }
      userId   = user.id;
      identity = `director:${user.id}`;
    } else {
      // Câmera: identity baseada no sessionId (anônimo permitido)
      const sessionId = body.cameraSessionId ?? `anon-${crypto.randomUUID()}`;
      identity = `camera:${sessionId}`;
    }

    // Gerar token JWT LiveKit
    const now  = Math.floor(Date.now() / 1000);
    const grants = {
      roomJoin:       true,
      room:           room.room_name,
      canPublish:     true,          // câmera publica, diretor também (para data messages)
      canSubscribe:   true,
      canPublishData: true,
    };

    const payload: Record<string, unknown> = {
      iss:      apiKey,
      sub:      identity,
      iat:      now,
      nbf:      now,
      exp:      now + 3600,
      video:    grants,
      metadata: JSON.stringify({
        role:       body.role,
        name:       body.cameraName ?? (isDirector ? "Diretor" : "Câmera"),
        user_id:    userId,
        session_id: body.cameraSessionId ?? null,
      }),
    };

    const token = await signJwt(payload, apiSecret);

    return new Response(JSON.stringify({
      mock:       false,
      token,
      livekitUrl: livekitUrl.replace(/\/$/, ""),
      identity,
      roomName:   room.room_name,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error("[create-livekit-token]", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
