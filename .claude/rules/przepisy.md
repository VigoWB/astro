---
paths:
  - "src/**"
  - "public/**"
  - "astro.config.mjs"
  - "lighthouserc.json"
  - "tests/strony.ts"
  - "tests/**/*.spec.ts"
  - ".env.example"
  - "src/env.d.ts"
  - ".github/workflows/**"
  - "opencode.json"
---

# Przepisy — portfolio fotograficzne (balansbieli.pl)

Dawna sekcja 10 `AGENTS.md` (bez przepisu „Nowe zdjęcie w galerii”, który zostaje w `AGENTS.md`). Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `src/` albo `public/`, `astro.config.mjs`, `lighthouserc.json`, `tests/strony.ts`, test `*.spec.ts`, `.env.example`, `.github/workflows/` albo `opencode.json`, a OpenCode — na starcie każdej sesji (`instructions` w `opencode.json`). Zakazy z sekcji 2 i pułapki z sekcji 11 `AGENTS.md` obowiązują niezależnie od niego.

**Nowa podstrona:**
1. Utwórz `src/pages/nazwa.astro` (albo `.md` z `layout: ../layouts/ArticleLayout.astro`) i przekaż `title` oraz `description` do `Layout`.
2. Dodaj link w `src/data/nav.ts`: `navLinks` (menu i stopka) albo `linkiStopki` (tylko stopka).
3. Dopisz stronę do listy w `public/sw.js` i podbij `CACHE_NAME` (numer o jeden w górę — aktualny sprawdź w pliku).
4. Dopisz adres do `STRONY` w `tests/strony.ts` (z tej listy korzystają testy dostępności, CSP i sitemapy) i do `url` w `lighthouserc.json`. Zgodność `public/sw.js` i `lighthouserc.json` z tą listą pilnuje `tests/jednostkowe/strony.test.ts`, a sitemapy — `tests/sitemapa.spec.ts`.

**Ukryta podstrona (szkic, np. `/oferta/` przed podaniem cen):**
1. Utwórz stronę jak wyżej, ale przekaż do `Layout` prop `bezIndeksowania` (Google jej nie indeksuje).
2. Dopisz adres do `STRONY_POZA_SITEMAPA` w `astro.config.mjs` i do `STRONY` w `tests/strony.ts` (szkic też przechodzi testy dostępności i CSP). Zgodność `public/sw.js`, `lighthouserc.json` i sitemapy z tą listą pilnują `tests/jednostkowe/strony.test.ts` i `tests/sitemapa.spec.ts` (szkic zostaje na liście `STRONY`, ale nie ma go w `public/sw.js`, `lighthouserc.json` ani sitemapie).
3. Bez linku w `nav.ts` ani z innych stron, bez wpisu w `public/sw.js` i w `lighthouserc.json` (Lighthouse obniża ocenę SEO za noindex). Pilnuje tego `tests/oferta.spec.ts`.

Pokazanie ukrytej strony: usuń `bezIndeksowania` i wpis w `STRONY_POZA_SITEMAPA`, dodaj link w `nav.ts`, stronę w `public/sw.js` (i podbij `CACHE_NAME`) oraz w `lighthouserc.json`, a `tests/oferta.spec.ts` zmień tak, żeby sprawdzał link w menu i obecność w sitemapie.

**Nowa zmienna środowiskowa** (ten przepis jest zgodą na zmiany w wymienionych plikach, także w `astro.config.mjs` i `.github/` — jeśli zadanie od Claude polega na dodaniu zmiennej, o te pliki osobno nie pytasz):
1. Dodaj ją do `src/env.d.ts` (z opisem po polsku), do `.env.example` i do tabeli w sekcji 5. Prawdziwą wartość do `.env` wpisuje Wiktor — Ty dopisujesz tylko `.env.example`.
2. Jeśli bez niej build nie może powstać, dopisz ją do `WYMAGANE_ZMIENNE` w `astro.config.mjs`. Jeśli bez niej wyłącza się tylko jakaś funkcja — do `ZALECANE_ZMIENNE` (build przejdzie z ostrzeżeniem).
3. Jeśli jest potrzebna przy buildzie, dodaj ją do `env:` w kroku `Build` w `.github/workflows/ci.yml`. Testy mają osobny build: jeśli zmienna włącza coś, co sprawdzają testy, dopisz jej wartość testową w `scripts/build-testowy.mjs` (tam, gdzie `PUBLIC_FORMSPREE_ID`).
4. W raporcie wypisz mi, co mam zrobić sam: wartość w `.env`, zmienna w ustawieniach Cloudflare Pages, sekret w GitHubie (Settings → Secrets and variables → Actions) i — jeśli zmiennej potrzebuje prawdziwy build w CI — także sekret Dependabota (Settings → Secrets and variables → Dependabot; przebiegi Dependabota nie widzą zwykłych sekretów).

