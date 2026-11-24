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
- **Blokady Claude Code** są w `.claude/settings.local.json` w folderze projektu. Nie ma ich w repo: każdy komputer ma własny plik, zakładany ręcznie. Jeśli pracujesz jako Claude Code, a w folderze projektu nie ma tego pliku, nie zaczynaj pracy, tylko napisz mi o tym — działałbyś wtedy bez blokad.

**Pliki reguł w `.claude/rules/`.** Część instrukcji jest w osobnych plikach. Claude Code wczytuje taki plik dopiero wtedy, gdy czyta albo zmienia pasujący plik (kolumna „Kiedy się wczytuje”), a OpenCode dostaje wszystkie od razu. Przy tworzeniu nowego pliku reguła wczytuje się dopiero przy jego zapisie, czyli za późno. Dlatego **zanim zaczniesz zadanie z danego obszaru, przeczytaj pasujący plik z `.claude/rules/`**, jeśli nie masz go jeszcze w rozmowie. Zakazy z sekcji 2 i pułapki z sekcji 11 obowiązują zawsze, niezależnie od tych plików.

| Plik | Kiedy się wczytuje | Co zawiera |
|---|---|---|
| `konwencje-kodu.md` | pliki w `src/` | sekcja 8: TypeScript, komponenty i importy, style i kolory, zaokrąglenia, dostępność, obrazy |
| `zdjecia.md` | `scripts/`, `src/lib/galeria.ts`, `src/data/`, komponenty galerii, suwaka i `ui/`, `index.astro`, `galeria.astro`, `astro.config.mjs`, `tests/dane/`, testy zdjęć i `sync-images` | sekcja 7: przepływ zdjęć, R2, EXIF, `wyroznione`, `paraSuwaka` |
| `testy.md` | `tests/`, `scripts/build-testowy.mjs`, konfiguracje Playwrighta i Vitesta, `.github/workflows/`, `src/lib/`, `src/data/` | sekcja 7: dane testowe, poziomy testów |
| `elementy-strony.md` | `src/`, `public/` | sekcja 9: nagłówek, galeria, strona główna, suwak, formularz, Schema, SEO |
| `przepisy.md` | `src/`, `public/`, `astro.config.mjs`, `lighthouserc.json`, `tests/strony.ts`, testy `*.spec.ts`, `.env.example`, `.github/workflows/`, `opencode.json` | sekcja 10: podstrony, zmienna środowiskowa, kolory, czcionka, pole formularza, Schema, treści powtórzone (bez „Nowe zdjęcie w galerii”) |
| `funkcje-ai.md` | pliki w `src/` | sekcja 12: zasady dla funkcji opartych o AI |
| `struktura.md` | `src/`, `tests/`, `scripts/`, `public/` | sekcja 6: drzewo plików projektu |

---

## 2. Czego NIGDY nie robić

1. **Nigdy nie wypychaj na `main` i nigdy nie scalaj pull requestów.** Wolno Ci wypchnąć tylko własną gałąź zadania, poleceniem z sekcji 3 (`git push -u origin <gałąź>`): bez `--force`, bez `--delete` i nigdy samo `git push` bez nazwy gałęzi. Pull request scala wyłącznie Wiktor — nie używaj `gh pr merge`, `gh api` ani `gh auth`. GitHub i tak odrzuci push na `main`, ale ta zasada obowiązuje niezależnie od tego.
2. **Nie importuj niczego z folderu `images/`** w `src/`. Tego folderu nie ma w gicie ani na Cloudflare Pages, więc build na produkcji się wysypie.
3. **Nie edytuj ręcznie `src/data/galeria.json` i nie uruchamiaj `npm run sync-images`** (ani innych skryptów z `scripts/`, które zapisują `galeria.json` lub `data/galeria.db`). Zdjęcia dodaję tylko ja: skrypt pyta o opisy, wgrywa pliki do R2 kluczami z `.env` i przepisuje `galeria.json`. (Baza `data/galeria.db` jest odtwarzana z `galeria.json` przy każdym uruchomieniu, więc po `git pull` skrypt jest bezpieczny na każdym moim komputerze. Zakaz dotyczy Ciebie, a nie sprzętu.) `node scripts/sprawdz-czyszczenie.mjs` też uruchamiam tylko ja: niczego nie zapisuje, ale czyta moje zdjęcia z `images/`. Jeśli zadanie wymaga odświeżenia `galeria.json`, napisz mi, że mam to zrobić sam.
4. **Nie dodawaj adaptera `@astrojs/cloudflare`, SSR ani `output: "server"`.** Strona jest w pełni statyczna.
5. **Nie pisz składni Tailwind v3.** Nie ma `tailwind.config.js` ani `@tailwind base`. Kolory są w `@theme` w `global.css`. Zamienniki:
   - `bg-opacity-50` → `bg-black/50`
   - `flex-shrink-0` / `flex-grow` → `shrink-0` / `grow`
   - `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm` (tak samo `blur`). Zaokrągleń to nie dotyczy: w projekcie są tylko `rounded-sm`, `rounded-md`, `rounded-lg` i `rounded-full`, a reszta skali jest wyłączona (`rounded-xs` nic nie robi) — `.claude/rules/konwencje-kodu.md`, „Style”.
   - `bg-gradient-to-r` → `bg-linear-to-r`
   - `ring` (3 px) → `ring-3`
   - `outline-none` → `outline-hidden`
