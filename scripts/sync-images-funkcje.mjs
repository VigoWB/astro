/**
 * sync-images-funkcje.mjs
 *
 * Czyste funkcje skryptu sync-images: nazwy par przed/po, wybór plików z images/, odpowiedź na pytanie
 * o brak „przed”, klucze R2 i podpowiedzi do błędów R2, opcje wiersza poleceń,
 * numery w --wyroznij, czyszczenie plików do R2 (biała lista metadanych, porównanie pikseli)
 * i zamiana galeria.json ↔ baza SQLite.
 * Importują go scripts/sync-images.mjs, scripts/sprawdz-czyszczenie.mjs i testy Vitesta
 * (tests/jednostkowe/sync-images.test.ts, tests/integracyjne/sync-images.test.ts,
 * tests/integracyjne/galeria.test.ts).
 *
 * UWAGA: ten plik nie może nic robić przy imporcie — żadnych pytań w terminalu, kończenia
 * procesu, czytania ani zapisu plików, console.* ani odczytu process.env na poziomie modułu.
 * Inaczej testy zaczęłyby pytać w terminalu albo ruszać prawdziwe pliki. Wszystko, co dotyka
 * terminala, R2, plików na dysku i kończy proces, zostaje w scripts/sync-images.mjs
 * (test w tests/jednostkowe/sync-images.test.ts sprawdza, że nazw tych funkcji Node tu nie ma).
 * Bazę, sharp i exifr funkcje dostają w parametrze (bez importu node:sqlite i bibliotek).
 */

// --- Pary przed/po i klucze R2 ---

// Wersja ze znakiem wodnym leży pod tym samym kluczem, tylko w folderze "znak/"
// zamiast "zdjecia/". Miniatury (Karta.astro) biorą oryginał z "zdjecia/",
// lightbox i duże porównanie "przed/po" na stronie głównej (src/lib/galeria.ts)
// wersję z "znak/" — tam musi być ta sama funkcja.
// Klucz spoza "zdjecia/" zostałby bez zmian i wersja ze znakiem nadpisałaby czysty
// oryginał — dlatego taki klucz przerywa pracę.
/**
 * Klucz wersji ze znakiem wodnym dla klucza oryginału w R2.
 * @param {string} kluczR2 klucz oryginału, np. "zdjecia/DSC_1.jpg"
 * @returns {string} klucz wersji ze znakiem, np. "znak/DSC_1.jpg"
 */
