// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://foto.vigolab.ovh',
  integrations: [sitemap()],
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()]
  }
});