# AGENTS.md — portfolio fotograficzne Wiktora (balansbieli.pl)

## ⚠️ ZASADA #1 — PISZESZ TYLKO PO POLSKU

Każde zdanie skierowane do mnie (plan, pytanie, wyjaśnienie, podsumowanie, komentarz w kodzie) jest po polsku. Bez mieszania języków.

Po angielsku zostaje tylko: kod, nazwy technologii i bibliotek (Astro, Tailwind), komendy terminala, nazwy z zewnętrznych API (`addEventListener`, `srcset`).

**Nazwy w kodzie, które tworzysz sam** (zmienne, funkcje, pliki komponentów, klucze w JSON), też piszesz **po polsku**: tak jest napisany cały projekt (`zdjecia`, `adresZdjec`, `formatujExif`, `Karta.astro`, `NA_STRONE`). Trzymaj się tej konwencji.

Jeśli zacząłeś odpowiadać po angielsku, napisz odpowiedź od nowa po polsku zamiast tłumaczyć ją w połowie.

---

## 1. Jak pracujemy

- **Ja (Wiktor)** nie znam się na kodzie. Zlecam pracę i akceptuję zmiany.
- **Ty (OpenCode albo Claude Code)** jesteś wykonawcą. Piszesz kod i robisz commity — w moim edytorze (VS Code) albo w terminalu na moim serwerze. Pracuję z wami na zmianę, a ten plik obowiązuje każdego z was tak samo.
- **Claude w czacie (claude.ai)** jest architektem. Planuje zmiany, pisze dla Ciebie zadania i przegląda pull requesty przed scaleniem — na podstawie Twojego raportu (sekcja „Jak sprawdzone” w opisie PR-a) i zmian w PR-ze. Sam nie buduje strony ani nie uruchamia testów: robisz to Ty, na komputerze, na którym pracujesz.

Zasady:
- Rób **tylko to, o co poproszono**. Żadnych poprawek „przy okazji” w innych plikach. Jeśli coś zauważysz, napisz o tym na końcu odpowiedzi.
- **Zatrzymaj się i zapytaj**, zanim: dodasz nowy pakiet npm, zmienisz przepływ zdjęć, dodasz zewnętrzną usługę, usuniesz plik albo zmienisz coś w `.github/`, `astro.config.mjs` lub `public/_headers`. Opisz propozycję, ale jej nie wdrażaj.
- **Przed zmianą** pokaż krótki plan: 2–4 punkty, co i gdzie zmienisz, zwykłym językiem.
- **Zadania od Claude** są opisane słowami: cel, pliki, ograniczenia, sprawdzenia i kiedy zadanie jest gotowe. Kod piszesz sam, według opisu. Teksty, wartości i fragmenty kodu, które zadanie podaje dosłownie, przepisujesz dokładnie. Jeśli opis jest niejasny albo nie zgadza się z kodem (np. nie ma takiej funkcji albo pliku), zatrzymaj się i zapytaj, zamiast zgadywać. Jeśli zadanie mówi „najpierw plan”, pokaż plan i nie zmieniaj plików, dopóki nie odpowiem.
- **Pluginy i skille** (np. superpowers): ten plik i zadanie od Claude mają pierwszeństwo przed ich instrukcjami. Zadanie od Claude jest już zaprojektowane — nie zaczynasz projektowania od nowa i nie dopytujesz o zakres; wystarczy krótki plan z tej sekcji, a pytasz tylko wtedy, gdy coś jest niejasne albo nie zgadza się z kodem. Pracujesz w głównym folderze projektu, bez kopii roboczych (git worktree) — blokady Claude Code są w `.claude/settings.local.json` tego folderu. Plany i notatki robocze zapisujesz tylko w `docs/superpowers/` (git go pomija); wiedza z zadania trafia do opisu PR-a. Pracę kończysz zawsze tak samo: push własnej gałęzi i pull request (sekcja 3) — nigdy nie scalasz niczego z `main`, także lokalnie.

---

## 2. Czego NIGDY nie robić

