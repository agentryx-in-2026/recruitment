// HireStream Service Worker — offline cache + network-first for API
// IMPORTANT: Bump CACHE_VERSION on every production build so clients get
// the latest HTML (which references new hashed asset filenames).
const CACHE_VERSION = "hirestream-v4-2026-04-14";
const STATIC_ASSETS = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API calls (always fresh)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ success: false, message: "Offline — request failed" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // Network-first for HTML navigation (so new bundle hashes always load)
  // Falls back to cache only when network fails
  const isNavigation = request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html");
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/")))
    );
    return;
  }

  // Cache-first for hashed static assets (JS/CSS/images — filenames change per build)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp.ok && request.method === "GET") {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return resp;
      }).catch(() => caches.match("/"));
    })
  );
});
