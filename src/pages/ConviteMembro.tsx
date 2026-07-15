/**
 * Public invite page — no auth required to view the invite.
 * Route: /convite-membro/:token
 *
 * IMPORTANT CONCEPT: this is NOT a free signup/login page. The invite belongs
 * to a member who is ALREADY REGISTERED in public.members. The member's
 * registered e-mail (member_email, from members.email) is the fixed binding
 * key between the Auth account and the member record. The user only creates
 * a password — they never choose or edit an e-mail here.
 *
 * The frontend does NOT create/update the Auth user, does NOT decide the
 * user id, and does NOT perform the DB linking. All of that happens
 * server-side in the `activate-member-invite` Edge Function (service role),
 * which delegates the actual linking to the `finalize_member_invite_activation`
 * RPC. The frontend only:
 *   1. Loads and displays the invite (member card + fixed e-mail).
 *   2. Collects a password (+ confirmation).
 *   3. Signs out any stale session on the device.
 *   4. Calls the Edge Function with { token, password }.
 *   5. On success, signs in with the fixed e-mail + password.
 *   6. Full-reloads to /admin only if that sign-in succeeds.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2, XCircle, Loader2, Church, User, MapPin,
  Eye, EyeOff, Mail, Lock, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getInviteByToken,
  activateMemberInviteWithPassword,
  type MemberInvitePublic,
} from "@/lib/memberInvites";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "loading" | "error" | "preview" | "activating" | "done";

// ── Error message mapping ─────────────────────────────────────────────────────

const INVITE_LOAD_ERRORS: Record<string, string> = {
  invalid_token:     "Link de convite inválido.",
  not_found:         "Convite não encontrado.",
  already_accepted:  "Este convite já foi utilizado.",
  revoked:           "Este convite foi revogado.",
  expired:           "Este convite expirou. Solicite um novo ao secretário.",
  invalid_invite:    "Convite inválido.",
  invalid_shape:     "Resposta inválida ao verificar o convite.",
  http_error:        "Não foi possível verificar este convite agora.",
  timeout:           "A verificação do convite demorou muito. Tente novamente.",
  network_error:     "Falha de conexão ao verificar o convite.",
};

const ACTIVATE_ERRORS: Record<string, string> = {
  invalid_token:          "Link de convite inválido.",
  invalid_password:       "A senha deve ter pelo menos 6 caracteres.",
  invite_not_found:       "Convite não encontrado.",
  invite_not_pending:     "Este convite já foi utilizado ou não está mais disponível.",
  invite_expired:         "Este convite expirou. Solicite um novo link à secretaria.",
  organization_mismatch:  "Este convite está inconsistente. Solicite um novo link à secretaria.",
  member_not_found:       "Membro não encontrado.",
  member_email_missing:   "Este membro ainda não possui e-mail cadastrado. Procure a secretaria para atualizar o cadastro.",
  email_mismatch:         "O e-mail da conta não corresponde ao e-mail cadastrado do membro.",
  member_already_linked:  "Este membro já está vinculado a outra conta.",
  existing_org_access:    "Esta conta já possui acesso nesta igreja com outro perfil. Contate o administrador.",
  auth_create_failed:     "Não foi possível criar seu acesso agora. Tente novamente.",
  auth_update_failed:     "Não foi possível atualizar sua senha agora. Tente novamente.",
  auth_user_not_found:    "Não foi possível localizar sua conta. Contate a secretaria.",
  auth_lookup_failed:     "Não foi possível verificar sua conta agora. Tente novamente.",
  server_misconfigured:   "O servidor está temporariamente indisponível. Tente novamente em breve.",
  network_error:          "Falha de conexão ao ativar o convite.",
  invalid_response:       "Resposta inválida do servidor ao ativar o convite.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasMemberEmail(invite: MemberInvitePublic | null): boolean {
  return !!invite?.member_email && invite.member_email.trim().length > 0;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConviteMembro() {
  const { token = "" } = useParams<{ token: string }>();

  const [step, setStep]     = useState<Step>("loading");
  const [invite, setInvite] = useState<MemberInvitePublic | null>(null);
  const [errMsg, setErrMsg] = useState("");

  // Password-creation form state — single fixed-e-mail form, no tabs, no login.
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword]  = useState("");
  const [showPass, setShowPass]                = useState(false);
  const [formError, setFormError]              = useState("");
  const [submitting, setSubmitting]             = useState(false);

  // ── Load invite ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!token || !token.trim()) {
        console.error("[ConviteMembro] token is empty or missing");
        setErrMsg(INVITE_LOAD_ERRORS.invalid_token);
        setStep("error");
        return;
      }

      console.info("[ConviteMembro] token received", token);

      let data: MemberInvitePublic | null = null;
      let error: string | null = null;
      try {
        const result = await getInviteByToken(token);
        data  = result.data;
        error = result.error;
      } catch (e) {
        console.error("[ConviteMembro] getInviteByToken failed", e);
        if (!cancelled) {
          setErrMsg(INVITE_LOAD_ERRORS.network_error);
          setStep("error");
        }
        return;
      }

      if (cancelled) return;

      if (error || !data) {
        console.error("[ConviteMembro] invite load error", error);
        setErrMsg(INVITE_LOAD_ERRORS[error ?? ""] ?? error ?? "Convite inválido.");
        setStep("error");
        return;
      }

      console.info("[ConviteMembro] invite loaded", data.member_name);
      setInvite(data);
      setStep("preview");
    };

    init().catch((e) => {
      console.error("[ConviteMembro] init() unhandled exception", e);
      if (!cancelled) {
        setErrMsg("Erro inesperado ao carregar o convite. Tente novamente.");
        setStep("error");
      }
    });

    // Absolute safety net: getInviteByToken already has its own 20s timeout +
    // 1 retry internally; this just guarantees the UI never stays stuck.
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) {
        setStep((current) => {
          if (current === "loading") {
            console.error("[ConviteMembro] loading timeout — stuck in loading state");
            setErrMsg(INVITE_LOAD_ERRORS.timeout);
            return "error";
          }
          return current;
        });
      }
    }, 25000);

    return () => {
      cancelled = true;
      clearTimeout(loadingTimeout);
    };
  }, [token]);

  // ── Create password → activate on server → sign in → redirect ────────────────
  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const fixedEmail = invite?.member_email?.trim();
    if (!fixedEmail) {
      setFormError("Este membro ainda não possui e-mail cadastrado.");
      return;
    }
    if (!password || password.length < 6) {
      setFormError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      // Always clear any stale session on this device BEFORE activating,
      // so the activation never gets mixed up with a previously logged-in
      // account (e.g. an admin testing on the same phone).
      await supabase.auth.signOut();

      const result = await activateMemberInviteWithPassword(token, password);

      if (!result.success) {
        setFormError(ACTIVATE_ERRORS[result.error ?? ""] ?? result.message ?? "Não foi possível ativar o convite agora.");
        setSubmitting(false);
        return;
      }

      setStep("activating");

      const loginEmail = result.email ?? fixedEmail;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (signInError) {
        console.error("[ConviteMembro] post-activation signIn failed", signInError);
        setFormError(
          "Sua conta foi ativada, mas não foi possível entrar automaticamente. " +
          "Vá para a tela de login e entre com a senha que você acabou de criar.",
        );
        setStep("preview");
        setSubmitting(false);
        return;
      }

      // Success: full page reload is mandatory — ChurchProvider must re-fetch
      // organization_users, which now contains the new member row. A client
      // side navigate() would leave the app believing the user has no church.
      setStep("done");
      setTimeout(() => { window.location.href = "/admin"; }, 1200);
    } catch (err) {
      console.error("[ConviteMembro] handleCreatePassword unexpected exception", err);
      setFormError("Erro inesperado ao ativar o convite. Tente novamente.");
      setStep("preview");
      setSubmitting(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const Header = () => (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
      <Link to="/" className="flex items-center gap-2">
        <Church size={20} className="text-primary" />
        <span className="font-serif text-base font-semibold text-foreground">Ecclesia Online</span>
      </Link>
      <ThemeToggle />
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-sm">Verificando convite...</span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-sm w-full text-center space-y-4">
            <XCircle size={48} className="text-destructive mx-auto" />
            <h1 className="font-serif text-xl font-semibold">Convite inválido</h1>
            <p className="text-sm text-muted-foreground">{errMsg}</p>
            <Link to="/login" className="inline-block text-sm text-primary hover:underline mt-2">
              Ir para o login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Activating ────────────────────────────────────────────────────────────────
  if (step === "activating") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-sm">Ativando acesso...</span>
        </div>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-sm w-full text-center space-y-4">
            <CheckCircle2 size={52} className="text-emerald-500 mx-auto" />
            <h1 className="font-serif text-xl font-semibold">Acesso ativado!</h1>
            <p className="text-sm text-muted-foreground">
              Bem-vindo(a), <strong>{invite?.member_name}</strong>.<br />
              Você está vinculado(a) à <strong>{invite?.church_name}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">Entrando no painel...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview / form ────────────────────────────────────────────────────────────
  const memberHasEmail = hasMemberEmail(invite);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full space-y-5">

          <div className="bg-card rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />

            <div className="px-6 py-6 space-y-5">
              {/* Member info */}
              <div className="flex items-center gap-4">
                {invite?.member_photo ? (
                  <img
                    src={invite.member_photo}
                    alt={invite.member_name}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-border"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                    <User size={24} className="text-accent" />
                  </div>
                )}
                <div>
                  <p className="font-serif text-lg font-semibold leading-tight">{invite?.member_name}</p>
                  <p className="text-sm text-muted-foreground">{invite?.member_role || "Membro"}</p>
                </div>
              </div>

              {/* Church info */}
              <div className="bg-muted/40 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <Church size={14} className="text-primary flex-shrink-0" />
                  <span className="font-medium">{invite?.church_name}</span>
                </div>
                {(invite?.church_city || invite?.church_state) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin size={12} className="flex-shrink-0" />
                    <span>{[invite?.church_city, invite?.church_state].filter(Boolean).join(" — ")}</span>
                  </div>
                )}
                {invite?.congregation && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin size={12} className="flex-shrink-0 opacity-0" />
                    <span>{invite.congregation}</span>
                  </div>
                )}
              </div>

              {/* ── BLOCKED: member has no registered e-mail ── */}
              {!memberHasEmail && (
                <div className="space-y-2 text-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                  <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400 mx-auto" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Este membro ainda não possui e-mail cadastrado. Procure a secretaria para
                    atualizar o cadastro antes de ativar o acesso.
                  </p>
                </div>
              )}

              {/* ── Single password-creation form, fixed/readonly e-mail ── */}
              {memberHasEmail && (
                <form onSubmit={handleCreatePassword} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Mail size={12} /> E-mail cadastrado
                    </label>
                    <input
                      type="email"
                      value={invite?.member_email ?? ""}
                      readOnly
                      disabled
                      className="w-full px-3 py-2.5 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Lock size={12} /> Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="Crie uma senha"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={submitting}
                        className="w-full px-3 py-2.5 pr-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Lock size={12} /> Confirmar senha
                    </label>
                    <input
                      type={showPass ? "text" : "password"}
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={submitting}
                      className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                    />
                  </div>

                  {formError && (
                    <p className="text-xs text-destructive">{formError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Criar senha e entrar
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Ecclesia Online — Plataforma de Gestão Pastoral
          </p>
        </div>
      </div>
    </div>
  );
}