1. **Nigdy nie wypychaj na `main` i nigdy nie scalaj pull requestów.** Wolno Ci wypchnąć tylko własną gałąź zadania, poleceniem z sekcji 3 (`git push -u origin <gałąź>`): bez `--force`, bez `--delete` i nigdy samo `git push` bez nazwy gałęzi. Pull request scala wyłącznie Wiktor — nie używaj `gh pr merge`, `gh api` ani `gh auth`. GitHub i tak odrzuci push na `main`, ale ta zasada obowiązuje niezależnie od tego.
2. **Nie importuj niczego z folderu `images/`** w `src/`. Tego folderu nie ma w gicie ani na Cloudflare Pages, więc build na produkcji się wysypie.
3. **Nie edytuj ręcznie `src/data/galeria.json` i nie uruchamiaj `npm run sync-images`** (ani innych skryptów z `scripts/`, które zapisują `galeria.json` lub `data/galeria.db`). Zdjęcia dodaję tylko ja: skrypt pyta o opisy, wgrywa pliki do R2 kluczami z `.env` i przepisuje `galeria.json`. (Baza `data/galeria.db` jest odtwarzana z `galeria.json` przy każdym uruchomieniu, więc po `git pull` skrypt jest bezpieczny na każdym moim komputerze. Zakaz dotyczy Ciebie, a nie sprzętu.) `node scripts/sprawdz-czyszczenie.mjs` też uruchamiam tylko ja: niczego nie zapisuje, ale czyta moje zdjęcia z `images/`. Jeśli zadanie wymaga odświeżenia `galeria.json`, napisz mi, że mam to zrobić sam.
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
7. **`.env` nie jest dla Ciebie.** To konfiguracja produkcyjna — jest tylko jeden, u mnie (do `sync-images`). Nie czytasz go, nie tworzysz, nie kopiujesz, nie wypisujesz i nie commitujesz. Nie uruchamiasz poleceń, które biorą z niego prawdziwe wartości: `npm run dev`, `npm run build`, `npm run preview`, `npm run sync-images`. Cała Twoja praca działa bez `.env`, na danych testowych i atrapach (`npm test`, `npm run build:testy`, `npm run preview:testy`). Jeśli coś bez `.env` nie działa, to błąd do opisania w raporcie, a nie powód, żeby `.env` założyć.
8. **Nie usuwaj atrybutów `data-testid`.** Opierają się na nich testy.
9. **Nie dodawaj logiki układu (flex, grid) do `Container.astro`.** Ma zostać prostym opakowaniem szerokości.
10. **Nie używaj `git add -A`.** Dodawaj tylko pliki zmienione w tym zadaniu. Jeśli `git status` pokazuje zmieniony `src/data/galeria.json`, którego nie ruszałeś, nie commituj go i zapytaj mnie. Wyjątek: commit `galeria.json`, o który sam poproszę po `sync-images` (sekcja 10, „Nowe zdjęcie w galerii”).

---

## 3. Gałąź, sprawdzenie, commit, pull request

Każde zadanie idzie przez osobną gałąź i pull request (PR) do `main`. Na `main` nic nie trafia bez PR-a i zielonego CI (reguła na GitHubie), a Cloudflare wdraża stronę z `main` dopiero po scaleniu, które robi Wiktor.

1. **Przed pierwszą zmianą: świeży `main` i nowa gałąź.**
   ```
   git switch main
   git pull
   git switch -c <typ>/<krotki-opis>
   ```
   `<typ>` jak w komunikacie commita (`feat`, `fix`, `chore`, `docs`, `test`), opis małymi literami, bez polskich znaków, słowa połączone myślnikiem, np. `feat/testy-vitest`. Jeśli zadanie od Claude podaje nazwę gałęzi, użyj jej. Jeśli `git status` pokazuje zmiany, których nie robiłeś, zatrzymaj się i zapytaj. Poprawki do PR-a, który nie jest jeszcze scalony, robisz na jego gałęzi (`git switch <gałąź>`), bez zakładania nowej.
