/* Northwood Stadium — Service Worker
   Required for the "Add to Home Screen" install prompt to fire on
   Android/Chrome — a page needs a registered service worker for the
   browser to consider it installable.

   Deliberately NETWORK-FIRST: it tries the live network first and only
   falls back to the cached copy if the network fails (e.g. offline).
   This avoids the stale-content problem FC Hanley's site ran into
   early on, where a cache-first worker kept serving old pages after
   updates — here, anyone with a connection always sees the current
   version, and the cache only exists as an offline fallback.
*/

const CACHE_NAME = 'northwood-v2';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './images/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle this site's own page/asset GETs. Everything else —
  // Firebase Auth sign-in (POST), Firestore's live connection, Square,
  // Google Fonts, the payment Cloud Function — goes straight to the
  // network untouched. Intercepting those broke staff login (Firestore
  // reported 'client is offline') and threw 'POST is unsupported'.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});