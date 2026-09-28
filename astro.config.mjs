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