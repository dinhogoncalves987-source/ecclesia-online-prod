/**
 * Ecclesia App — registro e atualização do Service Worker.
 *
 * Fluxo de atualização:
 *  1. SW novo instala em segundo plano.
 *  2. SW novo ativa e posta { type: "SW_UPDATED" } para todas as abas.
 *  3. Esta função recebe a mensagem e recarrega a página silenciosamente.
 *     → Garante que o app sempre carrega o index.html e os bundles atualizados.
 *     → Elimina a tela branca após instalação ou atualização do Ecclesia App.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Verificar atualizações a cada vez que o app volta ao foco
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            void registration.update();
          }
        });
      })
      .catch((err: unknown) => {
        console.error("[Ecclesia App] Falha ao registrar o app:", err);
      });

    // Quando o SW controller mudar (nova versão assumiu controle), recarregar
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    // Ouvir mensagem SW_UPDATED (postada pelo sw.js no activate)
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === "SW_UPDATED") {
        window.location.reload();
      }
    });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
