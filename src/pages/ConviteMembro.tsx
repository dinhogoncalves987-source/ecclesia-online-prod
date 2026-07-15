/**
 * Public invite page — no auth required to view the invite.
 * Route: /convite-membro/:token
 *
 * IMPORTANT CONCEPT: this is NOT a free signup/login page. The invite belongs
 * to a member who is ALREADY REGISTERED in public.members. The member's
 * registered e-mail (member_email, from members.email) is the fixed binding
 * key between the Auth account and the member record. The user never chooses
 * or edits an e-mail here.
 *
 * SECURITY MODEL (see hardening review of commit ee86c3d):
 * - There is NO server-side path (Edge Function or otherwise) that resets the
 *   password of a pre-existing Auth account from this public page. That
 *   capability has been removed entirely.
 * - New member (no account yet): we use the OFFICIAL Supabase `signUp` flow
 *   with the member's fixed e-mail. E-mail confirmation is REQUIRED — the
 *   invite is only finalized after Supabase reports a real, confirmed,
 *   authenticated session (never `email_confirm: true` bypasses).
 * - Existing member (already has an Auth account): they must log in normally
 *   or recover their password through the official `/forgot-password` flow.
 *   Once authenticated, the invite is finalized using their real session
 *   (`auth.uid()` + a normalized `auth.email()` <-> `members.email` check),
 *   via the `accept_member_invite` RPC — never a service-role/admin path.
 * - The frontend never sends an e-mail or a user id to any backend call for
 *   linking — only the invite token, and (for sign-up only) a password the
 *   member just chose for the FIXED e-mail shown on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import {
  CheckCircle2, XCircle, Loader2, Church, User, MapPin,
  Eye, EyeOff, Mail, Lock, AlertTriangle, LogOut, MailCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getInviteByToken,
  acceptMemberInvite,
  signUpForMemberInvite,
  buildInviteUrl,
  isAlreadyRegisteredSignUp,
  emailsMatch,
  type MemberInvitePublic,
} from "@/lib/memberInvites";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "loading" | "error" | "form" | "linking" | "done";

type FormMode =
  | "signup"            // no session yet — password-creation form (default)
  | "check_email"       // signed up, waiting for e-mail confirmation
  | "existing_account"  // signUp detected an already-registered e-mail
  | "session_mismatch"  // authenticated, but with the WRONG account
  | "link_error";        // authenticated + matching, but acceptMemberInvite failed

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

const ACCEPT_ERRORS: Record<string, string> = {
  not_authenticated:      "Sua sessão expirou. Faça login novamente para concluir a ativação.",
  invite_not_found:       "Convite não encontrado.",
  invite_not_pending:     "Este convite já foi utilizado ou não está mais disponível.",
  invite_expired:         "Este convite expirou. Solicite um novo link à secretaria.",
  organization_mismatch:  "Este convite está inconsistente. Solicite um novo link à secretaria.",
  member_not_found:       "Membro não encontrado.",
  member_email_missing:   "Este membro ainda não possui e-mail cadastrado. Procure a secretaria para atualizar o cadastro.",
  email_mismatch:         "O e-mail da sua conta não corresponde ao e-mail cadastrado do membro.",
  member_already_linked:  "Este membro já está vinculado a outra conta.",
  existing_org_access:    "Esta conta já possui acesso nesta igreja com outro perfil. Contate o administrador.",
  rpc_error:              "Não foi possível concluir a vinculação agora. Tente novamente.",
  empty_response:         "Não foi possível concluir a vinculação agora. Tente novamente.",
};

/** Errors where signing out and retrying with a different account can help. */
const IDENTITY_ACCEPT_ERRORS = new Set(["email_mismatch", "member_already_linked", "existing_org_access"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasMemberEmail(invite: MemberInvitePublic | null): boolean {
  return !!invite?.member_email && invite.member_email.trim().length > 0;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConviteMembro() {
  const { token = "" } = useParams<{ token: string }>();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep]     = useState<Step>("loading");
  const [invite, setInvite] = useState<MemberInvitePublic | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const [formMode, setFormMode] = useState<FormMode>("signup");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass]                = useState(false);
  const [formError, setFormError]              = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [linkError, setLinkError]               = useState("");
  const [linkErrorCode, setLinkErrorCode]        = useState("");
  const [resendState, setResendState]           = useState<"idle" | "sending" | "sent">("idle");

  // Only auto-attempt the finalize-link RPC once per (invite, user) pair —
  // otherwise a failed attempt (e.g. invite_expired) would loop forever, since
  // the triggering effect re-runs whenever `user`/`step` settle back to "form".
  const triedAutoAcceptRef = useRef<string | null>(null);

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

      setInvite(data);
      setStep("form");
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

  const fixedEmail     = invite?.member_email?.trim() ?? "";
  const memberHasEmail = hasMemberEmail(invite);

  // ── Finalize the link (safe RPC: auth.uid() + auth.email() vs members.email) ──
  const runAcceptMemberInvite = useCallback(async (userId: string) => {
    setStep("linking");
    setLinkError("");
    setLinkErrorCode("");
    try {
      const result = await acceptMemberInvite(token, userId);

      if (!result.success) {
        console.error("[ConviteMembro] acceptMemberInvite failed", result.error);
        setLinkError(ACCEPT_ERRORS[result.error ?? ""] ?? result.message ?? "Não foi possível concluir a vinculação agora.");
        setLinkErrorCode(result.error ?? "");
        setFormMode("link_error");
        setStep("form");
        return;
      }

      setStep("done");
      // Full page reload is mandatory — ChurchProvider must re-fetch
      // organization_users, which now contains the new member row. A client
      // side navigate() would leave the app believing the user has no church.
      setTimeout(() => { window.location.href = "/admin"; }, 1200);
    } catch (e) {
      console.error("[ConviteMembro] acceptMemberInvite unexpected exception", e);
      setLinkError("Erro inesperado ao concluir a vinculação. Tente novamente.");
      setLinkErrorCode("unexpected_error");
      setFormMode("link_error");
      setStep("form");
    }
  }, [token]);

  // ── React to the real auth session: this is what finalizes the invite both
  // right after e-mail confirmation (redirected back to this page) and right
  // after a normal login (redirected back via /login's `state.from`). ──────────
  useEffect(() => {
    if (step !== "form") return;
    if (authLoading || !invite || !memberHasEmail) return;
    if (!user) return; // no session yet — stay on whatever formMode is active

    if (!emailsMatch(user.email, fixedEmail)) {
      setFormMode("session_mismatch");
      return;
    }

    if (triedAutoAcceptRef.current === user.id) return;
    triedAutoAcceptRef.current = user.id;
    runAcceptMemberInvite(user.id);
  }, [step, authLoading, user, invite, memberHasEmail, fixedEmail, runAcceptMemberInvite]);

  // ── Create account (new member) → wait for e-mail confirmation ───────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

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
      const { data, error } = await signUpForMemberInvite(fixedEmail, password, token);

      if (error) {
        console.error("[ConviteMembro] signUp error", error);
        setFormError(error.message || "Não foi possível criar sua conta agora. Tente novamente.");
        setSubmitting(false);
        return;
      }

      if (isAlreadyRegisteredSignUp(data)) {
        setFormMode("existing_account");
        setSubmitting(false);
        return;
      }

      // Expected path: e-mail confirmation is required, so no session comes
      // back yet. The user must click the link in their inbox, which
      // redirects to this same page and lets the effect above finish the
      // link automatically once `useAuth()` reports the confirmed session.
      setFormMode("check_email");
      setSubmitting(false);
    } catch (err) {
      console.error("[ConviteMembro] handleSignUp unexpected exception", err);
      setFormError("Erro inesperado ao criar sua conta. Tente novamente.");
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (resendState === "sending" || !fixedEmail) return;
    setResendState("sending");
    try {
      await supabase.auth.resend({
        type: "signup",
        email: fixedEmail,
        options: { emailRedirectTo: buildInviteUrl(token) },
      });
    } catch (e) {
      console.error("[ConviteMembro] resend confirmation failed", e);
    }
    setResendState("sent");
    setTimeout(() => setResendState("idle"), 5000);
  };

  const handleSignOutAndRetry = async () => {
    triedAutoAcceptRef.current = null;
    setLinkError("");
    setLinkErrorCode("");
    setFormMode("signup");
    await supabase.auth.signOut();
  };

  const handleRetryLink = () => {
    if (!user) return;
    triedAutoAcceptRef.current = null;
    runAcceptMemberInvite(user.id);
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

  const MiniStatus = ({ text }: { text: string }) => (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-sm">{text}</span>
      </div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return <MiniStatus text="Verificando convite..." />;
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

  // ── Linking (finalizing with the authenticated session) ──────────────────────
  if (step === "linking") {
    return <MiniStatus text="Vinculando seu acesso..." />;
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

  // ── Form step: member card + password/login flow ─────────────────────────────
  const MemberCard = () => (
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
  );

  const ChurchInfo = () => (
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
  );

  const loginStateFrom = { from: { pathname: location.pathname } };

  let body: React.ReactNode;

  if (!memberHasEmail) {
    body = (
      <div className="space-y-2 text-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
        <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400 mx-auto" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Este membro ainda não possui e-mail cadastrado. Procure a secretaria para
          atualizar o cadastro antes de ativar o acesso.
        </p>
      </div>
    );
  } else if (authLoading) {
    body = (
      <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Verificando sua sessão...</span>
      </div>
    );
  } else if (formMode === "session_mismatch") {
    body = (
      <div className="space-y-3 text-center">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 space-y-2">
          <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400 mx-auto" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Você está conectado(a) com uma conta diferente da conta deste membro
            (<strong>{fixedEmail}</strong>). Saia desta conta para continuar.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOutAndRetry}
          className="w-full py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={15} /> Sair desta conta
        </button>
      </div>
    );
  } else if (formMode === "link_error") {
    const identityIssue = IDENTITY_ACCEPT_ERRORS.has(linkErrorCode);
    body = (
      <div className="space-y-3 text-center">
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 space-y-2">
          <XCircle size={22} className="text-destructive mx-auto" />
          <p className="text-sm text-destructive">{linkError}</p>
        </div>
        {identityIssue ? (
          <button
            type="button"
            onClick={handleSignOutAndRetry}
            className="w-full py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={15} /> Sair e tentar com outra conta
          </button>
        ) : user ? (
          <button
            type="button"
            onClick={handleRetryLink}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Tentar novamente
          </button>
        ) : (
          <Link
            to="/login"
            state={loginStateFrom}
            className="inline-block text-sm text-primary hover:underline"
          >
            Ir para o login
          </Link>
        )}
      </div>
    );
  } else if (formMode === "existing_account") {
    body = (
      <div className="space-y-3 text-center">
        <div className="bg-muted/40 border border-border/50 rounded-xl px-4 py-3 space-y-2">
          <Mail size={22} className="text-primary mx-auto" />
          <p className="text-sm text-foreground">
            Já existe uma conta para <strong>{fixedEmail}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Faça login normalmente ou recupere sua senha. Você voltará para esta página
            automaticamente para concluir a ativação.
          </p>
        </div>
        <Link
          to="/login"
          state={loginStateFrom}
          className="w-full inline-flex items-center justify-center py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Fazer login
        </Link>
        <Link
          to="/forgot-password"
          className="inline-block text-sm text-primary hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>
    );
  } else if (formMode === "check_email") {
    body = (
      <div className="space-y-3 text-center">
        <div className="bg-muted/40 border border-border/50 rounded-xl px-4 py-3 space-y-2">
          <MailCheck size={26} className="text-primary mx-auto" />
          <p className="text-sm text-foreground">
            Enviamos um link de confirmação para <strong>{fixedEmail}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Abra seu e-mail e clique no link para confirmar. Você voltará automaticamente
            para esta página com o acesso ativado.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResendConfirmation}
          disabled={resendState === "sending"}
          className="text-sm text-primary hover:underline disabled:opacity-60"
        >
          {resendState === "sending" && "Reenviando..."}
          {resendState === "sent" && "E-mail reenviado!"}
          {resendState === "idle" && "Reenviar e-mail de confirmação"}
        </button>
      </div>
    );
  } else {
    // formMode === "signup" — default: password-creation form for a new member.
    body = (
      <form onSubmit={handleSignUp} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Mail size={12} /> E-mail cadastrado
          </label>
          <input
            type="email"
            value={fixedEmail}
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
          Criar senha e ativar acesso
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Já tem uma conta com este e-mail?{" "}
          <Link to="/login" state={loginStateFrom} className="text-primary hover:underline">
            Fazer login
          </Link>
        </p>
      </form>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full space-y-5">

          <div className="bg-card rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />

            <div className="px-6 py-6 space-y-5">
              <MemberCard />
              <ChurchInfo />
              {body}
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
