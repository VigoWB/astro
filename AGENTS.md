# AGENTS.md — portfolio fotograficzne Wiktora (balansbieli.pl)

## ⚠️ ZASADA #1 — PISZESZ TYLKO PO POLSKU

Każde zdanie skierowane do mnie (plan, pytanie, wyjaśnienie, podsumowanie, komentarz w kodzie) jest po polsku. Bez mieszania języków.

Po angielsku zostaje tylko: kod, nazwy technologii i bibliotek (Astro, Tailwind), komendy terminala, nazwy z zewnętrznych API (`addEventListener`, `srcset`).

**Nazwy w kodzie, które tworzysz sam** (zmienne, funkcje, pliki komponentów, klucze w JSON), też piszesz **po polsku**: tak jest napisany cały projekt (`zdjecia`, `adresZdjec`, `formatujExif`, `Karta.astro`, `NA_STRONE`). Trzymaj się tej konwencji.

Jeśli zacząłeś odpowiadać po angielsku, napisz odpowiedź od nowa po polsku zamiast tłumaczyć ją w połowie.

---

## 1. Jak pracujemy

- **Ja (Wiktor)** nie znam się na kodzie. Zlecam pracę i akceptuję zmiany.
- **Ty (OpenCode albo Claude Code)** jesteś wykonawcą. Piszesz kod w moim edytorze i robisz commity. Pracuję z wami na zmianę, a ten plik obowiązuje każdego z was tak samo.
- **Claude w czacie (claude.ai)** jest architektem. Planuje większe zmiany, robi code review i sprawdza build po moim pushu.

Zasady:
- Rób **tylko to, o co poproszono**. Żadnych poprawek „przy okazji” w innych plikach. Jeśli coś zauważysz, napisz o tym na końcu odpowiedzi.
- **Zatrzymaj się i zapytaj**, zanim: dodasz nowy pakiet npm, zmienisz przepływ zdjęć, dodasz zewnętrzną usługę, usuniesz plik albo zmienisz coś w `.github/`, `astro.config.mjs` lub `public/_headers`. Opisz propozycję, ale jej nie wdrażaj.
- **Przed zmianą** pokaż krótki plan: 2–4 punkty, co i gdzie zmienisz, zwykłym językiem.

---

## 2. Czego NIGDY nie robić

1. **Nie wykonuj `git push`.** Nigdy. Wypycham zmiany sam.
2. **Nie importuj niczego z folderu `images/`** w `src/`. Tego folderu nie ma w gicie ani na Cloudflare Pages, więc build na produkcji się wysypie.
3. **Nie edytuj ręcznie `src/data/galeria.json` i nie uruchamiaj `npm run sync-images`** (ani innych skryptów z `scripts/`, które zapisują `galeria.json` lub `data/galeria.db`). Zdjęcia dodaję tylko ja: skrypt pyta o opisy, wgrywa pliki do R2 kluczami z `.env` i przepisuje `galeria.json`. (Baza `data/galeria.db` jest odtwarzana z `galeria.json` przy każdym uruchomieniu, więc po `git pull` skrypt jest bezpieczny na każdym moim komputerze. Zakaz dotyczy Ciebie, a nie sprzętu.) Jeśli zadanie wymaga odświeżenia `galeria.json`, napisz mi, że mam to zrobić sam.
4. **Nie dodawaj adaptera `@astrojs/cloudflare`, SSR ani `output: "server"`.** Strona jest w pełni statyczna.
5. **Nie pisz składni Tailwind v3.** Nie ma `tailwind.config.js` ani `@tailwind base`. Kolory są w `@theme` w `global.css`. Zamienniki:
   - `bg-opacity-50` → `bg-black/50`
   - `flex-shrink-0` / `flex-grow` → `shrink-0` / `grow`
   - `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm` (tak samo `rounded` i `blur`)
   - `bg-gradient-to-r` → `bg-linear-to-r`
   - `ring` (3 px) → `ring-3`
   - `outline-none` → `outline-hidden`
6. **W pliku `.astro` kod JS/TS może być tylko w dwóch miejscach:**
   - między `---` na górze pliku (wykonuje się przy budowaniu),
   - w znaczniku `<script>` (wykonuje się w przeglądarce).

   Nigdy luzem w HTML. Zmiennych z `---` nie ma w `<script>`, więc przekazuj je przez atrybuty `data-*`.
