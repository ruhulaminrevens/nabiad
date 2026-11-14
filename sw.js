/* Nabiad service worker: network-first for app files, cache-first for vendor libraries */
const C = "nabiad-v5";
const CORE = ["./", "index.html", "style.css?v=5", "app.js?v=5", "config.js?v=5", "i18n.js?v=5", "vendor/supabase.js", "icon.svg", "manifest.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith(".enc")) return;
  if (u.pathname.includes("/vendor/")) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; }))); return; }
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "#/rem";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => { for (const c of cs) { if ("focus" in c) { c.navigate ? c.focus().then(() => c.postMessage({ go: url })) : c.focus(); return; } } return self.clients.openWindow("./" + url); }));
});
