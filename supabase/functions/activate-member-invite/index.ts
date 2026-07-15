/**
 * activate-member-invite
 *
 * Server-side activation of a member invite. This is the ONLY place that is
 * allowed to create/update the Auth user and link it to a `members` row.
 * The frontend never calls `supabase.auth.signUp` for this flow — it only
 * collects a password and posts it here.
 *
 * Security model:
 * - Uses the service role key (never exposed to the client).
 * - The e-mail is NEVER accepted from the request body — it is always
 *   resolved server-side from `members.email` via the invite's `member_id`.
 * - The `user_id` is NEVER accepted from the request body — it is always
 *   resolved server-side (existing Auth user found by e-mail, or a newly
 *   created one).
 * - The actual DB linking (members.user_id, organization_users, invite
 *   status) is delegated to `public.finalize_member_invite_activation`,
 *   a SECURITY DEFINER RPC that is only grantable to `service_role` and
 *   re-validates everything (token, expiry, e-mail match, existing links)
 *   independently of this function.
 *
 * POST body: { "token": string, "password": string }
 * Response:  { success, email?, member_id?, organization_id?, error?, message? }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MemberInviteRow {
  id: string;
  token: string;
  member_id: string;
  organization_id: string;
  status: string;
  expires_at: string;
}

interface MemberRow {
  id: string;
  user_id: string | null;
  organization_id: string;
  email: string | null;
  full_name: string | null;
}

/**
 * GoTrue admin `listUsers` has no reliable server-side e-mail filter across
 * all Supabase versions, so we paginate and match client-side. Church member
 * counts are small enough that this is safe; the cap below is a hard safety
 * limit, not an expected ceiling.
 */
async function findAuthUserByEmail(
  // deno-lint-ignore no-explicit-any
  admin: any,
  email: string,
) {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  const maxPages = 20;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find(
      // deno-lint-ignore no-explicit-any
      (u: any) => (u.email ?? "").trim().toLowerCase() === target,
    );
    if (found) return found;

    if (users.length < perPage) return null; // last page reached
  }

  return null;
}

type PreValidation = { ok: true } | { ok: false; error: string; message: string };

/**
 * Pre-validates that `candidateUserId` (an EXISTING Auth user found by e-mail)
 * can legitimately be linked to this invite, BEFORE we touch its password.
 *
 * This mirrors the core rules of `finalize_member_invite_activation`, but runs
 * here so that a doomed activation (invite already used, member linked to
 * someone else, account already an admin elsewhere, etc.) never causes us to
 * overwrite the password of a pre-existing account first and fail afterwards.
 */
