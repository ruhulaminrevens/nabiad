/* Nabiad service worker: network-first (revalidated) for app files, cache-first for vendor libraries */
const C = "nabiad-v6-62";
const CORE = ["./", "index.html", "style.css?v=6.62", "app.js?v=6.62", "config.js?v=6.62", "i18n.js?v=6.62", "vendor/supabase.js", "icon.svg", "icon-192.png", "manifest.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith(".enc")) return;
  if (u.pathname.includes("/vendor/")) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; }))); return; }
  // always ask the server (cheap 304 when unchanged) so a new release is picked up at once; fall back to cache when offline
  const fresh = e.request.mode === "navigate" ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" }) : new Request(e.request, { cache: "no-cache" });
  e.respondWith(fetch(fresh).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then(r => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "#/rem";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => { for (const c of cs) { if ("focus" in c) { c.navigate ? c.focus().then(() => c.postMessage({ go: url })) : c.focus(); return; } } return self.clients.openWindow("./" + url); }));
});
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Nabiad", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "nabiad", renotify: true, data: { url: (d.url || "").replace(/^\//, "") || "#/dash" } }));
});