export function kluczZnak(kluczR2) {
  if (!kluczR2.startsWith('zdjecia/')) {
    throw new Error(
      `nieoczekiwany klucz R2 "${kluczR2}" (powinien zaczynać się od "zdjecia/") — przerywam, żeby wersja ze znakiem nie nadpisała oryginału.`
    );
  }
  return kluczR2.replace(/^zdjecia\//, 'znak/');
}

// Możliwe nazwy pliku "przed" dla pliku "po". Działają dwa sposoby nazywania:
// - obecny (od listopada 2026): "PRZED_" w miejscu "EDYCJA_", np.
//   październik_26_EDYCJA_DSC7102.jpg → październik_26_PRZED_DSC7102.jpg;
// - dawny: "przed_" tuż przed numerem "DSC", np. DSC_1234.jpg → przed_DSC_1234.jpg,
//   DSC_4968-Edytuj.jpg → przed_DSC_4968-Edytuj.jpg,
//   wrzesień_26_EDYCJA_DSC7062.jpg → wrzesień_26_EDYCJA_przed_DSC7062.jpg
//   (nazwa bez numeru "DSC" dostaje "przed_" na początku).
// Dawny sposób zostaje dla zdjęć już wgranych — --podmien znajdzie ich "przed" pod starą nazwą.
/**
 * Możliwe nazwy pliku "przed" dla pliku "po", w kolejności pierwszeństwa.
 * @param {string} nazwaPliku nazwa pliku "po"
 * @returns {string[]} nazwy pliku "przed"
 */
export function nazwyWersjiPrzed(nazwaPliku) {
  const nazwy = [];
  if (/EDYCJA_/i.test(nazwaPliku)) nazwy.push(nazwaPliku.replace(/EDYCJA_/i, 'PRZED_'));
  const zPrzed = nazwaPliku.replace(/(DSC_?\d)/i, 'przed_$1');
  nazwy.push(zPrzed === nazwaPliku ? `przed_${nazwaPliku}` : zPrzed);
  return nazwy;
}

/**
 * Plik "przed" dla pliku "po" spośród podanych nazw plików (np. zawartości images/).
 * Wielkość liter bez znaczenia, zwraca nazwę w pisowni z listy. Gdy żadnej nie ma —
 * pierwszą nazwę z nazwyWersjiPrzed() (do komunikatu „nie ma pliku …”).
 * @param {string} nazwaPliku nazwa pliku "po"
 * @param {string[]} pliki nazwy plików, wśród których szukamy
 * @returns {string} nazwa pliku "przed"
 */
export function wybierzPlikPrzed(nazwaPliku, pliki) {
  const kandydaci = nazwyWersjiPrzed(nazwaPliku);
  for (const kandydat of kandydaci) {
    const plik = pliki.find((f) => f.toLowerCase() === kandydat.toLowerCase());
    if (plik) return plik;
  }
  return kandydaci[0];
}

// Do R2 wysyłamy tylko JPG: tylko ten format umiemy wyczyścić bez ponownej kompresji
// (wyczyscExifDoR2 niżej). Jedna reguła dla wyboru plików, czyszczenia i --podmien.
/**
 * Czy nazwa pliku (albo klucz R2) to JPG — rozszerzenie .jpg albo .jpeg, wielkość liter bez znaczenia.
 * @param {string} nazwaPliku
 * @returns {boolean}
 */
export function czyJpg(nazwaPliku) {
  return /\.jpe?g$/i.test(nazwaPliku);
}

// Formaty, których do R2 nie wysyłamy (tylko JPG umiemy wyczyścić bez ponownej kompresji),
// a które zwykle są zdjęciami: skrypt wypisze je z podpowiedzią, zamiast pominąć po cichu.
const FORMATY_INNE_NIZ_JPG = /\.(png|heic|heif|tiff?|webp)$/i;

/**
 * Zdjęcia z listy plików w images/: kandydaci do dodania jako "po", JPG bez oznaczenia w nazwie
 * i pliki w innych formatach niż JPG.
 * @param {string[]} pliki wszystkie nazwy plików z images/
 * @returns {{ zdjecia: string[], kandydaci: string[], bezOznaczenia: string[], pominiete: string[] }}
 *   zdjecia — JPG bez plików ukrytych; kandydaci — JPG bez "przed_", z "EDYCJA_" albo numerem DSC
 *   w nazwie, posortowani; bezOznaczenia — JPG bez "przed_", który nie ma ani "EDYCJA_", ani numeru
 *   DSC (zwykle literówka w nazwie), posortowane; pominiete — PNG, HEIC, HEIF, TIFF i WebP, posortowane
 */
export function wybierzZdjecia(pliki) {
  // Pliki ukryte (np. "._DSC_1234.jpg", które macOS zostawia na pendrive'ach) to nie zdjęcia.
  const widoczne = pliki.filter((f) => !f.startsWith('.'));
  const zdjecia = widoczne.filter((f) => czyJpg(f));
  const bezPrzed = zdjecia.filter((f) => !/przed_/i.test(f));
  // "EDYCJA_" (obecny sposób, także zdjęcia z telefonu: IMG_1234, i z Fuji: DSCF1234) albo numer DSC
  // (dawny sposób: DSC_1234.jpg).
  const maOznaczenie = (f) => /EDYCJA_/i.test(f) || /DSC_?\d/i.test(f);
  const kandydaci = bezPrzed.filter(maOznaczenie).sort();
  // JPG, którego skrypt nie weźmie, też nie znika po cichu — skrypt wypisze tę listę z podpowiedzią.
  const bezOznaczenia = bezPrzed.filter((f) => !maOznaczenie(f)).sort();
  const pominiete = widoczne.filter((f) => FORMATY_INNE_NIZ_JPG.test(f)).sort();
  return { zdjecia, kandydaci, bezOznaczenia, pominiete };
}

// Zdjęcie bez pliku "przed" to najczęściej literówka w nazwie jednego z plików, a nie zamiar.
// Dlatego skrypt pyta, zamiast dodać je po cichu — i tylko wyraźne "tak" dodaje: sam Enter
// (odruch) albo literówka w odpowiedzi to "nie", które niczego nie wgrywa ani nie zapisuje.
/**
 * Czy odpowiedź na pytanie „Dodać bez „przed”?" to zgoda: tylko "tak" (spacje na brzegach i
 * wielkość liter bez znaczenia).
 * @param {string} odpowiedz wpisana odpowiedź
 * @returns {boolean}
 */
export function czyDodacBezPrzed(odpowiedz) {
  return typeof odpowiedz === 'string' && odpowiedz.trim().toLowerCase() === 'tak';
}

// --- Błędy R2 ---

/**
 * Dopisek do komunikatu o błędzie R2 (wgrywanie, usuwanie) zależny od statusu odpowiedzi: złe klucze,
 * zła nazwa bucketu, chwilowa awaria po stronie Cloudflare albo nieznana przyczyna. Zaczyna się od
 * " — " i kończy kropką.
 * @param {number} status kod HTTP odpowiedzi R2
 * @returns {string}
 */
export function podpowiedzDoBleduR2(status) {
  if (status === 401 || status === 403) return ' — sprawdź klucze R2_* w .env.';
  if (status === 404) return ' — sprawdź nazwę bucketu (R2_BUCKET_NAME) w .env.';
  if (status === 429 || (status >= 500 && status <= 599)) {
    return ' — chwilowy kłopot po stronie Cloudflare R2. Odczekaj kilka minut i uruchom to samo polecenie jeszcze raz (to, co już zapisane, zostaje).';
  }
  return ' — wklej ten komunikat do czatu z Claude.';
}

// Pliki "przed", których skrypt nie sparuje z żadnym "po" — np. "po" ma dopisek "-Edytuj",
// a "przed" nie. Bez tego ostrzeżenia zdjęcie trafiłoby na stronę po cichu bez wersji "przed".
/**
 * Pliki "przed", których nie da się sparować z żadnym "po", z podpowiedzią nazwy "po".
 * @param {string[]} zdjecia nazwy zdjęć z images/
 * @param {string[]} nazwyPo nazwy plików "po" (kandydaci i zdjęcia już w bazie)
 * @returns {{ plik: string, pasujacePo: string }[]} w kolejności z listy zdjecia
 */
export function plikiPrzedBezPary(zdjecia, nazwyPo) {
  const oczekiwane = new Set(nazwyPo.flatMap((n) => nazwyWersjiPrzed(n)).map((n) => n.toLowerCase()));
  const wynik = [];
  for (const plik of zdjecia) {
    if (/przed_/i.test(plik) && !oczekiwane.has(plik.toLowerCase())) {
      // Podpowiedź: dawny sposób ("przed_" na początku albo obok "EDYCJA_") — "po" to nazwa
      // bez "przed_"; obecny — "EDYCJA_" w miejscu "PRZED_".
      const pasujacePo = /^przed_|EDYCJA_/i.test(plik) ? plik.replace(/przed_/i, '') : plik.replace(/przed_/i, 'EDYCJA_');
      wynik.push({ plik, pasujacePo });
    }
  }
  return wynik;
}

// --- Opcje z wiersza poleceń ---

// Dozwolone opcje (true = po opcji musi być nazwa pliku). Literówka albo opcja "połknięta"
// przez npm (brak "--" przed opcjami) kończy się błędem — inaczej skrypt po cichu
// uruchomiłby zwykłe dodawanie zdjęć, które wgrywa pliki do R2.
const OPCJE = { '--uzupelnij': false, '--wyroznij': false, '--usun': true, '--podmien': true };
const PODPOWIEDZ_OPCJI =
  '   Dostępne opcje: --uzupelnij, --wyroznij, --usun <plik>, --podmien <plik> — zawsze po "--", np.:\n' +
  '   npm run sync-images -- --usun DSC_1111.jpg';

// "--usuń" działa jak "--usun" — polskie litery w nazwie opcji nie są błędem.
/**
 * Tekst bez polskich liter (i innych znaków diakrytycznych).
 * @param {string} tekst
 * @returns {string}
 */
export function bezPolskichLiter(tekst) {
  return tekst.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
}

/**
 * Odczytuje opcję skryptu z argumentów wiersza poleceń. Rzuca błąd przy nieznanej opcji,
 * braku nazwy pliku, kilku opcjach naraz albo opcji przejętej przez npm.
 * @param {string[]} argumenty argumenty po nazwie skryptu (process.argv.slice(2))
 * @param {Record<string, string | undefined>} [env] zmienne środowiskowe (domyślnie process.env)
 * @returns {{ opcja: string | null, plik: string | null }}
 */
export function odczytajOpcje(argumenty, env = process.env) {
  // npm bez "--" zabiera opcję dla siebie: do skryptu dociera wtedy tylko nazwa pliku
  // (albo nic), a po opcji zostaje ślad w zmiennej środowiskowej npm_config_<opcja>.
  const polkniete = Object.keys(env)
    .filter((nazwa) => /^npm_config_/i.test(nazwa))
    .map((nazwa) => `--${bezPolskichLiter(nazwa.slice('npm_config_'.length).toLowerCase())}`)
    .filter((opcja) => Object.hasOwn(OPCJE, opcja));
  if (polkniete.length > 0) {
    throw new Error(`Opcję ${polkniete[0]} przejął npm, bo zabrakło "--" przed opcjami.\n${PODPOWIEDZ_OPCJI}`);
  }

  const wybrane = [];
  for (let i = 0; i < argumenty.length; i++) {
    const opcja = bezPolskichLiter(argumenty[i].toLowerCase());
    if (!Object.hasOwn(OPCJE, opcja)) {
      throw new Error(`Nieznana opcja albo argument: "${argumenty[i]}".\n${PODPOWIEDZ_OPCJI}`);
    }
    let plik = null;
    if (OPCJE[opcja]) {
      plik = argumenty[i + 1];
      if (!plik || plik.startsWith('--')) {
        throw new Error(`Podaj nazwę pliku, np.: npm run sync-images -- ${opcja} DSC_1111.jpg`);
      }
      i++;
    }
    wybrane.push({ opcja, plik });
  }

  if (wybrane.length > 1) {
    throw new Error(`Podaj jedną opcję naraz (podano: ${wybrane.map((w) => w.opcja).join(', ')}).`);
  }
  return wybrane[0] ?? { opcja: null, plik: null };
}

// --- Wyróżnienia (--wyroznij) ---

// Zamienia np. "1, 3 5" na [1, 3, 5]. Jeśli choć jeden fragment nie jest numerem z listy
// (literówka "1;3", zakres "1-3", słowo), zwraca null — wtedy NIC nie zmieniamy, zamiast
// zastosować resztę albo pustą listę (pusta lista skasowałaby wszystkie wyróżnienia).
/**
 * Numery z listy wpisane przez użytkownika, bez powtórzeń. Przy błędnym fragmencie
 * wypisuje ostrzeżenie i zwraca null.
 * @param {string} tekst wpisane numery, np. "1, 3 5"
 * @param {number} maks największy dozwolony numer
 * @returns {number[] | null}
 */
export function rozbijNaNumery(tekst, maks) {
  const fragmenty = tekst.split(/[\s,]+/).filter(Boolean);
  const bledne = fragmenty.filter((f) => !/^\d+$/.test(f) || Number(f) < 1 || Number(f) > maks);

  if (fragmenty.length === 0 || bledne.length > 0) {
    console.warn(
      `   ⚠️  Nieprawidłowe numery: ${bledne.join(', ') || tekst} — wpisz liczby od 1 do ${maks}, oddzielone przecinkiem lub spacją.`
    );
    return null;
  }
  return [...new Set(fragmenty.map(Number))];
}

// Nowa lista zastępuje obecną, więc zdjęcie, którego numeru nie wpisano, traci wyróżnienie.
/**
 * Zdjęcia, które stracą wyróżnienie po wpisaniu nowej listy numerów.
 * @template {{ id: number, wyroznione: unknown }} T
 * @param {T[]} wszystkie zdjęcia w kolejności z listy (numer = pozycja + 1)
 * @param {number[]} numery wybrane numery (od 1)
 * @returns {(T & { numer: number })[]} wyróżnione zdjęcia spoza wybranych, z numerem na liście
 */
export function zdjeciaTracaceWyroznienie(wszystkie, numery) {
  const noweId = new Set(numery.map((n) => wszystkie[n - 1].id));
  return wszystkie
    .map((w, i) => ({ ...w, numer: i + 1 }))
    .filter((w) => w.wyroznione && !noweId.has(w.id));
}

// --- Dane z aparatu (EXIF) ---

// Do bazy i galeria.json może trafić tylko zwykła liczba albo tekst. Część aparatów
// zapisuje w jednym polu kilka wartości (np. ISO jako [100, 0]) — wtedy bierzemy pierwszą.
// Inaczej do galeria.json trafiłby obiekt, strona pokazałaby "ISO [object Object]",
// a następne uruchomienie skryptu przerwałoby się przy odtwarzaniu bazy.
/**
 * Pierwsza dodatnia, skończona liczba (także z listy) albo null.
 * @param {unknown} wartosc
 * @returns {number | null}
 */
export function liczbaLubNull(wartosc) {
  const pierwsza = Array.isArray(wartosc) || ArrayBuffer.isView(wartosc) ? wartosc[0] : wartosc;
  return typeof pierwsza === 'number' && Number.isFinite(pierwsza) && pierwsza > 0 ? pierwsza : null;
}

/**
 * Przycięty niepusty tekst albo null.
 * @param {unknown} wartosc
 * @returns {string | null}
 */
export function tekstLubNull(wartosc) {
  return typeof wartosc === 'string' && wartosc.trim() ? wartosc.trim() : null;
}

// --- Czyszczenie pliku do R2 (biała lista) ---

// Czysty oryginał trafia do publicznego bucketu R2 pod kluczem "zdjecia/…", a klucze są jawne
// (galeria.json leży w publicznym repo). Dlatego zostaje w nim tylko to, czego potrzebuje build
// i o czym zdecydował Wiktor: biała lista segmentów pliku i pól EXIF. Lista zakazów zawsze
// czegoś nie przewidzi (XMP z GPS, IPTC, miniatury, podgląd z aparatu doklejony po końcu obrazu,
// pola Windows XP*, Photographer z EXIF 3.0…). Nowe pole na liście = decyzja Wiktora + test.
// Pikseli nie kodujemy drugi raz: dane obrazu przechodzą bajt w bajt.
// Wersja ze znakiem wodnym (nalozZnak w scripts/sync-images.mjs) powstaje z czystego pliku.

// Pola EXIF, które zostają. Make, Model, daty i obiektyw — decyzja Wiktora z 1.10; ekspozycja —
// to samo, co strona i tak pokazuje w podpisie EXIF; Orientation — według niego sharp w Astro
// obraca miniatury, a inferRemoteSize zamienia szerokość z wysokością pliku "przed".
const POLA_IFD0 = new Set([
  0x010f, // Make
  0x0110, // Model
  0x0112, // Orientation
]);
const POLA_EXIF = new Set([
  0x829a, // ExposureTime
  0x829d, // FNumber
  0x8827, // ISO (PhotographicSensitivity)
  0x9003, // DateTimeOriginal
  0x9004, // DateTimeDigitized (w exifr: CreateDate — z niego sync-images bierze datę do galeria.json)
  0x920a, // FocalLength
  0xa432, // LensSpecification (w exifr: LensInfo)
  0xa433, // LensMake
  0xa434, // LensModel
]);
const WSKAZNIK_EXIF = 0x8769; // pole w IFD0 z położeniem katalogu Exif

// Rozmiar jednej wartości w bajtach dla typów pól TIFF 1–13 (BYTE, ASCII, SHORT, LONG, RATIONAL…).
const ROZMIAR_TYPU = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };

