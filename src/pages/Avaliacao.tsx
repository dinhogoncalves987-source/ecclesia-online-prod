import { Navigate } from "react-router-dom";
import { activateReviewModeSession, isReviewModeBuildEnabled } from "@/config/reviewMode";

/**
 * Rota pública `/avaliacao` — único ponto de entrada do Modo Avaliação.
 *
 * Regras:
 *   - Se `VITE_PUBLIC_REVIEW_MODE` não estiver ativo neste build, esta rota
 *     nunca liga nada — apenas redireciona para a página pública inicial,
 *     exatamente como qualquer outra URL desconhecida deveria comportar-se
 *     num deploy normal de produção/staging.
 *   - Se estiver ativo, liga o portão de sessão (sessionStorage, só esta
 *     aba) e entra direto na área administrativa real (`/admin`), que a
 *     partir daí passa a rodar 100% sobre dados fictícios em memória (ver
 *     src/integrations/supabase/client.ts e src/reviewMode/*).
 *
 * Esta página nunca renderiza UI própria — é apenas um redirecionador.
 */
export default function Avaliacao() {
  if (!isReviewModeBuildEnabled()) {
    return <Navigate to="/" replace />;
  }

  activateReviewModeSession();

  return <Navigate to="/admin?entry=1" replace />;
}
