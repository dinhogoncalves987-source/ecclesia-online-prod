import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useRef } from "react";

/**
 * PWAUpdatePrompt
 *
 * Componente que monitora atualizações do Service Worker gerenciado pelo
 * vite-plugin-pwa (registerType: 'autoUpdate').
 *
 * Uma release nova nunca pode ficar silenciosamente escondida atrás de uma
 * versão antiga do PWA. O registro procura atualizações na abertura, quando o
 * aplicativo volta ao primeiro plano e periodicamente enquanto permanece
 * aberto. Quando o novo worker assume o controle, a página recarrega uma única
 * vez; rota, rolagem e rascunhos são restaurados pelos mecanismos próprios do
 * aplicativo.
 */
export function PWAUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingRef = useRef(false);
  const hadControllerRef = useRef(
    typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller),
  );

  useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        registrationRef.current = registration;
        console.debug("[Ecclesia PWA] Service Worker registrado:", swUrl);
        void registration.update();
        window.setInterval(() => {
          void registration.update();
        }, 5 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn("[Ecclesia PWA] Falha ao registrar Service Worker:", error);
    },
  });

  useEffect(() => {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker) return;

    const handleControllerChange = () => {
      // A primeira instalação não deve recarregar a tela. Somente a troca de
      // um worker que já controlava o PWA representa uma release nova.
      if (!hadControllerRef.current) {
        hadControllerRef.current = true;
        return;
      }
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        void registrationRef.current?.update();
      }
    };

    serviceWorker.addEventListener("controllerchange", handleControllerChange);
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);

    return () => {
      serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
    };
  }, []);

  return null;
}
