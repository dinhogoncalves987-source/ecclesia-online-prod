import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { isReviewModeActive } from "@/config/reviewMode";

/**
 * Faixa fixa e permanente exibida em toda a interface enquanto o Modo
 * Avaliação estiver ativo nesta aba (ver src/config/reviewMode.ts).
 *
 * Reavalia `isReviewModeActive()` a cada troca de rota — o portão de sessão
 * (sessionStorage) só é alterado por `activateReviewModeSession()` (ao
 * entrar em `/avaliacao`) e `deactivateReviewModeSession()` (ao sair/"Sair
 * da conta"), então observar `location` é suficiente para refletir essas
 * transições sem precisar de um Context dedicado.
 */
export function ReviewModeBanner() {
  const location = useLocation();
  const [active, setActive] = useState(() => isReviewModeActive());

  useEffect(() => {
    setActive(isReviewModeActive());
  }, [location.pathname]);

  if (!active) return null;

  return (
    <div
      role="status"
      data-testid="review-mode-banner"
      className="sticky top-0 z-[70] w-full bg-fuchsia-600 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-white"
    >
      Modo avaliação — dados fictícios — nenhuma ação será gravada
    </div>
  );
}
