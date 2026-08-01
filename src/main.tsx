import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { runPwaMigration } from "./lib/pwaMigration";

function mount(): void {
  createRoot(document.getElementById("root")!).render(<App />);
}

/**
 * A aplicação NUNCA pode aguardar manutenção de cache/Service Worker para
 * montar. Em alguns navegadores Android, CacheStorage pode ficar pendente
 * indefinidamente; quando a limpeza era aguardada aqui, o usuário permanecia
 * para sempre no shell HTML estático "Abrindo Ecclesia" e nenhum provider do
 * React sequer chegava a iniciar.
 *
 * Montamos primeiro. A limpeza legada é oportunista, não bloqueante e não
 * interfere mais no registro atual (ver pwaMigration.ts).
 */
mount();

if (import.meta.env.PROD) {
  void runPwaMigration();
}
