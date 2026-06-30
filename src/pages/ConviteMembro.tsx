/**
 * Public invite page — no auth required to view the invite.
 * Route: /convite-membro/:token
 *
 * Flow:
 *  1. Load invite info via public RPC (get_member_invite_by_token).
 *  2. Show member name, church, congregation.
 *  3. If NOT logged in → show inline login/signup.
 *  4. If logged in → button "Ativar meu acesso" → accept_member_invite RPC.
 *  5. Redirect to app home.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  CheckCircle2, XCircle, Loader2, Church, User, MapPin,
  LogIn, UserPlus, Eye, EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getInviteByToken, acceptMemberInvite, type MemberInvitePublic } from "@/lib/memberInvites";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "loading" | "error" | "preview" | "auth" | "accepting" | "done";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConviteMembro() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate        = useNavigate();

  const [step, setStep]       = useState<Step>("loading");
  const [invite, setInvite]   = useState<MemberInvitePublic | null>(null);
  const [errMsg, setErrMsg]   = useState("");
  const [session, setSession] = useState<boolean | null>(null); // null = unknown

  // Auth state
  const [authMode, setAuthMode]         = useState<"login" | "signup">("login");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPass, setShowPass]         = useState(false);
  const [authLoading, setAuthLoading]   = useState(false);
  const [authError, setAuthError]       = useState("");

  // ── Load invite + check session ──────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Check if user is logged in
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(!!s);

      const { data, error } = await getInviteByToken(token);
      if (error || !data) {
        const friendlyErrors: Record<string, string> = {
          not_found:        "Convite não encontrado.",
          already_accepted: "Este convite já foi utilizado.",
          revoked:          "Este convite foi revogado.",
          expired:          "Este convite expirou. Solicite um novo ao secretário.",
        };
        setErrMsg(friendlyErrors[error ?? ""] ?? error ?? "Convite inválido.");
        setStep("error");
        return;
      }
      setInvite(data);
      setStep("preview");
    };
    init();
  }, [token]);

  // ── Accept invite (after auth check) ─────────────────────────────────────────
  const doAccept = async () => {
    setStep("accepting");
    const result = await acceptMemberInvite(token);
    if (!result.ok) {
      const msgs: Record<string, string> = {
        not_authenticated:   "Você precisa estar logado.",
        not_found:           "Convite não encontrado.",
        already_accepted:    "Este convite já foi utilizado.",
        expired_or_revoked:  "Este convite expirou ou foi revogado.",
      };
      setErrMsg(msgs[result.error ?? ""] ?? result.error ?? "Erro ao aceitar convite.");
      setStep("error");
      return;
    }
    setStep("done");
    setTimeout(() => navigate("/"), 2500);
  };

  // ── Login / Signup ────────────────────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthLoading(true);
    setAuthError("");

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setAuthError(error.message); setAuthLoading(false); return; }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setAuthError(error.message); setAuthLoading(false); return; }
    }

    setAuthLoading(false);
    setSession(true);
    // Don't navigate — let user confirm via "Ativar meu acesso" button
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
            <p className="text-xs text-muted-foreground">Redirecionando para o painel...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Accepting ─────────────────────────────────────────────────────────────────
  if (step === "accepting") {
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

  // ── Preview + Auth ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full space-y-5">

          {/* Invite card */}
          <div className="bg-card rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-hidden">

            {/* Top accent */}
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
                    <span>
                      {[invite?.church_city, invite?.church_state].filter(Boolean).join(" — ")}
                    </span>
                  </div>
                )}
                {invite?.congregation && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin size={12} className="flex-shrink-0 opacity-0" />
                    <span>{invite.congregation}</span>
                  </div>
                )}
              </div>

              {/* ── LOGGED IN: show accept button ── */}
              {session === true && (
                <button
                  onClick={doAccept}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Ativar meu acesso
                </button>
              )}

              {/* ── NOT LOGGED IN: show inline auth ── */}
              {session === false && (
                <div className="space-y-4">
                  <p className="text-sm text-center text-muted-foreground">
                    Para ativar seu acesso, entre ou crie uma conta.
                  </p>

                  {/* Tab selector */}
                  <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                    <button
                      onClick={() => setAuthMode("login")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        authMode === "login" ? "bg-card shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      <LogIn size={13} /> Entrar
                    </button>
                    <button
                      onClick={() => setAuthMode("signup")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        authMode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      <UserPlus size={13} /> Criar conta
                    </button>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-3">
                    <input
                      type="email"
                      placeholder="E-mail"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="Senha"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        className="w-full px-3 py-2.5 pr-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    {authError && (
                      <p className="text-xs text-destructive">{authError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {authLoading && <Loader2 size={14} className="animate-spin" />}
                      {authMode === "login" ? "Entrar e ativar acesso" : "Criar conta e ativar acesso"}
                    </button>
                  </form>
                </div>
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