7. **Nie czytaj na głos, nie wypisuj i nie commituj pliku `.env`.** Są w nim klucze.
8. **Nie usuwaj atrybutów `data-testid`.** Opierają się na nich testy.
9. **Nie dodawaj logiki układu (flex, grid) do `Container.astro`.** Ma zostać prostym opakowaniem szerokości.
10. **Nie używaj `git add -A`.** Dodawaj tylko pliki zmienione w tym zadaniu. Jeśli `git status` pokazuje zmieniony `src/data/galeria.json`, którego nie ruszałeś, nie commituj go i zapytaj mnie.

---

## 3. Po każdej zmianie: sprawdź, potem commit

1. Uruchom `npm run check` (na końcu musi być `0 errors`, to samo sprawdza CI na GitHubie). Uruchom `npm run build`. Jeśli zmiana dotyczy galerii, formularza, menu albo `Layout.astro`, uruchom `npm run test` (sam zrobi build i odpali testy Playwright).
2. **Jeśli check, build albo testy nie przechodzą, nie commituj.** Napraw błąd albo opisz mi problem.
3. `git status`, żeby zobaczyć, co się zmieniło.
4. `git add <konkretne pliki>`.
5. `git commit -m "fix: krótki opis po polsku"`. Przedrostki: `feat:` (nowa funkcja), `fix:` (poprawka), `chore:` (porządki), `docs:`, `test:`.

Commit robisz automatycznie, bez pytania. O zgodę pytasz tylko przy samej zmianie w kodzie. Jeden commit to jedna zamknięta zmiana.

---

## 4. Jak mi raportować zmianę

Każdą odpowiedź po zmianie w kodzie kończysz tym szablonem (przy drobiazgach wystarczy jedno zdanie na punkt):

```
Co się zmieniło: [jak to wygląda/działa w przeglądarce, bez nazw plików i klas]
Dlaczego tak: [tylko jeśli był realny wybór między podejściami, inaczej pomiń]
Build/testy: [✅ przeszły / ❌ co nie przeszło]
Co sprawdzić: [konkretna czynność, np. "zmniejsz okno, żeby zobaczyć wersję mobilną"]
```

- Tłumacz efekt, a nie implementację. Szczegóły techniczne podawaj tylko, jeśli o nie zapytam.
- Jeśli potrzebna jest moja decyzja (układ, kolor, tekst), zadaj pytanie wprost i nie idź dalej bez odpowiedzi.

---

## 5. Projekt w skrócie

- **Stos:** Astro 7, Tailwind CSS v4 (`@tailwindcss/vite`), TypeScript strict, Node 24 (dokładna wersja w `.node-version`; minimum 22.13, bo skrypty używają wbudowanego `node:sqlite`)
- **Hosting:** Cloudflare Pages, automatyczny deploy z brancha `main`, statyczny `dist/`
- **Usługi:** Cloudflare R2 (zdjęcia), Formspree (formularz), Cloudflare Turnstile (ochrona formularza), Cloudflare Web Analytics
- **Poza zakresem:** blog i pobieranie zdjęć przez odwiedzających (celowo utrudniamy kopiowanie). Opinie klientów i link do Instagrama są odłożone na później.

### Zmienne środowiskowe (`.env`, wzór w `.env.example`, typy w `src/env.d.ts`)

| Zmienna | Czy wymagana | Do czego |
|---|---|---|
| `PUBLIC_R2_URL` | **tak**, bez niej build się przerywa | adres bucketa R2 ze zdjęciami |
| `PUBLIC_FORMSPREE_ID` | tak (formularz) | samo ID formularza, nie cały URL |
| `PUBLIC_TURNSTILE_SITE_KEY` | nie | bez niej widget Turnstile się nie pokazuje |
| `PUBLIC_CF_BEACON_TOKEN` | nie | analityka Cloudflare |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | tylko dla `sync-images` | **sekrety**, nigdy z przedrostkiem `PUBLIC_` |

### Komendy

- `npm run dev`: serwer deweloperski (localhost:4321)
- `npm run build`: build do `dist/` (wcześniej warto `npm run check`: sprawdzanie typów TypeScript, także w plikach `.astro`; to samo robi CI)
- `npm run preview`: podgląd buildu (localhost:4322)
- `npm run test`: build, potem testy Playwright (Chrome desktop i mobile, testy dostępności axe)
- `npm run sync-images`: dodaje nowe zdjęcia z `images/` (uruchamiam ja, nie Ty)
- `npm run sync-images -- --uzupelnij`: dopytuje o brakujące opisy i kategorie
- `npm run sync-images -- --wyroznij`: wybór zdjęć na stronę główną — które pokazują się w sekcji "Wybrane prace" i która jedna para trafia do suwaka przed/po

