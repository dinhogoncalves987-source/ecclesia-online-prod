/**
 * Public access invite page — no auth required to view the invite.
 * Route: /convite-acesso/:token
 *
 * Flow:
 *  1. Load invite info via public RPC (get_access_invite_by_token).
 *  2. Show name, role, church.
 *  3. If NOT logged in → show inline login/signup.
 *  4. If logged in → button "Ativar meu acesso" → accept_access_invite RPC.
 *  5. Redirect to /admin.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2, XCircle, Loader2, Shield, User, MapPin,
  LogIn, UserPlus, Eye, EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAccessInviteByToken, acceptAccessInvite, type AccessInvitePublic,
  buildAccessInviteUrl,
} from "@/lib/accessInvites";
import { ThemeToggle } from "@/components/ThemeToggle";

type Step = "loading" | "error" | "preview" | "auth" | "accepting" | "done";

const ROLE_LABELS: Record<string, string> = {
  church_admin: "Administrador",
  tesoureiro:   "Tesoureiro",
  contador:     "Contador",
  pastor:       "Pastor",
  secretary:    "Secretário(a)",
  leader:       "Líder",
  member:       "Membro",
};

export default function ConviteAcesso() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate         = useNavigate();

  const [step, setStep]       = useState<Step>("loading");
  const [invite, setInvite]   = useState<AccessInvitePublic | null>(null);
  const [errMsg, setErrMsg]   = useState("");
  const [session, setSession] = useState<boolean | null>(null);

  const [authMode, setAuthMode]         = useState<"login" | "signup">("login");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPass, setShowPass]         = useState(false);
  const [authLoading, setAuthLoading]   = useState(false);
  const [authError, setAuthError]       = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(!!s);

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
      if (s) setStep("preview");
      else    setStep("auth");
    };
    void init();
  }, [token]);

  useEffect(() => {
    if (step !== "auth" && invite && session) setStep("preview");
  }, [session, invite, step]);

  const handleAccept = async () => {
    setStep("accepting");
    const { error } = await acceptAccessInvite(token);
    if (error) {
      setErrMsg(error === "already_accepted" ? "Este convite já foi utilizado." : `Erro: ${error}`);
      setStep("error");
      return;
    }
    setStep("done");
    setTimeout(() => navigate("/admin"), 2000);
  };

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
      setSession(true);
      setStep("preview");
    } finally {
      setAuthLoading(false);
    }
  };

  const roleLabel = invite ? (ROLE_LABELS[invite.role] ?? invite.role) : "";
  const inviteUrl = token ? buildAccessInviteUrl(token) : "";

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
          {/* Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Verificando convite...</p>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <XCircle size={40} className="text-destructive" />
              <p className="font-semibold text-destructive">Convite inválido</p>
              <p className="text-sm text-muted-foreground">{errMsg}</p>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <p className="font-semibold">Acesso ativado!</p>
              <p className="text-sm text-muted-foreground">Redirecionando para o painel...</p>
            </div>
          )}

          {/* Invite preview + accept */}
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
                    <MapPin size={11} /> {invite.church_name}
                    {invite.church_city ? ` · ${invite.church_city}${invite.church_state ? `/${invite.church_state}` : ""}` : ""}
                  </p>
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

          {/* Accepting */}
          {step === "accepting" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Ativando acesso...</p>
            </div>
          )}

          {/* Auth form */}
          {step === "auth" && invite && (
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary/40 p-3 flex items-center gap-3">
                <Shield size={18} className="text-accent flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{invite.full_name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel} · {invite.church_name}</p>
                </div>
              </div>

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
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
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
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                {authMode === "login"
                  ? "Não tem conta? Criar agora"
                  : "Já tem conta? Entrar"}
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
