import { Link } from "react-router-dom";
import { Building2, LogOut } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";

export function OrganizationPending() {
  const { t } = useLanguage();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-executive border border-border/50 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
          <Building2 size={28} className="text-accent" strokeWidth={1.5} />
        </div>
        <h1 className="text-xl font-serif tracking-tight text-foreground">
          {t("Aguardando vínculo à organização")}
        </h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          {t("Sua conta foi criada com sucesso. Um administrador precisa vinculá-la à sua igreja ou use o link de convite recebido.")}
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <Link
            to="/"
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("Voltar ao início")}
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full py-2.5 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut size={16} strokeWidth={1.5} />
            {t("Sair")}
          </button>
        </div>
      </div>
    </div>
  );
}
