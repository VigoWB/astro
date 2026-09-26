// Minimalny service worker dla offline mode - bez sztywnych ścieżek do plików
// Pliki statyczne są pobierane dynamicznie z public/ podczas buildu.
//
// Zdjęcia galerii leżą na R2 (inna domena niż strona) — cache'ujemy je
// osobno, w trybie "no-cors" (R2 nie ma włączonego CORS, więc normalny
// fetch() zostałby zablokowany; "opaque" odpowiedź da się jednak zapisać
// w cache i pokazać jako obrazek, mimo że nie znamy jej statusu/kodu HTTP).

const CACHE_NAME = 'foto-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      '/',
      '/index.html',
      '/galeria/',
      '/galeria/index.html',
      '/kontakt/',
      '/kontakt/index.html',
      '/o-mnie/',
      '/o-mnie/index.html',
      '/offline.html',
      '/manifest.webmanifest',
      '/favicon.svg',
      '/og-default.jpg',
      '/icon-192.png',
      '/icon-512.png',
    ]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Usuwamy stare cache'y przy nowej wersji
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const wlasnaDomena = url.origin === location.origin;
  // Jedyny typ cross-origin requestu, który chcemy cache'ować: obrazek
  // (czyli zdjęcie z R2). Fonty/analityka z innych domen zostają nietknięte.
  const obcyObrazek = !wlasnaDomena && request.destination === 'image';

  if (!wlasnaDomena && !obcyObrazek) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      const zadanieSieciowe = obcyObrazek
        ? new Request(request, { mode: 'no-cors' })
        : request;

      return fetch(zadanieSieciowe)
        .then((networkResponse) => {
          const wartoZapisac = obcyObrazek
            ? networkResponse.type === 'opaque'
            : networkResponse.ok &&
              (request.destination === 'image' ||
                request.destination === 'style' ||
                request.destination === 'script');

          if (wartoZapisac) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});