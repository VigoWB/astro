---
paths:
  - "tests/**"
  - "scripts/build-testowy.mjs"
  - "scripts/start-preview-if-needed.mjs"
  - "playwright.config.ts"
  - "vitest.config.ts"
  - ".github/workflows/**"
  - "src/lib/**"
  - "src/data/**"
---

# Dane testowe i poziomy testów — portfolio fotograficzne (balansbieli.pl)

Dawna sekcja 7 `AGENTS.md` (część „Dane testowe” i „Poziomy testów”). Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `tests/`, `scripts/build-testowy.mjs`, konfigurację Playwrighta albo Vitesta, `.github/workflows/` albo logikę w `src/lib/` i `src/data/`, a OpenCode — na starcie każdej sesji (`instructions` w `opencode.json`). Zakazy z sekcji 2 i pułapki z sekcji 11 `AGENTS.md` obowiązują niezależnie od niego.

**Dane testowe:** testy Playwright nie używają prawdziwych zdjęć. `npm run test:e2e` (ostatni etap `npm test`) buduje stronę przez `scripts/build-testowy.mjs`: zamiast `src/data/galeria.json` bierze `tests/dane/galeria.json` (zdjęcia ułożone pod testy: ponad 8 zdjęć, kategoria z jednym zdjęciem, zdjęcia z „przed” i bez, para do suwaka, polskie litery w nazwach), zamiast R2 — atrapę na porcie 4324 z szarymi zdjęciami JPG, a Formspree i Turnstile dostają wartości testowe (testy nie potrzebują `.env`). Wynik idzie do `dist-testy/`, podgląd dla testów na porcie 4323; `npm run build` i `dist/` zostają prawdziwe. Kod strony nic o tym nie wie — podmiana jest tylko w skrypcie. Build testowy ma własny cache (`node_modules/.astro-testy`). Na Windowsie pierwszy build na świeżym cache potrafi wyjść bez arkusza CSS — skrypt to wykrywa i sam buduje drugi raz („Pierwszy build wyszedł bez arkusza stylów…” w logu to nie błąd); gdy i to nie pomoże, kończy się błędem z podpowiedzią.
- `tests/dane/galeria.json` wolno edytować ręcznie (zakaz z sekcji 2 dotyczy tylko `src/data/galeria.json`). Ma ten sam układ pól co prawdziwy plik. Nowy przypadek do sprawdzenia = nowy wpis tutaj, a gdy testy go wymagają — także warunek w `tests/dane-testowe.spec.ts`.
- `tests/dane-testowe.spec.ts` pilnuje, że testy widzą stronę z danych testowych i że dane mają przypadki, których potrzebują testy galerii i suwaka. Brak przypadku na stronie to błąd testu, nie pominięcie: `test.skip` tylko z powodu projektu (telefon albo komputer), funkcji przeglądarki albo braku sieci — nigdy z powodu danych ani tego, co jest na stronie.
- Nowe pole w `galeria.json` (zmiana `sync-images`) = to samo pole w `tests/dane/galeria.json`.

**Poziomy testów** (CI uruchamia je w tej kolejności, każdy dopiero po zielonym poprzednim; `npm test` lokalnie tak samo):
- **Jednostkowe** — Vitest, `tests/jednostkowe/*.test.ts`: jedna funkcja albo jeden moduł, dane podstawione w teście (`vi.doMock`), bez sieci i bez renderowania. Przykład: lista kategorii liczona z `galeria.json`.
- **Integracyjne** — Vitest, `tests/integracyjne/*.test.ts`: kilka modułów razem, z atrapami tego, co wychodzi poza komputer — R2 to `vi.stubGlobal("fetch", …)`, `astro:assets` to `vi.mock`. Komponenty `.astro` renderuje Container API (`experimental_AstroContainer` — w Astro nadal eksperymentalne). Przykład: `src/lib/galeria.ts` (znak wodny, wersja z ETag, awaria R2), JSON-LD w `Schema.astro`.
- **E2e** — Playwright, `tests/*.spec.ts`: gotowa strona z danych testowych w przeglądarce (wyżej, „Dane testowe”). Testy e2e importują `test` i `expect` z `./pomocnicze` (atrapa statystyk Cloudflare w każdym teście), a w `page.route`, który przepuszcza zapytania, używamy `route.fallback()`, nie `route.continue()` (continue idzie prosto do sieci i omija atrapy z `context.route`).
- Plik Vitesta kończy się na `.test.ts`, plik Playwrighta na `.spec.ts` — każde narzędzie bierze tylko swoje (`include` w `vitest.config.ts`, `testMatch` w `playwright.config.ts`).
- Nowa logika w `src/lib/` albo `src/data/` = test jednostkowy albo integracyjny; zachowanie w przeglądarce = test e2e.
- Test nie zależy od prawdziwych zdjęć ani od `.env`: dane podstawiasz w teście, a zmienne `PUBLIC_*` przez `vi.stubEnv`.
- `scripts/sync-images.mjs` rusza sam przy imporcie (pytania w terminalu, R2, zapis `galeria.json`) — testy importują tylko `scripts/sync-images-funkcje.mjs`. Nową logikę sync-images, którą da się oddzielić od terminala, R2 i plików, dodawaj do tego modułu razem z testem; moduł nie może nic robić przy imporcie.
