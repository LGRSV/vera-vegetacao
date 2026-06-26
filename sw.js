// VERA — Service Worker neutralizado (não cacheia nada)
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', async e => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.registration.unregister();
  const cls = await self.clients.matchAll();
  cls.forEach(c => c.navigate(c.url));
});
