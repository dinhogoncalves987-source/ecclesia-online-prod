import { Link } from "react-router-dom";
import { PackageX } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Equivalente público (sem AdminLayout/autenticação) de ModuleUnavailable.
 * Usado por rotas públicas cujo módulo é staging-only (ex.: /devocional,
 * /validar/carta/:token) — ver FASE 6 (separação de bundle por build) em
 * src/App.tsx. O componente real do módulo nunca é importado num build de
 * produção; esta página nunca dispara nenhuma consulta ao Supabase.
 */
export default function PublicModuleUnavailable() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/30">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-serif text-base font-semibold text-foreground">{t("Ecclesia Online")}</span>
        </Link>
        <ThemeToggle />
      </header>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60">
          <PackageX size={28} strokeWidth={1.5} className="text-muted-foreground" />
        </div>
        <h1 className="font-serif text-xl font-semibold">{t("Recurso indisponível")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("Este recurso está disponível apenas no ambiente de teste e não faz parte da versão de gestão em produção.")}
        </p>
        <Link to="/" className="text-sm text-primary hover:underline mt-2">
          {t("Voltar para o início")}
        </Link>
      </div>
    </div>
  );
}
