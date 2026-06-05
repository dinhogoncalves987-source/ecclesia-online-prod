/**
 * Ecclesia Admin — App Shell Service Worker v4
 *
 * IMPORTANT: never intercept cross-origin requests (Supabase, APIs).
 * Intercepting them caused "Failed to fetch" for Bible & Devotional.
 */
const STATIC_CACHE = "ecclesia-static-v4";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html")
  );
}

function isSameOriginStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p.startsWith("/assets/")) return true;
  return /\.(js|mjs|css|woff2?|png|jpg|jpeg|webp|svg|ico|webmanifest|json)$/i.test(p);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => (key !== STATIC_CACHE ? caches.delete(key) : Promise.resolve()))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (Supabase, fonts, etc.): do NOT intercept
  if (url.origin !== self.location.origin) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached ?? caches.match("/").then((shell) => shell ?? new Response("", { status: 503 })),
          ),
        ),
    );
    return;
  }

  if (isSameOriginStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response?.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
        return cached ?? networkFetch;
      }),
    );
  }
});
