// Service worker of the club web: works offline with the last version seen.
// Same-origin pages and files: network first, cache as fallback. Data from Firebase / the live
// relay (other origins) is never cached here.
const CACHE = "vsp-v3";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png", "/live/logo.jpg",
  "/css/app.css", "/js/core.js", "/js/home.js", "/js/agenda.js", "/js/teams.js", "/js/member.js", "/js/club.js", "/js/main.js"];

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