---

## 6. Struktura plików

```
.agents/skills/            instrukcje dla agentów dotyczące Astro (patrz sekcja 11)
.github/workflows/ci.yml   typy + build + Lighthouse + testy przy każdym pushu i PR
public/
  _headers                 nagłówki HTTP Cloudflare (komentarze TYLKO przez "#")
  fonts/                   podzbiór Noto Sans (2 pliki .woff2) — patrz global.css i sekcja 10
  sw.js                    service worker (offline), ma ręczną listę stron
  manifest.webmanifest, offline.html + offline.css, ikony, og-default.jpg, robots.txt
scripts/
  sync-images.mjs          images/ → R2 + data/galeria.db → src/data/galeria.json
  start-preview-if-needed.mjs  uruchamia podgląd dla testów (Node, dziala tez na Windows)
src/
  assets/moje-zdjecie.jpg  zdjęcie profilowe (o-mnie.astro i Schema.astro)
  assets/logo.svg          logo: nagłówek (Header.astro), stopka (Footer.astro) i znak wodny (sync-images.mjs)
  components/
    Header.astro           logo i menu: pasek u góry (telefon, tablet) albo pasek boczny (od lg)
    Footer.astro
    SEO.astro              meta, Open Graph, Twitter, canonical
    Schema.astro           dane strukturalne JSON-LD
    Galeria.astro          siatka, filtry, "Załaduj więcej", lightbox (używana też na / bez filtrów/"Załaduj więcej")
    PorownanieSuwak.astro  suwak przed/po (albo zastępczy przełącznik) na pierwszym ekranie /
    ContactForm.astro      formularz Formspree + walidacja + Turnstile
    NajczestszePytania.astro  „Najczęstsze pytania” na /kontakt/, pod formularzem (treść pytań jest tutaj)
    ui/Container.astro     tylko max-w-240 mx-auto px-4
    ui/Karta.astro         kafelek zdjęcia w galerii
    ui/Pytanie.astro       jedno rozwijane pytanie (<details>, bez JS), odpowiedź w slocie
  data/
    galeria.json           GENEROWANY, nie edytuj ręcznie
    kategorie.ts           lista kategorii LICZONA przy buildzie z galeria.json
    nav.ts                 linki w menu
    siteConfig.json        dane osoby i firmy dla Schema/SEO, lista usług do formularza (`uslugi`)
  lib/galeria.ts           wczytywanie zdjęć (adresy R2, wersje do lightboxa) — wspólne dla / i /galeria
  env.d.ts                 typy zmiennych środowiskowych
  layouts/Layout.astro, ArticleLayout.astro
  pages/index.astro, galeria.astro, kontakt.astro, o-mnie.astro, 404.astro
  styles/global.css        Tailwind v4, @theme (kolory), font Noto Sans
tests/404.spec.ts, a11y.spec.ts, csp.spec.ts, galeria.spec.ts, kontakt.spec.ts, naglowek.spec.ts, offline.spec.ts, pytania.spec.ts, suwak.spec.ts; pomocnicze.ts (wspólna lista stron STRONY i funkcje dla testów)
images/, data/galeria.db   TYLKO na moim komputerze, poza gitem
```

---

## 7. Przepływ zdjęć

```
images/DSC_1234.jpg (+ opcjonalnie przed_DSC_1234.jpg; ta sama zasada dla nazw z prefiksem,
                      np. wrzesien_26_EDYCJA_DSC7062.jpg + wrzesien_26_EDYCJA_przed_DSC7062.jpg)
  → npm run sync-images
      ├─ wysyła pliki do Cloudflare R2
      ├─ zapisuje dane (opis, kategorie, wymiary, EXIF) do data/galeria.db
      └─ eksportuje src/data/galeria.json   ← to trafia do gita
  → src/lib/galeria.ts (wczytajZdjecia) czyta galeria.json i skleja adresy z PUBLIC_R2_URL — wspólne dla / i /galeria
  → Galeria.astro → Karta.astro (<Image> z astro:assets robi miniatury przy buildzie)
  → wczytajZdjecia() robi też przez getImage() wersje do lightboxa (webp, dłuższy bok 1280 i 1920 px)
```

