/* PlateMates service worker */
const VERSION = "platemates-v17";
const SHELL_CACHE = VERSION + "-shell";
const FONT_CACHE = VERSION + "-fonts";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: separate cache, cache-first with background refresh
  if (isFont(url)) {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE, event));
    return;
  }

  // Only handle same-origin requests inside our scope
  if (url.origin !== self.location.origin) return;

  // Exercise photos are online-only: never cached by the service worker
  if (url.pathname.endsWith("/exercise-photos.webp")) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  // Navigations fall back to the cached app shell
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached =
          (await cache.match(req, { ignoreSearch: true })) ||
          (await cache.match("./index.html")) ||
          (await cache.match("./"));
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put("./index.html", res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const res = await network;
        return res || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      })
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE, event));
});

async function staleWhileRevalidate(req, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: cacheName === SHELL_CACHE });
  const network = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || new Response("", { status: 504 });
}
