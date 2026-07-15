/**
 * bootPerf.ts
 *
 * Instrumentação leve de tempo de abertura do app, apenas para
 * desenvolvimento/depuração local. Nunca envia dados para fora do
 * dispositivo e nunca registra informação pessoal — apenas rótulos fixos
 * (ex.: "session", "church", "role") e o tempo em milissegundos desde o
 * início do carregamento da página.
 *
 * Em produção este módulo é uma no-op (os `console.log` nem são chamados),
 * então não há custo nem ruído no console do usuário final.
 */

const ENABLED = import.meta.env.DEV;

const START = typeof performance !== "undefined" ? performance.now() : 0;

/** Marks a named milestone in the boot sequence (dev-only console output). */
export function markBoot(label: string): void {
  if (!ENABLED) return;
  const elapsed = (typeof performance !== "undefined" ? performance.now() : 0) - START;
  console.info(`[boot] ${label}: ${elapsed.toFixed(0)}ms`);
}

/** Wraps an async operation, logging its duration under `label` (dev-only). */
export async function measureBoot<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const elapsed = performance.now() - start;
    console.info(`[boot] ${label}: ${elapsed.toFixed(0)}ms`);
  }
}