**Zmiana kolorów:** blok `@theme` w `src/styles/global.css`. Kontrast według konwencji (`.claude/rules/konwencje-kodu.md`): zwykły tekst co najmniej 7:1, minimum WCAG AA 4,5:1 — sprawdź każdą parę (kontrasty są w komentarzach w `global.css`). Te same kolory są wpisane na sztywno także w:
- `public/offline.css`, `public/manifest.webmanifest` (`theme_color`, `background_color`) i `src/components/SEO.astro` (`theme-color`) — zmień je razem i podbij `CACHE_NAME` w `public/sw.js`;
- `public/favicon.svg`, ikonach `public/icon-*.png` i `public/og-default.jpg` — te pliki przygotowuje Claude, nie edytujesz ich; napisz mi, że trzeba je zrobić od nowa;
- znaku wodnym: `ZNAK_NA_JASNYM` i `ZNAK_NA_CIEMNYM` w `scripts/sync-images.mjs` — zmiana działa tylko na nowo wgrywane zdjęcia; już wgrane trzeba wgrać ponownie przez `npm run sync-images -- --podmien <plik>` (każde zdjęcie; robię to ja) — napisz mi o tym w raporcie.

**Brakujący znak w czcionce (np. rzadki symbol, znak nowego języka):**
1. Jeśli w przeglądarce znak wygląda na zastępczy krój systemowy — to nie naprawi sam nowy zakres w `unicode-range` (`src/styles/global.css`), skoro glifu nie ma w pliku `.woff2`.
2. Pliki w `public/fonts/` to ręcznie wygenerowany podzbiór Noto Sans (`fontTools`, Python) — nie edytuj ich ani nie dopisuj zakresów na oślep.
3. Zatrzymaj się i zgłoś to jako osobne zadanie do Claude — potrzebna jest nowa wersja podzbioru z tym znakiem.

**Nowe pole w formularzu:**
1. Dodaj HTML: `label`, `input`, `span` na błąd z `aria-live`, `aria-describedby` i `data-testid`.
2. Dodaj pole do obiektu `pola` w skrypcie.
3. Dodaj regułę w funkcji `walidujPole()`.
4. Dodaj test w `tests/kontakt.spec.ts`.
5. Pole nieobowiązkowe wstaw do `<fieldset id="szczegoly-zlecenia">` (wtedy puste nie trafi do Formspree). Jeśli ma regułę, sprawdzaj je tylko wtedy, gdy coś wpisano — jak link do plików. Nowe pole zbierające dane dopisz też do `src/pages/polityka-prywatnosci.md`.

**Dane dla Google (Schema.org):** `src/data/siteConfig.json`.

**Treści powtórzone w kilku miejscach** (zmieniasz jedno — zmień wszystkie w tym samym commicie; przy wątpliwości szukaj fragmentu zdania w `src/`):
- przesyłanie plików (SwissTransfer albo Dysk Google): `/faq/` (`NajczestszePytania.astro`), `KROKI_ZAMOWIENIA` w `src/pages/index.astro`, podpowiedź pod polem „Link do plików” w `ContactForm.astro`, `src/pages/polityka-prywatnosci.md`;
- bezpłatna wycena: `/faq/`, `KROKI_ZAMOWIENIA`, zdanie pod nagłówkiem strony głównej (`index.astro`), `FAKTY` w `o-mnie.astro`, `src/pages/oferta.astro` (opis meta i tekst);
- termin „5–7 dni roboczych”: `/faq/`, `KROKI_ZAMOWIENIA`;
- JPG w pełnej rozdzielczości: `/faq/`, `KROKI_ZAMOWIENIA`, `FAKTY`;
- poprawki (uwagi w ciągu 7 dni, do 25% zdjęć): `/faq/`, `KROKI_ZAMOWIENIA`, `FAKTY`;
- zdanie „Retuszuję zdjęcia produktów do sklepów internetowych i reklam…”: pod nagłówkiem strony głównej i na `/oferta/`.
