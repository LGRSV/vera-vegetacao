const CACHE_NAME = 'vera-v7';
const APP_VERSION = '1.0.0';

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

// Nunca cacheia HTML/JS — sempre busca na rede
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Não intercepta APIs externas
  if (url.hostname !== 'lgrsv.github.io') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-points') {
    e.waitUntil(self.clients.matchAll().then(cls => {
      cls.forEach(c => c.postMessage({ type: 'DO_SYNC' }));
    }));
  }
});