- Na stronie nie ma żadnego adresu z R2: miniatury, lightbox i dane dla Google (Schema.org) wskazują pliki w `/_astro/`. Oryginały z R2 pobiera tylko build.
- Wymiary pliku „przed” build odczytuje z R2 (`inferRemoteSize`). Brak pliku „przed” w R2 = build przerywa się z komunikatem, którego pliku brakuje.
- Adresy z R2 przekazywane do `getImage()` i `<Image>` mają na końcu wersję pliku (`?v=` + skrót ETag z zapytania `HEAD`, funkcja `adresZWersjaWR2()` w `src/lib/galeria.ts`). Astro liczy nazwy plików w `/_astro/` z adresu, a nie z treści, a te pliki przeglądarka i `sw.js` trzymają długo — bez wersji zdjęcie podmienione przez `--podmien` dostałoby starą nazwę i odwiedzający widzieliby starą wersję. Nie usuwaj tej wersji z adresów.

- Komponenty zawsze opierają się na `galeria.json`, nigdy na bazie SQLite.
- `astro.config.mjs` buduje `image.remotePatterns` z `PUBLIC_R2_URL`. Przy zmianie domeny zdjęć zmienia się tylko zmienną.
- EXIF czytany jest z pliku „przed” (oryginał z aparatu), jeśli taki istnieje; pola, których tam brakuje, skrypt uzupełnia z pliku „po” (`pobierzExifZPary()`).
- Pola `wyroznione` i `paraSuwaka` (ustawia `npm run sync-images -- --wyroznij`) sterują stroną główną: `wyroznione` — sekcja "Wybrane prace", `paraSuwaka` — jedna para do suwaka na pierwszym ekranie. Brak oznaczeń nie przerywa builda — `index.astro` dobiera zastępcze zdjęcia i loguje ostrzeżenie (patrz sekcja 9).

---

## 8. Konwencje kodu

**TypeScript**
- Każdy komponent ma `interface Props` w tym samym pliku, a `Astro.props` jest destrukturyzowane z domyślnymi wartościami.
- Żadnego `any`. W skryptach przeglądarki stosuj rzutowania typu `as HTMLImageElement`.

**Komponenty i importy**
- Wszystko w `.astro`, bez React/Vue.
- Ścieżki względne (`../components/...`), bez aliasu `@/`.
- `ui/` to proste komponenty wizualne, `components/` to komponenty z logiką.
- `<script>` zostaje w tym samym pliku `.astro`.

**Style**
- Tylko klasy Tailwind v4 i tokeny z `@theme`: `paper`, `ink`, `muted`, `card`, `accent`, `line`, `error`, `success`, `przycisk`, `przycisk-tekst`, `przycisk-hover`, `blok`, `blok-tekst`, `cien`. Do czego który:
  - przyciski i stany aktywne (filtr, „Pokaż przed”, numery kroków): `bg-przycisk text-przycisk-tekst hover:bg-przycisk-hover` — nie `bg-accent text-paper`;
  - `accent`: linki, aktywny link w menu, obwódka fokusu;
  - ciemny blok (sekcja „Co poprawiam przy retuszu”, zaproszenie na dole strony głównej, stopka): `bg-blok`, w środku `text-paper` (nagłówki, linki), `text-blok-tekst` (zwykły tekst), akcent `przycisk`;
  - nakładki na zdjęciach, tło lightboxa i ramki zdjęć: `cien` (np. `bg-cien/90`), nigdy `ink` — `ink` jest zielony i barwiłby zdjęcia. Biały napis na zdjęciu (etykiety „Przed” / „Po”, przycisk „Pokaż przed”) stoi na co najmniej `bg-cien/70` — przy jaśniejszej nakładce na białym zdjęciu kontrast spada poniżej 4,5:1.
