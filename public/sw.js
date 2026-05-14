/**
 * Ecclesia Admin — static shell only.
 * Bump STATIC_CACHE when changing precache list or asset strategy (cache bust).
 */
const STATIC_CACHE = "ecclesia-static-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

function isGet(request) {
  return request.method === "GET";
}

function isSensitiveUrl(url) {
  const path = url.pathname.toLowerCase();
  const host = url.hostname.toLowerCase();
  const search = url.search.toLowerCase();
  if (host.includes("supabase.co")) return true;
  if (path.includes("/auth")) return true;
  if (path.includes("/rest/v1")) return true;
  if (path.includes("/functions/v1")) return true;
  if (path.includes("/join")) return true;
  if (path.includes("/invite")) return true;
  if (search.includes("token=")) return true;
  if (search.includes("invite")) return true;
  if (search.includes("qr")) return true;
  return false;
}

function hasAuthHeaders(request) {
  return request.headers.has("authorization") || request.headers.has("apikey");
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

function isSameOriginStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p.startsWith("/assets/")) return true;
  return /\.(js|mjs|css|woff2?|png|svg|ico|webmanifest|json)$/i.test(p);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE) return caches.delete(key);
            return Promise.resolve();
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!isGet(request)) return;

  const url = new URL(request.url);

  if (isSensitiveUrl(url) || hasAuthHeaders(request)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) return response;
          return caches.match("/").then((cached) => cached || fetch("/"));
        })
        .catch(() => caches.match("/").then((cached) => cached || fetch("/"))),
    );
    return;
  }

  if (isSameOriginStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || !response.ok || response.type !== "basic") return response;
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
    return;
  }

  event.respondWith(fetch(request));
});
