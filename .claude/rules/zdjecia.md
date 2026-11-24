---
paths:
  - "scripts/**"
  - "src/lib/galeria.ts"
  - "src/data/**"
  - "src/components/Galeria.astro"
  - "src/components/PorownanieSuwak.astro"
  - "src/components/ui/**"
  - "src/pages/index.astro"
  - "src/pages/galeria.astro"
  - "astro.config.mjs"
  - "tests/dane/**"
  - "tests/**/sync-images*"
  - "tests/integracyjne/galeria.test.ts"
  - "tests/integracyjne/porownanie-suwak.test.ts"
  - "tests/galeria.spec.ts"
  - "tests/suwak.spec.ts"
  - "tests/dane-testowe.spec.ts"
  - "tests/piexifjs.d.ts"
---

# Przepływ zdjęć — portfolio fotograficzne (balansbieli.pl)

Dawna sekcja 7 `AGENTS.md` (część o zdjęciach: schemat, R2, czyszczenie plików, EXIF, `wyroznione` i `paraSuwaka`). Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik zdjęć: skrypty w `scripts/`, `src/lib/galeria.ts`, dane w `src/data/`, komponenty galerii i suwaka, strony `/` i `/galeria`, `astro.config.mjs`, dane testowe w `tests/dane/` albo testy zdjęć i `sync-images`, a OpenCode — na starcie każdej sesji (`instructions` w `opencode.json`). Zakazy z sekcji 2 i pułapki z sekcji 11 `AGENTS.md` obowiązują niezależnie od niego.

```
images/październik_26_EDYCJA_DSC7102.jpg (+ opcjonalnie październik_26_PRZED_DSC7102.jpg — PRZED w miejscu EDYCJA;
                      kandydat to JPG z „EDYCJA_” w nazwie (także _IMG_1234, _DSCF1234) albo z numerem DSC;
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
- `plikiDoWgrania()` po czyszczeniu porównuje piksele, wymiary i obrót z oryginałem. Przy różnicy, tak samo jak przy pliku, którego nie da się wyczyścić, nic nie trafia do R2. Wersja ze znakiem wodnym (`znak/…`) powstaje z czystego pliku. Pliki inne niż JPG (PNG, HEIC, TIFF, WebP) i JPG bez `EDYCJA_`/DSC skrypt pomija z ostrzeżeniem; przy braku „przed” pyta, czy dodać. Pliki przed `--podmien` sprawdzam `node scripts/sprawdz-czyszczenie.mjs` (sekcja 5).
- Wymiary pliku „przed” build odczytuje z R2 (`inferRemoteSize`). Brak pliku „przed” w R2 = build przerywa się z komunikatem, którego pliku brakuje.
- Adresy z R2 przekazywane do `getImage()` i `<Image>` mają na końcu wersję pliku (`?v=` + skrót ETag z zapytania `HEAD`, funkcja `adresZWersjaWR2()` w `src/lib/galeria.ts`). Astro liczy nazwy plików w `/_astro/` z adresu, a nie z treści, a te pliki przeglądarka i `sw.js` trzymają długo — bez wersji zdjęcie podmienione przez `--podmien` dostałoby starą nazwę i odwiedzający widzieliby starą wersję. Nie usuwaj tej wersji z adresów.

- Komponenty zawsze opierają się na `galeria.json`, nigdy na bazie SQLite.
- `astro.config.mjs` buduje `image.remotePatterns` z `PUBLIC_R2_URL`. Przy zmianie domeny zdjęć zmienia się tylko zmienną.
- EXIF czytany jest z pliku „przed” (oryginał z aparatu), jeśli taki istnieje; pola, których tam brakuje, skrypt uzupełnia z pliku „po” (`pobierzExifZPary()`).
- Pola `wyroznione` i `paraSuwaka` (ustawia `npm run sync-images -- --wyroznij`) sterują stroną główną: `wyroznione` — sekcja "Wybrane prace", `paraSuwaka` — jedna para do suwaka na pierwszym ekranie. Brak oznaczeń nie przerywa builda — `index.astro` dobiera zastępcze zdjęcia i loguje ostrzeżenie (patrz sekcja 9).