- Zaokrąglenia tylko z trzech stopni (`--radius-*` w `@theme`): `rounded-lg` (12 px) — duże powierzchnie: ciemne bloki, kafelki, suwak przed/po; `rounded-md` (8 px) — przyciski (także ikonowe w lightboksie), pola formularza, filtry, miniatury; `rounded-sm` (4 px) — małe elementy: etykiety na zdjęciach, obwódka fokusu wokół logo. `rounded-full` tylko dla prawdziwych kół (zdjęcie na „O mnie”, uchwyt suwaka, numery kroków, kropki). Innych (`rounded-xl`, `rounded-xs`, `rounded-[…]`) nie używaj — reszta skali jest wyłączona i nic by nie zrobiła. Przyciski stojące obok siebie mają tę samą wysokość: jeśli jeden ma obwódkę (`border-2`), drugi też (w kolorze swojego tła) i oba `py-2.5`; przycisk bez obwódki ma `py-3`.
- Bez stylów wklejonych w HTML — żadnego `style="..."` w HTML, `<style>` wklejanego w stronę ani `setAttribute('style', …)` — blokuje je Content-Security-Policy (pułapka 7). Ze skryptu wolno tylko przez `element.style.nazwa = …` (tak działa `transform` w nagłówku i opóźnienie animacji w galerii).
- Podejście mobile-first: bazowe klasy są dla telefonu, a `md:`, `lg:` dla większych ekranów.

**Dostępność (obowiązkowo, testy to sprawdzają)**
- Każdy interaktywny element ma etykietę (`aria-label` albo widoczny tekst).
- Widoczny fokus przez `focus-visible:ring-2 focus-visible:ring-accent`; w ciemnym bloku `focus-visible:ring-przycisk focus-visible:ring-offset-blok`, a w lightboksie i na przyciskach leżących na zdjęciu `focus-visible:ring-przycisk focus-visible:ring-offset-cien` — `ring-accent` ma na ciemnym tle poniżej 3:1.
- Szanuj `prefers-reduced-motion`: animacje przez `motion-safe:` albo sprawdzenie w skrypcie.
- Semantyczny HTML: `<nav>`, `<main>`, `<article>`, `<footer>`, `<button type="button">`.
- Kontrast tekstu do tła co najmniej 4.5:1.

**Obrazy**
- `<Image>` / `<Picture>` z `astro:assets` z `width`, `height`, `loading="lazy"`, `decoding="async"`.
- Pierwsze zdjęcie na stronie ładuje się `eager` z `fetchpriority="high"`.
- Zdjęcia galerii mają `draggable="false"`, a prawy klik jest zablokowany (ochrona przed kopiowaniem, nie usuwaj).

---

## 9. Jak działają kluczowe elementy

**Header.astro:** jeden nagłówek, dwa układy.
- Telefon i tablet (do `lg`): pasek u góry. Na samej górze strony ma 96 px i logo 80 px; po przewinięciu (`scrollY > 8`) skrypt ustawia na `<header>` atrybut `data-zwiniety` i pasek zwija się do 60 px z logo 44 px (klasy `max-lg:group-data-zwiniety:*`, animacja tylko `motion-safe:`). W układzie strony `<header>` zajmuje zawsze 60 px + `mb-9`, a duży pasek (`absolute`) tylko nachodzi na ten odstęp — zwijanie nie przesuwa treści. Nie zamieniaj tego na zmianę wysokości samego `<header>`: przeglądarka koryguje wtedy przewinięcie i pasek zaczyna migać na granicy.
- Komputer (od `lg` = 1024 px): pasek boczny `lg:fixed` o szerokości `w-64`, z logo 160 px i menu w pionie. Miejsce robi mu `lg:pl-64` na `<body>` w `Layout.astro` — zmieniasz szerokość paska, zmień w obu miejscach.
- Linki z `nav.ts`, aktywny link dostaje `aria-current="page"`. Hamburger (do `md`) przełącza klasę `hidden` na menu mobilnym, a klasa `md:hidden` zostaje na stałe. Menu leży w pasku, więc otwiera się tuż pod nim przy każdej jego wysokości. Menu zamyka kliknięcie w link, stuknięcie w przyciemnione tło obok menu (`#tlo-menu` pod nagłówkiem: tło `z-30`, nagłówek `z-40`), Escape albo poszerzenie okna. Menu ma focus trap. Zachowanie obu układów sprawdza `tests/naglowek.spec.ts`.

