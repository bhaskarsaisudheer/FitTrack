/*
 * FitTrack service worker.
 *
 * Strategy:
 *  - App shell (HTML, JS, CSS, icons): precached on install, served from the
 *    cache first so the app opens instantly and works offline.
 *  - API requests: network only. Workout data must never be served from a
 *    stale cache, because the user could otherwise lose a logged set.
 */

const VERSION = 'v1';
const SHELL_CACHE = `fittrack-shell-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` fails the whole install if any single asset 404s, so each
      // asset is added independently and failures are tolerated.
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map((asset) =>
            cache.add(asset).catch(() => {
              /* An asset that cannot be pre-cached is not fatal. */
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fittrack-shell-') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin API traffic is always live — never cache workout data.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api')) {
    return;
  }

  // Ignore non-GET and cross-origin requests entirely.
  if (url.origin !== self.location.origin) return;

  // Navigation requests fall back to the cached shell when the network is
  // unavailable, so client-side routes still load offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Static assets: cache first, then network, then cache the result.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error()));
    }),
  );
});
