---
paths:
  - "src/**"
  - "tests/**"
  - "scripts/**"
  - "public/**"
---

# Struktura plików — portfolio fotograficzne (balansbieli.pl)

Dawna sekcja 6 `AGENTS.md`. Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `src/`, `tests/`, `scripts/` albo `public/`, a OpenCode — na starcie każdej sesji (`instructions` w `opencode.json`). Zakazy z sekcji 2 i pułapki z sekcji 11 `AGENTS.md` obowiązują niezależnie od niego.

```
.claude/skills/            skille Astro: docs-lookup, astro-best-practices, create-component (sekcja 11)
.claude/rules/             7 plików reguł (konwencje kodu, struktura, testy, przepisy, elementy strony, zdjęcia, funkcje AI), każdy wczytywany przy pracy na pasujących plikach (`paths` na górze pliku)
.github/workflows/ci.yml   etapy po kolei: typy i testy jednostkowe → testy integracyjne → testy e2e → build + Lighthouse → „Wynik” (wymagany do scalenia PR)
.github/pull_request_template.md   szablon opisu PR: co i po co, wiedza z zadania, jak sprawdzone
.github/dependabot.yml     cotygodniowe PR-y z aktualizacjami npm i akcji GitHuba
public/
  _headers                 nagłówki HTTP Cloudflare (komentarze TYLKO przez "#")
  fonts/                   podzbiór Noto Sans (2 pliki .woff2) — patrz global.css i sekcja 10
  sw.js                    service worker (offline), ma ręczną listę stron
  manifest.webmanifest, offline.html + offline.css, ikony, og-default.jpg, robots.txt
  favicon.svg, icon-*.png, og-default.jpg   przygotowuje Claude z logo — nie edytuj ręcznie
scripts/
  sync-images.mjs          images/ → R2 + data/galeria.db → src/data/galeria.json
  sync-images-funkcje.mjs   czyste funkcje sync-images (nazwy par, klucze R2, opcje, numery, czyszczenie plików do R2 z porównaniem pikseli, galeria.json ↔ baza) — bez skutków przy imporcie, z testami Vitesta
  sprawdz-czyszczenie.mjs   tylko odczyt: co czyszczenie zostawi w zdjęciach z images/ (uruchamia Wiktor przed --podmien; logika w sync-images-funkcje.mjs)
  build-testowy.mjs        build na danych testowych do dist-testy/ (atrapa R2, tests/dane/galeria.json) — dla npm test
  start-preview-if-needed.mjs  uruchamia podgląd builda testowego dla testów, port 4323 (Node, dziala tez na Windows)
src/
  assets/moje-zdjecie.jpg  zdjęcie profilowe (o-mnie.astro i Schema.astro)
  assets/logo.svg          logo: nagłówek (Header.astro), stopka (Footer.astro) i znak wodny (sync-images.mjs)
  components/
    Header.astro           logo i menu: pasek u góry (telefon, tablet) albo pasek boczny (od lg)
    Footer.astro
    SEO.astro              meta, Open Graph, Twitter, canonical
    Schema.astro           dane strukturalne JSON-LD: Person, ProfessionalService, WebSite (zawsze), ImageGallery i BreadcrumbList (gdy strona je przekaże)
    Galeria.astro          siatka, filtry, "Załaduj więcej", lightbox (używana też na / bez filtrów/"Załaduj więcej")
    PorownanieSuwak.astro  suwak przed/po (albo zastępczy przełącznik) na pierwszym ekranie /
    ContactForm.astro      formularz Formspree + walidacja + Turnstile
    NajczestszePytania.astro  lista najczęstszych pytań na /faq/ (treść pytań jest tutaj)
    ui/Container.astro     tylko max-w-240 mx-auto px-4
    ui/Karta.astro         kafelek zdjęcia w galerii
    ui/Pytanie.astro       jedno rozwijane pytanie (<details>, bez JS), odpowiedź w slocie
  data/
    galeria.json           GENEROWANY, nie edytuj ręcznie
    kategorie.ts           lista kategorii LICZONA przy buildzie z galeria.json
    nav.ts                 linki w menu i w stopce (`navLinks`) oraz tylko w stopce (`linkiStopki`)
    siteConfig.json        dane osoby i firmy dla Schema/SEO, lista usług do formularza (`uslugi`)
  lib/galeria.ts           wczytywanie zdjęć (adresy R2, wersje do lightboxa) — wspólne dla / i /galeria
  lib/odmiana.ts           odmiana słowa „zdjęcie” przez liczebnik (1 zdjęcie, 2 zdjęcia, 5 zdjęć)
  lib/stronaGlowna.ts      wybór zdjęć na stronę główną: para do suwaka (wybierzBohatera) i „Wybrane prace” (wybierzWyroznione)
  lib/exif.ts              podpis z danych aparatu do lightboxa (formatujExif, używa Karta.astro)
  env.d.ts                 typy zmiennych środowiskowych
  layouts/Layout.astro, ArticleLayout.astro
  pages/index.astro, galeria.astro, kontakt.astro, faq.astro, o-mnie.astro, 404.astro
  pages/oferta.astro       szkic oferty — UKRYTY do czasu cen (sekcja 10, „Ukryta podstrona”)
  pages/polityka-prywatnosci.md  polityka prywatności (ArticleLayout) — to strona: zmiana = testy (sekcja 3, krok 2)
  styles/global.css        Tailwind v4, @theme (kolory), font Noto Sans
tests/404.spec.ts, a11y.spec.ts, csp.spec.ts, dane-testowe.spec.ts, galeria.spec.ts, kontakt.spec.ts, naglowek.spec.ts, oferta.spec.ts, offline.spec.ts, pytania.spec.ts, sitemapa.spec.ts, suwak.spec.ts; pomocnicze.ts (funkcje dla testów i `test` z automatyczną atrapą statystyk Cloudflare)
tests/strony.ts            wspólna lista stron STRONY — bez importów, czytają ją i Vitest, i Playwright (przez pomocnicze.ts)
tests/dane/galeria.json    dane testowe galerii (edytowane ręcznie) — z nich powstaje strona do testów
tests/piexifjs.d.ts   typy dla piexifjs (paczka ich nie ma) — tylko dla testu EXIF-u
tests/jednostkowe/         testy jednostkowe Vitesta (*.test.ts): kategorie.test.ts, nawigacja.test.ts, odmiana.test.ts, strony.test.ts (public/sw.js i lighthouserc.json zgodne z listą STRONY), sync-images.test.ts
tests/integracyjne/        testy integracyjne Vitesta (*.test.ts): galeria.test.ts (src/lib/galeria.ts z atrapą R2), porownanie-suwak.test.ts, seo-i-schema.test.ts, sync-images.test.ts
vitest.config.ts           konfiguracja Vitesta: dwa projekty, „jednostkowe” i „integracyjne”
images/, data/galeria.db   TYLKO na moim komputerze, poza gitem
```
