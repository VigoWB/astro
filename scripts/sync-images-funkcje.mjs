/**
 * sync-images-funkcje.mjs
 *
 * Czyste funkcje skryptu sync-images: nazwy par przed/po, klucze R2, opcje wiersza poleceń,
 * numery w --wyroznij, czyszczenie EXIF-u i zamiana galeria.json ↔ baza SQLite.
 * Importują go scripts/sync-images.mjs i testy Vitesta (tests/jednostkowe/sync-images.test.ts,
 * tests/integracyjne/sync-images.test.ts, tests/integracyjne/galeria.test.ts).
 *
 * UWAGA: ten plik nie może nic robić przy imporcie — żadnych pytań w terminalu, kończenia
 * procesu, czytania ani zapisu plików, console.* ani odczytu process.env na poziomie modułu.
 * Inaczej testy zaczęłyby pytać w terminalu albo ruszać prawdziwe pliki. Wszystko, co dotyka
 * terminala, R2, plików na dysku i kończy proces, zostaje w scripts/sync-images.mjs
 * (test w tests/jednostkowe/sync-images.test.ts sprawdza, że nazw tych funkcji Node tu nie ma).
 * Bazę funkcje dostają w parametrze (bez importu node:sqlite).
 */

import piexif from 'piexifjs';

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

/**
 * Zdjęcia z listy plików w images/ i kandydaci do dodania jako "po".
 * @param {string[]} pliki wszystkie nazwy plików z images/
 * @returns {{ zdjecia: string[], kandydaci: string[] }} zdjecia — JPG/PNG bez plików ukrytych;
 *   kandydaci — zdjęcia z numerem DSC, bez "przed_", posortowane
 */
export function wybierzZdjecia(pliki) {
  // Pliki ukryte (np. "._DSC_1234.jpg", które macOS zostawia na pendrive'ach) to nie zdjęcia.
  const zdjecia = pliki.filter((f) => !f.startsWith('.') && /\.(jpe?g|png)$/i.test(f));
  const kandydaci = zdjecia.filter((f) => /DSC_?\d/i.test(f) && !/przed_/i.test(f)).sort();
  return { zdjecia, kandydaci };
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

// Usuwa z EXIF-u lokalizację GPS i numer seryjny (aparatu + obiektywu) przed
// wysyłką "czystego" oryginału do R2 — ten bucket jest publiczny. Reszta EXIF-u
// (data wykonania, model aparatu, obiektyw) zostaje — nic poufnego, a w pliku też
// się przyda. Działa tylko na nagłówku pliku, bez przekodowywania pikseli — zero
// utraty jakości. Wersji ze znakiem wodnym (nalozZnak niżej) to nie dotyczy — ona
// i tak wychodzi z sharp bez EXIF-u.
// Pliku, którego nie da się wyczyścić, NIE wysyłamy (bucket jest publiczny).
// PNG pomijamy bez błędu — piexifjs obsługuje tylko JPEG, a aparaty i tak nie
// produkują PNG (ten format dopuszczamy w kandydatach tylko teoretycznie).
/**
 * JPEG bez GPS-u, numerów seryjnych i MakerNote, bez ponownej kompresji. PNG bez zmian.
 * Rzuca błąd, gdy pliku nie da się wyczyścić.
 * @param {Buffer} bufor zawartość pliku
 * @param {string} kluczR2 klucz w R2 (po rozszerzeniu poznajemy format)
 * @returns {Buffer}
 */
export function wyczyscExifDoR2(bufor, kluczR2) {
  if (!/\.jpe?g$/i.test(kluczR2)) return bufor;

  try {
    const binarny = bufor.toString('binary');
    const exif = piexif.load(binarny);

    exif.GPS = {};
    if (exif.Exif) {
      delete exif.Exif[piexif.ExifIFD.BodySerialNumber];
      delete exif.Exif[piexif.ExifIFD.LensSerialNumber];
      delete exif.Exif[piexif.ExifIFD.MakerNote]; // u części producentów numer seryjny jest schowany tu, nie w polu wyżej
    }

    const nowyExifBytes = piexif.dump(exif);
    return Buffer.from(piexif.insert(nowyExifBytes, binarny), 'binary');
  } catch (err) {
    throw new Error(
      `nie udało się wyczyścić EXIF-u (${err.message}) — nie wysyłam pliku, w którym mógłby zostać GPS albo numer seryjny. ` +
      'Wyeksportuj zdjęcie jeszcze raz i spróbuj ponownie.'
    );
  }
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