// Pola z białej listy z EXIF-u (TIFF z segmentu APP1 "Exif\0\0"). Czyta tylko IFD0 i katalog
// Exif — do GPS, Interop i 1st IFD (miniatura) w ogóle nie zagląda, więc ich uszkodzenie nie
// przeszkadza. Wartości zostają bajt w bajt, w kolejności bajtów oryginału (II albo MM).
function polaExifZBialejListy(tiff) {
  if (tiff.length < 8) throw new Error('uszkodzony EXIF: za krótki');
  const kolejnosc = tiff.toString('latin1', 0, 2);
  if (kolejnosc !== 'II' && kolejnosc !== 'MM') throw new Error('uszkodzony EXIF: brak kolejności bajtów II/MM');
  const le = kolejnosc === 'II';
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('uszkodzony EXIF: brak nagłówka TIFF');

  const katalog = (offset, dozwolone, wIfd0) => {
    // 4 bajtów wskaźnika za katalogiem nie wymagamy: piexifjs nie zapisuje ich po katalogu Exif,
    // a za tym wskaźnikiem (1st IFD = miniatura) i tak nie idziemy.
    if (offset < 8 || offset + 2 > tiff.length) throw new Error('uszkodzony EXIF: katalog poza danymi');
    const liczba = u16(offset);
    if (offset + 2 + liczba * 12 > tiff.length) throw new Error('uszkodzony EXIF: katalog poza danymi');
    const wpisy = new Map();
    let wskaznikExif = null;
    for (let k = 0; k < liczba; k++) {
      const p = offset + 2 + k * 12;
      const pole = u16(p);
      if (wIfd0 && pole === WSKAZNIK_EXIF) {
        wskaznikExif ??= u32(p + 8);
        continue;
      }
      if (!dozwolone.has(pole) || wpisy.has(pole)) continue;
      const typ = u16(p + 2);
      const ile = u32(p + 4);
      const rozmiar = ROZMIAR_TYPU[typ];
      if (!rozmiar) throw new Error(`uszkodzony EXIF: pole 0x${pole.toString(16)} ma nieznany typ ${typ}`);
      const dlugosc = rozmiar * ile;
      let wartosc;
      if (dlugosc <= 4) {
        wartosc = tiff.subarray(p + 8, p + 8 + dlugosc); // krótka wartość leży w samym wpisie
      } else {
        const o = u32(p + 8);
        if (o < 8 || o + dlugosc > tiff.length) throw new Error(`uszkodzony EXIF: wartość pola 0x${pole.toString(16)} poza danymi`);
        wartosc = tiff.subarray(o, o + dlugosc);
      }
      wpisy.set(pole, { pole, typ, ile, wartosc });
    }
    return { wpisy: [...wpisy.values()], wskaznikExif };
  };

  const ifd0 = katalog(u32(4), POLA_IFD0, true);
  const exif = ifd0.wskaznikExif === null ? [] : katalog(ifd0.wskaznikExif, POLA_EXIF, false).wpisy;
  return { le, ifd0: ifd0.wpisy, exif };
}