**Galeria.astro**
- Siatka to kolumny CSS (`columns-2 md:columns-3`), bez JS. Więcej kolumn nie dokładaj: kolumna treści ma maks. 960 px, a od `lg` obok stoi pasek boczny — przy 4–6 kolumnach miniatury na komputerze były mniejsze niż na tablecie.
- Na start widać `NA_STRONE` (8) zdjęć, reszta ma `hidden`. O tym, co jest widoczne, decyduje jedna funkcja (filtr + „Załaduj więcej”).
- Filtry porównują `data-kategoria` karty (lista kategorii jako JSON — nazwa może mieć spację) z przyciskami z `kategorie.ts`.
- Zdjęcia pojawiają się rzędami, grupowane po pozycji Y (tolerancja 24 px), a nie po kolejności w HTML, bo kolumny CSS mieszają kolejność.
- Efekt „wyostrzenia” miniatury: klasy startowe są w `Karta.astro`, a zdejmuje je skrypt w `Galeria.astro` (nie `onload` w HTML).
- Podpis miniatury: z myszką — nakładka po najechaniu; na ekranach dotykowych (`pointer-coarse:`) stały podpis pod zdjęciem, bo najechania tam nie ma. Oba `aria-hidden` — opis czyta czytnik z `alt`.
- Lightbox jest jeden, wspólny, i podmienia `sizes`, `srcset` i `src` (funkcja `ustawZdjecie`) — dane bierze z atrybutów karty `data-po*` / `data-przed*`. Wersję „przed” pokazuje przycisk „Pokaż przed” (`id="lightbox-przelacznik"`, `aria-pressed`) — działa z klawiatury, myszki i dotyku, resetuje się przy zamknięciu lightboxa i zmianie zdjęcia. Podpis EXIF pochodzi z `data-exif`. Lightbox ma focus trap i zamyka się Escape, kliknięciem w tło albo przyciskiem.
- Propy `pokazFiltry`, `pokazZaladujWiecej` i `priorytetPierwszego` (domyślnie `true`) wyłączają pasek filtrów, przycisk „Załaduj więcej” i wysoki priorytet pierwszego zdjęcia — używa tego `index.astro` (sekcja „Wybrane prace” pokazuje przekazane zdjęcia od razu, bez filtrowania).

**index.astro (strona główna)**
- Dane bierze z `wczytajZdjecia()` (`src/lib/galeria.ts`), tak jak `/galeria`.
- Para do suwaka: `wybierzBohatera()` szuka zdjęcia z `paraSuwaka: true`. Jeśli go nie ma, albo jego „przed”/„po” mają różne proporcje (tolerancja 2%, `proporcjeZgodne()`), build **nie przerywa się** — loguje ostrzeżenie (`console.warn`, widoczne przy `npm run build`) i pokazuje zastępcze zdjęcie z przełącznikiem „Pokaż przed” zamiast suwaka. Realny suwak wymaga pary w identycznym kadrze.
- Sekcja „Wybrane prace”: `wybierzWyroznione()` bierze zdjęcia z `wyroznione: true` (max 6, bez zdjęcia użytego jako bohater). Gdy żadne nie jest oznaczone, tymczasowo pokazuje pierwsze zdjęcia z `galeria.json` (z ostrzeżeniem w logu) — żeby strona nie była pusta, zanim ktoś uruchomi `npm run sync-images -- --wyroznij`.
- Sekcja „Jak zamówić retusz” (`KROKI_ZAMOWIENIA`): 4 kroki w `<ol>`. Te same warunki (przesyłanie plików, bezpłatna wycena, termin 5–7 dni, poprawki: uwagi w 7 dni, do 25% zdjęć) są w FAQ na `/kontakt/` (`NajczestszePytania.astro`), a część z nich (bezpłatna wycena, JPG w pełnej rozdzielczości, poprawki do 25% zdjęć) także w pasku „W skrócie” na `/o-mnie/` (`FAKTY` w `o-mnie.astro`). Zmieniasz jedno miejsce — zmień wszystkie w tym samym commicie.
- Treść sekcji „Co poprawiam przy retuszu” (`PUNKTY_RETUSZU`) i zaproszenia do kontaktu to na razie tekst tymczasowy — do potwierdzenia.

