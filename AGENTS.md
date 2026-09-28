# AGENTS.md — portfolio fotograficzne Wiktora (foto.vigolab.ovh)

## ⚠️ ZASADA #1 — PISZESZ TYLKO PO POLSKU

Każde zdanie skierowane do mnie (plan, pytanie, wyjaśnienie, podsumowanie, komentarz w kodzie) jest po polsku. Bez mieszania języków.

Po angielsku zostaje tylko: kod, nazwy technologii i bibliotek (Astro, Tailwind), komendy terminala, nazwy z zewnętrznych API (`addEventListener`, `srcset`).

**Nazwy w kodzie, które tworzysz sam** (zmienne, funkcje, pliki komponentów, klucze w JSON), też piszesz **po polsku**: tak jest napisany cały projekt (`zdjecia`, `adresZdjec`, `formatujExif`, `Karta.astro`, `NA_STRONE`). Trzymaj się tej konwencji.

Jeśli zacząłeś odpowiadać po angielsku, napisz odpowiedź od nowa po polsku zamiast tłumaczyć ją w połowie.

---

## 1. Jak pracujemy

- **Ja (Wiktor)** nie znam się na kodzie. Zlecam pracę i akceptuję zmiany.
- **Ty (OpenCode)** jesteś wykonawcą. Piszesz kod w moim edytorze i robisz commity.
- **Claude (w claude.ai)** jest architektem. Planuje większe zmiany, robi code review i sprawdza build po moim pushu.

Zasady:
- Rób **tylko to, o co poproszono**. Żadnych poprawek „przy okazji” w innych plikach. Jeśli coś zauważysz, napisz o tym na końcu odpowiedzi.
- **Zatrzymaj się i zapytaj**, zanim: dodasz nowy pakiet npm, zmienisz przepływ zdjęć, dodasz zewnętrzną usługę, usuniesz plik albo zmienisz coś w `.github/`, `astro.config.mjs` lub `public/_headers`. Opisz propozycję, ale jej nie wdrażaj.
- **Przed zmianą** pokaż krótki plan: 2–4 punkty, co i gdzie zmienisz, zwykłym językiem.

---

## 2. Czego NIGDY nie robić

1. **Nie wykonuj `git push`.** Nigdy. Wypycham zmiany sam.
2. **Nie importuj niczego z folderu `images/`** w `src/`. Tego folderu nie ma w gicie ani na Cloudflare Pages, więc build na produkcji się wysypie.
3. **Nie edytuj ręcznie `src/data/galeria.json` i nie uruchamiaj `npm run sync-images`** (ani innych skryptów z `scripts/`, które zapisują `galeria.json` lub `data/galeria.db`). Zdjęcia dodaję tylko ja, na domowym komputerze. Na innym komputerze skrypt nadpisałby `galeria.json` starą lokalną bazą i zdjęcia zniknęłyby ze strony. Jeśli zadanie wymaga odświeżenia `galeria.json`, napisz mi, że mam to zrobić sam.
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

### Zmienne środowiskowe (`.env`, wzór w `.env.example`, typy w `env.d.ts`)

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

---

## 6. Struktura plików

```
.agents/skills/            instrukcje dla agentów dotyczące Astro (patrz sekcja 11)
.github/workflows/ci.yml   typy + build + Lighthouse + testy przy każdym pushu i PR
public/
  _headers                 nagłówki HTTP Cloudflare (komentarze TYLKO przez "#")
  sw.js                    service worker (offline), ma ręczną listę stron
  manifest.webmanifest, offline.html, ikony, og-default.jpg, robots.txt
scripts/
  sync-images.mjs          images/ → R2 + data/galeria.db → src/data/galeria.json
  update-exif.mjs          jednorazowy: odświeża dane EXIF z plików "przed"
  ustaw-opisy-testowe.mjs  jednorazowy: opisy 9 zdjęć testowych
  start-preview-if-needed.sh  uruchamia podgląd dla testów
src/
  assets/moje-zdjecie.jpg  zdjęcie profilowe (o-mnie.md i Schema.astro)
  components/
    Header.astro           menu, hamburger na mobile, paralaksa
    Footer.astro
    SEO.astro              meta, Open Graph, Twitter, canonical
    Schema.astro           dane strukturalne JSON-LD
    Galeria.astro          siatka, filtry, "Załaduj więcej", lightbox
    ContactForm.astro      formularz Formspree + walidacja + Turnstile
    ui/Container.astro     tylko max-w-240 mx-auto px-4
    ui/Karta.astro         kafelek zdjęcia w galerii
  data/
    galeria.json           GENEROWANY, nie edytuj ręcznie
    kategorie.ts           przyciski filtrów galerii
    nav.ts                 linki w menu
    siteConfig.json        dane osoby i firmy dla Schema/SEO
  layouts/Layout.astro, ArticleLayout.astro
  pages/index.astro, galeria.astro, kontakt.astro, o-mnie.md, 404.astro
  styles/global.css        Tailwind v4, @theme (kolory), font Noto Sans
tests/a11y.spec.ts, galeria.spec.ts, kontakt.spec.ts
env.d.ts                   typy zmiennych środowiskowych
images/, data/galeria.db   TYLKO na moim komputerze, poza gitem
```

