// @ts-check
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Astro nie udostępnia zmiennych z pliku .env wewnątrz astro.config.mjs,
// więc wczytujemy je ręcznie. Chodzi o PUBLIC_R2_URL — adres, pod którym
// leżą zdjęcia. Astro musi znać ten adres, żeby pozwolić sobie pobierać
// stamtąd zdjęcia i robić z nich miniatury podczas budowania strony.
// Gdy zmienisz adres (np. na własną subdomenę), wystarczy podmienić
// samą zmienną PUBLIC_R2_URL — tutaj nic nie trzeba poprawiać.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const adresZdjec = env.PUBLIC_R2_URL ? new URL(env.PUBLIC_R2_URL) : null;

// --- Sprawdzanie zmiennych środowiskowych (jedno miejsce dla całego builda) ---
// Dwie grupy:
// - WYMAGANE: bez nich strona nie ma sensu, build się zatrzymuje z czytelnym błędem.
// - ZALECANE: strona i tak się zbuduje, ale dana funkcja się wyłączy — w logu
//   builda pojawia się wyraźne ostrzeżenie, żeby to było widać od razu, a nie
//   dopiero gdy ktoś zauważy, że formularz nie działa albo nie ma ochrony
//   przed spamem.
//
// Dopisując w przyszłości kolejny sekret: dodaj go do jednej z list poniżej
// (albo zostaw poza nimi, jeśli ma być w pełni opcjonalny, jak dziś
// PUBLIC_CF_BEACON_TOKEN) — więcej nigdzie w tym pliku nic nie trzeba ruszać.
//
// Sprawdzanie odpalamy dopiero z hooka "astro:build:start" / "astro:server:start",
// NIE bezpośrednio tutaj w kodzie modułu — inaczej `npm run check` (krok
// "Type check" w CI, celowo uruchamiany bez żadnych zmiennych środowiskowych)
// wywalałby się przy każdym uruchomieniu, mimo że nie robi żadnego builda.
const WYMAGANE_ZMIENNE = [
  {
    klucz: 'PUBLIC_R2_URL',
    powod: 'bez niej strona nie wie, skąd pobierać zdjęcia — galeria nie może powstać',
  },
];

const ZALECANE_ZMIENNE = [
  {
    klucz: 'PUBLIC_FORMSPREE_ID',
    powod: 'formularz kontaktowy nie wyśle żadnej wiadomości',
  },
  {
    klucz: 'PUBLIC_TURNSTILE_SITE_KEY',
    powod: 'formularz zostaje bez ochrony przed spamem (Turnstile)',
  },
];

/** @param {import('astro').AstroIntegrationLogger} logger */
function sprawdzZmienneSrodowiskowe(logger) {
  const brakujaceWymagane = WYMAGANE_ZMIENNE.filter(({ klucz }) => !env[klucz]);
  if (brakujaceWymagane.length > 0) {
    const lista = brakujaceWymagane.map(({ klucz, powod }) => `  - ${klucz}: ${powod}`).join('\n');
    throw new Error(
      `Brak wymaganych zmiennych środowiskowych:\n${lista}\n\nUstaw je w pliku .env (lokalnie) oraz w ustawieniach Cloudflare Pages (produkcja). Zob. .env.example.`
    );
  }

  for (const { klucz, powod } of ZALECANE_ZMIENNE) {
    if (!env[klucz]) {
      logger.warn(`Brak zmiennej ${klucz} — ${powod}. Zob. .env.example.`);
    }
  }
}

// Integracja bez własnej logiki budowania — służy tylko do odpalenia
// sprawdzZmienneSrodowiskowe() we właściwym momencie (patrz komentarz wyżej).
const walidacjaZmiennychSrodowiskowych = {
  name: 'walidacja-zmiennych-srodowiskowych',
  hooks: {
    /** @param {import('astro').HookParameters<'astro:build:start'>} params */
    'astro:build:start': ({ logger }) => sprawdzZmienneSrodowiskowe(logger),
    /** @param {import('astro').HookParameters<'astro:server:start'>} params */
    'astro:server:start': ({ logger }) => sprawdzZmienneSrodowiskowe(logger),
  },
};

// --- Zdjęcia w sitemapie (image:image) dla Google Grafika ---
// Sitemapa powstaje PO zbudowaniu stron (hook astro:build:done), więc
// dist/galeria/index.html już istnieje. Zamiast drugi raz liczyć zmniejszone
// wersje zdjęć (adresy /_astro/ są haszowane, nieprzewidywalne z góry),
// czytamy gotowe dane ImageGallery (Schema.org), które galeria.astro już
// zapisało w tej stronie — te same zmniejszone wersje 1920 px, co
// w lightboxie. Żadnych adresów R2 w sitemapie.
async function obrazyGaleriiDlaSitemapy() {
  const sciezkaHtml = join(process.cwd(), 'dist', 'galeria', 'index.html');

  let html;
  try {
    html = await readFile(sciezkaHtml, 'utf8');
  } catch {
    console.warn(`⚠️  sitemap: nie znaleziono ${sciezkaHtml} — sitemapa powstanie bez zdjęć galerii.`);
    return [];
  }

  const bloki = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const galeria = bloki
    .map(([, tresc]) => {
      try {
        return JSON.parse(tresc);
      } catch {
        return null;
      }
    })
    .find((dane) => dane?.['@type'] === 'ImageGallery');

  if (!galeria?.image?.length) {
    console.warn('⚠️  sitemap: nie znaleziono danych ImageGallery w dist/galeria/index.html — sitemapa powstanie bez zdjęć galerii.');
    return [];
  }

  return galeria.image.map(
    (/** @type {{ contentUrl: string; name?: string }} */ obraz) => ({
      url: obraz.contentUrl,
      ...(obraz.name ? { caption: obraz.name } : {}),
    })
  );
}

export default defineConfig({
  site: 'https://foto.vigolab.ovh',
  base: '/',
  integrations: [
    walidacjaZmiennychSrodowiskowych,
    sitemap({
      // Dokładamy zdjęcia (image:image) tylko do wpisu /galeria, reszta
      // stron wraca bez zmian.
      serialize: async (item) => {
        const sciezka = new URL(item.url).pathname.replace(/\/+$/, '');
        if (sciezka === '/galeria') {
          const obrazy = await obrazyGaleriiDlaSitemapy();
          if (obrazy.length > 0) {
            // @astrojs/sitemap nie ma pola "img" w swoich typach, choć
            // biblioteka `sitemap`, z której korzysta, w pełni je obsługuje
            // (generuje <image:image> w XML) — stąd rzutowanie typu.
            return /** @type {import('@astrojs/sitemap').SitemapItem} */ ({
              ...item,
              img: obrazy,
            });
          }
        }
        return item;
      },
    }),
  ],
  output: 'static',
  image: {
    remotePatterns: adresZdjec
      ? [
          {
            protocol: adresZdjec.protocol.replace(':', ''),
            hostname: adresZdjec.hostname,
            ...(adresZdjec.port ? { port: adresZdjec.port } : {}),
          },
        ]
      : [],
  },
  vite: {
    plugins: [
      tailwindcss(),
    ]
  }
});