**PorownanieSuwak.astro:** „po” zawsze w tle (`loading="eager"`, `fetchpriority="high"` — LCP), „przed” nałożone przez `object-cover` i odsłaniane `clip-path` (tryb suwaka; połowa odsłonięta już w CSS, zanim zadziała skrypt) albo pokazywane w całości (`object-contain`) zwykłym przełącznikiem `aria-pressed` (tryb zastępczy) — wybór trybu przychodzi z propa `trybSuwaka` z `index.astro`. W trybie suwaka widać tylko pionową linię z okrągłym uchwytem, etykiety „Przed” / „Po” w górnych rogach i podpowiedź „Przesuń linię, żeby porównać” na dole (`data-porownanie-podpowiedz`) — skrypt chowa ją (`opacity-0`) przy pierwszym ruchu linii myszą, palcem albo klawiaturą. Linię przeciąga się w dowolnym miejscu zdjęcia: zdarzenia `pointerdown` / `pointermove` / `pointerup` / `pointercancel` na kontenerze z `touch-pan-y touch-pinch-zoom`. Przeciąga jeden wskaźnik naraz (mysz albo pierwszy palec). Palcem linia rusza dopiero przy ruchu w poziomie (próg 8 px) albo po stuknięciu — ruch w pionie przewija stronę i linii nie przesuwa (zanim przeglądarka wyśle `pointercancel`, przychodzą jeszcze 1–2 `pointermove`, stąd sprawdzanie kierunku), a dwoma palcami można powiększyć zdjęcie. Przeciąganie myszą i palcem sprawdza `tests/suwak.spec.ts`. Pod spodem zostaje `<input type="range">` z klasą `sr-only` (`data-porownanie-suwak`): obsługuje klawiaturę (strzałki) i czytniki ekranu, a jego wartość steruje linią (skrypt dopisuje `aria-valuetext`, np. „50% zdjęcia przed retuszem, 50% po retuszu”, żeby czytnik nie czytał samej liczby); fokus z klawiatury widać jako obwódkę na uchwycie (`group-has-[input:focus-visible]:ring-2`). Nie usuwaj tego suwaka i nie rób go widocznym — opiera się na nim test dostępności w `tests/a11y.spec.ts`. Pozycję linii i `clip-path` ustawia skrypt przez `element.style.*` (CSP, pułapka 7 niżej), nie atrybut `style=`.

**ContactForm.astro:** walidacja w JS (`noValidate`), komunikaty po polsku w `aria-live`. Wysyłka `fetch` do Formspree. Honeypot `_gotcha`. Turnstile włącza się, gdy jest `PUBLIC_TURNSTILE_SITE_KEY`: skrypt ładuje `Layout.astro` przez prop `turnstile`, a token weryfikuje Formspree. Bez JS formularz wysyła się zwykłym POST-em. Pola pod wycenę (wszystkie nieobowiązkowe) są w `<fieldset id="szczegoly-zlecenia">`: rodzaj usługi (lista z `uslugi` w `siteConfig.json` + „Inne / jeszcze nie wiem”; pusta lista = pole znika), liczba zdjęć, termin i link do plików (sprawdzany tylko, gdy coś wpisano). Puste pola z tego fieldsetu skrypt usuwa przed wysyłką. Ukryte pole `subject` („Zapytanie o wycenę”) ustawia temat maila od Formspree, a skrypt dopisuje do niego imię (cały temat sprawdza test w `tests/kontakt.spec.ts`).

**Schema.astro:** zawsze `Person` i `ProfessionalService`. `ImageGallery` pojawia się, gdy strona przekaże `zdjecia`, a `BreadcrumbList`, gdy przekaże `breadcrumbs`. Dane pochodzą z `siteConfig.json`, a adresy są absolutne przez `Astro.site`.

**SEO.astro:** canonical z propa albo z `Astro.url.pathname` + `Astro.site`. Obraz OG domyślnie `/og-default.jpg`. Locale `pl_PL`.

---

## 10. Przepisy

**Nowe zdjęcie w galerii:** robię to ja. Robię `git pull`, wrzucam plik do `images/`, uruchamiam `npm run sync-images` i commituję `src/data/galeria.json`. W kodzie nic nie trzeba zmieniać.

**Nowa podstrona:**
1. Utwórz `src/pages/nazwa.astro` (albo `.md` z `layout: ../layouts/ArticleLayout.astro`) i przekaż `title` oraz `description` do `Layout`.
2. Dodaj link w `src/data/nav.ts`.
3. Dopisz stronę do listy w `public/sw.js` i podbij `CACHE_NAME` (np. `foto-v4` → `foto-v5`).
4. Dopisz adres do `STRONY` w `tests/pomocnicze.ts` (z tej listy korzystają testy dostępności i CSP) i do `url` w `lighthouserc.json`.

**Nowa zmienna środowiskowa:**
1. Dodaj ją do `src/env.d.ts` (z opisem po polsku) i do `.env.example`.
2. Jeśli jest potrzebna przy buildzie, dodaj ją do `env:` w kroku `Build` (testy korzystają z tego samego buildu) w `.github/workflows/ci.yml`.
3. Przypomnij mi, żebym dodał ją w ustawieniach Cloudflare Pages.