---

## 7. Przepływ zdjęć

```
images/DSC_1234.jpg (+ opcjonalnie przed_DSC_1234.jpg)
  → npm run sync-images
      ├─ wysyła pliki do Cloudflare R2
      ├─ zapisuje dane (opis, kategorie, wymiary, EXIF) do data/galeria.db
      └─ eksportuje src/data/galeria.json   ← to trafia do gita
  → src/pages/galeria.astro czyta galeria.json i skleja adresy z PUBLIC_R2_URL
  → Galeria.astro → Karta.astro (<Image> z astro:assets robi miniatury przy buildzie)
```

- Komponenty zawsze opierają się na `galeria.json`, nigdy na bazie SQLite.
- `astro.config.mjs` buduje `image.remotePatterns` z `PUBLIC_R2_URL`. Przy zmianie domeny zdjęć zmienia się tylko zmienną.
- EXIF czytany jest z pliku „przed” (oryginał z aparatu), jeśli taki istnieje.

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
- Tylko klasy Tailwind v4 i tokeny z `@theme`: `paper`, `ink`, `muted`, `card`, `accent`, `line`.
- Bez stylów inline, z wyjątkiem `transform` ustawianego ze skryptu.
- Podejście mobile-first: bazowe klasy są dla telefonu, a `md:`, `lg:` dla większych ekranów.

**Dostępność (obowiązkowo, testy to sprawdzają)**
- Każdy interaktywny element ma etykietę (`aria-label` albo widoczny tekst).
- Widoczny fokus przez `focus-visible:ring-2 focus-visible:ring-accent`.
- Szanuj `prefers-reduced-motion`: animacje przez `motion-safe:` albo sprawdzenie w skrypcie.
- Semantyczny HTML: `<nav>`, `<main>`, `<article>`, `<footer>`, `<button type="button">`.
- Kontrast tekstu do tła co najmniej 4.5:1.

**Obrazy**
- `<Image>` / `<Picture>` z `astro:assets` z `width`, `height`, `loading="lazy"`, `decoding="async"`.
- Pierwsze zdjęcie na stronie ładuje się `eager` z `fetchpriority="high"`.
- Zdjęcia galerii mają `draggable="false"`, a prawy klik jest zablokowany (ochrona przed kopiowaniem, nie usuwaj).

---

## 9. Jak działają kluczowe elementy

**Header.astro:** pasek `h-15`, linki z `nav.ts`, aktywny link dostaje `aria-current="page"`. Paralaksa `scrollY * 0.25` (maks. 10 px) przez `requestAnimationFrame`. Hamburger przełącza klasę `hidden` na menu mobilnym, a klasa `md:hidden` zostaje na stałe. Menu zamyka kliknięcie w link, Escape albo poszerzenie okna. Menu ma focus trap.

**Galeria.astro**
- Siatka to kolumny CSS (`columns-2` … `2xl:columns-6`), bez JS.
- Na start widać `NA_STRONE` (8) zdjęć, reszta ma `hidden`. O tym, co jest widoczne, decyduje jedna funkcja (filtr + „Załaduj więcej”).
- Filtry porównują `data-kategoria` karty z przyciskami z `kategorie.ts`.
- Zdjęcia pojawiają się rzędami, grupowane po pozycji Y (tolerancja 24 px), a nie po kolejności w HTML, bo kolumny CSS mieszają kolejność.
- Efekt „wyostrzenia” miniatury: klasy startowe są w `Karta.astro`, a zdejmuje je skrypt w `Galeria.astro` (nie `onload` w HTML).
- Lightbox jest jeden, wspólny, i podmienia `src`. Wersja „przed” pojawia się na `mouseenter` / `touchstart`. Podpis EXIF pochodzi z `data-exif`. Lightbox ma focus trap i zamyka się Escape, kliknięciem w tło albo przyciskiem.

**ContactForm.astro:** walidacja w JS (`noValidate`), komunikaty po polsku w `aria-live`. Wysyłka `fetch` do Formspree. Honeypot `_gotcha`. Turnstile włącza się, gdy jest `PUBLIC_TURNSTILE_SITE_KEY`: skrypt ładuje `Layout.astro` przez prop `turnstile`, a token weryfikuje Formspree. Bez JS formularz wysyła się zwykłym POST-em.

