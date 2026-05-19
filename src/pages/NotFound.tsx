import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-serif font-bold text-accent">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("Página não encontrada")}</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          {t("Voltar ao início")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
