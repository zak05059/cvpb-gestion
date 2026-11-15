/* Service worker CVPB Manager : fonctionne hors ligne et affiche les notifications. */
const VERSION = "cvpb-v17";
const COQUILLE = ["./", "index.html", "app.js", "fb.js", "firebase-config.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "maskable-192.png", "maskable-512.png", "apple-touch-icon.png", "favicon.png", "badge-96.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Les échanges avec la base Firebase ne passent jamais par le cache
  if (/googleapis\.com$|firebaseio\.com$/.test(u.hostname) && !u.hostname.startsWith("fonts.")) return;
  const memeOrigine = u.origin === self.location.origin;
  const bibliotheque = u.hostname === "www.gstatic.com" || u.hostname.startsWith("fonts.");
  if (!memeOrigine && !bibliotheque) return;
  if (memeOrigine){
    // Réseau d'abord (mises à jour immédiates), cache si hors ligne
    e.respondWith(fetch(e.request, {cache:"no-store"}).then(r => { if (r.ok){ const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, {ignoreSearch:true}).then(r => r || caches.match("index.html"))));
  } else {
    // Bibliothèques Firebase et polices : cache d'abord
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return res; })));
  }
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(L => {
    for (const c of L){ if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