2. **Sprawdzenie robisz Ty** — Claude w czacie nie buduje strony. Zawsze uruchom `npm test` (wszystkie etapy po kolei, tak jak CI: typy, testy jednostkowe, integracyjne i e2e — build na danych testowych i Playwright; zatrzymuje się na pierwszym błędzie). Prawdziwego buildu (`npm run build`) nie uruchamiasz — potrzebuje `.env` (sekcja 2, punkt 7). Prawdziwy build ze zdjęciami z R2 i Lighthouse robi CI (etap „Build i Lighthouse”); bez niego nie ma zielonego „Wyniku”. Jeśli zadanie od Claude podaje dodatkowe sprawdzenia (np. co ma być w zbudowanej stronie: fragment HTML, JSON-LD, nazwa pliku), wykonaj je na `dist-testy/` (powstaje w `npm test` albo `npm run build:testy`) i zapisz wynik. Wyjątek: gdy zmieniasz tylko pliki `.md`, testy pomijasz — napisz to w raporcie.
3. **Jeśli check, build albo testy nie przechodzą, nie commituj.** Napraw błąd albo opisz mi problem.
4. `git status`, żeby zobaczyć, co się zmieniło.
5. `git add <konkretne pliki>`.
6. `git commit -m "fix: krótki opis po polsku"`. Przedrostki: `feat:` (nowa funkcja), `fix:` (poprawka), `chore:` (porządki), `docs:`, `test:`.
7. **Push gałęzi.** Najpierw `git branch --show-current` — jeśli wychodzi `main`, nie wypychaj i napisz mi o tym. Potem `git push -u origin <gałąź>` (przy poprawkach do istniejącego PR-a: `git push origin <gałąź>`).
8. **Pull request z wiedzą z zadania.** Opis zapisz w pliku `opis-pr.md` w głównym folderze projektu (git go pomija), według szablonu `.github/pull_request_template.md`:
   - „Co i po co”, „Wiedza z zadania” i „Do obejrzenia przed Merge” przepisz z zadania od Claude bez skracania. Jeśli zadanie ich nie ma, napisz je sam z tego, co ustaliliśmy w rozmowie: decyzje i dlaczego tak, odrzucone warianty, pułapki.
   - „Jak sprawdzone” to Twój raport dla Claude w czacie: Wiktor kopiuje go z PR-a do czatu, a Claude ocenia PR na jego podstawie, bez własnego buildu. Pisz konkretnie:
      - każde polecenie z punktu 2 i jego prawdziwy wynik (np. `npm test` — 155 passed, 3 skipped), a przy dodatkowych sprawdzeniach z zadania — co pokazały;
      - zmienione pliki: wynik `git diff --stat origin/main...HEAD`;
      - odstępstwa od zadania: co zrobiłeś inaczej niż w opisie i dlaczego (albo „brak”);
      - czego nie sprawdziłeś, ryzyka i otwarte pytania;
      - rzeczy zauważone przy okazji, których nie naprawiałeś.
   - Do „Wiedzy z zadania” dopisz własne decyzje i pułapki, na które trafiłeś przy pracy.

   Potem `gh pr create --base main --head <gałąź> --title "<komunikat commita>" --body-file opis-pr.md` i podaj mi link do PR-a. Przy poprawkach do istniejącego PR-a dopisz w `opis-pr.md`, co się zmieniło, i uruchom `gh pr edit <numer> --body-file opis-pr.md`.

Commit, push gałęzi i PR robisz po kolei, bez pytania w rozmowie — o zgodę pytasz tylko przy samej zmianie w kodzie (polecenia `git push` i `gh pr create` i tak zatwierdzam w okienku). Jeden commit to jedna zamknięta zmiana. PR-a nigdy nie scalasz.

---

## 4. Jak mi raportować zmianę

Każdą odpowiedź po zmianie w kodzie kończysz tym szablonem (przy drobiazgach wystarczy jedno zdanie na punkt):

