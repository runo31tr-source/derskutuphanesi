// Ders Kütüphanesi – çevrimdışı çalışma için önbellek
const CACHE = "ders-kutuphanesi-v34";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Önce internetten dene (güncel sürüm gelsin), olmazsa önbellekten aç
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});

// Uygulama kapalıyken çalışma hatırlatıcısı (Chrome'da yüklü uygulamalarda arka plan eşitleme ile)
self.addEventListener("periodicsync", e => {
  if (e.tag !== "hatirlatici") return;
  e.waitUntil((async () => {
    const c = await caches.open("ders-ayar"), r = await c.match("/__ayar");
    if (!r) return;
    const a = await r.json(), n = new Date(), pad = x => String(x).padStart(2, "0");
    const today = n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(n.getDate()), hm = pad(n.getHours()) + ":" + pad(n.getMinutes());
    if (!a.on || !a.days.includes((n.getDay() + 6) % 7) || hm < a.time || a.shown === today || a.studied === today) return;
    await self.registration.showNotification("📚 Ders çalışma zamanı!", { body: "Bugün henüz çalışmadın. Günlük hedefin " + (a.goal || 20) + " soru, hadi başlayalım!", icon: "icon-192.png", badge: "icon-192.png", tag: "ders-hatirlatici" });
    a.shown = today;
    await c.put("/__ayar", new Response(JSON.stringify(a), { headers: { "Content-Type": "application/json" } }));
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow("./")));
});
