// Offline support.
//   install   precache the app shell (HTML, config, styles, every JS module, interface strings, icons).
//             tools/build.mjs fills SHELL and VERSION; in development SHELL is empty and VERSION 'dev'.
//   fetch     navigations: network first, the cached shell when offline.
//             content/** (the compendium, loaded per section): network first, kept in a separate cache
//             that survives app updates, so sections read once stay readable offline.
//             other same-origin files and the Google font: cache first, then network (and cached).
const VERSION = 'dev';
const SHELL = [];
const CACHE = `meletee-${VERSION}`;
const CONTENT = 'meletee-content';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('meletee-') && k !== CACHE && k !== CONTENT).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (fallback && (await caches.match(fallback)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !isFont) return;
  // noema-lite's library (proxied by netlify.toml) changes on its own schedule: always ask the network.
  if (sameOrigin && url.pathname.startsWith('/noema-library/')) return;
  if (req.mode === 'navigate') e.respondWith(networkFirst(req, CACHE, './index.html'));
  else if (sameOrigin && url.pathname.includes('/content/')) e.respondWith(networkFirst(req, CONTENT));
  else e.respondWith(cacheFirst(req));
});
