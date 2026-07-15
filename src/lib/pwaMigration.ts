/**
 * Migração única — remove registros e caches do Service Worker legado
 * (ecclesia-static-*), deixados por versões anteriores do app shell manual.
 *
 * Regras de segurança:
 * 1. Executa apenas UMA vez por navegador, controlada por chave versionada
 *    em localStorage (MIGRATION_KEY). Em visitas subsequentes, retorna
 *    imediatamente sem tocar em Service Workers ou caches.
 * 2. NUNCA desregistra o Service Worker novo (gerado pelo vite-plugin-pwa /
 *    workbox): só chama `unregister()` quando existe evidência concreta do
 *    SW legado — ou seja, quando há caches com o prefixo "ecclesia-static-".
 *    O SW novo nunca cria caches com esse prefixo, então essa heurística é
 *    segura.
 * 3. Remove apenas caches "ecclesia-static-*" — nunca toca em caches do
 *    Workbox (workbox-precache-*, google-fonts-*, ecclesia-campaign-images,
 *    ecclesia-icons etc.).
 * 4. Deve ser chamada (e aguardada) ANTES do React montar a aplicação, para
 *    que termine antes de qualquer registro do novo SW via
 *    `virtual:pwa-register/react` — eliminando a corrida entre migração e
 *    registro.
 */
const MIGRATION_KEY = "ecclesia:pwa-legacy-cleanup:v1";
const LEGACY_CACHE_PREFIX = "ecclesia-static-";

function isMigrationDone(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_KEY) === "done";
  } catch {
    return false;
  }
}

function markMigrationDone(): void {
  try {
    window.localStorage.setItem(MIGRATION_KEY, "done");
  } catch {
    // Sem persistência (modo privado, storage bloqueado etc.) — a migração
    // pode rodar de novo na próxima visita, mas permanece segura porque só
    // desregistra SWs quando encontra evidência concreta do legado.
  }
}

export async function runPwaMigration(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isMigrationDone()) return;

  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      const legacyCacheNames = cacheNames.filter((name) =>
        name.startsWith(LEGACY_CACHE_PREFIX),
      );

      if (legacyCacheNames.length > 0 && "serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      await Promise.all(legacyCacheNames.map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.warn("[Ecclesia PWA] Falha na migração de limpeza legada:", error);
  }

  markMigrationDone();
}