// Nowy TIFF z wybranych pól: nagłówek (8 B), zaraz za nim IFD0 — parser wymiarów w Astro
// (inferRemoteSize) czyta Orientation tylko spod offsetu 8 — potem wartości IFD0, katalog Exif
// i jego wartości. Wpisy rosnąco po numerze pola, wartości dłuższe niż 4 bajty pod parzystym
// offsetem (wymogi TIFF), wskaźnik następnego katalogu 0 (bez 1st IFD z miniaturą). Wskaźnik
// Exif tylko wtedy, gdy katalog Exif ma choć jedno pole. Nic z listy = null (segment wypada).
function zapiszExif(le, ifd0, exif) {
  if (ifd0.length === 0 && exif.length === 0) return null;
  const rosnaco = (a, b) => a.pole - b.pole;
  const wpisy0 = [...ifd0];
  if (exif.length > 0) wpisy0.push({ pole: WSKAZNIK_EXIF, typ: 4, ile: 1, wartosc: null });
  wpisy0.sort(rosnaco);
  const wpisyExif = [...exif].sort(rosnaco);

  const parzyscie = (n) => n + (n % 2);
  const rozmiarKatalogu = (liczba) => 2 + liczba * 12 + 4;
  const rozmiarWartosci = (wpisy) =>
    wpisy.reduce((suma, w) => suma + (w.wartosc && w.wartosc.length > 4 ? parzyscie(w.wartosc.length) : 0), 0);

  const poczatek0 = 8;
  const wartosci0 = poczatek0 + rozmiarKatalogu(wpisy0.length);
  const poczatekExif = wartosci0 + rozmiarWartosci(wpisy0);
  const wartosciExif = poczatekExif + rozmiarKatalogu(wpisyExif.length);
  const calosc = wpisyExif.length > 0 ? wartosciExif + rozmiarWartosci(wpisyExif) : poczatekExif;

  const t = Buffer.alloc(calosc); // same zera, więc dopełnienie do parzystego offsetu też jest zerem
  const w16 = (v, o) => (le ? t.writeUInt16LE(v, o) : t.writeUInt16BE(v, o));
  const w32 = (v, o) => (le ? t.writeUInt32LE(v, o) : t.writeUInt32BE(v, o));
  t.write(le ? 'II' : 'MM', 0, 'latin1');
  w16(42, 2);
  w32(poczatek0, 4);

  const zapiszKatalog = (wpisy, poczatek, poczatekWartosci) => {
    w16(wpisy.length, poczatek);
    let wolne = poczatekWartosci;
    wpisy.forEach((w, k) => {
      const p = poczatek + 2 + k * 12;
      w16(w.pole, p);
      w16(w.typ, p + 2);
      w32(w.ile, p + 4);
      if (w.wartosc === null) {
        w32(poczatekExif, p + 8); // wskaźnik Exif
      } else if (w.wartosc.length <= 4) {
        w.wartosc.copy(t, p + 8); // krótka wartość w samym wpisie, od lewej
      } else {
        w32(wolne, p + 8);
        w.wartosc.copy(t, wolne);
        wolne += parzyscie(w.wartosc.length);
      }
    });
    w32(0, poczatek + 2 + wpisy.length * 12); // brak następnego katalogu
  };
  zapiszKatalog(wpisy0, poczatek0, wartosci0);
  if (wpisyExif.length > 0) zapiszKatalog(wpisyExif, poczatekExif, wartosciExif);
  return t;
}

