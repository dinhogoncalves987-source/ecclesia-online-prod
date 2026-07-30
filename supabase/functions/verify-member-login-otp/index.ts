/**
 * verify-member-login-otp — PARTE D (Login por telefone/WhatsApp).
 *
 * Único ponto do sistema que transforma "código de telefone comprovado" em
 * uma sessão real do Supabase Auth. Chamado PELO PRÓPRIO MEMBRO, antes de
 * estar autenticado (ver supabase/config.toml — verify_jwt = false para esta
 * função), com { phone, code } no login normal ou
 * { invite_token, phone, code } na ativação manual enviada pela Secretaria.
 *
 * Por que isto precisa de uma Edge Function (e não só das RPCs da migration
 * 20260802100000_member_login_otp_foundation.sql):
 *   - a emissão de uma sessão real (access_token + refresh_token) depende da
 *     Admin API do GoTrue (service_role), que não existe dentro de Postgres;
 *   - esta função é o ÚNICO lugar do projeto autorizado a usar
 *     `admin.generateLink` / `admin.createUser` para o fluxo de telefone —
 *     nunca reseta senha, nunca atualiza um auth.users já existente (ver
 *     nota de segurança em supabase/functions/activate-member-invite —
 *     aquele endpoint foi desativado por fazer exatamente esse tipo de
 *     escrita a partir de um token público; este aqui NUNCA chama
 *     `updateUserById`).
 *
 * Fluxo:
 *   1. Body { phone, code } → chama `_verify_member_login_otp_internal`
 *      (service_role) — a MESMA validação atômica de hash/expiração/
 *      tentativa máxima/uso único usada por todo o resto da Parte D. Se
 *      retornar ok=false, este endpoint devolve o erro tal como veio, sem
 *      nunca revelar mais detalhe do que a própria RPC.
 *   2. Com `member_id` confirmado (posse do telefone provada), busca o
 *      membro (service_role) e decide o "e-mail-ponte" do Supabase Auth:
 *        - se `members.email` existir, usa-o (a mesma ponte já usada por
 *          member_invites/accept_member_invite);
 *        - caso contrário, sintetiza um e-mail interno determinístico
 *          (`otp-member-<member_id>@members.ecclesiaonline.internal`) —
 *          nunca exibido ao membro, nunca uma prova de identidade por si
 *          só (a prova já ocorreu no passo 1), existe apenas porque o
 *          GoTrue exige um identificador de conta e esta operação NÃO ativa
 *          o provedor de telefone do Supabase (isso exigiria um gateway SMS
 *          real, proibido nesta operação). Este é um ponto explícito para
 *          revisão do Codex (ver docs/architecture/auditoria-tv-canal-chat-
 *          otp.md).
 *   3. Se `members.user_id` já existir, reaproveita a conta Auth vinculada
 *      (nunca cria uma segunda). Caso contrário, localiza ou cria a conta
 *      pelo e-mail-ponte e vincula com `link_member_auth_user` (RPC
 *      idempotente — nunca sobrescreve um vínculo para outro usuário).
 *   4. Gera um `magiclink` (Admin API) só para extrair `hashed_token` —
 *      NUNCA envia e-mail (generateLink não dispara nenhum transporte por
 *      si só). Devolve `{ ok: true, email, token_hash }` ao chamador, que
 *      troca isso por uma sessão real chamando, no PRÓPRIO NAVEGADOR:
 *        supabase.auth.verifyOtp({ email, token_hash, type: "magiclink" })
 *      Esta troca final acontece inteiramente pelo SDK oficial do
 *      Supabase — esta função nunca fabrica um JWT manualmente.
 */
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

const SYNTHETIC_EMAIL_DOMAIN = "members.ecclesiaonline.internal";

