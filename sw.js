const CACHE_NAME = 'olifinancas-v73';
const SHARED_CACHE_NAME = 'olifinancas-shared-files-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icons/favicon-32x32.png',
  './icons/favicon-16x16.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/mascot-ghibli.png',
  './js/app.js?v=73',
  './js/data-seed.js?v=73',
  './js/housing-financing.js?v=73',
  './js/ofx-csv-parser.js?v=73',
  './js/supabase-sync.js?v=73'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Falha parcial no pré-cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== SHARED_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  const url = new URL(event.request.url);

  // Intercepta arquivos enviados pelo menu "Compartilhar" do Android (Web Share Target API)
  if (event.request.method === 'POST' && url.searchParams.has('share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('statements');
          const cache = await caches.open(SHARED_CACHE_NAME);
          const oldKeys = await cache.keys();
          await Promise.all(oldKeys.map((k) => cache.delete(k)));

          const metaList = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file || typeof file.arrayBuffer !== 'function') continue;
            const buf = await file.arrayBuffer();
            const fileKey = `/__shared_file_${i}__`;
            await cache.put(
              fileKey,
              new Response(buf, {
                headers: {
                  'Content-Type': file.type || 'application/octet-stream'
                }
              })
            );
            metaList.push({
              key: fileKey,
              name: file.name || `extrato_${i + 1}.ofx`,
              type: file.type || 'application/octet-stream',
              lastModified: file.lastModified || Date.now()
            });
          }

          await cache.put(
            '/__shared_meta__',
            new Response(JSON.stringify(metaList), {
              headers: { 'Content-Type': 'application/json' }
            })
          );
        } catch (err) {
          console.error('Erro ao receber arquivo compartilhado:', err);
        }
        return Response.redirect('./index.html?shared=1', 303);
      })()
    );
    return;
  }

  // Ignora requisições que não sejam GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
