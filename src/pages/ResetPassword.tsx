import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      // Try to get session (user may already be authenticated via recovery link)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else navigate("/login");
      });
    }
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) return;
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha atualizada!", description: "Você já pode entrar com a nova senha." });
      navigate("/admin");
    }
    setLoading(false);
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-accent font-serif text-2xl">Ω</span>
            </div>
          </Link>
          <h1 className="text-2xl font-serif tracking-tight">Nova senha</h1>
          <p className="text-sm text-muted-foreground mt-1">Defina sua nova senha</p>
        </div>

        <form onSubmit={handleReset} className="bg-card rounded-xl shadow-executive p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nova senha</label>
            <div className="relative mt-1.5">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("Mínimo 6 caracteres")}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 pr-10"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Salvar nova senha
          </button>
        </form>
      </div>
    </div>
  );
}
