import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setSent(true);
    }
    setLoading(false);
  };

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
          <h1 className="text-2xl font-serif tracking-tight">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground mt-1">Enviaremos um link para redefinir sua senha</p>
        </div>

        {sent ? (
          <div className="bg-card rounded-xl shadow-executive p-6 text-center">
            <p className="text-sm">E-mail enviado para <strong>{email}</strong>.</p>
            <p className="text-xs text-muted-foreground mt-2">Verifique sua caixa de entrada e siga as instruções.</p>
            <Link to="/login" className="inline-block mt-4 text-sm text-accent hover:underline">Voltar ao login</Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="bg-card rounded-xl shadow-executive p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Enviar link
            </button>
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/login" className="text-accent hover:underline">Voltar ao login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