async function preValidateExistingUserForInvite(
  // deno-lint-ignore no-explicit-any
  admin: any,
  invite: MemberInviteRow,
  member: MemberRow,
  memberEmail: string,
  candidateUserId: string,
  candidateEmail: string,
): Promise<PreValidation> {
  if (invite.status !== "pending") {
    return {
      ok: false,
      error: "invite_not_pending",
      message: "Este convite ja foi utilizado ou nao esta mais disponivel.",
    };
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      error: "invite_expired",
      message: "Este convite expirou. Solicite um novo link a secretaria.",
    };
  }

  if (member.organization_id !== invite.organization_id) {
    return {
      ok: false,
      error: "organization_mismatch",
      message: "O convite nao pertence a mesma organizacao do membro.",
    };
  }

  if (!memberEmail) {
    return {
      ok: false,
      error: "member_email_missing",
      message: "Este membro nao possui e-mail cadastrado. Procure a secretaria para atualizar o cadastro.",
    };
  }

  if ((candidateEmail ?? "").trim().toLowerCase() !== memberEmail.trim().toLowerCase()) {
    return {
      ok: false,
      error: "email_mismatch",
      message: "O e-mail da conta encontrada nao corresponde ao e-mail cadastrado do membro.",
    };
  }

  if (member.user_id && member.user_id !== candidateUserId) {
    return {
      ok: false,
      error: "member_already_linked",
      message: "Este membro ja esta vinculado a outra conta.",
    };
  }

  const { data: existingOrgUser, error: orgUserError } = await admin
    .from("organization_users")
    .select("role, is_active")
    .eq("organization_id", invite.organization_id)
    .eq("user_id", candidateUserId)
    .maybeSingle<{ role: string; is_active: boolean }>();

  if (orgUserError) {
    console.error("[activate-member-invite] organization_users pre-check error", orgUserError);
    return {
      ok: false,
      error: "org_access_check_failed",
      message: "Nao foi possivel verificar o acesso atual desta conta.",
    };
  }

  if (existingOrgUser && existingOrgUser.role !== "member") {
    return {
      ok: false,
      error: "existing_org_access",
      message: "Esta conta ja possui acesso nesta igreja com outro perfil. Contate o administrador.",
    };
  }

  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "method_not_allowed", message: "Metodo nao permitido." },
      405,
    );
  }

  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { success: false, error: "invalid_body", message: "Corpo da requisicao invalido." },
      400,
    );
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) {
    return jsonResponse(
      { success: false, error: "invalid_token", message: "Token obrigatorio." },
      400,
    );
  }

  if (!password || password.length < 6) {
    return jsonResponse(
      { success: false, error: "invalid_password", message: "A senha deve ter pelo menos 6 caracteres." },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[activate-member-invite] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse(
      { success: false, error: "server_misconfigured", message: "Configuracao do servidor incompleta." },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Load invite (service role bypasses RLS)
    const { data: invite, error: inviteError } = await admin
      .from("member_invites")
      .select("id, token, member_id, organization_id, status, expires_at")
      .eq("token", token)
      .maybeSingle<MemberInviteRow>();

    if (inviteError) {
      console.error("[activate-member-invite] invite lookup error", inviteError);
      return jsonResponse(
        { success: false, error: "invite_lookup_failed", message: "Nao foi possivel verificar o convite." },
        500,
      );
    }
    if (!invite) {
      return jsonResponse(
        { success: false, error: "invite_not_found", message: "Convite nao encontrado." },
        404,
      );
    }
    if (invite.status !== "pending") {
      return jsonResponse(
        {
          success: false,
          error: "invite_not_pending",
          message: "Este convite ja foi utilizado ou nao esta mais disponivel.",
        },
        409,
      );
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return jsonResponse(
        {
          success: false,
          error: "invite_expired",
          message: "Este convite expirou. Solicite um novo link a secretaria.",
        },
        409,
      );
    }

    // 2. Load member (the fixed e-mail comes from here — never from the request body)
    const { data: member, error: memberError } = await admin
      .from("members")
      .select("id, user_id, organization_id, email, full_name")
      .eq("id", invite.member_id)
      .maybeSingle<MemberRow>();

    if (memberError) {
      console.error("[activate-member-invite] member lookup error", memberError);
      return jsonResponse(
        { success: false, error: "member_lookup_failed", message: "Nao foi possivel verificar o membro." },
        500,
      );
    }
    if (!member) {
      return jsonResponse(
        { success: false, error: "member_not_found", message: "Membro nao encontrado." },
        404,
      );
    }
    if (member.organization_id !== invite.organization_id) {
      return jsonResponse(
        {
          success: false,
          error: "organization_mismatch",
          message: "O convite nao pertence a mesma organizacao do membro.",
        },
        409,
      );
    }

    const memberEmail = typeof member.email === "string" ? member.email.trim() : "";
    if (!memberEmail) {
      return jsonResponse(
        {
          success: false,
          error: "member_email_missing",
          message: "Este membro nao possui e-mail cadastrado. Procure a secretaria para atualizar o cadastro.",
        },
        409,
      );
    }

    // 3. Find or create the Auth user for this fixed e-mail.
    // deno-lint-ignore no-explicit-any
    let authUser: any = null;
    let createdNewUser = false;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: memberEmail,
      password,
      email_confirm: true,
      user_metadata: {
        member_id: member.id,
        organization_id: invite.organization_id,
        role: "member",
      },
    });

    if (createError) {
      const alreadyExists = /already registered|already exists|already been registered/i.test(
        createError.message ?? "",
      );

      if (!alreadyExists) {
        console.error("[activate-member-invite] createUser error", createError);
        return jsonResponse(
          { success: false, error: "auth_create_failed", message: createError.message ?? "Nao foi possivel criar o usuario." },
          500,
        );
      }

      // Account already exists for this e-mail — find it, but do NOT touch its
      // password yet. We must first confirm this candidate can legitimately be
      // linked to this invite, otherwise a doomed activation (invite already
      // used, member linked to someone else, account already an admin, etc.)
      // would have overwritten a pre-existing user's password for nothing.
      let existing;
      try {
        existing = await findAuthUserByEmail(admin, memberEmail);
      } catch (e) {
        console.error("[activate-member-invite] findAuthUserByEmail exception", e);
        return jsonResponse(
          { success: false, error: "auth_lookup_failed", message: "Nao foi possivel localizar a conta existente." },
          500,
        );
      }

      if (!existing) {
        return jsonResponse(
          {
            success: false,
            error: "auth_user_not_found",
            message: "Nao foi possivel localizar a conta existente para este e-mail.",
          },
          500,
        );
      }

      // ── Pre-validation gate: no password change happens before this passes ──
      const preValidation = await preValidateExistingUserForInvite(
        admin,
        invite,
        member,
        memberEmail,
        existing.id,
        existing.email ?? memberEmail,
      );

      if (!preValidation.ok) {
        console.error(
          "[activate-member-invite] pre-validation blocked password update",
          preValidation.error,
        );
        return jsonResponse(
          { success: false, error: preValidation.error, message: preValidation.message },
          409,
        );
      }

      const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });

      if (updateError) {
        console.error("[activate-member-invite] updateUserById error", updateError);
        return jsonResponse(
          { success: false, error: "auth_update_failed", message: updateError.message ?? "Nao foi possivel atualizar a senha." },
          500,
        );
      }

      authUser = updated.user;
    } else {
      authUser = created.user;
      createdNewUser = true;
    }

    if (!authUser?.id) {
      console.error("[activate-member-invite] no authUser after create/update flow");
      return jsonResponse(
        { success: false, error: "auth_user_missing", message: "Nao foi possivel determinar o usuario." },
        500,
      );
    }

    // 4. Finalize the link server-side (RPC re-validates everything independently).
    const { data: finalizeData, error: finalizeError } = await admin.rpc(
      "finalize_member_invite_activation",
      { p_token: token, p_user_id: authUser.id },
    );

    if (finalizeError) {
      console.error("[activate-member-invite] finalize RPC error", finalizeError);

      if (createdNewUser) {
        console.error(
          "[activate-member-invite] created auth user but finalize failed — attempting rollback",
          { userId: authUser.id },
        );
        const { error: deleteError } = await admin.auth.admin.deleteUser(authUser.id);
        if (deleteError) {
          console.error("[activate-member-invite] rollback deleteUser also failed", deleteError);
        }
      }

      return jsonResponse(
        { success: false, error: "finalize_failed", message: finalizeError.message ?? "Nao foi possivel finalizar a ativacao." },
        500,
      );
    }

    const finalizeResult = finalizeData as
      | { success: boolean; error?: string; message?: string; member_id?: string; organization_id?: string }
      | null;

    if (!finalizeResult || !finalizeResult.success) {
      if (createdNewUser) {
        console.error(
          "[activate-member-invite] created auth user but finalize failed",
          { userId: authUser.id, result: finalizeResult },
        );
        const { error: deleteError } = await admin.auth.admin.deleteUser(authUser.id);
        if (deleteError) {
          console.error("[activate-member-invite] rollback deleteUser also failed", deleteError);
        }
      } else {
        console.error("[activate-member-invite] finalize RPC returned failure", finalizeResult);
      }

      return jsonResponse(
        {
          success: false,
          error: finalizeResult?.error ?? "finalize_failed",
          message: finalizeResult?.message ?? "Nao foi possivel finalizar a ativacao.",
        },
        409,
      );
    }

    return jsonResponse({
      success: true,
      email: memberEmail,
      member_id: finalizeResult.member_id ?? member.id,
      organization_id: finalizeResult.organization_id ?? invite.organization_id,
    });
  } catch (e) {
    console.error("[activate-member-invite] unexpected exception", e);
    return jsonResponse(
      { success: false, error: "unexpected_error", message: "Erro inesperado ao ativar o convite." },
      500,
    );
  }
});
