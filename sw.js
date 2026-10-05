const CACHE = 'ah13-daily-v7';
const PREFIX = 'ah13-daily-';
const CORE = ['./', './index.html', './manifest.json'];
const INDEX_URL = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Account and data requests must not be saved by this worker.
  if (request.headers.has('Authorization')) return;
  const isPage = request.mode === 'navigate';
  const isCore = CORE.some(path => new URL(path, self.location.href).href === url.href);
  if (!isPage && !isCore) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok && response.type === 'basic') {
        try {
          await cache.put(request, response.clone());
          // Keep the canonical home fallback current after a navigation.
          const home = new URL('./', self.location.href);
          if (isPage && (url.pathname === home.pathname || url.href === INDEX_URL)
              && response.headers.get('content-type')?.includes('text/html')) {
            await cache.put(INDEX_URL, response.clone());
          }
        } catch (_) {
          // A storage failure must not hide a successful network response.
        }
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (isPage) {
        const home = await cache.match(INDEX_URL);
        if (home) return home;
        return new Response('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>غير متصل</title><p>لا يوجد اتصال بالإنترنت. حاول مرة أخرى عند عودة الاتصال.</p></html>', {
          status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return Response.error();
    }
  })());
});
