// Service worker — tryb offline dla portfolio.
//
// Co robi:
// - przy instalacji zapisuje w pamięci przeglądarki podstrony, stronę offline,
//   ikony i czcionki;
// - strony HTML pobiera najpierw z sieci (świeża treść po każdym deployu), ale
//   gdy sieć milczy dłużej niż LIMIT_SIECI_MS, pokazuje zapisaną kopię;
// - czcionki, ikony, obrazki, style i skrypty: najpierw z pamięci, potem z sieci.
//
// Zmieniasz listę plików albo logikę poniżej? Podbij CACHE_NAME (foto-v7 → foto-v8),
// inaczej odwiedzający zostaną przy starej kopii. Dotyczy to też plików bez hasha
// w nazwie (ikony, czcionki, offline.css) — te odświeżają się tylko razem z CACHE_NAME.
//
// Obsługujemy tylko zapytania do naszej domeny. Zdjęcia galerii Astro robi przy
// buildzie do /_astro/, więc strona nie pobiera niczego z R2.

const CACHE_NAME = 'foto-v7';
const LIMIT_SIECI_MS = 4000;

const OFFLINE_URL = '/offline.html';

// Bez tych dwóch plików strona offline nie ma sensu — jeśli któryś się nie pobierze,
// instalacja kończy się błędem, a przeglądarka zostaje przy poprzedniej wersji.
const WAZNE = [OFFLINE_URL, '/offline.css'];

// Reszta zapisuje się „na ile się uda": jeden brakujący plik nie blokuje instalacji.
// Adresy podstron są takie, jak serwuje je Cloudflare Pages (z ukośnikiem na końcu);
// wpisy typu "/galeria/index.html" to tylko przekierowania, więc ich nie ma.
const POZOSTALE = [
  '/',
  '/galeria/',
  '/kontakt/',
  '/o-mnie/',
  '/polityka-prywatnosci/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/og-default.jpg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/fonts/noto-sans-latin.woff2',
  '/fonts/noto-sans-polskie-znaki.woff2',
];

const TYPY_DO_ZAPISU = new Set(['image', 'style', 'script', 'font']);

// Odpowiedź, która przyszła po przekierowaniu (Cloudflare Pages zamienia
// /offline.html na /offline), nie może być oddana jako odpowiedź na nawigację —
// Chrome zgłasza wtedy błąd i pokazuje własną stronę „brak połączenia".
// Dlatego do pamięci trafia czysta kopia, bez śladu przekierowania.
async function bezPrzekierowania(odpowiedz) {
  if (!odpowiedz.redirected) return odpowiedz;
  return new Response(await odpowiedz.blob(), {
    status: odpowiedz.status,
    statusText: odpowiedz.statusText,
    headers: odpowiedz.headers,
  });
}

async function zapiszWCache(cache, adres) {
  const odpowiedz = await fetch(adres, { cache: 'reload' });
  if (odpowiedz.status !== 200) throw new Error(`${adres}: status ${odpowiedz.status}`);
  await cache.put(adres, await bezPrzekierowania(odpowiedz));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(WAZNE.map((adres) => zapiszWCache(cache, adres)));
      await Promise.allSettled(POZOSTALE.map((adres) => zapiszWCache(cache, adres)));
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Usuwamy stare cache'y przy nowej wersji
  event.waitUntil(
    caches
      .keys()
      .then((nazwy) =>
        Promise.all(nazwy.filter((nazwa) => nazwa !== CACHE_NAME).map((nazwa) => caches.delete(nazwa)))
      )
      .then(() => self.clients.claim())
  );
});

// Strony HTML: najpierw sieć (po deployu ma być świeża treść), ale z limitem czasu.
// Bez limitu przy słabym zasięgu przeglądarka czeka na sieć nawet kilka minut,
// choć zapisana kopia leży gotowa.
async function obsluzNawigacje(event) {
  const { request } = event;

  const siec = fetch(request).then((odpowiedz) => {
    if (odpowiedz.status === 200) {
      // Tylko poprawna odpowiedź zastępuje kopię — strona błędu (404/500) jej nie nadpisze.
      const kopia = odpowiedz.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, kopia)));
    }
    return odpowiedz;
  });
  siec.catch(() => {}); // błąd sieci obsługujemy niżej; to tylko ucisza ostrzeżenie w konsoli

  const zapisana = () => caches.match(request);

  try {
    const zwloka = new Promise((resolve) => setTimeout(resolve, LIMIT_SIECI_MS, null));
    const wynik = await Promise.race([siec, zwloka]);
    if (wynik) return wynik;
    // Sieć zwleka: jest kopia — pokazujemy ją od razu; nie ma — czekamy dalej na sieć.
    return (await zapisana()) || (await siec);
  } catch {
    return (await zapisana()) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

// Pozostałe zasoby (pliki z hashem w /_astro/, czcionki, ikony): najpierw pamięć,
// bo pod tym samym adresem mają tę samą treść.
async function obsluzZasob(event) {
  const { request } = event;

  const zapisana = await caches.match(request);
  if (zapisana) return zapisana;

  try {
    const odpowiedz = await fetch(request);
    if (odpowiedz.status === 200 && TYPY_DO_ZAPISU.has(request.destination)) {
      const kopia = odpowiedz.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, kopia)));
    }
    return odpowiedz;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Wysyłka formularza, Turnstile, analityka i inne domeny — zostają przy przeglądarce.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== location.origin) return;

  event.respondWith(request.mode === 'navigate' ? obsluzNawigacje(event) : obsluzZasob(event));
});