/**
 * check-stale-sessions
 *
 * Detecta transmissões que pararam sem encerramento explícito.
 * Pode ser chamada por um cron job externo a cada 2 minutos.
 *
 * Alternativa: usar pg_cron dentro do Supabase (ver migration).
 *
 * GET /functions/v1/check-stale-sessions
 * Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Exemplo de cron job no servidor:
 *   * /2 * * * * curl -s -X GET $SUPABASE_URL/functions/v1/check-stale-sessions \
 *                   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type":                 "application/json",
};

// Sessões sem heartbeat por mais de TIMEOUT_SECONDS são marcadas como error
const TIMEOUT_SECONDS = 90;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Aceitar tanto service role key como token anon com verificação
  const auth = req.headers.get("Authorization") ?? "";
  const bearerToken = auth.replace("Bearer ", "").trim();

  // Somente o service role pode chamar esta função
  if (bearerToken !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, reason: "unauthorized" }), {
      status: 401, headers: CORS,
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Marcar sessões sem heartbeat como error
  const { data: staleCount, error: staleErr } = await admin.rpc("check_stale_live_sessions", {
    p_timeout_seconds: TIMEOUT_SECONDS,
  });

  if (staleErr) {
    console.error("[check-stale-sessions] RPC error:", staleErr.message);
    return new Response(JSON.stringify({ ok: false, error: staleErr.message }), {
      status: 500, headers: CORS,
    });
  }

  // 2. Também marcar sessões 'waiting' muito antigas (> 10 minutos sem iniciar)
  const { error: waitingErr } = await admin
    .from("tv_live_sessions")
    .update({
      status_transmissao: "ended",
      ended_at: new Date().toISOString(),
      error_message: "Sessão aguardando iniciou há mais de 10 minutos sem sinal",
    })
    .eq("status_transmissao", "waiting")
    .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  console.info(`[check-stale-sessions] Marked ${staleCount} stale sessions`);

  return new Response(JSON.stringify({
    ok:           true,
    stale_marked: staleCount ?? 0,
    timeout_sec:  TIMEOUT_SECONDS,
    ts:           new Date().toISOString(),
  }), { status: 200, headers: CORS });
});