const hex = (znacznik) => `FF${znacznik.toString(16).toUpperCase().padStart(2, '0')}`;
// SOF0–SOF15 bez DHT (FFC4), JPG (FFC8) i DAC (FFCC).
const czySof = (z) => z >= 0xc0 && z <= 0xcf && z !== 0xc4 && z !== 0xc8 && z !== 0xcc;
// Inne części kodowania obrazu, które zostają bajt w bajt: DHT, DAC, DQT, DNL, DRI.
const czyTabela = (z) => z === 0xc4 || z === 0xcc || z === 0xdb || z === 0xdc || z === 0xdd;
const czyAppn = (z) => z >= 0xe0 && z <= 0xef;
const zaczynaSie = (dane, tekst) => dane.length >= tekst.length && dane.toString('latin1', 0, tekst.length) === tekst;

// Przejazd po znacznikach JPEG-a: segment przeskakujemy po jego długości, a w danych skanu
// FF 00 (bajt FF w danych) i FF D0–D7 (RST) to nie znaczniki — każdy inny znacznik kończy dane
// skanu (w JPEG-u progresywnym dalej są DHT i kolejne SOS). Końca obrazu NIE szukamy jako
// pierwszego "FF D9" w bajtach: takie bajty bywają w tabeli DHT między skanami, w profilu ICC
// i w miniaturze w EXIF-ie (ona ma własne FF D8 … FF D9). Zwraca części pliku do EOI włącznie.
function rozbierzJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new Error('to nie jest plik JPEG');
  const urwany = () => new Error('plik urwany — brak znacznika końca obrazu');
  const czesci = [];
  let i = 2;
  for (;;) {
    if (i >= b.length) throw urwany();
    if (b[i] !== 0xff) throw new Error(`nieoczekiwane bajty na pozycji ${i} — plik uszkodzony`);
    while (i < b.length && b[i] === 0xff) i++; // bajty wypełnienia (FF FF …) przed znacznikiem
    if (i >= b.length) throw urwany();
    const znacznik = b[i++];
    if (znacznik === 0xd9) {
      czesci.push({ znacznik, dane: null, skan: null });
      return { czesci, koniecObrazu: i };
    }
    // FF 00 i RST0–7 mają sens tylko w danych skanu, drugi SOI (i TEM) — wcale.
    if (znacznik === 0x00 || znacznik === 0x01 || (znacznik >= 0xd0 && znacznik <= 0xd8)) {
      throw new Error(`nieoczekiwany znacznik ${hex(znacznik)} na pozycji ${i - 2}`);
    }
    if (i + 2 > b.length) throw urwany();
    const dlugosc = b.readUInt16BE(i);
    if (dlugosc < 2 || i + dlugosc > b.length) throw new Error(`segment ${hex(znacznik)} wychodzi poza plik — plik urwany albo uszkodzony`);
    const dane = b.subarray(i + 2, i + dlugosc);
    i += dlugosc;
    let skan = null;
    if (znacznik === 0xda) {
      const start = i;
      for (;;) {
        const j = b.indexOf(0xff, i);
        if (j === -1) throw urwany();
        let k = j + 1;
        while (k < b.length && b[k] === 0xff) k++;
        if (k >= b.length) throw urwany();
        if (b[k] === 0x00 || (b[k] >= 0xd0 && b[k] <= 0xd7)) {
          i = k + 1;
          continue;
        }
        skan = b.subarray(start, j); // dane skanu kończą się tuż przed znacznikiem
        i = j;
        break;
      }
    }
    czesci.push({ znacznik, dane, skan });
  }
}

function segment(znacznik, dane) {
  const dlugosc = dane.length + 2;
  if (dlugosc > 0xffff) throw new Error(`segment ${hex(znacznik)} za długi`);
  return Buffer.concat([Buffer.from([0xff, znacznik, dlugosc >> 8, dlugosc & 0xff]), dane]);
}

// Czysty JPEG z białej listy segmentów: SOI, APP0 JFIF bez miniatury, jeden przepisany APP1 Exif,
// APP2 ICC_PROFILE (wszystkie części), APP14 Adobe, części kodowania obrazu i EOI — za nim nic.
function wyczyscJpeg(b) {
  const wynik = [Buffer.from([0xff, 0xd8])];
  let bylSof = false;
  let bylSkan = false;
  let bylExif = false;
  for (const { znacznik, dane, skan } of rozbierzJpeg(b).czesci) {
    if (znacznik === 0xd9) {
      if (!bylSkan) throw new Error('brak danych obrazu (SOS)');
      wynik.push(Buffer.from([0xff, 0xd9]));
    } else if (czySof(znacznik)) {
      if (bylSof) throw new Error('drugi nagłówek obrazu (SOF) — nieobsługiwany rodzaj JPEG-a');
      bylSof = true;
      wynik.push(segment(znacznik, dane));
    } else if (znacznik === 0xda) {
      if (!bylSof) throw new Error('dane obrazu przed nagłówkiem (SOS przed SOF)');
      bylSkan = true;
      wynik.push(segment(znacznik, dane), skan);
    } else if (czyTabela(znacznik)) {
      wynik.push(segment(znacznik, dane));
    } else if (czyAppn(znacznik) || znacznik === 0xfe) {
      // Po pierwszym skanie dekoder APPn już nie czyta — wypadają razem z komentarzami (COM).
      if (bylSkan) continue;
      if (znacznik === 0xe0 && zaczynaSie(dane, 'JFIF\x00')) {
        // Sam nagłówek JFIF (wersja, gęstość pikseli) z miniaturą 0×0 — miniatura potrafi
        // pokazywać kadr sprzed przycięcia. Długość segmentu: 16.
        if (dane.length < 14) throw new Error('uszkodzony nagłówek JFIF');
        const jfif = Buffer.from(dane.subarray(0, 14));
        jfif[12] = 0; // szerokość miniatury
        jfif[13] = 0; // wysokość miniatury
        wynik.push(segment(znacznik, jfif));
      } else if (znacznik === 0xe1 && zaczynaSie(dane, 'Exif\x00\x00')) {
        // Dwa bloki EXIF: Astro bierze obrót z ostatniego, a my zostawilibyśmy pierwszy — obrót
        // miniatur i wymiary "przed" mogłyby się rozjechać. Taki plik nie idzie.
        if (bylExif) throw new Error('plik ma dwa bloki EXIF');
        bylExif = true;
        const { le, ifd0, exif } = polaExifZBialejListy(dane.subarray(6));
        const tiff = zapiszExif(le, ifd0, exif);
        if (tiff) wynik.push(segment(znacznik, Buffer.concat([dane.subarray(0, 6), tiff])));
      } else if (znacznik === 0xe2 && zaczynaSie(dane, 'ICC_PROFILE\x00')) {
        // Profil kolorów, bajt w bajt — bez niego miniatura np. z pliku Display P3 wychodzi w innych kolorach.
        wynik.push(segment(znacznik, dane));
      } else if (znacznik === 0xee && zaczynaSie(dane, 'Adobe')) {
        // 12 bajtów: wersja i sposób zapisu kolorów (wpływa na odczyt części JPEG-ów). Długość segmentu: 14.
        if (dane.length < 12) throw new Error('uszkodzony segment Adobe');
        wynik.push(segment(znacznik, dane.subarray(0, 12)));
      }
      // Reszta (XMP, rozszerzony XMP, MPF, IPTC, C2PA, JFXX, inne APPn) i COM wypada.
    } else {
      throw new Error(`nieznany segment ${hex(znacznik)}`);
    }
  }
  return Buffer.concat(wynik);
}

