/* BellCraft Service Worker — handles Web Push notifications */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data?.json() ?? {}; } catch {}

  const title = data.title ?? "🔔 جرس الحصة — BellCraft";
  const body  = data.body  ?? "";

  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((openClients) => {
        // ── If any tab is open: tell it to ring via Web Audio ──────────
        if (openClients.length > 0) {
          openClients.forEach((client) =>
            client.postMessage({ type: "BELL_RING", title, body })
          );
        }

        // ── Always show the system notification ────────────────────────
        return self.registration.showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: "bellcraft-bell",
          renotify: true,
          requireInteraction: true,
          silent: false,
          dir: "rtl",
          lang: "ar",
          // Vibration pattern: 3 pulses — felt on locked screen
          vibrate: [300, 100, 300, 100, 300],
          data: { autoplay: true },
          actions: [
            { action: "open", title: "📱 فتح التطبيق" },
          ],
        });
      })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        if (list.length > 0) {
          list[0].postMessage({ type: "BELL_RING", autoplay: true });
          return list[0].focus();
        }
        return self.clients.openWindow("/?autoplay=bell");
      })
  );
});
