import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Location } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppBootScreen } from "@/components/AppBootScreen";
import { ReconnectScreen } from "@/components/ReconnectScreen";
import { Loader2, Eye, EyeOff, BookOpen, Users, Wallet, Phone, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useMobileFocusScroll } from "@/hooks/useMobileFocusScroll";
import { persistPendingChurchSlug, resolveInviteChurchSlug, signupPathWithChurch } from "@/lib/organizationMembership";
import { requestMemberLoginOtp, verifyMemberLoginOtp } from "@/lib/memberLoginOtp";
import flagBR from "@/assets/flag-br.png";
import flagUS from "@/assets/flag-us.png";
import flagES from "@/assets/flag-es.png";

/** Traduz os códigos de erro estáveis das RPCs/Edge Function de OTP em texto para o membro. */
function otpErrorMessage(error: string): string {
  switch (error) {
    case "invalid_phone":
      return "Informe um telefone válido, com DDD.";
    case "member_not_found":
      return "Não encontramos nenhum cadastro com este telefone. Procure a Secretaria da sua igreja.";
    case "ambiguous_phone":
      return "Mais de um cadastro usa este número. Procure a Secretaria da sua igreja.";
    case "rate_limited":
      return "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.";
    case "otp_disabled":
      return "A entrada por telefone ainda não foi liberada para esta igreja.";
    case "otp_manual_test_admin_only":
      return "A entrada por telefone está em teste controlado. Peça a um administrador autorizado o código do seu teste.";
    case "otp_provider_not_configured":
      return "O envio automático por WhatsApp ainda não foi configurado. Peça a um administrador o código do seu teste.";
    case "no_active_challenge":
      return "Nenhum código ativo para este telefone. Peça um novo código.";
    case "challenge_expired":
      return "Este código expirou. Peça um novo código.";
    case "max_attempts_exceeded":
      return "Número máximo de tentativas atingido. Peça um novo código.";
    case "invalid_code":
      return "Código incorreto. Confira e tente novamente.";
    default:
      return "Não foi possível concluir a entrada agora. Tente novamente em instantes.";
  }
}

