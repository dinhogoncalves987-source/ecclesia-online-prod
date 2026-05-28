import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Eye, EyeOff, BookOpen, Users, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { persistPendingChurchSlug, signupPathWithChurch } from "@/lib/organizationMembership";
import flagBR from "@/assets/flag-br.png";
import flagUS from "@/assets/flag-us.png";
import flagES from "@/assets/flag-es.png";

export default function Login() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useLanguage();
  const [searchParams] = useSearchParams();
  const churchSlug = searchParams.get("church");

  useEffect(() => {
    persistPendingChurchSlug(churchSlug);
  }, [churchSlug]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({ title: t("Erro ao entrar"), description: error.message, variant: "destructive" });
    } else {
      navigate("/admin");
    }
    setLoading(false);
  };

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

        <form onSubmit={handleLogin} className="bg-card rounded-xl shadow-executive p-6 space-y-4">
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
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/admin`,
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

          <p className="text-center text-xs text-muted-foreground">
            {t("Não tem conta?")}{" "}
            <Link to={signupPathWithChurch(churchSlug)} className="text-accent hover:underline font-medium">{t("Criar conta")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