const bladCzyszczenia = (powod) =>
  new Error(
    `nie udało się wyczyścić pliku (${powod}) — nie wysyłam pliku, w którym mogłyby zostać dane prywatne (GPS, numer seryjny, autor). ` +
      'Wyeksportuj zdjęcie jeszcze raz jako JPG i spróbuj ponownie.'
  );

// Pliku, którego nie da się wyczyścić, NIE wysyłamy (bucket jest publiczny).
/**
 * Czysty JPEG do R2: tylko segmenty i pola EXIF z białej listy, dane obrazu bajt w bajt (bez ponownej
 * kompresji). Rzuca błąd dla pliku innego niż JPG (po nazwie i po treści) i dla pliku, którego nie da
 * się wyczyścić.
 * @param {Buffer} bufor zawartość pliku
 * @param {string} kluczR2 klucz w R2 albo nazwa pliku (po rozszerzeniu poznajemy format)
 * @returns {Buffer}
 */
export function wyczyscExifDoR2(bufor, kluczR2) {
  if (!czyJpg(kluczR2)) throw bladCzyszczenia('to nie JPG — do R2 wysyłamy tylko JPG');
  try {
    return wyczyscJpeg(bufor);
  } catch (err) {
    throw bladCzyszczenia(err.message);
  }
}

// Nazwa segmentu do podglądu: znacznik, a przy APPn także początek danych (np. "APP13 Photoshop 3.0").
function nazwaSegmentu(znacznik, dane) {
  if (znacznik === 0xd9) return 'EOI';
  if (znacznik === 0xfe) return 'COM';
  if (czySof(znacznik)) return `SOF${znacznik - 0xc0}`;
  if (czyAppn(znacznik)) {
    const app = `APP${znacznik - 0xe0}`;
    if (zaczynaSie(dane, 'http://ns.adobe.com/xap/1.0/\x00')) return `${app} XMP`;
    if (zaczynaSie(dane, 'http://ns.adobe.com/xmp/extension/\x00')) return `${app} XMP (rozszerzony)`;
    const nazwa = dane.toString('latin1', 0, Math.min(dane.length, 16)).split('\x00')[0].replace(/[^\x20-\x7e]/g, '?');
    return nazwa ? `${app} ${nazwa}` : app;
  }
  return { 0xc4: 'DHT', 0xcc: 'DAC', 0xda: 'SOS', 0xdb: 'DQT', 0xdc: 'DNL', 0xdd: 'DRI' }[znacznik] ?? hex(znacznik);
}

/**
 * Segmenty pliku JPEG po kolei, np. ["SOI", "APP1 Exif", "APP2 ICC_PROFILE", "DQT", …, "EOI",
 * "(po EOI: 907 B)"] — do testów i do scripts/sprawdz-czyszczenie.mjs. Rzuca błąd dla pliku,
 * którego nie da się przejść po znacznikach.
 * @param {Buffer} bufor zawartość pliku
 * @returns {string[]}
 */
export function segmentyJpeg(bufor) {
  const { czesci, koniecObrazu } = rozbierzJpeg(bufor);
  const lista = ['SOI', ...czesci.map(({ znacznik, dane }) => nazwaSegmentu(znacznik, dane))];
  if (koniecObrazu < bufor.length) lista.push(`(po EOI: ${bufor.length - koniecObrazu} B)`);
  return lista;
}

// --- Porównanie po czyszczeniu i pliki do wysłania ---

/**
 * @typedef {{ piksele: Buffer, szerokosc: number, wysokosc: number, orientacja: number | undefined }} Obraz
 * @typedef {(bufor: Buffer) => Promise<Obraz>} Dekoder
 */

/**
 * Funkcja dekodująca do pikseleIObrotBezZmian(): piksele (raw) z wymiarami i orientacja z EXIF-u.
 * sharp przychodzi w parametrze, żeby ten moduł niczego nie ładował sam.
 * @param {typeof import('sharp').default} sharp
 * @returns {Dekoder}
 */
export function dekoderPikseli(sharp) {
  return async (bufor) => {
    const [{ data, info }, meta] = await Promise.all([
      sharp(bufor).raw().toBuffer({ resolveWithObject: true }),
      sharp(bufor).metadata(),
    ]);
    return { piksele: data, szerokosc: info.width, wysokosc: info.height, orientacja: meta.orientation };
  };
}

// Testy sprawdzają sztuczne pliki — to porównanie sprawdza każdy prawdziwy plik przy wgrywaniu.
/**
 * Czy po czyszczeniu piksele, wymiary i obrót są takie jak w oryginale. Oryginał, którego nie da się
 * odczytać, kończy się błędem czyszczenia; czysty plik, którego nie da się odczytać, to "nie".
 * @param {Buffer} oryginal
 * @param {Buffer} czysty wynik wyczyscExifDoR2()
 * @param {Dekoder} dekoduj np. dekoderPikseli(sharp)
 * @returns {Promise<boolean>}
 */