/** Where to send the user once we know they're authenticated. */
function resolveDestination(location: Location): string {
  const from = (location.state as { from?: Location } | null)?.from;
  if (from) {
    return `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
  }
  return "/admin?entry=1";
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, connectionIssue, retryConnection } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [searchParams] = useSearchParams();
  const churchSlug = searchParams.get("church");

  useEffect(() => {
    persistPendingChurchSlug(churchSlug);
  }, [churchSlug]);

  // A session already exists (persisted from a previous visit) — never make
  // an already-authenticated user fill in the form again. This is the fix
  // for the PWA "always asks to log in again" complaint: without this,
  // landing on /login with a valid session showed the form regardless.
  useEffect(() => {
    if (!authLoading && user) {
      navigate(resolveDestination(location), { replace: true });
    }
  }, [authLoading, user, navigate, location]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useMobileFocusScroll<HTMLFormElement>();

  // ── Entrada por telefone/WhatsApp (Parte D — não substitui e-mail/senha,
  // é um método alternativo para quem já é membro cadastrado). Nunca cria
  // segundo cadastro: apenas vincula a sessão ao members.id já existente.
  const [loginMode, setLoginMode] = useState<"password" | "phone">("password");
  const [phoneStep, setPhoneStep] = useState<"enter-phone" | "enter-code">("enter-phone");
  const [phoneValue, setPhoneValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneHint, setPhoneHint] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({ title: t("Erro ao entrar"), description: error.message, variant: "destructive" });
      setLoading(false);
    } else {
      navigate(resolveDestination(location), { replace: true });
    }
  };

  const resetPhoneFlow = () => {
    setLoginMode("password");
    setPhoneStep("enter-phone");
    setPhoneValue("");
    setCodeValue("");
    setPhoneError(null);
    setPhoneHint(null);
  };

  const handleRequestPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValue.trim()) return;
    setPhoneLoading(true);
    setPhoneError(null);
    setPhoneHint(null);

    const result = await requestMemberLoginOtp(phoneValue);
    setPhoneLoading(false);

    // Mesmo quando o pedido "falha" (transporte desligado/manual_test), a
    // tela avança para a etapa de código: nesta operação, o código sempre
    // vem de um administrador (teste controlado), nunca de um envio
    // automático — o membro digita o código que recebeu por fora deste
    // formulário. O erro vira uma explicação, não um bloqueio da tela.
    if (!result.ok) {
      setPhoneError(otpErrorMessage(result.error));
      if (result.hint) setPhoneHint(result.hint);
    }
    setPhoneStep("enter-code");
  };

  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeValue.trim()) return;
    setPhoneLoading(true);
    setPhoneError(null);

    const result = await verifyMemberLoginOtp(phoneValue, codeValue);
    setPhoneLoading(false);

    if (!result.ok) {
      setPhoneError(otpErrorMessage(result.error));
      return;
    }

    navigate(resolveDestination(location), { replace: true });
  };

  // A persisted token exists but couldn't be confirmed (offline/timeout) —
  // never show the login form here, this is not a logout. Offer a manual
  // retry instead. See PROBLEMA CRÍTICO 1.
  if (connectionIssue) {
    return <ReconnectScreen onRetry={retryConnection} />;
  }

  // While we're still recovering the session, or once we know the user is
  // authenticated (redirect effect above is about to fire), never flash the
  // login form.
  if (authLoading || user) {
    return <AppBootScreen />;
  }

  const FEATURES = [
    { icon: BookOpen, label: lang === "en" ? "AI Bible Assistant" : lang === "es" ? "Asistente Bíblico IA" : "Assistente Bíblico IA" },
    { icon: Users,    label: lang === "en" ? "Institutional Management" : lang === "es" ? "Gestión Institucional" : "Gestão Institucional" },
    { icon: Wallet,   label: lang === "en" ? "Integrated Treasury" : lang === "es" ? "Tesorería Integrada" : "Tesouraria Integrada" },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Top bar */}
      <div className="absolute top-4 left-4 flex items-center gap-1.5">
        {([["pt", flagBR], ["en", flagUS], ["es", flagES]] as const).map(([l, flag]) => (
          <button key={l} onClick={() => setLang(l)}
            className={`w-7 h-5 rounded overflow-hidden transition-opacity ${lang === l ? "opacity-100 ring-2 ring-accent ring-offset-1 ring-offset-background" : "opacity-40 hover:opacity-70"}`}
          >
            <img src={flag} alt={l} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-3 mb-2">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-executive">
              <span className="text-accent font-serif text-3xl">Ω</span>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                {lang === "en" ? "Church Management Platform" : lang === "es" ? "Plataforma de Gestión Pastoral" : "Plataforma de Gestão Pastoral"}
              </p>
            </div>
          </Link>
          <h1 className="text-2xl font-serif tracking-tight mt-4">{t("Bem-vindo de volta")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Entre com suas credenciais")}</p>

          {/* Feature pills */}
          <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
            {FEATURES.map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/60 rounded-full px-2.5 py-1">
                <Icon size={11} className="text-accent" /> {label}
              </span>
            ))}
          </div>
        </div>

        {loginMode === "password" ? (
          <form ref={formRef} onSubmit={handleLogin} className="bg-card rounded-xl shadow-executive p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("E-mail")}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("Senha")}</label>
              <div className="relative mt-1.5">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <Link to="/forgot-password" className="text-accent hover:underline">{t("Esqueci a senha")}</Link>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {t("Entrar")}
            </button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{t("ou")}</span></div>
            </div>

            <button type="button"
              onClick={async () => {
                const inviteSlug = resolveInviteChurchSlug(churchSlug);
                if (inviteSlug) persistPendingChurchSlug(inviteSlug);
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo: `${window.location.origin}/admin?entry=1`,
                    queryParams: {
                      access_type: "offline",
                      prompt: "consent",
                    },
                  },
                });
                if (error) toast({ title: t("Erro"), description: error.message, variant: "destructive" });
              }}
              className="w-full py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              {t("Entrar com Google")}
            </button>

            <button type="button" onClick={() => setLoginMode("phone")}
              className="w-full py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2">
              <Phone size={16} className="text-accent" />
              {t("Entrar com telefone")}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              {t("Não tem conta?")}{" "}
              <Link to={signupPathWithChurch(churchSlug)} className="text-accent hover:underline font-medium">{t("Criar conta")}</Link>
            </p>
          </form>
        ) : (
          <div className="bg-card rounded-xl shadow-executive p-6 space-y-4">
            <button type="button" onClick={resetPhoneFlow}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground -mt-1 -ml-1">
              <ArrowLeft size={14} /> {t("Voltar para e-mail e senha")}
            </button>

            {phoneStep === "enter-phone" ? (
              <form onSubmit={handleRequestPhoneCode} className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold">{t("Entrar com telefone")}</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("Informe o telefone/WhatsApp já cadastrado pela sua igreja. Você não precisa se cadastrar novamente.")}
                  </p>
                </div>
                <div>
                  <label htmlFor="login-phone" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Telefone/WhatsApp")}
                  </label>
                  <input id="login-phone" type="tel" inputMode="tel" autoComplete="tel" value={phoneValue}
                    onChange={(e) => setPhoneValue(e.target.value)} placeholder="(11) 91234-5678" required
                    aria-describedby={phoneError ? "login-phone-error" : undefined}
                    className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
                <button type="submit" disabled={phoneLoading}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {phoneLoading && <Loader2 size={16} className="animate-spin" />}
                  {t("Continuar")}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneCode} className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold">{t("Digite o código")}</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("Peça o código a um administrador autorizado da sua igreja e informe-o abaixo.")}
                  </p>
                </div>
                {phoneError && (
                  <p id="login-phone-error" role="alert" className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {phoneError}
                    {phoneHint ? ` ${phoneHint}` : ""}
                  </p>
                )}
                <div>
                  <label htmlFor="login-otp-code" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("Código de 6 dígitos")}
                  </label>
                  <input id="login-otp-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
                    value={codeValue} onChange={(e) => setCodeValue(e.target.value.replace(/\D/g, ""))} placeholder="000000" required
                    className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
                <button type="submit" disabled={phoneLoading || codeValue.length !== 6}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {phoneLoading && <Loader2 size={16} className="animate-spin" />}
                  {t("Entrar")}
                </button>
                <button type="button" onClick={() => { setPhoneStep("enter-phone"); setCodeValue(""); setPhoneError(null); setPhoneHint(null); }}
                  className="w-full text-center text-xs text-accent hover:underline">
                  {t("Usar outro telefone")}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
