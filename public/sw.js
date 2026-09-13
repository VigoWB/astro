const CACHE_NAME = 'foto-v1';

const PRECACHE_URLS = [
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
  '/_astro/Layout.BiNkwaF5.css',
  '/_astro/Galeria.astro_astro_type_script_index_0_lang.DayLQeJF.js',
  '/_astro/DSC_1111.B-mgpPxa_27C4AB.webp',
  '/_astro/DSC_1112.BGJXU5wu_e0tsf.webp',
  '/_astro/DSC_1113.yI6TRw_9_2pv3r1.webp',
  '/_astro/DSC_1114.DyausMpA_Z1H9dIH.webp',
  '/_astro/DSC_1115.RUn8RtxQ_FRymg.webp',
  '/_astro/DSC_1116.dsSkWFid_Z2yWSy.webp',
  '/_astro/DSC_4968-Edytuj.BLdRUWDO_2aOrma.webp',
  '/_astro/DSC_4971-Edytuj.fRu92MWm_ZkfdsW.webp',
  '/_astro/moje-zdjecie.dwgqp2KI_1WHmiI.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
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

  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse.ok &&
            (request.destination === 'image' ||
              request.destination === 'style' ||
              request.destination === 'script')
          ) {
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