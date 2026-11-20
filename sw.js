/* Cache a complete release before it takes control. Bank data stays in the app's user cache. */
const VERSION = "6.80-cheque-enquiry1";
const CACHE = "nabiad-v" + VERSION;
const SCOPE = self.registration.scope;
const SHELL = new URL("index.html", SCOPE).href;
const CORE = [
  SHELL,
  ...["app.js", "config.js", "i18n.js", "inv.js", "cashbook.js", "cheque-verification.js", "style.css", "inv.css", "cashbook.css"]
    .map(path => new URL(path + "?v=" + VERSION, SCOPE).href),
  ...["vendor/supabase.js", "manifest.json", "icon.svg", "icon-192.png"].map(path => new URL(path, SCOPE).href)
];
const ENTRY_PATHS = new Set([new URL(SCOPE).pathname, new URL(SHELL).pathname]);
const VENDOR_PATH = new URL("vendor/", SCOPE).pathname;

async function cacheRelease() {
  const cache = await caches.open(CACHE);
  const shell = await fetch(SHELL, {cache:"reload"});
  if (!shell.ok || !(await shell.clone().text()).includes('src="app.js?v=' + VERSION + '"')) {
    throw new Error("Nabiad offline shell does not match this release");
  }
  await cache.addAll(CORE.slice(1).map(url => new Request(url, {cache:"reload"})));
  await cache.put(SHELL, shell);
}
self.addEventListener("install", event => {
  event.waitUntil(cacheRelease().then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("nabiad-v") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  const port = event.ports[0];
  if (event.data?.type !== "nabiad-offline-status" || !port) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const assets = await Promise.all(CORE.map(url => cache.match(url)));
      const ready = assets.every(Boolean);
      if (!ready && event.data.repair === true) await cacheRelease();
      port.postMessage({version:VERSION, ready:ready || event.data.repair === true});
    } catch {
      port.postMessage({version:VERSION, ready:false});
    }
  })());
});

async function navigation(request) {
  const timer = new AbortController();
  const limit = setTimeout(() => timer.abort(), 4500);
  try {
    const response = await fetch(request.url, {cache:"no-cache", credentials:"same-origin", signal:timer.signal});
    if (response.status < 500) return response;
    return await shellFallback(response);
  } catch {
    return shellFallback(Response.error());
  } finally {
    clearTimeout(limit);
  }
}
async function shellFallback(fallback) {
  const cache = await caches.open(CACHE);
  return (await cache.match(SHELL)) || fallback;
}
async function staticAsset(request, store) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (store && response.ok) {
    try { await cache.put(request, response.clone()); } catch { }
  }
  return response;
}
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (request.mode === "navigate" && ENTRY_PATHS.has(url.pathname)) {
    event.respondWith(navigation(request));
  } else if (CORE.includes(url.href) && url.href !== SHELL) {
    event.respondWith(staticAsset(request, true));
  } else if (url.pathname.startsWith(VENDOR_PATH)) {
    event.respondWith(staticAsset(request, true));
  }
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "#/rem";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => { for (const c of cs) { if ("focus" in c) { c.navigate ? c.focus().then(() => c.postMessage({ go: url })) : c.focus(); return; } } return self.clients.openWindow("./" + url); }));
});
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Nabiad", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "nabiad", renotify: true, data: { url: (d.url || "").replace(/^\//, "") || "#/dash" } }));
});