6. **W pliku `.astro` kod JS/TS może być tylko w dwóch miejscach:**
   - między `---` na górze pliku (wykonuje się przy budowaniu),
   - w znaczniku `<script>` (wykonuje się w przeglądarce).

   Nigdy luzem w HTML. Zmiennych z `---` nie ma w `<script>`, więc przekazuj je przez atrybuty `data-*`.
7. **`.env` nie jest dla Ciebie.** To konfiguracja produkcyjna — jest tylko jeden, u mnie (do `sync-images`). Nie czytasz go, nie tworzysz, nie kopiujesz, nie wypisujesz i nie commitujesz. Nie uruchamiasz poleceń, które biorą z niego prawdziwe wartości: `npm run dev`, `npm run build`, `npm run preview`, `npm run sync-images`. Cała Twoja praca działa bez `.env`, na danych testowych i atrapach (`npm test`, `npm run build:testy`, `npm run preview:testy`). Jeśli coś bez `.env` nie działa, to błąd do opisania w raporcie, a nie powód, żeby `.env` założyć.
8. **Nie usuwaj i nie zmieniaj atrybutów, na których stoją testy.** Chodzi nie tylko o `data-testid`. Kontraktem są też `id` i atrybuty `data-*` / `aria-*`, których szukają testy (np. `id="lightbox-przelacznik"`, `data-porownanie-suwak`, `aria-pressed`). Zanim zmienisz albo usuniesz `id` czy atrybut, poszukaj go w `tests/`. Jeśli zadanie wymaga takiej zmiany, popraw test w tym samym commicie.
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
2. **Sprawdzenie robisz Ty** — Claude w czacie nie buduje strony. Zawsze uruchom `npm test` (wszystkie etapy po kolei, tak jak CI: typy, testy jednostkowe, integracyjne i e2e — build na danych testowych i Playwright; zatrzymuje się na pierwszym błędzie). Prawdziwego buildu (`npm run build`) nie uruchamiasz — potrzebuje `.env` (sekcja 2, punkt 7). Prawdziwy build ze zdjęciami z R2 i Lighthouse robi CI (etap „Build i Lighthouse”); bez niego nie ma zielonego „Wyniku”. Jeśli zadanie od Claude podaje dodatkowe sprawdzenia (np. co ma być w zbudowanej stronie: fragment HTML, JSON-LD, nazwa pliku), wykonaj je na `dist-testy/` (powstaje w `npm test` albo `npm run build:testy`) i zapisz wynik. Wyjątek: gdy zmieniasz tylko pliki `.md` poza `src/` (np. `AGENTS.md`, `README.md`, `.claude/`), testy pomijasz — napisz to w raporcie. Plik `.md` w `src/pages/` (np. `polityka-prywatnosci.md`) to strona, więc testy uruchamiasz jak zwykle.
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

