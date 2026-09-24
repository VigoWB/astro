// @ts-check
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

export default defineConfig({
  site: 'https://foto.vigolab.ovh',
  base: '/',
  integrations: [sitemap()],
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
