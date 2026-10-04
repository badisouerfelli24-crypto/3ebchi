/* Service worker de l'espace hajem : reçoit les notifications Web Push
   (nouvelles réservations) et ouvre le dashboard au clic. Aucun cache. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "3EBCHI STYLE", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Nouvelle réservation 💈", {
      body: data.body || "",
      tag: data.tag,
      renotify: !!data.tag,
      icon: "/barber-icon-192.png",
      badge: "/barber-badge.png",
      data: { url: data.url || "/barber" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/barber", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith("/barber") && "focus" in c) {
          c.navigate(url.href);
          return c.focus();
        }
      }
      return self.clients.openWindow(url.href);
    })
  );
});
