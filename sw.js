// VERA v1.0 — Kill switch SW
// Este SW desinstala todos os anteriores e força reload

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', async e => {
  // Apagar TODOS os caches
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  
  // Tomar controle de todas as abas
  await clients.claim();
  
  // Forçar reload de todas as abas abertas
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(client => {
    client.navigate(client.url);
  });
  
  // Auto-desinstalar este SW também
  self.registration.unregister();
});

self.addEventListener('fetch', e => {
  // Buscar sempre da rede, nunca do cache
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});
