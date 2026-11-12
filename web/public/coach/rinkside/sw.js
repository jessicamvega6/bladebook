/*
 * The rinkside page's service worker (ADR-014; Batch 10). It keeps a copy of the page itself (its HTML, scripts and
 * styles) so the page opens at the rink with no signal. It never touches /api/: today's lessons and saved check-ins
 * live in the page's own storage, and contact details are never kept on the phone (ADR-014 d9b).
 *
 * Network first, so a coach with signal always gets the newest page; the copy is only for when there's none.
 */
const CACHE = 'bb-rinkside-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(self.registration.scope)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bb-rinkside-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })
    .then((hit) => hit || (e.request.mode === 'navigate' ? caches.match(self.registration.scope) : undefined))
    .then((hit) => hit || Response.error())));
});