**Zmiana kolorów:** blok `@theme` w `src/styles/global.css`. Sprawdź kontrast (min. 4,5:1 dla tekstu). Te same kolory są też wpisane na sztywno w `public/offline.css`, `public/manifest.webmanifest` (`theme_color`, `background_color`) i `src/components/SEO.astro` (`theme-color`) — zmień je razem i podbij `CACHE_NAME` w `public/sw.js`.

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

---

## 11. Pułapki

1. **Astro 7 jest nowy.** Twoja wiedza może dotyczyć starszej wersji. Jeśli nie masz pewności co do API Astro, przeczytaj `.agents/skills/docs-lookup/SKILL.md` i sprawdź w dokumentacji zamiast zgadywać. Przy review kodu korzystaj z `.agents/skills/astro-best-practices/SKILL.md`.
2. **`Astro.url` a `Astro.site`:** `Astro.url` to adres bieżącej strony, a `Astro.site` to domena z konfiguracji. Absolutne adresy buduj przez `Astro.site`.
3. **W `public/_headers` komentarz to tylko `#`.** Styl `/* */` Cloudflare czyta jako wzorzec ścieżki i nagłówki przestają działać.
4. **W `astro.config.mjs` nie ma `import.meta.env`.** Zmienne wczytuje `loadEnv` z Vite.
5. **Service worker:** strony HTML pobiera najpierw z sieci (network-first), a pliki z `/_astro/` i zdjęcia najpierw z cache. Nie zmieniaj tego bez pytania — przy cache-first dla stron odwiedzający po deployu widzieli starą treść. Lista stron w `sw.js` służy tylko do trybu offline.
6. **Formspree ID** to sam identyfikator (np. `xzznnkyq`), a nie pełny URL.
7. **Content-Security-Policy (CSP) w `public/_headers`.** Przeglądarka ładuje skrypty, style, ramki i połączenia tylko z miejsc z tej listy. Dlatego:
   - żadnych `onclick=` / `onload=`, `style="..."`, `<script>` z atrybutem `is:inline` ani `set:html` z kodem JS — wszystko, co wklejone w HTML, zostanie zablokowane (`set:html` z danymi JSON-LD jest w porządku),
   - w `astro.config.mjs` zostają `build.inlineStylesheets: 'never'` i `vite.build.assetsInlineLimit: 0` — bez nich Astro wkleja małe skrypty i style prosto do HTML,
   - nowa zewnętrzna usługa (skrypt, ramka, `fetch` do innej domeny) = najpierw zapytaj, potem dopisz jej domenę do właściwej dyrektywy CSP w `_headers`,
   - `tests/csp.spec.ts` czyta politykę z `_headers` i wykrywa naruszenia na wszystkich stronach (także przy wysyłce formularza i rejestracji service workera) — nowa podstrona trafia do `STRONY` w `tests/pomocnicze.ts`.
8. **Link w środku zdania pisz w tej samej linii co tekst wokół niego.** Gdy między tekstem a znacznikiem (np. `<a>`) jest przejście do nowej linii, Astro przy buildzie usuwa spację i na stronie słowa sklejają się z linkiem („przezSwissTransfer”). Dobrze: `Pliki wyślij przez <a href="…">SwissTransfer</a>: jest darmowy`.

---

## 12. Tylko jeśli dodajesz do strony funkcję opartą o AI (zasady Fluent 2 RAI)

Dziś strona nie ma takich funkcji. Jeśli się pojawią, stosuj od razu, także w prototypie:
1. **Transparentność:** każde miejsce działania AI ma widoczne oznaczenie (badge, ikona, etykieta).
2. **Ton:** bez antropomorfizacji. Piszesz „Wygenerowano podsumowanie”, a nie „Cieszę się, że mogę pomóc”.
3. **Oczekiwania:** przy wejściu do funkcji krótko wyjaśnij, co robi, z jakich danych korzysta i jakie ma ograniczenia.
4. **Bez nadmiernego zaufania:** dodaj dopisek „może zawierać błędy, zweryfikuj” i pokaż źródła.
5. **Kontrola:** przyciski mówią konkretnie, co się stanie („Usuń plik X”). Akcje nieodwracalne wymagają potwierdzenia przed wykonaniem.
6. **Feedback:** daj możliwość zgłoszenia błędnego, nieprzydatnego albo stronniczego wyniku, a nie tylko kciuk w górę/w dół.