- **Stos:** Astro 7, Tailwind CSS v4 (`@tailwindcss/vite`), TypeScript strict, Node 24 — minimum i wersja, na której budują CI i Cloudflare Pages (dokładnie w `.node-version`); starszego nie używamy, na komputerach Wiktora bywa nowszy
- **Hosting:** Cloudflare Pages, automatyczny deploy z brancha `main`, statyczny `dist/`
- **Usługi:** Cloudflare R2 (zdjęcia), Formspree (formularz), Cloudflare Turnstile (ochrona formularza), Cloudflare Web Analytics
- **Poza zakresem:** blog i pobieranie zdjęć przez odwiedzających (celowo utrudniamy kopiowanie). Opinie klientów i link do Instagrama są odłożone na później.

### Zmienne środowiskowe (`.env`, wzór w `.env.example`, typy w `src/env.d.ts`)

Plik `.env` z prawdziwymi wartościami jest tylko u Wiktora (sekcja 2, punkt 7). CI bierze je z sekretów GitHuba, a build testowy i testy mają własne wartości testowe.

| Zmienna | Czy wymagana | Do czego |
|---|---|---|
| `PUBLIC_R2_URL` | **tak**, bez niej build się przerywa | adres bucketa R2 ze zdjęciami |
| `PUBLIC_FORMSPREE_ID` | nie, ale zalecana — bez niej build przejdzie z ostrzeżeniem (`ZALECANE_ZMIENNE`), a formularz nie wyśle żadnej wiadomości | samo ID formularza, nie cały URL |
| `PUBLIC_TURNSTILE_SITE_KEY` | nie | bez niej widget Turnstile się nie pokazuje |
| `PUBLIC_CF_BEACON_TOKEN` | nie | analityka Cloudflare |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | tylko dla `sync-images` | **sekrety**, nigdy z przedrostkiem `PUBLIC_` |

### Komendy

- `npm run check`: sprawdzanie typów (`astro check`) — pierwszy etap `npm test`, działa bez `.env`
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
- `npm run sync-images -- --podmien <plik>`: ponownie wgrywa zdjęcie, które już jest w galerii (nowa wersja „po” albo „przed”) — uruchamiam ja
- `npm run sync-images -- --usun <plik>`: TRWALE usuwa zdjęcie z R2, z bazy i z `galeria.json` — uruchamiam ja
- `node scripts/sprawdz-czyszczenie.mjs`: tylko odczyt — pokazuje, co czyszczenie zostawi w zdjęciach z `images/` (wszystkie JPG albo plik podany na końcu), zanim trafią do R2; bez R2, `.env` i zapisu plików, kod wyjścia 1 przy problemach (uruchamiam ja przed `--podmien`, nie Ty)

---

## 6. Struktura plików

Drzewo plików projektu z opisem każdego pliku jest w `.claude/rules/struktura.md` (tabelka w sekcji 1).

---

## 7. Przepływ zdjęć

Przepływ zdjęć (schemat, R2, czyszczenie plików, EXIF, `wyroznione` i `paraSuwaka`) jest w `.claude/rules/zdjecia.md`, a „Dane testowe” i „Poziomy testów” — w `.claude/rules/testy.md`. Claude Code wczytuje je przy pracy na pasujących plikach (tabelka w sekcji 1), OpenCode zawsze.

---

## 8. Konwencje kodu

Konwencje kodu (TypeScript, komponenty i importy, style i kolory, zaokrąglenia, dostępność, obrazy) są w `.claude/rules/konwencje-kodu.md`. Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `src/`, a OpenCode — na starcie każdej sesji. Zanim utworzysz nowy plik w `src/` albo zrobisz przegląd kodu, przeczytaj go, jeśli nie masz go jeszcze w rozmowie.

---

## 9. Jak działają kluczowe elementy

Opis działania nagłówka, galerii, strony głównej, suwaka przed/po, formularza, Schema i SEO jest w `.claude/rules/elementy-strony.md` (tabelka w sekcji 1).

---

## 10. Przepisy

Przepisy („Nowa podstrona”, „Ukryta podstrona”, „Nowa zmienna środowiskowa”, „Zmiana kolorów”, „Brakujący znak w czcionce”, „Nowe pole w formularzu”, „Dane dla Google”, „Treści powtórzone w kilku miejscach”) są w `.claude/rules/przepisy.md` (tabelka w sekcji 1). Tu zostaje tylko „Nowe zdjęcie w galerii”, bo ta praca nie wymaga czytania plików z `src/`.

