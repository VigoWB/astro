// Minimalny service worker dla offline mode - bez sztywnych ścieżek do plików
// Pliki statyczne są pobierane dynamicznie z public/ podczas buildu.
//
// Obsługujemy tylko zapytania do naszej domeny. Zdjęcia galerii (miniatury
// i wersje do lightboxa) Astro robi przy buildzie do /_astro/, więc strona
// nie pobiera już niczego z R2 — nie potrzebujemy osobnej obsługi innych domen.

// foto-v6: style strony offline w osobnym pliku /offline.css (wymóg Content-Security-Policy).
const CACHE_NAME = 'foto-v6';

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
      '/polityka-prywatnosci/',
      '/polityka-prywatnosci/index.html',
      '/offline.html',
      '/offline.css',
      '/manifest.webmanifest',
      '/favicon.svg',
      '/og-default.jpg',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-192-maskable.png',
      '/icon-512-maskable.png',
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

  // Zapytania do innych domen (analityka, Turnstile, Formspree) zostawiamy
  // przeglądarce — service worker ich nie dotyka.
  if (url.origin !== location.origin) {
    return;
  }

  // Nawigacja (strony HTML) — network-first: po każdym deployu ma być
  // widoczna świeża treść, cache to tylko zapasowa opcja przy braku sieci.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            if (networkResponse.ok) cache.put(request, responseClone); // strona błędu (404/500) nie nadpisze dobrej kopii na czas bez sieci
          });
          return networkResponse;
        })
        .catch(() =>
          caches.match(request).then(
            (cachedResponse) => cachedResponse || caches.match('/offline.html')
          )
        )
    );
    return;
  }

  // Pozostałe zasoby (pliki z hashem w /_astro/, w tym zdjęcia galerii) — cache-first,
  // bo pod tym samym URL-em zawsze mają tę samą treść.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          const wartoZapisac =
            networkResponse.ok &&
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
        .catch(() => new Response('Offline', { status: 503 }));
    })
  );
});