```
Co się zmieniło: [jak to wygląda/działa w przeglądarce, bez nazw plików i klas]
Dlaczego tak: [tylko jeśli był realny wybór między podejściami, inaczej pomiń]
Build/testy: [✅ przeszły / ❌ co nie przeszło]
Co sprawdzić: [konkretna czynność, np. "zmniejsz okno, żeby zobaczyć wersję mobilną"]
PR: [link do pull requesta]
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

Plik `.env` z prawdziwymi wartościami jest tylko u Wiktora (sekcja 2, punkt 7). CI bierze je z sekretów GitHuba, a build testowy i testy mają własne wartości testowe.

| Zmienna | Czy wymagana | Do czego |
|---|---|---|
| `PUBLIC_R2_URL` | **tak**, bez niej build się przerywa | adres bucketa R2 ze zdjęciami |
| `PUBLIC_FORMSPREE_ID` | tak (formularz) | samo ID formularza, nie cały URL |
| `PUBLIC_TURNSTILE_SITE_KEY` | nie | bez niej widget Turnstile się nie pokazuje |
| `PUBLIC_CF_BEACON_TOKEN` | nie | analityka Cloudflare |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | tylko dla `sync-images` | **sekrety**, nigdy z przedrostkiem `PUBLIC_` |

### Komendy

- `npm run dev`: serwer deweloperski (localhost:4321) — tylko Wiktor, potrzebuje `.env`
- `npm run build`: prawdziwy build do `dist/` — tylko Wiktor i CI (prawdziwe wartości z `.env` albo z sekretów GitHuba)
- `npm run preview`: podgląd `dist/` (localhost:4322) — tylko Wiktor
- `npm run build:testy`: build na danych testowych do `dist-testy/` (atrapa R2, wartości testowe, bez `.env`) — dla wykonawcy
- `npm run preview:testy`: podgląd `dist-testy/` (localhost:4323) — dla wykonawcy
- `npm test`: wszystkie etapy po kolei, tak jak CI, do pierwszego błędu: `npm run check` → `npm run test:jednostkowe` → `npm run test:integracyjne` → `npm run test:e2e`
- `npm run test:jednostkowe`, `npm run test:integracyjne`: testy Vitesta (`tests/jednostkowe/`, `tests/integracyjne/`), kilka sekund; oba naraz: `npx vitest run` (sekcja 7, „Poziomy testów”)
- `npm run test:e2e`: build na danych testowych do `dist-testy/` (`npm run build:testy`), potem testy Playwright (Chrome desktop i mobile, testy dostępności axe). Testy nigdy nie widzą prawdziwych zdjęć — sekcja 7, „Dane testowe”
- `npm run sync-images`: dodaje nowe zdjęcia z `images/`, tylko JPG (uruchamiam ja, nie Ty)
- `npm run sync-images -- --uzupelnij`: dopytuje o brakujące opisy i kategorie
- `npm run sync-images -- --wyroznij`: wybór zdjęć na stronę główną — które pokazują się w sekcji "Wybrane prace" i która jedna para trafia do suwaka przed/po
- `node scripts/sprawdz-czyszczenie.mjs`: tylko odczyt — pokazuje, co czyszczenie zostawi w zdjęciach z `images/` (wszystkie JPG albo plik podany na końcu), zanim trafią do R2; bez R2, `.env` i zapisu plików, kod wyjścia 1 przy problemach (uruchamiam ja przed `--podmien`, nie Ty)

---

## 6. Struktura plików

```
.claude/skills/            skille Astro: docs-lookup, astro-best-practices, create-component (sekcja 11)
.claude/rules/             konwencje kodu, wczytywane przy pracy na plikach z src/ (sekcja 8)
.github/workflows/ci.yml   etapy po kolei: typy i testy jednostkowe → testy integracyjne → testy e2e → build + Lighthouse → „Wynik” (wymagany do scalenia PR)
.github/pull_request_template.md   szablon opisu PR: co i po co, wiedza z zadania, jak sprawdzone
public/
  _headers                 nagłówki HTTP Cloudflare (komentarze TYLKO przez "#")
  fonts/                   podzbiór Noto Sans (2 pliki .woff2) — patrz global.css i sekcja 10
  sw.js                    service worker (offline), ma ręczną listę stron
  manifest.webmanifest, offline.html + offline.css, ikony, og-default.jpg, robots.txt
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
    Schema.astro           dane strukturalne JSON-LD
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
  env.d.ts                 typy zmiennych środowiskowych
  layouts/Layout.astro, ArticleLayout.astro
  pages/index.astro, galeria.astro, kontakt.astro, faq.astro, o-mnie.astro, 404.astro
  pages/oferta.astro       szkic oferty — UKRYTY do czasu cen (sekcja 10, „Ukryta podstrona”)
  styles/global.css        Tailwind v4, @theme (kolory), font Noto Sans
tests/404.spec.ts, a11y.spec.ts, csp.spec.ts, dane-testowe.spec.ts, galeria.spec.ts, kontakt.spec.ts, naglowek.spec.ts, oferta.spec.ts, offline.spec.ts, pytania.spec.ts, suwak.spec.ts; pomocnicze.ts (wspólna lista stron STRONY i funkcje dla testów)
tests/dane/galeria.json    dane testowe galerii (edytowane ręcznie) — z nich powstaje strona do testów
tests/piexifjs.d.ts   typy dla piexifjs (paczka ich nie ma) — tylko dla testu EXIF-u
tests/jednostkowe/         testy jednostkowe Vitesta (*.test.ts): kategorie.test.ts, nawigacja.test.ts, sync-images.test.ts
tests/integracyjne/        testy integracyjne Vitesta (*.test.ts): galeria.test.ts (src/lib/galeria.ts z atrapą R2), seo-i-schema.test.ts, sync-images.test.ts
vitest.config.ts           konfiguracja Vitesta: dwa projekty, „jednostkowe” i „integracyjne”
images/, data/galeria.db   TYLKO na moim komputerze, poza gitem
```

---

## 7. Przepływ zdjęć

```
images/październik_26_EDYCJA_DSC7102.jpg (+ opcjonalnie październik_26_PRZED_DSC7102.jpg — PRZED w miejscu EDYCJA;
                      dawny sposób też działa: DSC_1234.jpg + przed_DSC_1234.jpg, wielkość liter bez znaczenia)
  → npm run sync-images
      ├─ wysyła pliki do Cloudflare R2
      ├─ zapisuje dane (opis, kategorie, wymiary, EXIF) do data/galeria.db
      └─ eksportuje src/data/galeria.json   ← to trafia do gita
  → src/lib/galeria.ts (wczytajZdjecia) czyta galeria.json i skleja adresy z PUBLIC_R2_URL — wspólne dla / i /galeria
  → Galeria.astro → Karta.astro (<Image> z astro:assets robi miniatury przy buildzie)
  → wczytajZdjecia() robi też przez getImage() wersje do lightboxa (webp, dłuższy bok 1280 i 1920 px)
