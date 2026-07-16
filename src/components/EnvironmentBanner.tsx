import { useEffect } from "react";
import { environment } from "@/config/environment";

/**
 * Banner fixo "AMBIENTE DE TESTE" — visível apenas quando
 * `environment.isStaging`. Nunca aparece em produção. Não depende de
 * window.location; depende exclusivamente de VITE_APP_ENV (via
 * src/config/environment.ts), então o comportamento é idêntico em qualquer
 * domínio/preview apontando para staging.
 *
 * Também atualiza a meta tag <meta name="robots"> em runtime: o valor
 * estático em index.html é "noindex, nofollow" (seguro por padrão); só é
 * promovido para "index, follow" quando `environment.isProduction` é
 * verdadeiro. Uma falha na detecção de ambiente nunca resulta em staging
 * sendo indexado — na pior hipótese, produção fica noindex até carregar.
 */
export function EnvironmentBanner() {
  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]');
    if (robots) {
      robots.setAttribute("content", environment.isProduction ? "index, follow" : "noindex, nofollow");
    }
  }, []);

  if (!environment.isStaging) return null;

  return (
    <div
      role="status"
      data-testid="environment-banner"
      className="sticky top-0 z-[60] w-full bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-amber-950"
    >
      Ambiente de teste — dados e integrações não são de produção
    </div>
  );
}