**Nowe zdjęcie w galerii:** robię to ja, na jedynym komputerze z plikiem `.env` (sekcja 2, punkt 7). Najpierw scalam poprzedni PR ze zdjęciami, potem `git switch main` i `git pull`, wrzucam plik do `images/` i uruchamiam `npm run sync-images`. Zmieniony `src/data/galeria.json` idzie jak każda zmiana: przez osobną gałąź `zdjecia/<RRRR-MM-DD-GGMM>` i pull request, bo GitHub odrzuca push na `main`. Komendy mam w ściądze w Claude. W kodzie nic nie trzeba zmieniać. Jeśli poproszę Cię o commit `galeria.json` po `sync-images`: gałąź `zdjecia/<RRRR-MM-DD-GGMM>` (data i godzina), w commicie tylko `src/data/galeria.json`, komunikat ode mnie (bez niego `feat: zdjęcia w galerii`), dalej jak w sekcji 3 — sprawdzenie, push gałęzi, PR. Samego pliku nie zmieniasz (sekcja 2, punkt 3).

---

## 11. Pułapki

1. **Astro 7 jest nowy.** Twoja wiedza może dotyczyć starszej wersji. Jeśli nie masz pewności co do API Astro, użyj skilla `docs-lookup` (`.claude/skills/docs-lookup/SKILL.md`) i sprawdź w dokumentacji zamiast zgadywać. Przy nowym komponencie albo nowej stronie korzystaj ze skilla `create-component`, a przy przeglądzie kodu — z `astro-best-practices` (oba w `.claude/skills/`).
2. **`Astro.url` a `Astro.site`:** `Astro.url` to adres bieżącej strony, a `Astro.site` to domena z konfiguracji. Absolutne adresy buduj przez `Astro.site`.
3. **W `public/_headers` komentarz to tylko `#`.** Styl `/* */` Cloudflare czyta jako wzorzec ścieżki i nagłówki przestają działać.
4. **W `astro.config.mjs` nie ma `import.meta.env`.** Zmienne wczytuje `loadEnv` z Vite.
5. **Service worker:** strony HTML pobiera najpierw z sieci (network-first), a pliki z `/_astro/` i zdjęcia najpierw z cache. Nie zmieniaj tego bez pytania — przy cache-first dla stron odwiedzający po deployu widzieli starą treść. Lista stron w `sw.js` służy tylko do trybu offline. Strony zapisuje i szuka w pamięci pod adresem bez części po „?” (np. `?fbclid=` z Facebooka) — HTML jest ten sam, a bez tego wejście z linku z parametrem offline pokazywało „Jesteś offline”.
6. **Formspree ID** to sam identyfikator (np. `xzznnkyq`), a nie pełny URL.
7. **Content-Security-Policy (CSP) w `public/_headers`.** Przeglądarka ładuje skrypty, style, ramki i połączenia tylko z miejsc z tej listy. Dlatego:
   - żadnych `onclick=` / `onload=`, `style="..."`, `<script>` z atrybutem `is:inline` ani `set:html` z kodem JS — wszystko, co wklejone w HTML, zostanie zablokowane (`set:html` z danymi JSON-LD jest w porządku),
   - w `astro.config.mjs` zostają `build.inlineStylesheets: 'never'` i `vite.build.assetsInlineLimit: 0` — bez nich Astro wkleja małe skrypty i style prosto do HTML,
   - nowa zewnętrzna usługa (skrypt, ramka, `fetch` do innej domeny) = najpierw zapytaj, potem dopisz jej domenę do właściwej dyrektywy CSP w `_headers`,
   - `tests/csp.spec.ts` czyta politykę z `_headers` i wykrywa naruszenia na wszystkich stronach (także przy wysyłce formularza i rejestracji service workera) — nowa podstrona trafia do `STRONY` w `tests/strony.ts`.
8. **Link w środku zdania pisz w tej samej linii co tekst wokół niego.** Gdy między tekstem a znacznikiem (np. `<a>`) jest przejście do nowej linii, Astro przy buildzie usuwa spację i na stronie słowa sklejają się z linkiem („przezSwissTransfer”). Dobrze: `Pliki wyślij przez <a href="…">SwissTransfer</a>: jest darmowy`.

---

## 12. Tylko jeśli dodajesz do strony funkcję opartą o AI (zasady Fluent 2 RAI)

Zasady dla funkcji opartych o AI są w `.claude/rules/funkcje-ai.md` (tabelka w sekcji 1).
