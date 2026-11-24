// Service worker of the club web: works offline with the last version seen.
// Same-origin pages and files: network first, cache as fallback. Data from Firebase / the live
// relay (other origins) is never cached here.
// Keep in sync by hand with VSP.WEB_VERSION in js/core.js (shown in ⚙️ Preferències › Quant a).
const CACHE = "vsp-v23";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png", "/live/logo.jpg",
  "/css/app.css", "/js/i18n.js", "/js/core.js", "/js/livesign.js", "/js/home.js", "/js/agenda.js", "/js/teams.js", "/js/member.js", "/js/club.js", "/js/perduts.js", "/js/push.js", "/js/prefs.js", "/js/main.js",
  "/provar/", "/provar/index.html", "/js/provar.js",
  "/jocs/", "/jocs/index.html", "/jocs/css/jocs.css", "/jocs/js/i18n.js", "/jocs/js/i18n_sg.js", "/jocs/js/progress.js", "/jocs/js/secret.js", "/jocs/js/pili.js", "/jocs/js/frame.js", "/jocs/js/hub.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === "navigate" ? caches.match("/") : Response.error())))
  );
});

// 🔔 Web push (iPhone / browsers): the club's sending service posts {title, body, url, tag}
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Vòlei Santpedor", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Vòlei Santpedor", {
    body: d.body || "", tag: d.tag || undefined, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin) && "focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

