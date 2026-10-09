# Portfolio fotograficzne — balansbieli.pl

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

## Testy lokalnie

Przed pierwszym uruchomieniem testów (i po każdej aktualizacji Playwrighta w `package.json`) zainstaluj przeglądarkę:

```
npx playwright install chromium
```

Bez tego wszystkie testy padają od razu z komunikatem `Executable doesn't exist … Please run: npx playwright install`.

Testy formularza kontaktowego podmieniają widżet Turnstile atrapą, więc działają bez sieci i bez klucza. Prawdziwy widżet sprawdza jeden test („Turnstile (prawdziwy widżet Cloudflare)”): bez dostępu do Cloudflare jest pomijany, a z kluczem z `.env` może paść (klucz produkcyjny najpewniej nie działa na `localhost`). Żeby go uruchomić lokalnie, w PowerShellu:

```
$env:PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"; npm test
```

Klucz obowiązuje tylko w tym oknie terminala i nie trafia do repo. Test „Załaduj więcej przy włączonym filtrze” jest pomijany, dopóki żadna kategoria nie ma więcej niż 8 zdjęć.