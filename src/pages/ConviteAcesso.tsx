/**
 * Public access invite page — no auth required to view the invite.
 * Route: /convite-acesso/:token
 *
 * Security model:
 *  - If the invite has an e-mail, ONLY a user logged in with that exact e-mail
 *    may accept the invite.  Any other logged-in user sees a "wrong account"
 *    screen and is offered the chance to sign out first.
 *  - The backend RPC (accept_access_invite) also validates this independently,
 *    so a crafted request cannot bypass the frontend check.
 *
 * Steps:
 *  loading       → fetching invite + current session
 *  auth          → not logged in → inline login / signup
 *  wrong_account → logged in as a different e-mail → block + offer logout
 *  preview       → logged in as the correct e-mail → confirm & accept
 *  accepting     → RPC in flight
 *  done          → success → redirect to /admin
 *  error         → any unrecoverable error
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, XCircle, Loader2, LogOut,
  Shield, User, MapPin, LogIn, UserPlus, Eye, EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAccessInviteByToken, acceptAccessInvite, type AccessInvitePublic,
  buildAccessInviteUrl,
} from "@/lib/accessInvites";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "loading" | "error" | "wrong_account" | "preview" | "auth" | "accepting" | "done";

const ROLE_LABELS: Record<string, string> = {
  church_admin: "Administrador",
  tesoureiro:   "Tesoureiro",
  contador:     "Contador",
  pastor:       "Pastor",
  secretary:    "Secretário(a)",
  leader:       "Líder",
  member:       "Membro",
};

// ── Helper ────────────────────────────────────────────────────────────────────

/** Returns true when inviteEmail is set AND does not match the current user. */
function isEmailMismatch(inviteEmail: string | null | undefined, currentEmail: string | null): boolean {
  if (!inviteEmail || inviteEmail.trim() === "") return false; // no restriction
  if (!currentEmail) return true; // not logged in at all
  return inviteEmail.toLowerCase().trim() !== currentEmail.toLowerCase().trim();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConviteAcesso() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate         = useNavigate();

  const [step, setStep]               = useState<Step>("loading");
  const [invite, setInvite]           = useState<AccessInvitePublic | null>(null);
  const [errMsg, setErrMsg]           = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Auth form state
  const [authMode, setAuthMode]       = useState<"login" | "signup">("login");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError]     = useState("");

  // ── Init: load invite + check current session ─────────────────────────────

  useEffect(() => {
    const init = async () => {
      // 1. Get current user (may be null if not logged in)
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email?.toLowerCase().trim() ?? null;
      setCurrentUserEmail(userEmail);

      // 2. Fetch invite details (public RPC — no auth required)
      const { data, error } = await getAccessInviteByToken(token);
      if (error || !data) {
        const friendly: Record<string, string> = {
          not_found:        "Convite não encontrado.",
          already_accepted: "Este convite já foi utilizado.",
          revoked:          "Este convite foi revogado.",
          expired:          "Este convite expirou. Solicite um novo ao administrador.",
        };
        setErrMsg(friendly[error ?? ""] ?? error ?? "Convite inválido.");
        setStep("error");
        return;
      }
      setInvite(data);

      // 3. Decide next step based on current session + email match
      if (!user) {
        // Not logged in → show login/signup form, pre-fill invite e-mail
        if (data.email) setEmail(data.email);
        setStep("auth");
        return;
      }

      // Logged in — check e-mail match
      if (isEmailMismatch(data.email, userEmail)) {
        setStep("wrong_account");
      } else {
        setStep("preview");
      }
    };
    void init();
  }, [token]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Accept the invite — only reached when emails are confirmed to match. */
  const handleAccept = async () => {
    setStep("accepting");
    const { error } = await acceptAccessInvite(token);
    if (error) {
      const friendly: Record<string, string> = {
        already_accepted:     "Este convite já foi utilizado.",
        email_mismatch:       "Este convite pertence a outro e-mail. Faça login com o e-mail correto.",
        expired_or_revoked:   "Este convite expirou ou foi revogado.",
        not_authenticated:    "Você precisa estar autenticado para aceitar este convite.",
        invite_email_missing: "Este convite não possui e-mail cadastrado. Solicite um novo link ao administrador.",
        existing_org_access:  "Esta conta já possui acesso nesta igreja. Contate o administrador para alterar o papel.",
      };
      setErrMsg(friendly[error] ?? `Erro: ${error}`);
      setStep("error");
      return;
    }
    setStep("done");
    setTimeout(() => navigate("/admin"), 2000);
  };

  /** Sign out the wrong user, then go to auth step. */
  const handleSignOutAndContinue = async () => {
    await supabase.auth.signOut();
    setCurrentUserEmail(null);
    if (invite?.email) setEmail(invite.email);
    setAuthMode("login");
    setStep("auth");
  };

  /** Auth form submission (login or signup). */
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setAuthError(error.message); return; }
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: invite?.full_name || "" } },
        });
        if (error) { setAuthError(error.message); return; }
      }

      // Re-validate email after auth
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email?.toLowerCase().trim() ?? null;
      setCurrentUserEmail(userEmail);

      if (invite && isEmailMismatch(invite.email, userEmail)) {
        setStep("wrong_account");
      } else {
        setStep("preview");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const roleLabel = invite ? (ROLE_LABELS[invite.role] ?? invite.role) : "";
  const inviteUrl = token ? buildAccessInviteUrl(token) : "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3">
            <Shield size={28} className="text-accent" />
          </div>
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Ecclesia Online</p>
          <p className="text-lg font-semibold text-white mt-1">Convite de Acesso</p>
        </div>

        <div className="p-6">

          {/* ── Loading ── */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Verificando convite...</p>
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <XCircle size={40} className="text-destructive" />
              <p className="font-semibold text-destructive">Convite inválido</p>
              <p className="text-sm text-muted-foreground">{errMsg}</p>
            </div>
          )}

          {/* ── Wrong account ── */}
          {step === "wrong_account" && invite && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle size={28} className="text-amber-500" />
                </div>
                <p className="font-semibold">Conta diferente detectada</p>
              </div>

              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Este convite foi enviado para:
                </p>
                <p className="font-semibold text-amber-700 dark:text-amber-400 break-all">
                  {invite.email || "— (sem e-mail cadastrado)"}
                </p>
                <p className="text-muted-foreground mt-2">
                  Você está logado como:
                </p>
                <p className="font-semibold break-all">{currentUserEmail ?? "—"}</p>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Para aceitar este convite, saia desta conta e entre com o e-mail correto.
              </p>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleSignOutAndContinue()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <LogOut size={15} />
                  Sair e continuar
                </button>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="w-full px-4 py-2.5 bg-secondary rounded-xl text-sm hover:bg-secondary/80 transition-colors"
                >
                  Cancelar
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                Ao sair, você não perderá dados. Apenas a sessão será encerrada.
              </p>
            </div>
          )}

          {/* ── Preview + Accept ── */}
          {step === "preview" && invite && (
            <div className="space-y-5">
              <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <User size={20} className="text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold">{invite.full_name}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
                <div className="border-t border-border/40 pt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Shield size={11} className="text-accent" />
                    Função: <span className="font-medium text-foreground">{roleLabel}</span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin size={11} />
                    {invite.church_name}
                    {invite.church_city
                      ? ` · ${invite.church_city}${invite.church_state ? `/${invite.church_state}` : ""}`
                      : ""}
                  </p>
                  {currentUserEmail && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={11} />
                      Conta verificada: {currentUserEmail}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleAccept()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <CheckCircle2 size={16} />
                Ativar meu acesso
              </button>

              <p className="text-[11px] text-muted-foreground text-center">
                Ao ativar, sua conta será vinculada como {roleLabel} em {invite.church_name}.
              </p>
            </div>
          )}

          {/* ── Accepting ── */}
          {step === "accepting" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Ativando acesso...</p>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <p className="font-semibold">Acesso ativado!</p>
              <p className="text-sm text-muted-foreground">Redirecionando para o painel...</p>
            </div>
          )}

          {/* ── Auth form ── */}
          {step === "auth" && invite && (
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary/40 p-3 flex items-center gap-3">
                <Shield size={18} className="text-accent flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{invite.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel} · {invite.church_name}
                  </p>
                </div>
              </div>

              {invite.email && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Entre com o e-mail <strong>{invite.email}</strong> para aceitar este convite.
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                {authMode === "login"
                  ? "Entre com sua conta para ativar o acesso."
                  : "Crie sua conta para ativar o acesso."}
              </p>

              <form onSubmit={(e) => void handleAuth(e)} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    required
                    className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {authError && <p className="text-xs text-destructive">{authError}</p>}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {authLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : authMode === "login" ? (
                    <LogIn size={14} />
                  ) : (
                    <UserPlus size={14} />
                  )}
                  {authMode === "login" ? "Entrar e ativar acesso" : "Criar conta e ativar acesso"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setAuthMode((m) => (m === "login" ? "signup" : "login"))}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
              >
                {authMode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border/30 px-6 py-3 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Ecclesia Online · Acesso seguro</p>
          {inviteUrl && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{inviteUrl}</p>
          )}
        </div>
      </div>
    </div>
  );
}
