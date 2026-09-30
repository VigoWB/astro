# Portfolio fotograficzne — foto.vigolab.ovh

Prywatna strona portfolio fotograficznego Wiktora: Astro 7 (w pełni statyczny), Tailwind CSS v4, hosting na Cloudflare Pages. Zdjęcia trzymane w Cloudflare R2, formularz kontaktowy przez Formspree z ochroną Cloudflare Turnstile.

Zasady pracy nad projektem, stos technologiczny i konwencje kodu opisuje [`AGENTS.md`](./AGENTS.md).

## Komendy

| Komenda | Działanie |
|---|---|
| `npm install` | instalacja zależności |
| `npm run dev` | serwer deweloperski (`localhost:4321`) |
| `npm run check` | sprawdzanie typów TypeScript |
| `npm run build` | build produkcyjny do `dist/` |
| `npm run preview` | podgląd builda (`localhost:4322`) |
| `npm run test` | build + testy Playwright |
| `npm run sync-images` | dodanie nowych zdjęć z `images/` do R2 i `galeria.json` |