const CACHE_NAME = 'vera-v6';
const ASSETS = ['/vera-vegetacao/', '/vera-vegetacao/index.html', '/vera-vegetacao/manifest.json'];

// Instala e limpa caches antigos
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

// Ativa e remove todos os caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Network first: sempre tenta a rede, cache só se falhar
self.addEventListener('fetch', e => {
  // Não intercepta requests de API ou dados externos
  const url = new URL(e.request.url);
  if (!url.hostname.includes('github.io') && !url.hostname.includes('github.com')) return;
  
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        // Atualiza o cache com a versão nova
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Sync em background
self.addEventListener('sync', e => {
  if (e.tag === 'sync-points') {
    e.waitUntil(self.clients.matchAll().then(cls => {
      cls.forEach(c => c.postMessage({ type: 'DO_SYNC' }));
    }));
  }
});