export async function pikseleIObrotBezZmian(oryginal, czysty, dekoduj) {
  let przed;
  try {
    przed = await dekoduj(oryginal);
  } catch (err) {
    throw bladCzyszczenia(`nie da się odczytać obrazu: ${err.message}`);
  }
  let po;
  try {
    po = await dekoduj(czysty);
  } catch {
    return false;
  }
  return (
    przed.szerokosc === po.szerokosc &&
    przed.wysokosc === po.wysokosc &&
    przed.orientacja === po.orientacja &&
    przed.piksele.equals(po.piksele)
  );
}

const BLAD_POROWNANIA =
  'nie udało się wyczyścić pliku (po czyszczeniu zmieniły się piksele albo obrót — to błąd skryptu, nie zdjęcia) — nie wysyłam pliku. ' +
  'Zachowaj ten plik i wklej komunikat do czatu z Claude.';

// Jedyne miejsce, które składa pliki do R2 — test pilnuje, że skrypt nie wysyła nic obok niego.
/**
 * Pliki do wysłania do R2 dla jednego zdjęcia: czysty oryginał pod "zdjecia/…" (z niego build robi
 * miniatury) i wersja ze znakiem wodnym pod "znak/…", zrobiona z czystego pliku. Kolejność: klucz,
 * czyszczenie, porównanie z oryginałem, znak wodny — każdy błąd przerywa, zanim cokolwiek trafi do R2.
 * @param {Buffer} oryginal zawartość pliku z images/
 * @param {string} kluczR2 klucz oryginału, np. "zdjecia/DSC_1.jpg"
 * @param {{ nalozZnak: (bufor: Buffer) => Promise<Buffer>, dekoduj: Dekoder }} zaleznosci nalozZnak —
 *   znak wodny (scripts/sync-images.mjs); dekoduj — dekoderPikseli(sharp)
 * @returns {Promise<{ klucz: string, bufor: Buffer, typ: string }[]>}
 */
export async function plikiDoWgrania(oryginal, kluczR2, { nalozZnak, dekoduj }) {
  const kluczZeZnakiem = kluczZnak(kluczR2);
  const czysty = wyczyscExifDoR2(oryginal, kluczR2);
  if (!(await pikseleIObrotBezZmian(oryginal, czysty, dekoduj))) throw new Error(BLAD_POROWNANIA);
  return [
    { klucz: kluczR2, bufor: czysty, typ: 'image/jpeg' },
    { klucz: kluczZeZnakiem, bufor: await nalozZnak(czysty), typ: 'image/jpeg' },
  ];
}

// --- Sprawdzanie własnych plików przed podmianą (scripts/sprawdz-czyszczenie.mjs) ---

/**
 * Wynik sprawdzenia jednego pliku: co czyszczenie zostawi, czy exifr znajdzie GPS i czy piksele,
 * wymiary i obrót zostaną te same. Niczego nie wysyła i niczego nie zapisuje.
 * @param {Buffer} oryginal zawartość pliku
 * @param {string} nazwaPliku nazwa pliku (po rozszerzeniu poznajemy format)
 * @param {{ dekoduj: Dekoder, exifr: Pick<typeof import('exifr').default, 'gps' | 'parse'> }} zaleznosci
 * @returns {Promise<{ linie: string[], problem: boolean }>} problem — tego zdjęcia nie podmieniać
 */
export async function sprawdzCzyszczenie(oryginal, nazwaPliku, { dekoduj, exifr }) {
  try {
    const czysty = wyczyscExifDoR2(oryginal, nazwaPliku);
    const gpsPrzed = await exifr.gps(oryginal);
    const gpsPo = await exifr.gps(czysty);
    const zostaje = await exifr.parse(czysty, { ifd1: true, interop: true, xmp: true, iptc: true, mergeOutput: false });
    const bezZmian = await pikseleIObrotBezZmian(oryginal, czysty, dekoduj);
    const gps = (dane) => (dane ? JSON.stringify(dane) : 'brak');
    return {
      problem: !bezZmian || Boolean(gpsPo),
      linie: [
        `Segmenty przed: ${segmentyJpeg(oryginal).join(', ')}`,
        `Segmenty po:    ${segmentyJpeg(czysty).join(', ')}`,
        `GPS przed: ${gps(gpsPrzed)} | po: ${gps(gpsPo)}`,
        `Zostaje: ${JSON.stringify(zostaje ?? {})}`,
        `Piksele i obrót bez zmian: ${bezZmian ? 'tak' : 'NIE'}`,
      ],
    };
  } catch (err) {
    return { problem: true, linie: [`Błąd: ${err.message}`] };
  }
}

/**
 * Ostatnia linia scripts/sprawdz-czyszczenie.mjs i kod wyjścia (1 = są problemy albo nie było czego sprawdzić).
 * @param {number} liczbaPlikow ile plików sprawdzono
 * @param {number} liczbaProblemow ile z nich ma problem
 * @returns {{ tekst: string, kodWyjscia: number }}
 */
export function podsumowanieSprawdzenia(liczbaPlikow, liczbaProblemow) {
  if (liczbaPlikow === 0) {
    return { tekst: '❌ Nie ma plików JPG do sprawdzenia (w images/ albo podanych w poleceniu).', kodWyjscia: 1 };
  }
  if (liczbaProblemow === 0) return { tekst: `✅ Wszystkie pliki czyste (${liczbaPlikow})`, kodWyjscia: 0 };
  return { tekst: `❌ Problemy: ${liczbaProblemow} — tych zdjęć nie podmieniaj, wklej wynik do czatu z Claude`, kodWyjscia: 1 };
}

// --- galeria.json ↔ baza SQLite ---

// Tabela jako stała, bo tworzymy ją w dwóch miejscach: przy otwarciu bazy
// i przy odtwarzaniu bazy z galeria.json.
/**
 * Polecenie SQL tworzące tabelę zdjęć.
 * @type {string}
 */
export const TABELA_ZDJEC = `
    CREATE TABLE IF NOT EXISTS zdjecia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nazwa_pliku TEXT UNIQUE NOT NULL,
      nazwa_pliku_przed TEXT,
      opis TEXT DEFAULT '',
      kategorie TEXT DEFAULT '[]',
      szerokosc INTEGER,
      wysokosc INTEGER,
      iso INTEGER,
      przyslona REAL,
      ogniskowa REAL,
      czas_naswietlania REAL,
      data_wykonania TEXT,
      make TEXT,
      model TEXT,
      lens_model TEXT,
      r2_klucz TEXT,
      r2_klucz_przed TEXT,
      wyroznione INTEGER DEFAULT 0,
      para_suwaka INTEGER DEFAULT 0
    );
`;

