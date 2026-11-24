---
paths:
  - "src/**"
---

# Konwencje kodu — portfolio fotograficzne (balansbieli.pl)

Dawna sekcja 8 `AGENTS.md`. Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `src/`, a OpenCode — na starcie każdej sesji (`instructions` w `opencode.json`). Zakazy z sekcji 2 i pułapki z sekcji 11 `AGENTS.md` obowiązują niezależnie od niego.

**TypeScript**
- Każdy komponent ma `interface Props` w tym samym pliku, a `Astro.props` jest destrukturyzowane z domyślnymi wartościami.
- Żadnego `any`. W skryptach przeglądarki stosuj rzutowania typu `as HTMLImageElement`.

**Komponenty i importy**
- Wszystko w `.astro`, bez React/Vue.
- Ścieżki względne (`../components/...`), bez aliasu `@/`.
- `ui/` to proste komponenty wizualne, `components/` to komponenty z logiką.
- `<script>` zostaje w tym samym pliku `.astro`.

**Style**
- Tylko klasy Tailwind v4 i tokeny z `@theme`: `paper`, `ink`, `przycisk`, `przycisk-hover`, `muted`, `line`, `blok`, `blok-tekst`, `cien`, `error`, `success`. Paleta ma cztery role: tło `paper`, tekst `ink`, akcent `przycisk` (szałwia), tekst na akcencie `ink` — nie dodawaj nowej zieleni ani jaśniejszego wariantu akcentu do tła; nowy kolor tylko po decyzji Wiktora. Do czego który:
  - przyciski i stany aktywne (filtr, „Pokaż przed”, numery kroków): `bg-przycisk text-ink hover:bg-przycisk-hover`;
  - linki i aktywny link w menu: w kolorze tekstu (`text-ink`), wyróżnione podkreśleniem — link w tekście `underline underline-offset-2 hover:decoration-2`, aktywny link w menu `underline decoration-2 underline-offset-8`, pozostałe w menu po najechaniu `decoration-ink/40 hover:underline`; nie zmieniaj koloru linku po najechaniu;
  - drugoplanowe: `muted` (tekst), `line` (linie, obwódki kafelków — kafelki z obwódką, bez kolorowego tła);
  - wyróżniona sekcja w treści (zaproszenie do kontaktu na dole strony, „Co poprawiam przy retuszu”): tło strony z obwódką jak kafelki — `rounded-lg border border-line`, w środku `text-ink` (nagłówki, punkty), `text-muted` (akapit), przycisk `bg-przycisk`. Sekcjom w treści nie dawaj ciemnego tła (`bg-blok`) — ciemny blok przyciągał za dużo uwagi (decyzja Wiktora 4.11);
  - ciemny blok tylko w stopce: `bg-blok`, w środku `text-paper` (nagłówki, linki), `text-blok-tekst` (zwykły tekst), akcent `przycisk`;
  - nakładki na zdjęciach, tło lightboxa i ramki zdjęć: `cien` (np. `bg-cien/90`), nigdy `ink` — `ink` jest zielony i barwiłby zdjęcia. Biały napis na zdjęciu (etykiety „Przed” / „Po”, przycisk „Pokaż przed”) stoi na co najmniej `bg-cien/75` (biały tekst 7,49:1 na białym zdjęciu; /70 to 6,24:1) — przy jaśniejszej nakładce na białym zdjęciu kontrast spada poniżej 7:1. Przyciski z samą ikoną na zdjęciu albo w podglądzie (×, strzałki) mogą zostać na `bg-cien/70` — dla grafiki wystarcza 3:1.
- Zaokrąglenia tylko z trzech stopni (`--radius-*` w `@theme`): `rounded-lg` (12 px) — duże powierzchnie: kafelki i sekcje z obwódką, suwak przed/po; `rounded-md` (8 px) — przyciski (także ikonowe w lightboksie), pola formularza, filtry, miniatury; `rounded-sm` (4 px) — małe elementy: etykiety na zdjęciach, obwódka fokusu wokół logo. `rounded-full` tylko dla prawdziwych kół (zdjęcie na „O mnie”, uchwyt suwaka, numery kroków, kropki). Innych (`rounded-xl`, `rounded-xs`, `rounded-[…]`) nie używaj — reszta skali jest wyłączona i nic by nie zrobiła. Przyciski stojące obok siebie mają tę samą wysokość: jeśli jeden ma obwódkę (`border-2`), drugi też (w kolorze swojego tła) i oba `py-2.5`; przycisk bez obwódki ma `py-3`.
- Bez stylów wklejonych w HTML — żadnego `style="..."` w HTML, `<noscript><style>` ani `setAttribute('style', …)` — blokuje je Content-Security-Policy (`AGENTS.md`, sekcja 11, pułapka 7). Ze skryptu wolno tylko przez `element.style.nazwa = …` (tak działa `transform` w nagłówku i opóźnienie animacji w galerii). Blok `<style>` w komponencie `.astro` jest dozwolony na to, czego nie da się zrobić klasami (np. zmienne `--tw-prose-*` w `ArticleLayout.astro`, kreski hamburgera w `Header.astro`): Astro przenosi go do pliku CSS (`build.inlineStylesheets: 'never'`), więc CSP go nie blokuje. Nie powtarzaj w nim tego, co robią klasy: zwykły CSS z `<style>` wygrywa z klasami Tailwinda i po cichu je wyłącza.
- Podejście mobile-first: bazowe klasy są dla telefonu, a `md:`, `lg:` dla większych ekranów.

**Dostępność (obowiązkowo, testy to sprawdzają)**
- Każdy interaktywny element ma etykietę (`aria-label` albo widoczny tekst).
- Widoczny fokus przez `focus-visible:ring-2 focus-visible:ring-ink`; w stopce (ciemny blok) `focus-visible:ring-przycisk focus-visible:ring-offset-blok`, a w lightboksie i na przyciskach leżących na zdjęciu `focus-visible:ring-przycisk focus-visible:ring-offset-cien` — `ring-ink` na ciemnym tle byłby niewidoczny.
- Szanuj `prefers-reduced-motion`: animacje przez `motion-safe:` albo sprawdzenie w skrypcie.
- Semantyczny HTML: `<nav>`, `<main>`, `<article>`, `<footer>`, `<button type="button">`.
- Kontrast tekstu do tła co najmniej 4.5:1 (wymóg WCAG AA); zwykły tekst — także drugoplanowy `muted` — trzymamy co najmniej 7:1.

**Obrazy**
- `<Image>` / `<Picture>` z `astro:assets` z `width`, `height`, `loading="lazy"`, `decoding="async"`.
- Pierwsze zdjęcie na stronie ładuje się `eager` z `fetchpriority="high"`.
- Zdjęcia galerii mają `draggable="false"`, a prawy klik jest zablokowany (ochrona przed kopiowaniem, nie usuwaj).