function syntheticEmailFor(memberId: string): string {
  return `otp-member-${memberId}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "supabase_secrets_not_configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const phone = typeof body?.phone === "string" ? body.phone : "";
    const code = typeof body?.code === "string" ? body.code : "";
    const inviteToken = typeof body?.invite_token === "string" ? body.invite_token.trim() : "";
    if (!phone.trim() || !code.trim()) {
      return jsonResponse({ ok: false, error: "missing_phone_or_code" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fail-closed de defesa em profundidade para login espontâneo. Convite
    // manual usa um desafio próprio, já autorizado por um responsável e
    // vinculado ao token de convite; por isso não depende do transport_mode
    // global (e continua sem qualquer envio automático).
    // por algum motivo aceitasse um desafio órfão, esta função nunca emite
    // sessão se o transporte estiver 'disabled' (produção, por padrão).
    if (!inviteToken) {
      const { data: settings, error: settingsError } = await adminClient
        .from("member_otp_settings")
        .select("transport_mode")
        .limit(1)
        .maybeSingle();
      if (settingsError) {
        return jsonResponse({ ok: false, error: "settings_unavailable" }, 500);
      }
      if (!settings || settings.transport_mode === "disabled") {
        return jsonResponse({ ok: false, error: "otp_disabled" }, 403);
      }
    }

    const { data: verifyResult, error: verifyError } = inviteToken
      ? await adminClient.rpc(
          "_verify_member_invite_otp_internal",
          { p_invite_token: inviteToken, p_phone: phone, p_code: code },
        )
      : await adminClient.rpc(
          "_verify_member_login_otp_internal",
          { p_phone: phone, p_code: code },
        );
    if (verifyError) {
      console.error("verify-member-login-otp: _verify_member_login_otp_internal error", verifyError.message);
      return jsonResponse({ ok: false, error: "verification_failed" }, 500);
    }
    if (!verifyResult?.ok) {
      // Repassa o erro estruturado da RPC (invalid_code, challenge_expired,
      // max_attempts_exceeded, no_active_challenge, ...) — nunca inventa um
      // motivo diferente do que a validação atômica já decidiu.
      return jsonResponse(verifyResult ?? { ok: false, error: "invalid_code" }, 401);
    }

    const memberId: string = verifyResult.member_id;

    const { data: member, error: memberError } = await adminClient
      .from("members")
      .select("id, user_id, email, full_name")
      .eq("id", memberId)
      .maybeSingle();
    if (memberError || !member) {
      return jsonResponse({ ok: false, error: "member_not_found" }, 404);
    }

    let targetUserId: string | null = member.user_id ?? null;
    let bridgeEmail: string;

    if (targetUserId) {
      // Membro já tem conta Auth vinculada — reaproveita, nunca cria outra.
      const { data: existingUser, error: getUserError } = await adminClient.auth.admin.getUserById(targetUserId);
      if (getUserError || !existingUser?.user?.email) {
        return jsonResponse({ ok: false, error: "linked_account_unavailable" }, 500);
      }
      bridgeEmail = existingUser.user.email;
    } else {
      bridgeEmail = member.email && member.email.trim() ? member.email.trim() : syntheticEmailFor(member.id);

      // Tenta localizar uma conta Auth já existente com este e-mail (ex.: o
      // membro tem e-mail cadastrado e já se cadastrou por e-mail antes, mas
      // ainda não vinculou members.user_id). Nunca cria uma segunda pessoa —
      // se existir, apenas vincula.
      const { data: listResult, error: listError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        // @ts-expect-error — filtro por e-mail exato suportado pela Admin API do GoTrue.
        email: bridgeEmail,
      });
      const foundUser = !listError
        ? listResult?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === bridgeEmail.toLowerCase())
        : undefined;

      if (foundUser) {
        targetUserId = foundUser.id;
      } else {
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email: bridgeEmail,
          email_confirm: true,
          user_metadata: { login_via: "phone_otp", member_id: member.id },
        });
        if (createError || !created?.user) {
          console.error("verify-member-login-otp: createUser error", createError?.message);
          return jsonResponse({ ok: false, error: "account_creation_failed" }, 500);
        }
        targetUserId = created.user.id;
      }

      const { data: linkResult, error: linkError } = await adminClient.rpc("link_member_auth_user", {
        p_member_id: member.id,
        p_user_id: targetUserId,
      });
      if (linkError || !linkResult?.ok) {
        console.error("verify-member-login-otp: link_member_auth_user failed", linkError?.message ?? linkResult?.error);
        return jsonResponse({ ok: false, error: linkResult?.error ?? "link_failed" }, 409);
      }
    }

    const { data: linkData, error: generateLinkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: bridgeEmail,
    });
    if (generateLinkError || !linkData?.properties?.hashed_token) {
      console.error("verify-member-login-otp: generateLink error", generateLinkError?.message);
      return jsonResponse({ ok: false, error: "session_bridge_failed" }, 500);
    }

    return jsonResponse({
      ok: true,
      email: bridgeEmail,
      token_hash: linkData.properties.hashed_token,
      member_id: member.id,
      member_name: member.full_name,
    });
  } catch (error) {
    console.error("verify-member-login-otp error:", error);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
