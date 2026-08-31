// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // TODO: podmień na docelową domenę, gdy będzie znana (Etap 8 — wdrożenie)
  site: 'https://twoja-domena.pl',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});