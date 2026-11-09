// Offline support. The build id is injected into this file at build time (vite.config.ts),
// so every build gets its own cache and old caches are removed on activate.
//  - pages and the two JSON manifests: network-first, cache as offline fallback
//  - content-hashed files under js/: cache-first (the filename changes with the content)
//  - everything else (assets/, audio/, icons...): stale-while-revalidate
const BUILD = '__BUILD_ID__';
const CACHE = 'medieval-match-' + BUILD;
const NET_TIMEOUT = 5000; // slow network: fall back to the cached copy after this long

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function store(req, res) {
  if (res.status !== 200) return Promise.resolve();
  const copy = res.clone();
  return caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
}

// url: what to ask the network for (no-cache = always revalidate, never trust the HTTP cache)
function networkFirst(e, req, url) {
  const net = fetch(url, { cache: 'no-cache' }).then((res) => {
    e.waitUntil(store(req, res));
    return res;
  });
  const cached = () => caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: req.mode === 'navigate' }));
  const timer = new Promise((resolve) => setTimeout(resolve, NET_TIMEOUT)).then(() => cached()).then((hit) => hit || net);
  return Promise.race([net, timer]).catch(() => cached().then((hit) => hit || net));
}

function cacheFirst(e, req) {
  return caches.open(CACHE).then((c) => c.match(req)).then((hit) => hit || fetch(req).then((res) => {
    e.waitUntil(store(req, res));
    return res;
  }));
}

function staleWhileRevalidate(e, req) {
  return caches.open(CACHE).then((c) => c.match(req)).then((hit) => {
    const net = fetch(req, { cache: 'no-cache' }).then((res) => {
      e.waitUntil(store(req, res));
      return res;
    });
    if (hit) {
      e.waitUntil(net.catch(() => {}));
      return hit;
    }
    return net;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  const path = url.pathname;
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(e, req, req.url));
  } else if (path.endsWith('/assets/optional.json') || path.endsWith('/audio/audio.json')) {
    e.respondWith(networkFirst(e, req, req.url));
  } else if (path.includes('/js/')) {
    e.respondWith(cacheFirst(e, req));
  } else {
    e.respondWith(staleWhileRevalidate(e, req));
  }
});