```

- Na stronie nie ma żadnego adresu z R2: miniatury, lightbox i dane dla Google (Schema.org) wskazują pliki w `/_astro/`. Oryginały z R2 pobiera tylko build.
- **Do R2 trafia tylko czysty JPG.** Bucket jest publiczny, a klucze plików są jawne (`galeria.json` leży w publicznym repo). `wyczyscExifDoR2()` (`scripts/sync-images-funkcje.mjs`) przechodzi plik po znacznikach JPEG-a, bez ponownej kompresji, i zostawia w czystym oryginale (`zdjecia/…`) tylko białą listę: EXIF (`Make`, `Model`, `Orientation`, `DateTimeOriginal`, `DateTimeDigitized`, `LensModel`, `LensMake`, `LensSpecification`, `ExposureTime`, `FNumber`, `ISO`, `FocalLength`), profil kolorów ICC, nagłówki JFIF (bez miniatury) i Adobe oraz dane obrazu do znacznika końca. Znika wszystko inne: GPS, numery seryjne, autor i prawa autorskie, komentarze, nazwa programu, XMP, IPTC, miniatury, podglądy z aparatu i dane doklejone po końcu obrazu (np. film z „Motion Photo”). Nowe pole na białej liście = decyzja Wiktora + test.
- `plikiDoWgrania()` po czyszczeniu porównuje piksele, wymiary i obrót z oryginałem. Przy różnicy, tak samo jak przy pliku, którego nie da się wyczyścić, nic nie trafia do R2. Wersja ze znakiem wodnym (`znak/…`) powstaje z czystego pliku. PNG skrypt pomija z ostrzeżeniem. Pliki przed `--podmien` sprawdzam `node scripts/sprawdz-czyszczenie.mjs` (sekcja 5).
- Wymiary pliku „przed” build odczytuje z R2 (`inferRemoteSize`). Brak pliku „przed” w R2 = build przerywa się z komunikatem, którego pliku brakuje.
- Adresy z R2 przekazywane do `getImage()` i `<Image>` mają na końcu wersję pliku (`?v=` + skrót ETag z zapytania `HEAD`, funkcja `adresZWersjaWR2()` w `src/lib/galeria.ts`). Astro liczy nazwy plików w `/_astro/` z adresu, a nie z treści, a te pliki przeglądarka i `sw.js` trzymają długo — bez wersji zdjęcie podmienione przez `--podmien` dostałoby starą nazwę i odwiedzający widzieliby starą wersję. Nie usuwaj tej wersji z adresów.

- Komponenty zawsze opierają się na `galeria.json`, nigdy na bazie SQLite.
- `astro.config.mjs` buduje `image.remotePatterns` z `PUBLIC_R2_URL`. Przy zmianie domeny zdjęć zmienia się tylko zmienną.
- EXIF czytany jest z pliku „przed” (oryginał z aparatu), jeśli taki istnieje; pola, których tam brakuje, skrypt uzupełnia z pliku „po” (`pobierzExifZPary()`).
- Pola `wyroznione` i `paraSuwaka` (ustawia `npm run sync-images -- --wyroznij`) sterują stroną główną: `wyroznione` — sekcja "Wybrane prace", `paraSuwaka` — jedna para do suwaka na pierwszym ekranie. Brak oznaczeń nie przerywa builda — `index.astro` dobiera zastępcze zdjęcia i loguje ostrzeżenie (patrz sekcja 9).

**Dane testowe:** testy Playwright nie używają prawdziwych zdjęć. `npm run test:e2e` (ostatni etap `npm test`) buduje stronę przez `scripts/build-testowy.mjs`: zamiast `src/data/galeria.json` bierze `tests/dane/galeria.json` (zdjęcia ułożone pod testy: ponad 8 zdjęć, kategoria z jednym zdjęciem, zdjęcia z „przed” i bez, para do suwaka, polskie litery w nazwach), zamiast R2 — atrapę na porcie 4324 z szarymi zdjęciami JPG, a Formspree i Turnstile dostają wartości testowe (testy nie potrzebują `.env`). Wynik idzie do `dist-testy/`, podgląd dla testów na porcie 4323; `npm run build` i `dist/` zostają prawdziwe. Kod strony nic o tym nie wie — podmiana jest tylko w skrypcie. Build testowy ma własny cache (`node_modules/.astro-testy`). Na Windowsie pierwszy build na świeżym cache potrafi wyjść bez arkusza CSS — skrypt to wykrywa i sam buduje drugi raz („Pierwszy build wyszedł bez arkusza stylów…” w logu to nie błąd); gdy i to nie pomoże, kończy się błędem z podpowiedzią.
- `tests/dane/galeria.json` wolno edytować ręcznie (zakaz z sekcji 2 dotyczy tylko `src/data/galeria.json`). Ma ten sam układ pól co prawdziwy plik. Nowy przypadek do sprawdzenia = nowy wpis tutaj, a gdy testy go wymagają — także warunek w `tests/dane-testowe.spec.ts`.
- `tests/dane-testowe.spec.ts` pilnuje, że testy widzą stronę z danych testowych i że dane mają przypadki, których potrzebują testy galerii i suwaka. Brak przypadku na stronie to błąd testu, nie pominięcie: `test.skip` tylko z powodu projektu (telefon albo komputer), funkcji przeglądarki albo braku sieci — nigdy z powodu danych ani tego, co jest na stronie.
- Nowe pole w `galeria.json` (zmiana `sync-images`) = to samo pole w `tests/dane/galeria.json`.

**Poziomy testów** (CI uruchamia je w tej kolejności, każdy dopiero po zielonym poprzednim; `npm test` lokalnie tak samo):
- **Jednostkowe** — Vitest, `tests/jednostkowe/*.test.ts`: jedna funkcja albo jeden moduł, dane podstawione w teście (`vi.doMock`), bez sieci i bez renderowania. Przykład: lista kategorii liczona z `galeria.json`.
- **Integracyjne** — Vitest, `tests/integracyjne/*.test.ts`: kilka modułów razem, z atrapami tego, co wychodzi poza komputer — R2 to `vi.stubGlobal("fetch", …)`, `astro:assets` to `vi.mock`. Komponenty `.astro` renderuje Container API (`experimental_AstroContainer` — w Astro nadal eksperymentalne). Przykład: `src/lib/galeria.ts` (znak wodny, wersja z ETag, awaria R2), JSON-LD w `Schema.astro`.
- **E2e** — Playwright, `tests/*.spec.ts`: gotowa strona z danych testowych w przeglądarce (wyżej, „Dane testowe”).
- Plik Vitesta kończy się na `.test.ts`, plik Playwrighta na `.spec.ts` — każde narzędzie bierze tylko swoje (`include` w `vitest.config.ts`, `testMatch` w `playwright.config.ts`).
- Nowa logika w `src/lib/` albo `src/data/` = test jednostkowy albo integracyjny; zachowanie w przeglądarce = test e2e.
- Test nie zależy od prawdziwych zdjęć ani od `.env`: dane podstawiasz w teście, a zmienne `PUBLIC_*` przez `vi.stubEnv`.
- `scripts/sync-images.mjs` rusza sam przy imporcie (pytania w terminalu, R2, zapis `galeria.json`) — testy importują tylko `scripts/sync-images-funkcje.mjs`. Nową logikę sync-images, którą da się oddzielić od terminala, R2 i plików, dodawaj do tego modułu razem z testem; moduł nie może nic robić przy imporcie.

---

## 8. Konwencje kodu

Konwencje kodu (TypeScript, komponenty i importy, style i kolory, zaokrąglenia, dostępność, obrazy) są w `.claude/rules/konwencje-kodu.md`. Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `src/`, a OpenCode — na starcie każdej sesji. Zanim utworzysz nowy plik w `src/` albo zrobisz przegląd kodu, przeczytaj go, jeśli nie masz go jeszcze w rozmowie.

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
- Sekcja „Jak zamówić retusz” (`KROKI_ZAMOWIENIA`): 4 kroki w `<ol>`. Te same warunki (przesyłanie plików, bezpłatna wycena, termin 5–7 dni, poprawki: uwagi w 7 dni, do 25% zdjęć) są w najczęstszych pytaniach na `/faq/` (`NajczestszePytania.astro`), a część z nich (bezpłatna wycena, JPG w pełnej rozdzielczości, poprawki do 25% zdjęć) także w pasku „W skrócie” na `/o-mnie/` (`FAKTY` w `o-mnie.astro`). Zmieniasz jedno miejsce — zmień wszystkie w tym samym commicie.
- Treść sekcji „Co poprawiam przy retuszu” (`PUNKTY_RETUSZU`) i zaproszenia do kontaktu to na razie tekst tymczasowy — do potwierdzenia.

**PorownanieSuwak.astro:** „po” zawsze w tle (`loading="eager"`, `fetchpriority="high"` — LCP), „przed” nałożone przez `object-cover` i odsłaniane `clip-path` (tryb suwaka; połowa odsłonięta już w CSS, zanim zadziała skrypt) albo pokazywane w całości (`object-contain`) zwykłym przełącznikiem `aria-pressed` (tryb zastępczy) — wybór trybu przychodzi z propa `trybSuwaka` z `index.astro`. W trybie suwaka widać tylko pionową linię z okrągłym uchwytem, etykiety „Przed” / „Po” w górnych rogach i podpowiedź „Przesuń linię, żeby porównać” na dole (`data-porownanie-podpowiedz`) — skrypt chowa ją (`opacity-0`) przy pierwszym ruchu linii myszą, palcem albo klawiaturą. Linię przeciąga się w dowolnym miejscu zdjęcia: zdarzenia `pointerdown` / `pointermove` / `pointerup` / `pointercancel` na kontenerze z `touch-pan-y touch-pinch-zoom`. Przeciąga jeden wskaźnik naraz (mysz albo pierwszy palec). Palcem linia rusza dopiero przy ruchu w poziomie (próg 8 px) albo po stuknięciu — ruch w pionie przewija stronę i linii nie przesuwa (zanim przeglądarka wyśle `pointercancel`, przychodzą jeszcze 1–2 `pointermove`, stąd sprawdzanie kierunku), a dwoma palcami można powiększyć zdjęcie. Przeciąganie myszą i palcem sprawdza `tests/suwak.spec.ts`. Pod spodem zostaje `<input type="range">` z klasą `sr-only` (`data-porownanie-suwak`): obsługuje klawiaturę (strzałki) i czytniki ekranu, a jego wartość steruje linią (skrypt dopisuje `aria-valuetext`, np. „50% zdjęcia przed retuszem, 50% po retuszu”, żeby czytnik nie czytał samej liczby); fokus z klawiatury widać jako obwódkę na uchwycie (`group-has-[input:focus-visible]:ring-2`). Nie usuwaj tego suwaka i nie rób go widocznym — opiera się na nim test dostępności w `tests/a11y.spec.ts`. Pozycję linii i `clip-path` ustawia skrypt przez `element.style.*` (CSP, pułapka 7 niżej), nie atrybut `style=`.

**ContactForm.astro:** walidacja w JS (`noValidate`), komunikaty po polsku w `aria-live`. Wysyłka `fetch` do Formspree. Honeypot `_gotcha`. Turnstile włącza się, gdy jest `PUBLIC_TURNSTILE_SITE_KEY`: skrypt ładuje `Layout.astro` przez prop `turnstile`, a token weryfikuje Formspree. Bez JS formularz wysyła się zwykłym POST-em. Pola pod wycenę (wszystkie nieobowiązkowe) są w `<fieldset id="szczegoly-zlecenia">`: rodzaj usługi (lista z `uslugi` w `siteConfig.json` + „Inne / jeszcze nie wiem”; pusta lista = pole znika), liczba zdjęć, termin i link do plików (sprawdzany tylko, gdy coś wpisano). Puste pola z tego fieldsetu skrypt usuwa przed wysyłką. Ukryte pole `subject` („Zapytanie o wycenę”) ustawia temat maila od Formspree, a skrypt dopisuje do niego imię (cały temat sprawdza test w `tests/kontakt.spec.ts`).

**Schema.astro:** zawsze `Person` i `ProfessionalService`. `ImageGallery` pojawia się, gdy strona przekaże `zdjecia`, a `BreadcrumbList`, gdy przekaże `breadcrumbs`. Dane pochodzą z `siteConfig.json`, a adresy są absolutne przez `Astro.site`.

**SEO.astro:** canonical z propa albo z `Astro.url.pathname` + `Astro.site`. Obraz OG domyślnie `/og-default.jpg`. Locale `pl_PL`. Prop `bezIndeksowania` (podawany przez `Layout`) dodaje `<meta name="robots" content="noindex">` — tylko dla stron-szkiców.

---

## 10. Przepisy

**Nowe zdjęcie w galerii:** robię to ja, na jedynym komputerze z plikiem `.env` (sekcja 2, punkt 7). Najpierw scalam poprzedni PR ze zdjęciami, potem `git switch main` i `git pull`, wrzucam plik do `images/` i uruchamiam `npm run sync-images`. Zmieniony `src/data/galeria.json` idzie jak każda zmiana: przez osobną gałąź `zdjecia/<RRRR-MM-DD-GGMM>` i pull request, bo GitHub odrzuca push na `main`. Komendy mam w ściądze w Claude. W kodzie nic nie trzeba zmieniać. Jeśli poproszę Cię o commit `galeria.json` po `sync-images`: gałąź `zdjecia/<RRRR-MM-DD-GGMM>` (data i godzina), w commicie tylko `src/data/galeria.json`, komunikat ode mnie (bez niego `feat: zdjęcia w galerii`), dalej jak w sekcji 3 — sprawdzenie, push gałęzi, PR. Samego pliku nie zmieniasz (sekcja 2, punkt 3).

**Nowa podstrona:**
1. Utwórz `src/pages/nazwa.astro` (albo `.md` z `layout: ../layouts/ArticleLayout.astro`) i przekaż `title` oraz `description` do `Layout`.
2. Dodaj link w `src/data/nav.ts`: `navLinks` (menu i stopka) albo `linkiStopki` (tylko stopka).
3. Dopisz stronę do listy w `public/sw.js` i podbij `CACHE_NAME` (np. `foto-v4` → `foto-v5`).
4. Dopisz adres do `STRONY` w `tests/pomocnicze.ts` (z tej listy korzystają testy dostępności i CSP) i do `url` w `lighthouserc.json`.

**Ukryta podstrona (szkic, np. `/oferta/` przed podaniem cen):**
1. Utwórz stronę jak wyżej, ale przekaż do `Layout` prop `bezIndeksowania` (Google jej nie indeksuje).
2. Dopisz adres do `STRONY_POZA_SITEMAPA` w `astro.config.mjs` i do `STRONY` w `tests/pomocnicze.ts` (szkic też przechodzi testy dostępności i CSP).
3. Bez linku w `nav.ts` ani z innych stron, bez wpisu w `public/sw.js` i w `lighthouserc.json` (Lighthouse obniża ocenę SEO za noindex). Pilnuje tego `tests/oferta.spec.ts`.

Pokazanie ukrytej strony: usuń `bezIndeksowania` i wpis w `STRONY_POZA_SITEMAPA`, dodaj link w `nav.ts`, stronę w `public/sw.js` (i podbij `CACHE_NAME`) oraz w `lighthouserc.json`, a `tests/oferta.spec.ts` zmień tak, żeby sprawdzał link w menu i obecność w sitemapie.

**Nowa zmienna środowiskowa:**
1. Dodaj ją do `src/env.d.ts` (z opisem po polsku) i do `.env.example`. Prawdziwą wartość do `.env` wpisuje Wiktor — Ty dopisujesz tylko `.env.example`.
2. Jeśli jest potrzebna przy buildzie, dodaj ją do `env:` w kroku `Build` w `.github/workflows/ci.yml`. Testy mają osobny build: jeśli zmienna włącza coś, co sprawdzają testy, dopisz jej wartość testową w `scripts/build-testowy.mjs` (tam, gdzie `PUBLIC_FORMSPREE_ID`).
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

1. **Astro 7 jest nowy.** Twoja wiedza może dotyczyć starszej wersji. Jeśli nie masz pewności co do API Astro, użyj skilla `docs-lookup` (`.claude/skills/docs-lookup/SKILL.md`) i sprawdź w dokumentacji zamiast zgadywać. Przy nowym komponencie albo nowej stronie korzystaj ze skilla `create-component`, a przy przeglądzie kodu — z `astro-best-practices` (oba w `.claude/skills/`).
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