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
| `npm test` | wszystkie etapy po kolei, jak w CI: typy → testy jednostkowe → integracyjne → e2e |
| `npx vitest run` | same testy jednostkowe i integracyjne (Vitest, kilka sekund) |
| `npm run test:e2e` | build na danych testowych (`dist-testy/`) + testy Playwright |
| `npm run sync-images` | dodanie nowych zdjęć z `images/` do R2 i `galeria.json` |

## Testy lokalnie

Przed pierwszym uruchomieniem testów (i po każdej aktualizacji Playwrighta w `package.json`) zainstaluj przeglądarkę:

```
npx playwright install chromium
```

Bez tego wszystkie testy padają od razu z komunikatem `Executable doesn't exist … Please run: npx playwright install`.

Testy nie używają prawdziwych zdjęć. Testy jednostkowe i integracyjne (Vitest) podstawiają dane i atrapy w samym teście. Etap e2e (`npm run test:e2e`, ostatni w `npm test`) najpierw buduje stronę na danych testowych (`npm run build:testy`, wynik w `dist-testy/`): galeria z `tests/dane/galeria.json`, szare zdjęcia z atrapy R2 uruchamianej na chwilę na tym komputerze, wartości testowe Formspree i Turnstile. Dlatego testy działają bez sieci i bez pliku `.env`, a nowe zdjęcia w galerii ich nie zmieniają. Prawdziwy build (`npm run build`, `dist/`) zostaje nietknięty. Szczegóły: `AGENTS.md`, sekcja 7, „Dane testowe”.

Testy formularza kontaktowego podmieniają widżet Turnstile atrapą i przechwytują wysyłkę do Formspree. Prawdziwy widżet Cloudflare sprawdza jeden test („Turnstile (prawdziwy widżet Cloudflare)”) — bez dostępu do Cloudflare jest pomijany, w CI musi przejść.
