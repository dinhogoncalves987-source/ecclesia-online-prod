/**
 * activate-member-invite — NEUTRALIZED (security hardening, revisão do
 * commit ee86c3d).
 *
 * This Edge Function used to reset the password of a pre-existing Supabase
 * Auth account via `admin.auth.admin.updateUserById(existing.id, {password,
 * email_confirm: true})`, reachable from a PUBLIC, unauthenticated endpoint
 * with nothing but a member-invite token. That allowed anyone who obtained
 * (or guessed/phished) an invite link to take over ANY existing Auth account
 * whose e-mail happened to match the invited member's registered e-mail,
 * without ever proving ownership of that account. This is a P0 account
 * takeover vulnerability and has been removed — not patched, removed.
 *
 * The member invite flow no longer uses any service-role / admin.* path to
 * create or update Auth users:
 *   - New members create their account through the official Supabase
 *     `auth.signUp()` flow (frontend, `src/lib/memberInvites.ts` ->
 *     `signUpForMemberInvite`), which requires real e-mail confirmation.
 *   - Existing members must log in normally or use the official
 *     `/forgot-password` recovery flow.
 *   - In both cases, the invite is only finalized with the RPC
 *     `public.accept_member_invite(token, uid)`, which is bound to the
 *     caller's own `auth.uid()`/`auth.email()` — never a service-role bypass.
 *
 * This function is kept deployed (rather than deleted) purely so that any
 * stale client/link pointing at it fails loudly and safely instead of 404
 * hitting an unrelated route. It performs NO Auth or database mutation of
 * any kind and always responds with 410 Gone.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: "endpoint_disabled",
      message:
        "Este caminho de ativação foi desativado por motivos de segurança. " +
        "Crie sua conta pelo cadastro oficial (com confirmação de e-mail) ou " +
        "faça login/recupere sua senha, e depois abra novamente o link do convite.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
