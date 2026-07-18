/**
 * push-sw.js — listeners de 'push' e 'notificationclick' do Service Worker.
 *
 * Importado pelo Service Worker principal (gerado via Workbox, ver
 * vite.config.ts -> workbox.importScripts) através de `importScripts()`.
 * Fica num arquivo separado, plano, NUNCA processado pelo Workbox, para não
 * arriscar nada do precache/runtime caching já em produção — só adiciona
 * dois listeners extras ao mesmo escopo global do SW.
 *
 * Isto é o que permite a notificação aparecer com o app/navegador
 * totalmente fechado ou o celular travado — diferente da notificação via
 * `new Notification()` feita em primeiro plano (src/lib/chatNotifications.ts),
 * que só funciona enquanto a aba/app ainda está carregado em memória.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Ecclesia Online";
  const threadId = data.threadId || null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Nova mensagem",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: threadId ? `ec-thread-${threadId}` : undefined,
      renotify: Boolean(threadId),
      data: { threadId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const threadId = event.notification.data && event.notification.data.threadId;
  const targetUrl = threadId ? `/admin/chat?thread=${threadId}` : "/admin/chat";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            try {
              client.navigate(targetUrl);
            } catch {
              // Alguns navegadores não suportam client.navigate — o focus abaixo já resolve.
            }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
