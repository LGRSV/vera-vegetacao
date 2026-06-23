const CACHE_NAME = 'vera-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});

// Sync em background
self.addEventListener('sync', e => {
  if (e.tag === 'sync-points') {
    e.waitUntil(self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'DO_SYNC' }));
    }));
  }
});
