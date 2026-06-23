const CACHE_NAME = 'vera-v7';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

// Nunca cacheia — sempre busca na rede
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-points') {
    e.waitUntil(self.clients.matchAll().then(cls => {
      cls.forEach(c => c.postMessage({ type: 'DO_SYNC' }));
    }));
  }
});