**Schema.astro:** zawsze `Person` i `ProfessionalService`. `ImageGallery` pojawia się, gdy strona przekaże `zdjecia`, a `BreadcrumbList`, gdy przekaże `breadcrumbs`. Dane pochodzą z `siteConfig.json`, a adresy są absolutne przez `Astro.site`.

**SEO.astro:** canonical z propa albo z `Astro.url.pathname` + `Astro.site`. Obraz OG domyślnie `/og-default.jpg`. Locale `pl_PL`.

---

## 10. Przepisy

**Nowe zdjęcie w galerii:** robię to ja. Wrzucam plik do `images/`, uruchamiam `npm run sync-images` i commituję `src/data/galeria.json`. W kodzie nic nie trzeba zmieniać.

**Nowa podstrona:**
1. Utwórz `src/pages/nazwa.astro` (albo `.md` z `layout: ../layouts/ArticleLayout.astro`) i przekaż `title` oraz `description` do `Layout`.
2. Dodaj link w `src/data/nav.ts`.
3. Dopisz stronę do listy w `public/sw.js` i podbij `CACHE_NAME` (np. `foto-v3` → `foto-v4`).
4. Dopisz adres do `PAGES` w `tests/a11y.spec.ts` i do `url` w `lighthouserc.json`.

**Nowa zmienna środowiskowa:**
1. Dodaj ją do `env.d.ts` (z opisem po polsku) i do `.env.example`.
2. Jeśli jest potrzebna przy buildzie, dodaj ją do `env:` w kroku `Build` (testy korzystają z tego samego buildu) w `.github/workflows/ci.yml`.
3. Przypomnij mi, żebym dodał ją w ustawieniach Cloudflare Pages.

**Zmiana kolorów:** blok `@theme` w `src/styles/global.css`. Sprawdź kontrast.

**Nowe pole w formularzu:**
1. Dodaj HTML: `label`, `input`, `span` na błąd z `aria-live`, `aria-describedby` i `data-testid`.
2. Dodaj pole do obiektu `pola` w skrypcie.
3. Dodaj regułę w funkcji `walidujPole()`.
4. Dodaj test w `tests/kontakt.spec.ts`.

**Dane dla Google (Schema.org):** `src/data/siteConfig.json`.

---

## 11. Pułapki

1. **Astro 7 jest nowy.** Twoja wiedza może dotyczyć starszej wersji. Jeśli nie masz pewności co do API Astro, przeczytaj `.agents/skills/docs-lookup/SKILL.md` i sprawdź w dokumentacji zamiast zgadywać. Przy review kodu korzystaj z `.agents/skills/astro-best-practices/SKILL.md`.
2. **`Astro.url` a `Astro.site`:** `Astro.url` to adres bieżącej strony, a `Astro.site` to domena z konfiguracji. Absolutne adresy buduj przez `Astro.site`.
3. **W `public/_headers` komentarz to tylko `#`.** Styl `/* */` Cloudflare czyta jako wzorzec ścieżki i nagłówki przestają działać.
4. **W `astro.config.mjs` nie ma `import.meta.env`.** Zmienne wczytuje `loadEnv` z Vite.
5. **Service worker:** strony HTML pobiera najpierw z sieci (network-first), a pliki z `/_astro/` i zdjęcia najpierw z cache. Nie zmieniaj tego bez pytania — przy cache-first dla stron odwiedzający po deployu widzieli starą treść. Lista stron w `sw.js` służy tylko do trybu offline.
6. **Formspree ID** to sam identyfikator (np. `xzznnkyq`), a nie pełny URL.

---

## 12. Tylko jeśli dodajesz do strony funkcję opartą o AI (zasady Fluent 2 RAI)

Dziś strona nie ma takich funkcji. Jeśli się pojawią, stosuj od razu, także w prototypie:
1. **Transparentność:** każde miejsce działania AI ma widoczne oznaczenie (badge, ikona, etykieta).
2. **Ton:** bez antropomorfizacji. Piszesz „Wygenerowano podsumowanie”, a nie „Cieszę się, że mogę pomóc”.
3. **Oczekiwania:** przy wejściu do funkcji krótko wyjaśnij, co robi, z jakich danych korzysta i jakie ma ograniczenia.
4. **Bez nadmiernego zaufania:** dodaj dopisek „może zawierać błędy, zweryfikuj” i pokaż źródła.
5. **Kontrola:** przyciski mówią konkretnie, co się stanie („Usuń plik X”). Akcje nieodwracalne wymagają potwierdzenia przed wykonaniem.
6. **Feedback:** daj możliwość zgłoszenia błędnego, nieprzydatnego albo stronniczego wyniku, a nie tylko kciuk w górę/w dół.