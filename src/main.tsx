import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { runPwaMigration } from "./lib/pwaMigration";

function mount(): void {
  createRoot(document.getElementById("root")!).render(<App />);
}

/**
 * Em produção, a migração de limpeza do Service Worker legado precisa
 * terminar ANTES do React montar a aplicação — só assim o PWAUpdatePrompt
 * (que registra o novo Service Worker via virtual:pwa-register/react) entra
 * em cena sem correr risco de colidir com a limpeza legada.
 */
if (import.meta.env.PROD) {
  void runPwaMigration().finally(mount);
} else {
  mount();
}