/**
 * Lista kategorii z tekstu JSON w bazie; zły format daje pustą listę.
 * @param {string | null | undefined} tekst
 * @returns {string[]}
 */
export function parsujKategorie(tekst) {
  try {
    const wynik = JSON.parse(tekst ?? '[]');
    return Array.isArray(wynik) ? wynik : [];
  } catch {
    return [];
  }
}

// Znak BOM na początku pliku (dopisują go niektóre edytory, np. stary Notatnik) nie jest
// częścią JSON-a — bez jego usunięcia JSON.parse zgłasza błąd, choć plik jest w porządku.
/**
 * Tekst bez znaku BOM na początku.
 * @param {string} tekst
 * @returns {string}
 */
export function bezBom(tekst) {
  return tekst.charCodeAt(0) === 0xfeff ? tekst.slice(1) : tekst;
}

/**
 * Lista zdjęć z treści galeria.json. Rzuca błąd przy uszkodzonym JSON-ie albo złym formacie.
 * @param {string} tekst treść pliku
 * @param {string} sciezka ścieżka pliku (do komunikatu błędu)
 * @returns {any[]}
 */
export function wczytajListe(tekst, sciezka) {
  let lista;
  try {
    lista = JSON.parse(bezBom(tekst));
  } catch (err) {
    // Uszkodzony plik (np. nierozwiązany konflikt gita) — przerywamy, żeby go nie nadpisać.
    throw new Error(
      `Plik ${sciezka} nie jest poprawnym JSON-em (${err.message}). ` +
      'Możliwy nierozwiązany konflikt gita. Nic nie zmieniono — napraw plik albo przywróć jego poprzednią wersję z gita.'
    );
  }
  // "kategorie" jako zwykły tekst (np. po ręcznej poprawce) po cichu przepadłyby przy zapisie —
  // dlatego taki plik też zatrzymuje skrypt.
  const zlyWpis = (z) =>
    !z || typeof z.nazwaPliku !== 'string' || !z.nazwaPliku || (z.kategorie != null && !Array.isArray(z.kategorie));
  if (!Array.isArray(lista) || lista.some(zlyWpis)) {
    throw new Error(
      `Plik ${sciezka} ma nieoczekiwany format (oczekiwana lista zdjęć z polem nazwaPliku, a "kategorie" jako lista). Nic nie zmieniono.`
    );
  }
  return lista;
}

/**
 * Buduje tabelę zdjęć od zera z listy (w jednej transakcji). Przy błędzie baza zostaje
 * taka jak przed wywołaniem, a funkcja rzuca błąd „Nie udało się odtworzyć bazy z …”.
 * @param {import('node:sqlite').DatabaseSync} db otwarta baza
 * @param {any[]} lista zdjęcia w formacie galeria.json
 * @param {string} sciezka ścieżka galeria.json (do komunikatu błędu)
 * @returns {void}
 */
export function zapiszListeWBazie(db, lista, sciezka) {
  // Tabelę tworzymy od zera, więc stara baza z innego komputera (np. bez nowszych kolumn)
  // też zadziała. Wszystko w jednej transakcji: błąd w połowie nie zostawi połowy bazy.
  db.exec('BEGIN');
  try {
    db.exec('DROP TABLE IF EXISTS zdjecia');
    db.exec(TABELA_ZDJEC);

    const wstaw = db.prepare(`
      INSERT INTO zdjecia
        (nazwa_pliku, nazwa_pliku_przed, opis, kategorie, szerokosc, wysokosc,
         iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, make, model, lens_model, r2_klucz, r2_klucz_przed,
         wyroznione, para_suwaka)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const z of lista) {
      try {
        wstaw.run(
          z.nazwaPliku,
          z.kluczPrzed ? z.kluczPrzed.replace(/^zdjecia\//, '') : null, // nazwa "przed" = klucz bez folderu (pasuje do każdego sposobu nazywania)
          z.opis ?? '',
          JSON.stringify(z.kategorie ?? []),
          z.szerokosc ?? null,
          z.wysokosc ?? null,
          z.exif?.iso ?? null,
          z.exif?.przyslona ?? null,
          z.exif?.ogniskowa ?? null,
          z.exif?.czasNaswietlania ?? null,
          z.exif?.dataWykonania ?? null,
          z.exif?.make ?? null,
          z.exif?.model ?? null,
          z.exif?.lensModel ?? null,
          z.klucz ?? null,
          z.kluczPrzed ?? null,
          z.wyroznione ? 1 : 0,
          z.paraSuwaka ? 1 : 0
        );
      } catch (err) {
        throw new Error(`zdjęcie "${z.nazwaPliku}": ${err.message}`);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    // Przy niektórych błędach (np. pełny dysk) SQLite sam wycofuje transakcję — wtedy
    // ROLLBACK rzuciłby własny błąd i zasłonił ten prawdziwy.
    try {
      db.exec('ROLLBACK');
    } catch {
      // transakcja już wycofana
    }
    throw new Error(`Nie udało się odtworzyć bazy z ${sciezka} (${err.message}). Plik nie został zmieniony.`);
  }
}

/**
 * Zdjęcia z bazy w formacie galeria.json, posortowane po nazwie pliku.
 * @param {import('node:sqlite').DatabaseSync} db otwarta baza
 * @returns {any[]}
 */
export function listaZBazy(db) {
  const wiersze = db.prepare('SELECT * FROM zdjecia ORDER BY nazwa_pliku').all();

  return wiersze.map((w) => ({
    nazwaPliku: w.nazwa_pliku,
    opis: w.opis ?? '',
    kategorie: parsujKategorie(w.kategorie),
    szerokosc: w.szerokosc ?? null,
    wysokosc: w.wysokosc ?? null,
    klucz: w.r2_klucz,
    kluczPrzed: w.r2_klucz_przed ?? null,
    wyroznione: Boolean(w.wyroznione),
    paraSuwaka: Boolean(w.para_suwaka),
    exif: {
      iso: w.iso ?? null,
      przyslona: w.przyslona ?? null,
      ogniskowa: w.ogniskowa ?? null,
      czasNaswietlania: w.czas_naswietlania ?? null,
      dataWykonania: w.data_wykonania ?? null,
      make: w.make ?? null,
      model: w.model ?? null,
      lensModel: w.lens_model ?? null,
    },
  }));
}

/**
 * Treść pliku galeria.json dla listy zdjęć (wcięcie 2 spacje, nowa linia na końcu).
 * @param {any[]} lista
 * @returns {string}
 */
export function tekstGalerii(lista) {
  return JSON.stringify(lista, null, 2) + '\n';
}
