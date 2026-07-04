/**
 * Ecclesia App — Service Worker v5
 *
 * Estratégias por tipo de recurso:
 *   Navigation (HTML)  → Network First, sem cache (sempre HTML fresco do servidor)
 *   /assets/*.js|css   → Stale-While-Revalidate (entrega cache, atualiza em segundo plano)
 *   Imagens / ícones   → Cache First (estáveis, raramente mudam)
 *   Cross-origin       → Não interceptar nunca (Supabase, Google Fonts, APIs)
 *
 * Ao ativar versão nova o SW posta SW_UPDATED para todas as abas.
 * O cliente escuta e recarrega a página automaticamente → sem tela branca.
 */

const CACHE_NAME   = "ecclesia-v5";
const ASSETS_CACHE = "ecclesia-assets-v5";
const IMAGES_CACHE = "ecclesia-images-v5";

// Arquivos pré-cacheados no install (NÃO inclui "/" para evitar HTML obsoleto)
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNavigation(req) {
  return (
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html")
  );
}

function isAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/assets/") &&
    /\.(js|mjs|css)$/i.test(url.pathname)
  );
}

function isImage(url) {
  return (
    url.origin === self.location.origin &&
    /\.(png|jpg|jpeg|webp|svg|gif|ico|woff2?)$/i.test(url.pathname)
  );
}

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(IMAGES_CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, ASSETS_CACHE, IMAGES_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => (!keep.has(key) ? caches.delete(key) : Promise.resolve()))),
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notifica todas as abas abertas: nova versão ativa → recarregar
        return self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED" });
          });
        });
      }),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca interceptar requisições cross-origin (Supabase, Fonts, CDN, etc.)
  if (url.origin !== self.location.origin) return;

  // ── Navegação HTML: Network First, sem cache ──────────────────────────────
  // Garantia: o index.html sempre vem do servidor após qualquer novo deploy.
  if (isNavigation(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Retornar resposta direta, sem armazenar em cache
          return res;
        })
        .catch(() =>
          // Offline: tentar shell do cache de imagens (precacheamos na install)
          caches.match("/").then(
            (shell) =>
              shell ??
              new Response(
                `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ecclesia — Sem conexão</title>
<style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0B0B0F;color:#fff;gap:12px}p{opacity:.6;font-size:.9rem}</style>
</head><body><strong>Ecclesia</strong><p>Sem conexão com a internet. Reconecte e tente novamente.</p></body></html>`,
                {
                  status: 200,
                  headers: { "Content-Type": "text/html; charset=utf-8" },
                },
              ),
          ),
        ),
    );
    return;
  }

  // ── Assets JS/CSS: Stale-While-Revalidate ────────────────────────────────
  // Entrega o cache imediatamente (zero latência) e atualiza em segundo plano.
  // Como o Vite usa hashes nos nomes de arquivo, assets antigos nunca conflitam.
  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req)
            .then((res) => {
              if (res?.ok && res.type === "basic") {
                cache.put(req, res.clone());
              }
              return res;
            })
            .catch(() => cached ?? new Response("", { status: 503 }));

          // Se existe no cache, entrega imediatamente e revalida em fundo
          return cached ? (void networkFetch, cached) : networkFetch;
        }),
      ),
    );
    return;
  }

  // ── Imagens / ícones: Cache First ────────────────────────────────────────
  if (isImage(url)) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then((cache) =>
        cache.match(req).then(
          (cached) =>
            cached ??
            fetch(req).then((res) => {
              if (res?.ok && res.type === "basic") cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});

// ── Mensagens do cliente ─────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
