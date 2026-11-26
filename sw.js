// The old address is now a bridge to https://clubvoleisantpedor.github.io. This service worker replaces
// the old one: it empties the offline copy (so the bridge is always shown) and still shows the club's
// web notifications that arrive here; tapping one opens the bridge, which takes you to the new web.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: "window" }))
    .then((cs) => cs.forEach((c) => { try { c.navigate(c.url); } catch (err) {} })));
});
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Club Vòlei Santpedor", {
    body: d.body || "", tag: d.tag, icon: "https://clubvoleisantpedor.github.io/icons/icon-192.png",
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow((e.notification.data && e.notification.data.url) || "/"));
});
