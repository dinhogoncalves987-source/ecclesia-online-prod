/**
 * src/reviewMode/reviewToast.ts
 *
 * Ponto único de notificação para toda ação simulada no Modo Avaliação
 * (gravações no "banco" fictício, uploads, chamadas, RPCs administrativas).
 * Usa `sonner` diretamente (o mesmo Toaster já montado em App.tsx) para não
 * depender de contexto React — o motor de consulta (`mockQueryBuilder.ts`)
 * roda fora da árvore de componentes.
 *
 * Debounced por um curto intervalo para não empilhar dezenas de toasts
 * idênticos quando uma tela dispara várias mutações em sequência (ex.:
 * salvar uma escala com múltiplas atribuições de membros).
 */

import { toast } from "sonner";

const SIMULATION_MESSAGE = "Modo avaliação: esta ação foi simulada e nenhum dado foi alterado.";
const DEBOUNCE_MS = 600;

let lastShownAt = 0;

export function notifyReviewSimulatedAction(_actionLabel?: string): void {
  const now = Date.now();
  if (now - lastShownAt < DEBOUNCE_MS) return;
  lastShownAt = now;
  toast.message(SIMULATION_MESSAGE, {
    duration: 3500,
  });
}
