#!/usr/bin/env node
/**
 * sync-images.mjs
 *
 * Skanuje folder images/ w poszukiwaniu nowych zdjęć (nazwa z numerem "DSC", np. DSC_1234.jpg
 * albo wrzesien_26_EDYCJA_DSC7062.jpg, bez "przed_" — parę "przed" znajduje po nazwie,
 * patrz nazwaWersjiPrzed()),
 * odczytuje wymiary z samego pliku i dane z aparatu (EXIF), pyta o opis i kategorie,
 * wgrywa pliki (po + opcjonalnie przed) do Cloudflare R2 — każdy w dwóch wersjach:
 * czystej (klucz "zdjecia/...", z niej strona robi miniatury) i ze znakiem wodnym
 * (klucz "znak/...", z niej strona robi powiększenia do lightboksa — na razie sam
 * tekst "foto.vigolab.ovh" w rogu, funkcja nalozZnak() niżej)
 * i zapisuje metadane w lokalnej bazie SQLite (data/galeria.db).
 *
 * Po każdej zmianie zapisuje plik src/data/galeria.json — to właśnie z niego
 * korzysta strona podczas budowania.
 *
 * Źródłem prawdy jest galeria.json (leży w gicie). Baza SQLite to tylko robocza
 * kopia: przy KAŻDYM uruchomieniu jest budowana od nowa z galeria.json, więc stara
 * baza z innego komputera nie może nadpisać nowszych zdjęć ani opisów.
 * Przed uruchomieniem zawsze zrób git pull.
 *
 * Uruchomienie (opcje zawsze po "--"):
 *   npm run sync-images                       — dodaje nowe zdjęcia
 *   npm run sync-images -- --uzupelnij        — pyta o opis/kategorie tam, gdzie są puste
 *   npm run sync-images -- --wyroznij         — wybór zdjęć na stronę główną:
 *                                                sekcja "Wybrane prace" i para do suwaka przed/po
 *   npm run sync-images -- --podmien <plik>   — podmienia "po" i/lub "przed" dla zdjęcia JUŻ w bazie
 *                                                (np. dorzucenie "przed" do zdjęcia dodanego bez niego)
 *   npm run sync-images -- --usun <plik>      — TRWALE usuwa zdjęcie z R2, z bazy i z galeria.json
 *
 * Ctrl+C przy pytaniu kończy od razu. W trakcie wgrywania skrypt najpierw dokańcza
 * bieżące zdjęcie (żeby nie zostało w połowie), a drugie Ctrl+C przerywa natychmiast.
 */

import { DatabaseSync } from 'node:sqlite';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import piexif from 'piexifjs';
import { readFile, readdir, mkdir, open, rename, rm } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import readline from 'node:readline';

const IMAGES_DIR = 'images';
const DB_PATH = 'data/galeria.db';
const JSON_PATH = 'src/data/galeria.json';

// Błąd, który nie dotyczy jednego pliku, tylko wszystkich: R2 nie przyjmuje plików
// (złe klucze, brak internetu) albo nie da się zapisać galeria.json. Po nim tryb
// dodawania kończy pracę, zamiast pytać o opisy kolejnych zdjęć, które i tak by przepadły.
class BladGlobalny extends Error {}

// Przerwanie przez użytkownika (Ctrl+C albo koniec wejścia) — to nie błąd.
class Przerwano extends Error {}

// Czy w tym uruchomieniu galeria.json naprawdę się zmienił (do komunikatu na końcu).
let zmienionoJson = false;

// --- Klient S3 (Cloudflare R2 jest S3-kompatybilne) ---
// Tworzony dopiero przy pierwszym wgrywaniu — dzięki temu samo odświeżenie
// pliku JSON albo uzupełnianie opisów nie wymaga kluczy R2.
let s3 = null;

function pobierzKlienta() {
  if (s3) return s3;

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error('❌ Brak wymaganych zmiennych środowiskowych R2_*.');
    console.error('   Skopiuj .env.example do .env i wypełnij: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.');
    process.exit(1);
  }

  s3 = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  return s3;
}

// Adres R2 do wgrania pliku pod danym kluczem (ten sam endpoint S3-kompatybilny).
// Każdy segment ścieżki kodujemy osobno, żeby ukośnik w kluczu (np. "zdjecia/plik.jpg")
// został separatorem, a nie zamienił się w %2F.
function adresR2(kluczR2) {
  const { R2_ACCOUNT_ID, R2_BUCKET_NAME } = process.env;
  const kluczZakodowany = kluczR2.split('/').map(encodeURIComponent).join('/');
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${kluczZakodowany}`;
}

// Wersja ze znakiem wodnym leży pod tym samym kluczem, tylko w folderze "znak/"
// zamiast "zdjecia/". Miniatury (Karta.astro) biorą oryginał z "zdjecia/",
// lightbox i duże porównanie "przed/po" na stronie głównej (src/lib/galeria.ts)
// wersję z "znak/" — tam musi być ta sama funkcja.
// Klucz spoza "zdjecia/" zostałby bez zmian i wersja ze znakiem nadpisałaby czysty
// oryginał — dlatego taki klucz przerywa pracę.
function kluczZnak(kluczR2) {
  if (!kluczR2.startsWith('zdjecia/')) {
    throw new Error(
      `nieoczekiwany klucz R2 "${kluczR2}" (powinien zaczynać się od "zdjecia/") — przerywam, żeby wersja ze znakiem nie nadpisała oryginału.`
    );
  }
  return kluczR2.replace(/^zdjecia\//, 'znak/');
}

// Nazwa pliku "przed" dla danego pliku "po": "przed_" wchodzi tuż przed numerem "DSC",
// więc DSC_1234.jpg → przed_DSC_1234.jpg, DSC_4968-Edytuj.jpg → przed_DSC_4968-Edytuj.jpg,
// a wrzesien_26_EDYCJA_DSC7062.jpg → wrzesien_26_EDYCJA_przed_DSC7062.jpg.
// Nazwa bez numeru "DSC" dostaje "przed_" na początku (jak dawniej).
function nazwaWersjiPrzed(nazwaPliku) {
  const zPrzed = nazwaPliku.replace(/(DSC_?\d)/i, 'przed_$1');
  return zPrzed === nazwaPliku ? `przed_${nazwaPliku}` : zPrzed;
}

// --- Baza SQLite (wbudowana w Node; bez dodatkowej flagi działa od wersji 22.13) ---
// Tabela jako stała, bo tworzymy ją w dwóch miejscach: przy otwarciu bazy
// i przy odtwarzaniu bazy z galeria.json.
const TABELA_ZDJEC = `
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

function initDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(TABELA_ZDJEC);
  return db;
}

function pobierzWgrane(db) {
  const rows = db.prepare('SELECT nazwa_pliku FROM zdjecia').all();
  return new Set(rows.map((r) => r.nazwa_pliku));
}

function parsujKategorie(tekst) {
  try {
    const wynik = JSON.parse(tekst ?? '[]');
    return Array.isArray(wynik) ? wynik : [];
  } catch {
    return [];
  }
}

// --- Kategorie ---

// Zwraca listę wszystkich kategorii, jakie kiedykolwiek wpisano przy jakimkolwiek
// zdjęciu w bazie — bez duplikatów, posortowaną alfabetycznie. Lista rośnie sama,
// w miarę wpisywania nowych nazw — nic nie trzeba poprawiać w kodzie.
function pobierzUzywaneKategorie(db) {
  const wiersze = db.prepare('SELECT kategorie FROM zdjecia').all();
  const zbior = new Set();
  for (const w of wiersze) {
    for (const kategoria of parsujKategorie(w.kategorie)) {
      zbior.add(kategoria);
    }
  }
  return Array.from(zbior).sort((a, b) => a.localeCompare(b, 'pl'));
}

// --- Odtworzenie bazy z pliku JSON ---

// Znak BOM na początku pliku (dopisują go niektóre edytory, np. stary Notatnik) nie jest
// częścią JSON-a — bez jego usunięcia JSON.parse zgłasza błąd, choć plik jest w porządku.
function bezBom(tekst) {
  return tekst.charCodeAt(0) === 0xfeff ? tekst.slice(1) : tekst;
}

// Źródłem prawdy jest src/data/galeria.json — leży w gicie, więc po git pull jest taki
// sam na każdym komputerze. Baza SQLite to tylko robocza kopia, dlatego przy KAŻDYM
// uruchomieniu budujemy ją od nowa z pliku JSON. Stara baza z innego komputera nie może
// wtedy nadpisać nowszych zdjęć ani opisów, a zdjęcia usunięte z JSON-a nie wracają.
// Obieg JSON → baza → JSON daje identyczny plik, więc nic nie ginie.
async function odtworzZJson(db) {
  if (!existsSync(JSON_PATH)) return; // pierwsze uruchomienie — nie ma jeszcze z czego odtwarzać

  let lista;
  try {
    lista = JSON.parse(bezBom(await readFile(JSON_PATH, 'utf8')));
  } catch (err) {
    // Uszkodzony plik (np. nierozwiązany konflikt gita) — przerywamy, żeby go nie nadpisać.
    throw new Error(
      `Plik ${JSON_PATH} nie jest poprawnym JSON-em (${err.message}). ` +
      'Możliwy nierozwiązany konflikt gita. Nic nie zmieniono — napraw plik albo przywróć jego poprzednią wersję z gita.'
    );
  }
  // "kategorie" jako zwykły tekst (np. po ręcznej poprawce) po cichu przepadłyby przy zapisie —
  // dlatego taki plik też zatrzymuje skrypt.
  const zlyWpis = (z) =>
    !z || typeof z.nazwaPliku !== 'string' || !z.nazwaPliku || (z.kategorie != null && !Array.isArray(z.kategorie));
  if (!Array.isArray(lista) || lista.some(zlyWpis)) {
    throw new Error(
      `Plik ${JSON_PATH} ma nieoczekiwany format (oczekiwana lista zdjęć z polem nazwaPliku, a "kategorie" jako lista). Nic nie zmieniono.`
    );
  }

  const ileBylo = db.prepare('SELECT COUNT(*) AS n FROM zdjecia').get().n;

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
          z.kluczPrzed ? nazwaWersjiPrzed(z.nazwaPliku) : null,
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
    throw new Error(`Nie udało się odtworzyć bazy z ${JSON_PATH} (${err.message}). Plik nie został zmieniony.`);
  }

  console.log(`♻️  Baza odtworzona z ${JSON_PATH} (zdjęć: ${lista.length}, w starej bazie było: ${ileBylo}).`);
  console.log('   Jeśli pracujesz na innym komputerze niż zwykle, upewnij się, że zrobiłeś git pull.\n');
}

// --- Wymiary zdjęcia: czytane z samego pliku (sharp), a nie z EXIF ---
// EXIF po eksporcie z Lightroom/Photoshopa bywa pusty albo nieaktualny po kadrowaniu.
async function pobierzWymiary(sciezka) {
  const meta = await sharp(sciezka).metadata();
  let { width, height } = meta;

  if (!width || !height) {
    throw new Error('nie udało się odczytać wymiarów pliku');
  }

  // Orientacja EXIF 5–8 oznacza zdjęcie obrócone o 90° — po wyświetleniu
  // w przeglądarce szerokość i wysokość zamieniają się miejscami.
  if (meta.orientation && meta.orientation >= 5) {
    [width, height] = [height, width];
  }

  return { szerokosc: width, wysokosc: height };
}

// --- Dane z aparatu (ISO, przysłona itd.) ---

// Do bazy i galeria.json może trafić tylko zwykła liczba albo tekst. Część aparatów
// zapisuje w jednym polu kilka wartości (np. ISO jako [100, 0]) — wtedy bierzemy pierwszą.
// Inaczej do galeria.json trafiłby obiekt, strona pokazałaby "ISO [object Object]",
// a następne uruchomienie skryptu przerwałoby się przy odtwarzaniu bazy.
function liczbaLubNull(wartosc) {
  const pierwsza = Array.isArray(wartosc) || ArrayBuffer.isView(wartosc) ? wartosc[0] : wartosc;
  return typeof pierwsza === 'number' && Number.isFinite(pierwsza) && pierwsza > 0 ? pierwsza : null;
}

function tekstLubNull(wartosc) {
  return typeof wartosc === 'string' && wartosc.trim() ? wartosc.trim() : null;
}

async function pobierzExif(sciezka) {
  const exifr = (await import('exifr')).default;
  let exif = {};
  try {
    // Node 26 psuje czytanie po ścieżce w exifr 7.1.3 — podajemy gotowy bufor zamiast ścieżki.
    exif = (await exifr.parse(await readFile(sciezka), { pick: ['ISO', 'FNumber', 'FocalLength', 'ExposureTime', 'CreateDate', 'Make', 'Model', 'LensModel'] })) ?? {};
  } catch {
    console.warn('⚠️  Nie udało się odczytać EXIF dla:', sciezka);
  }

  // Aparat bez ustawionego zegara zapisuje datę "0000:00:00 00:00:00", z której exifr
  // robi rok 1899 — taką (i każdą inną spoza rozsądnego zakresu) datę pomijamy.
  const data = exif.CreateDate ? new Date(exif.CreateDate) : null;
  const rok = data?.getFullYear();
  const dataWykonania = rok >= 1990 && rok <= new Date().getFullYear() + 1 ? data.toISOString() : null;

  return {
    iso: liczbaLubNull(exif.ISO),
    przyslona: liczbaLubNull(exif.FNumber),
    ogniskowa: liczbaLubNull(exif.FocalLength),
    czas_naswietlania: liczbaLubNull(exif.ExposureTime),
    data_wykonania: dataWykonania,
    make: tekstLubNull(exif.Make),
    model: tekstLubNull(exif.Model),
    lens_model: tekstLubNull(exif.LensModel),
  };
}

// EXIF bierzemy przede wszystkim z "przed" (bliżej pliku z aparatu — "po" po eksporcie
// z Photoshopa bywa bez EXIF-u), a pola, których tam brak, uzupełniamy z "po".
// Dzięki temu "przed" bez EXIF-u nie kasuje danych, które ma "po" — i odwrotnie.
async function pobierzExifZPary(sciezkaPrzed, sciezkaPo) {
  const wynik = {};
  for (const sciezka of [sciezkaPrzed, sciezkaPo]) {
    if (!sciezka) continue;
    for (const [pole, wartosc] of Object.entries(await pobierzExif(sciezka))) {
      wynik[pole] ??= wartosc;
    }
  }
  return wynik;
}

// Przy każdym uruchomieniu sprawdzamy wymiary zdjęć, które mamy lokalnie w images/.
// Puste wymiary uzupełniamy z pliku. Ale gdy plik ma INNE wymiary niż zapisane, niczego
// nie zmieniamy: w R2 wciąż leży stara wersja, a wymiary w galeria.json muszą opisywać
// właśnie ją (inaczej strona przytnie zdjęcie). Zmienia je tylko --podmien, które przy
// okazji wgrywa nowy plik.
async function sprawdzWymiary(db, pominPlik = null) {
  const wiersze = db.prepare('SELECT id, nazwa_pliku, szerokosc, wysokosc FROM zdjecia').all();
  const uzupelnij = db.prepare('UPDATE zdjecia SET szerokosc = ?, wysokosc = ? WHERE id = ?');
  let uzupelnione = 0;

  for (const w of wiersze) {
    const sciezka = `${IMAGES_DIR}/${w.nazwa_pliku}`;
    const maWymiary = Boolean(w.szerokosc && w.wysokosc);

    if (!existsSync(sciezka)) {
      if (!maWymiary) {
        console.warn(`⚠️  Brak wymiarów dla ${w.nazwa_pliku}, a pliku nie ma lokalnie w ${IMAGES_DIR}/ — strona pominie to zdjęcie.`);
      }
      continue;
    }

    let wymiary;
    try {
      wymiary = await pobierzWymiary(sciezka);
    } catch (err) {
      console.warn(`⚠️  Nie udało się odczytać wymiarów ${w.nazwa_pliku}: ${err.message}`);
      continue;
    }

    if (!maWymiary) {
      uzupelnij.run(wymiary.szerokosc, wymiary.wysokosc, w.id);
      uzupelnione++;
    } else if ((wymiary.szerokosc !== w.szerokosc || wymiary.wysokosc !== w.wysokosc) && w.nazwa_pliku !== pominPlik) {
      console.warn(
        `⚠️  ${w.nazwa_pliku}: plik w ${IMAGES_DIR}/ ma ${wymiary.szerokosc}×${wymiary.wysokosc}, a zdjęcie w galerii ${w.szerokosc}×${w.wysokosc}.\n` +
        `   Nowa wersja tego zdjęcia? Wgraj ją: npm run sync-images -- --podmien ${w.nazwa_pliku}\n` +
        '   Inne zdjęcie z tym samym numerem (aparat po DSC_9999 liczy od nowa)? Zmień nazwę pliku i uruchom skrypt jeszcze raz.\n'
      );
    }
  }

  if (uzupelnione > 0) {
    console.log(`📐 Uzupełniono brakujące wymiary (zdjęć: ${uzupelnione}).\n`);
  }
}

// --- Terminal: pytania ---
// Uwaga: używamy JEDNEGO wspólnego interfejsu readline na cały czas działania
// skryptu (tworzenie nowego interfejsu przy każdym pytaniu psuje odczyt danych
// z potoku/stdin po pierwszym zamknięciu).
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let przerwano = false;
let odrzucPytanie = null; // ustawione, gdy skrypt czeka na odpowiedź

function przerwijPytanie() {
  if (odrzucPytanie) {
    odrzucPytanie(new Przerwano());
    odrzucPytanie = null;
  }
}

// Ctrl+C. Przy pytaniu nic się w tle nie dzieje, więc kończymy od razu. W trakcie
// wgrywania albo usuwania dokańczamy bieżące zdjęcie (żeby nie zostało w połowie:
// część plików w R2, a w galeria.json nic) i dopiero wtedy kończymy.
rl.on('SIGINT', () => {
  if (przerwano && !odrzucPytanie) {
    console.log('\n⏹️  Przerwano natychmiast. Jeśli to było w trakcie usuwania albo podmiany, uruchom to samo polecenie jeszcze raz.');
    process.exit(130);
  }
  przerwano = true;
  process.exitCode = 130;
  if (odrzucPytanie) {
    console.log('\n⏹️  Przerwano (Ctrl+C).');
    przerwijPytanie();
  } else {
    console.log('\n⏹️  Ctrl+C — kończę bieżące zdjęcie, żeby nie zostało w połowie, i przerywam. Jeszcze raz Ctrl+C = natychmiast.');
  }
});

// Wejście się skończyło (Ctrl+D albo koniec danych z potoku) — więcej odpowiedzi nie będzie.
rl.on('close', () => {
  przerwano = true;
  if (odrzucPytanie) {
    process.exitCode = 130;
    przerwijPytanie();
  }
});

function zapytaj(pytanie) {
  if (przerwano) {
    process.exitCode = 130;
    return Promise.reject(new Przerwano());
  }
  return new Promise((resolve, reject) => {
    odrzucPytanie = reject;
    rl.question(pytanie, (odpowiedz) => {
      odrzucPytanie = null;
      resolve(odpowiedz.trim());
    });
  });
}

async function zapytajOpisIKategorie(dostepneKategorie, obecne = { opis: '', kategorie: [] }) {
  const pytanieOpis = obecne.opis
    ? `   Opis zdjęcia (Enter = zostaw „${obecne.opis}”): `
    : '   Opis zdjęcia (Enter = puste): ';
  const opis = (await zapytaj(pytanieOpis)) || obecne.opis;

  if (dostepneKategorie.length > 0) {
    console.log(`   Kategorie używane do tej pory: ${dostepneKategorie.join(', ')}`);
  } else {
    console.log('   Nie ma jeszcze żadnych zapisanych kategorii — możesz wpisać dowolną nową.');
  }

  const pytanieKat = obecne.kategorie.length > 0
    ? `   Kategorie (oddziel przecinkiem; nowa nazwa = od razu ją dodaje; Enter = zostaw: ${obecne.kategorie.join(', ')}): `
    : '   Kategorie (oddziel przecinkiem; nowa nazwa = od razu ją dodaje; Enter = puste do uzupełnienia później): ';
  const kategorieRaw = await zapytaj(pytanieKat);

  if (!kategorieRaw) {
    return { opis, kategorie: obecne.kategorie };
  }

  // Dopasowujemy bez względu na wielkość liter do tego, co już istnieje (żeby "portrety"
  // i "Portrety" nie stały się dwiema różnymi kategoriami) — czego nie znajdziemy,
  // traktujemy jako nową kategorię, zachowując pisownię, jaką wpisano.
  const wpisane = kategorieRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => dostepneKategorie.find((kat) => kat.toLowerCase() === k.toLowerCase()) || k);

  return { opis, kategorie: [...new Set(wpisane)] };
}

// --- Wgrywanie do R2 ---

// Krótki powód z odpowiedzi R2, np. "InvalidAccessKeyId" (złe klucze) albo "NoSuchBucket"
// (zła nazwa bucketa). Bierzemy tylko kod błędu — reszta odpowiedzi nie trafia na ekran.
async function powodZOdpowiedzi(odpowiedz) {
  try {
    const kod = (await odpowiedz.text()).match(/<Code>([A-Za-z]{1,64})<\/Code>/)?.[1];
    return kod ? `, ${kod}` : '';
  } catch {
    return '';
  }
}

// Zapytanie do R2. Chwilowe błędy po stronie R2 (5xx, 429) ponawia już sam aws4fetch
// (do 10 razy); tu ponawiamy jeszcze zerwane połączenie (np. chwilowy zanik Wi-Fi).
// PUT i DELETE można bezpiecznie powtórzyć — wynik jest ten sam.
async function zapytanieR2(kluczR2, ustawienia) {
  for (let proba = 1; ; proba++) {
    try {
      return await pobierzKlienta().fetch(adresR2(kluczR2), ustawienia);
    } catch (err) {
      if (proba === 3) {
        // Tylko kod przyczyny (np. ENOTFOUND, ECONNRESET) — pełny opis zawiera adres z ID konta.
        const przyczyna = err.cause?.code ? ` (${err.cause.code})` : '';
        throw new BladGlobalny(`brak połączenia z R2 przy ${kluczR2}${przyczyna} — sprawdź internet.`);
      }
      await new Promise((zakoncz) => setTimeout(zakoncz, 2000 * proba));
    }
  }
}

async function wyslijBuforDoR2(bufor, kluczR2, contentType) {
  const odpowiedz = await zapytanieR2(kluczR2, {
    method: 'PUT',
    body: bufor,
    headers: { 'Content-Type': contentType },
  });

  if (!odpowiedz.ok) {
    throw new BladGlobalny(
      `R2 odrzuciło wgrywanie ${kluczR2} (${odpowiedz.status} ${odpowiedz.statusText}${await powodZOdpowiedzi(odpowiedz)}) — sprawdź klucze R2_* w .env.`
    );
  }
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
function wyczyscExifDoR2(bufor, kluczR2) {
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

// Szkielet znaku wodnego: na razie dokłada półprzezroczysty napis "foto.vigolab.ovh"
// w rogu zdjęcia. Logo podmienisz tu później (composite() z PNG zamiast SVG z tekstem)
// — wywołania niżej i klucz w R2 zostają bez zmian.
async function nalozZnak(bufor, format) {
  const meta = await sharp(bufor).metadata();
  // Orientacja EXIF 5–8 = zdjęcie obrócone o 90°. Wersja ze znakiem wychodzi z sharp
  // bez EXIF-u, więc obrót "wypalamy" w piksele (autoOrient() niżej) — inaczej zdjęcie
  // leżałoby na boku — a napis liczymy już dla wymiarów po obrocie.
  const [width, height] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const rozmiarTekstu = Math.max(18, Math.round(width * 0.022));
  const margines = Math.round(width * 0.025);
  const grubyObrys = Math.max(1, Math.round(rozmiarTekstu * 0.035));
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${width - margines}" y="${height - margines}" text-anchor="end"
        font-family="Arial, Helvetica, sans-serif" font-size="${rozmiarTekstu}" font-weight="600"
        fill="#eaf4f4" fill-opacity="0.65"
        style="paint-order: stroke; stroke: #171512; stroke-opacity: 0.5; stroke-width: ${grubyObrys}px;"
      >foto.vigolab.ovh</text>
    </svg>`;
  const zeZnakiem = sharp(bufor).autoOrient().composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
  return format === 'png' ? zeZnakiem.png().toBuffer() : zeZnakiem.jpeg({ quality: 88 }).toBuffer();
}

// Przygotowuje oba pliki do wysłania: czysty oryginał (bez GPS i numeru seryjnego)
// i wersję ze znakiem wodnym. Wszystko, co może się nie udać na samym pliku (uszkodzony
// JPEG, nieczytelny EXIF), dzieje się tu — PRZED pierwszym wgraniem do R2 i przed
// pytaniem o opis, więc taki błąd nie zostawia w R2 połowy zdjęcia ani wpisanego na darmo opisu.
async function przygotujDoWgrania(sciezkaLokalna, kluczR2) {
  const oryginal = await readFile(sciezkaLokalna);
  const png = kluczR2.toLowerCase().endsWith('.png');
  const typ = png ? 'image/png' : 'image/jpeg';
  return [
    { klucz: kluczR2, bufor: wyczyscExifDoR2(oryginal, kluczR2), typ },
    { klucz: kluczZnak(kluczR2), bufor: await nalozZnak(oryginal, png ? 'png' : 'jpeg'), typ },
  ];
}

async function wgrajDoR2(pliki) {
  for (const { klucz, bufor, typ } of pliki) {
    await wyslijBuforDoR2(bufor, klucz, typ);
  }
}

// --- Usuwanie z R2 ---
async function usunZR2(kluczR2) {
  const odpowiedz = await zapytanieR2(kluczR2, { method: 'DELETE' });

  // R2 (tak jak S3) zwraca powodzenie nawet dla klucza, którego już nie ma —
  // błędem jest więc tylko odpowiedź spoza zakresu 2xx.
  if (!odpowiedz.ok) {
    throw new BladGlobalny(
      `R2 odrzuciło usuwanie ${kluczR2} (${odpowiedz.status} ${odpowiedz.statusText}${await powodZOdpowiedzi(odpowiedz)}).`
    );
  }
}

// --- Tryb "dodaj nowe zdjęcia" ---

// Pliki "przed", których skrypt nie sparuje z żadnym "po" — np. "po" ma dopisek "-Edytuj",
// a "przed" nie. Bez tego ostrzeżenia zdjęcie trafiłoby na stronę po cichu bez wersji "przed".
function ostrzezOPlikachPrzedBezPary(zdjecia, nazwyPo) {
  const oczekiwane = new Set(nazwyPo.map((n) => nazwaWersjiPrzed(n).toLowerCase()));
  for (const plik of zdjecia) {
    if (/przed_/i.test(plik) && !oczekiwane.has(plik.toLowerCase())) {
      console.warn(
        `⚠️  "${plik}" nie ma pary — pasowałoby do niego "po" o nazwie "${plik.replace(/przed_/i, '')}". ` +
        'Popraw nazwę jednego z plików (np. dopisek "-Edytuj"), inaczej zdjęcie trafi na stronę bez "przed".'
      );
    }
  }
}

async function dodajNoweZdjecia(db) {
  const wgrane = pobierzWgrane(db);

  if (!existsSync(IMAGES_DIR)) {
    console.warn(`⚠️  Folder ${IMAGES_DIR}/ nie istnieje — nie ma czego dodawać.`);
  }

  const wszystkiePliki = existsSync(IMAGES_DIR) ? await readdir(IMAGES_DIR) : [];
  // Pliki ukryte (np. "._DSC_1234.jpg", które macOS zostawia na pendrive'ach) to nie zdjęcia.
  const zdjecia = wszystkiePliki.filter((f) => !f.startsWith('.') && /\.(jpe?g|png)$/i.test(f));
  const kandydaci = zdjecia.filter((f) => /DSC_?\d/i.test(f) && !/przed_/i.test(f)).sort();

  ostrzezOPlikachPrzedBezPary(zdjecia, [...kandydaci, ...wgrane]);

  const doWgrania = kandydaci.filter((f) => !wgrane.has(f));
  const juzWgrane = kandydaci.length - doWgrania.length;

  if (doWgrania.length === 0) {
    console.log(`✅ Brak nowych zdjęć do wgrania (już w bazie: ${juzWgrane}).\n`);
    return;
  }

  // Sprawdzamy klucze R2 od razu, zanim zaczniemy zadawać pytania.
  pobierzKlienta();

  console.log(`📦 Nowe zdjęcia: ${doWgrania.length} (już w bazie: ${juzWgrane}).\n`);

  const insertStmt = db.prepare(`
    INSERT INTO zdjecia
      (nazwa_pliku, nazwa_pliku_przed, opis, kategorie, szerokosc, wysokosc,
       iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, make, model, lens_model, r2_klucz, r2_klucz_przed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let dodanoLiczba = 0;
  let bledyLiczba = 0;

  for (const nazwaPliku of doWgrania) {
    if (przerwano) {
      process.exitCode = 130;
      break;
    }
    console.log(`\n🖼️  ${nazwaPliku}`);

    const sciezkaPo = `${IMAGES_DIR}/${nazwaPliku}`;
    const nazwaPrzed = nazwaWersjiPrzed(nazwaPliku);
    const sciezkaPrzed = `${IMAGES_DIR}/${nazwaPrzed}`;
    const maWersjePrzed = existsSync(sciezkaPrzed);

    console.log(maWersjePrzed ? `   Znaleziono wersję "przed": ${nazwaPrzed}` : `   Bez wersji "przed" (nie ma pliku ${nazwaPrzed}).`);

    let wpisane = null;
    try {
      const kluczR2Po = `zdjecia/${nazwaPliku}`;
      const kluczR2Przed = maWersjePrzed ? `zdjecia/${nazwaPrzed}` : null;

      // Najpierw wszystko, co dotyczy samych plików — błąd (np. uszkodzony "przed")
      // wyjdzie, zanim wpiszesz opis i zanim cokolwiek trafi do R2.
      const wymiary = await pobierzWymiary(sciezkaPo);
      const exif = await pobierzExifZPary(maWersjePrzed ? sciezkaPrzed : null, sciezkaPo);
      const pliki = [
        ...(await przygotujDoWgrania(sciezkaPo, kluczR2Po)),
        ...(maWersjePrzed ? await przygotujDoWgrania(sciezkaPrzed, kluczR2Przed) : []),
      ];

      const dostepneKategorie = pobierzUzywaneKategorie(db); // odświeżone, żeby widzieć też kategorię dodaną chwilę wcześniej w tym samym uruchomieniu
      wpisane = await zapytajOpisIKategorie(dostepneKategorie);

      console.log('   ⬆️  Wgrywanie do R2...');
      await wgrajDoR2(pliki);

      insertStmt.run(
        nazwaPliku,
        maWersjePrzed ? nazwaPrzed : null,
        wpisane.opis,
        JSON.stringify(wpisane.kategorie),
        wymiary.szerokosc,
        wymiary.wysokosc,
        exif.iso,
        exif.przyslona,
        exif.ogniskowa,
        exif.czas_naswietlania,
        exif.data_wykonania,
        exif.make,
        exif.model,
        exif.lens_model,
        kluczR2Po,
        kluczR2Przed
      );

      // JSON od razu nadąża za bazą — bo przy następnym uruchomieniu baza jest budowana z JSON-a,
      // więc przerwane uruchomienie (Ctrl+C, błąd) nie może zgubić zdjęcia już wgranego do R2.
      await eksportujJson(db);

      console.log('   ✅ Wgrano i zapisano.');
      dodanoLiczba++;
    } catch (err) {
      if (err instanceof Przerwano) break;
      bledyLiczba++;
      console.error(`   ❌ Błąd przy przetwarzaniu ${nazwaPliku}: ${err.message}`);
      if (err instanceof BladGlobalny) {
        console.error('   Przerywam — ten błąd dotyczy wszystkich zdjęć, nie tylko tego. Usuń przyczynę i uruchom skrypt jeszcze raz.');
        if (wpisane) {
          console.error(
            `   Wpisany opis (do ponownego wklejenia): ${wpisane.opis || '(pusty)'}; kategorie: ${wpisane.kategorie.join(', ') || '(brak)'}`
          );
        }
        break;
      }
    }
  }

  const nieruszone = doWgrania.length - dodanoLiczba - bledyLiczba;
  if (bledyLiczba > 0) process.exitCode = 1;

  console.log('\n' + '─'.repeat(40));
  console.log('📊 Podsumowanie:');
  console.log(`   Dodano:       ${dodanoLiczba}`);
  console.log(`   Błędy:        ${bledyLiczba}`);
  if (nieruszone > 0) console.log(`   Nieruszone:   ${nieruszone} (zostaną dodane przy następnym uruchomieniu)`);
  console.log(`   Już w bazie:  ${juzWgrane}`);
  console.log('─'.repeat(40) + '\n');
}

// --- Tryb "uzupełnij opisy": tylko zdjęcia z pustym opisem lub bez kategorii ---
async function uzupelnijOpisy(db) {
  const doUzupelnienia = db
    .prepare('SELECT id, nazwa_pliku, opis, kategorie FROM zdjecia ORDER BY nazwa_pliku')
    .all()
    .filter((w) => !w.opis || parsujKategorie(w.kategorie).length === 0);

  if (doUzupelnienia.length === 0) {
    console.log('✅ Wszystkie zdjęcia mają już opis i kategorie.\n');
    return;
  }

  console.log(`✏️  Do uzupełnienia (brak opisu albo kategorii): ${doUzupelnienia.length}.\n`);

  const aktualizuj = db.prepare('UPDATE zdjecia SET opis = ?, kategorie = ? WHERE id = ?');

  for (const w of doUzupelnienia) {
    console.log(`\n🖼️  ${w.nazwa_pliku}`);
    const dostepneKategorie = pobierzUzywaneKategorie(db);
    const { opis, kategorie } = await zapytajOpisIKategorie(dostepneKategorie, {
      opis: w.opis ?? '',
      kategorie: parsujKategorie(w.kategorie),
    });
    aktualizuj.run(opis, JSON.stringify(kategorie), w.id);
    await eksportujJson(db); // jak wyżej: JSON zawsze nadąża za bazą
    console.log('   ✅ Zapisano.');
  }
  console.log('');
}

// Zamienia np. "1, 3 5" na [1, 3, 5]. Jeśli choć jeden fragment nie jest numerem z listy
// (literówka "1;3", zakres "1-3", słowo), zwraca null — wtedy NIC nie zmieniamy, zamiast
// zastosować resztę albo pustą listę (pusta lista skasowałaby wszystkie wyróżnienia).
function rozbijNaNumery(tekst, maks) {
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

// --- Tryb "wyróżnij": wybór zdjęć na stronę główną ---
// Dwie niezależne rzeczy: (1) które zdjęcia pokazują się w sekcji "Wybrane prace"
// (pole "wyroznione", dowolna liczba), (2) która JEDNA para trafia do suwaka
// przed/po na pierwszym ekranie (pole "para_suwaka"). Build sam sprawdzi, czy para
// do suwaka ma identyczne proporcje "przed" i "po" — jeśli nie, pokaże zamiast
// niego przełącznik "Pokaż przed" (bez przerywania builda).
async function zarzadzajWyroznieniami(db) {
  const wszystkie = db
    .prepare('SELECT id, nazwa_pliku, nazwa_pliku_przed, opis, wyroznione, para_suwaka FROM zdjecia ORDER BY nazwa_pliku')
    .all();

  if (wszystkie.length === 0) {
    console.log('✅ Baza jest pusta — najpierw dodaj zdjęcia (npm run sync-images).\n');
    return;
  }

  console.log('🌟 Wybór zdjęć na stronę główną\n');
  wszystkie.forEach((w, i) => {
    const znaczniki = [w.wyroznione ? 'wyróżnione' : null, w.para_suwaka ? 'suwak' : null].filter(Boolean);
    const opis = w.opis ? ` — ${w.opis}` : '';
    const status = znaczniki.length > 0 ? `  [${znaczniki.join(', ')}]` : '';
    console.log(`   ${String(i + 1).padStart(2)}. ${w.nazwa_pliku}${opis}${status}`);
  });

  console.log('\n   Sekcja "Wybrane prace" na stronie głównej pokazuje zdjęcia oznaczone jako wyróżnione (3–6 par).');
  const wejscieWyroznione = await zapytaj(
    '   Numery zdjęć do wyróżnienia (oddziel przecinkiem lub spacją; Enter = bez zmian, "brak" = wyczyść wszystkie): '
  );

  if (wejscieWyroznione) {
    const numery = wejscieWyroznione.toLowerCase() === 'brak' ? [] : rozbijNaNumery(wejscieWyroznione, wszystkie.length);
    if (numery === null) {
      console.warn('   Wyróżnienia bez zmian.');
    } else {
      const noweId = new Set(numery.map((n) => wszystkie[n - 1].id));
      const ustawWyroznione = db.prepare('UPDATE zdjecia SET wyroznione = ? WHERE id = ?');
      for (const w of wszystkie) {
        ustawWyroznione.run(noweId.has(w.id) ? 1 : 0, w.id);
      }
      await eksportujJson(db); // zapis od razu — przerwanie przy następnym pytaniu tego nie cofnie
      console.log(`   ✅ Wyróżnionych zdjęć: ${noweId.size}.`);
    }
  }

  console.log('\n   Suwak przed/po na pierwszym ekranie pokazuje jedną parę — potrzebuje "przed"');
  console.log('   w IDENTYCZNYM kadrze i proporcjach co "po" (inaczej strona pokaże przełącznik "Pokaż przed").');
  const wejscieSuwak = await zapytaj('   Numer zdjęcia do suwaka (jedna liczba; Enter = bez zmian, 0 = wyłącz): ');

  if (wejscieSuwak === '0') {
    db.prepare('UPDATE zdjecia SET para_suwaka = 0').run();
    console.log('   ✅ Suwak wyłączony — strona główna pokaże zastępcze zdjęcie z przełącznikiem "Pokaż przed".');
  } else if (wejscieSuwak) {
    const numery = rozbijNaNumery(wejscieSuwak, wszystkie.length);
    if (numery === null || numery.length !== 1) {
      console.warn('   ⚠️  Podaj jedną liczbę z listy — suwak bez zmian.');
    } else {
      const wybrane = wszystkie[numery[0] - 1];
      if (!wybrane.nazwa_pliku_przed) {
        console.warn(`   ⚠️  ${wybrane.nazwa_pliku} nie ma wersji "przed" — suwak i tak nie zadziała (build pokaże tryb zastępczy).`);
      }
      db.prepare('UPDATE zdjecia SET para_suwaka = 0').run();
      db.prepare('UPDATE zdjecia SET para_suwaka = 1 WHERE id = ?').run(wybrane.id);
      console.log(`   ✅ Para do suwaka: ${wybrane.nazwa_pliku}.`);
    }
  }

  console.log('');
}

// --- Tryb "usuń": TRWALE kasuje zdjęcie z R2, bazy i galeria.json ---
async function usunZdjecie(db, nazwaPliku) {
  const wiersz = db.prepare('SELECT * FROM zdjecia WHERE nazwa_pliku = ?').get(nazwaPliku);

  if (!wiersz) {
    console.error(`❌ Nie znaleziono w bazie zdjęcia "${nazwaPliku}" (podaj samą nazwę pliku, co do litery).`);
    process.exitCode = 1;
    return;
  }

  const kluczeDoUsuniecia = [wiersz.r2_klucz, wiersz.r2_klucz_przed].filter(Boolean).flatMap((k) => [k, kluczZnak(k)]);

  console.log(`🗑️  Do usunięcia: ${wiersz.nazwa_pliku}${wiersz.opis ? ` — ${wiersz.opis}` : ''}`);
  console.log(`   Z R2 zniknie: ${kluczeDoUsuniecia.join(', ')}`);
  console.log('   To działanie jest NIEODWRACALNE.');
  pobierzKlienta(); // klucze R2 sprawdzone, zanim zapytamy o potwierdzenie
  const potwierdzenie = await zapytaj(`   Wpisz dokładnie "${wiersz.nazwa_pliku}", żeby potwierdzić: `);
  if (potwierdzenie !== wiersz.nazwa_pliku) {
    console.log('   Anulowano — nic nie zmieniono.\n');
    return;
  }

  // Usuwamy najpierw z R2, a dopiero po sukcesie z bazy — w razie przerwania w połowie
  // (np. błąd sieci) wystarczy uruchomić usuwanie tego samego pliku jeszcze raz: DELETE
  // na już nieistniejącym kluczu w R2 i tak kończy się sukcesem (patrz usunZR2).
  console.log('   🗑️  Usuwanie z R2 (oryginały + wersje ze znakiem)...');
  try {
    for (const klucz of kluczeDoUsuniecia) {
      await usunZR2(klucz);
    }
  } catch (err) {
    throw new Error(
      `${err.message}\n   Usuwanie przerwane w połowie: część plików mogła już zniknąć z R2, a zdjęcie wciąż jest w galeria.json ` +
      '(build strony może się teraz nie udać). Uruchom to samo polecenie jeszcze raz.'
    );
  }
  db.prepare('DELETE FROM zdjecia WHERE id = ?').run(wiersz.id);
  await eksportujJson(db);

  console.log(`   ✅ Usunięto "${wiersz.nazwa_pliku}" — z R2, bazy i ${JSON_PATH}.`);
  console.log(`   Pliki w ${IMAGES_DIR}/ (jeśli je masz) zostają — usuń je albo przenieś, bo zwykłe "npm run sync-images" dodałoby zdjęcie z powrotem.\n`);
}

// --- Tryb "podmień": nowy/zmieniony plik dla zdjęcia JUŻ w bazie ---
// Zwykłe dodawanie (dodajNoweZdjecia) pomija pliki, których nazwa_pliku już jest w bazie —
// więc samo dorzucenie "przed_DSC_1111.jpg" do zdjęcia dodanego wcześniej bez wersji "przed"
// nic by nie zrobiło. Ten tryb wgrywa ponownie to, co akurat znajdzie lokalnie w images/
// (samo "po", samo "przed" albo oba) i nadpisuje odpowiednie pola w bazie.
async function podmienPlik(db, nazwaPliku) {
  const wiersz = db.prepare('SELECT * FROM zdjecia WHERE nazwa_pliku = ?').get(nazwaPliku);

  if (!wiersz) {
    console.error(`❌ "${nazwaPliku}" nie ma jeszcze w bazie — dodaj je zwykłym "npm run sync-images".`);
    process.exitCode = 1;
    return;
  }

  const sciezkaPo = `${IMAGES_DIR}/${nazwaPliku}`;
  const nazwaPrzed = nazwaWersjiPrzed(nazwaPliku);
  const sciezkaPrzed = `${IMAGES_DIR}/${nazwaPrzed}`;
  const maPo = existsSync(sciezkaPo);
  const maPrzed = existsSync(sciezkaPrzed);

  if (!maPo && !maPrzed) {
    console.error(`❌ Brak lokalnie "${nazwaPliku}" i "${nazwaPrzed}" w ${IMAGES_DIR}/ — nie ma czego wgrać.`);
    process.exitCode = 1;
    return;
  }

  console.log(`🔄 Podmiana dla: ${nazwaPliku}`);
  if (maPo) console.log('   "po" znaleziono lokalnie — nadpisze wersję w R2.');
  if (maPrzed) {
    console.log(`   "przed" znaleziono lokalnie — ${wiersz.r2_klucz_przed ? 'nadpisze wersję w R2.' : 'doda nową wersję "przed".'}`);
  }

  const kluczPo = wiersz.r2_klucz ?? `zdjecia/${nazwaPliku}`;
  const kluczPrzed = maPrzed ? (wiersz.r2_klucz_przed ?? `zdjecia/${nazwaPrzed}`) : wiersz.r2_klucz_przed;

  // Najpierw wszystko lokalnie (wymiary, EXIF, czyszczenie EXIF-u, znak wodny) — błąd
  // pliku wyjdzie tu, zanim cokolwiek trafi do R2.
  // Wymiary (szerokość/wysokość w galeria.json) opisują "po" — zmieniają się tylko,
  // gdy naprawdę podmieniamy "po".
  const wymiary = maPo ? await pobierzWymiary(sciezkaPo) : { szerokosc: wiersz.szerokosc, wysokosc: wiersz.wysokosc };
  const exif = await pobierzExifZPary(maPrzed ? sciezkaPrzed : null, maPo ? sciezkaPo : null);
  const pliki = [
    ...(maPo ? await przygotujDoWgrania(sciezkaPo, kluczPo) : []),
    ...(maPrzed ? await przygotujDoWgrania(sciezkaPrzed, kluczPrzed) : []),
  ];

  pobierzKlienta(); // klucze R2 sprawdzone, zanim zapytamy o potwierdzenie
  const potwierdzenie = await zapytaj('   Wgrać do R2 i zaktualizować bazę? (tak/nie): ');
  if (potwierdzenie.toLowerCase() !== 'tak') {
    console.log('   Anulowano — nic nie zmieniono.\n');
    return;
  }

  console.log('   ⬆️  Wgrywanie do R2 (oryginał + wersja ze znakiem)...');
  await wgrajDoR2(pliki);

  // Dane z aparatu: puste pole w nowym pliku (np. "po" z Photoshopa bez EXIF-u)
  // nie kasuje tego, co już jest zapisane (COALESCE = "nowa wartość albo stara").
  db.prepare(`
    UPDATE zdjecia SET
      nazwa_pliku_przed = ?, r2_klucz = ?, r2_klucz_przed = ?, szerokosc = ?, wysokosc = ?,
      iso = COALESCE(?, iso), przyslona = COALESCE(?, przyslona), ogniskowa = COALESCE(?, ogniskowa),
      czas_naswietlania = COALESCE(?, czas_naswietlania), data_wykonania = COALESCE(?, data_wykonania),
      make = COALESCE(?, make), model = COALESCE(?, model), lens_model = COALESCE(?, lens_model)
    WHERE id = ?
  `).run(
    maPrzed ? nazwaPrzed : wiersz.nazwa_pliku_przed,
    kluczPo,
    kluczPrzed,
    wymiary.szerokosc,
    wymiary.wysokosc,
    exif.iso,
    exif.przyslona,
    exif.ogniskowa,
    exif.czas_naswietlania,
    exif.data_wykonania,
    exif.make,
    exif.model,
    exif.lens_model,
    wiersz.id
  );

  await eksportujJson(db);
  console.log(`   ✅ Zaktualizowano "${nazwaPliku}".\n`);
}

// --- Plik src/data/galeria.json — to z niego korzysta strona ---

// Zapis "wszystko albo nic": pełna treść trafia najpierw do pliku tymczasowego obok,
// a dopiero potem podmienia galeria.json. Pełny dysk, zamknięte okno terminala czy
// zanik prądu w trakcie zapisu zostawią stary, cały plik — nigdy ucięty.
async function zapiszAtomowo(sciezka, tresc) {
  const tymczasowy = `${sciezka}.tmp`;
  try {
    const plik = await open(tymczasowy, 'w');
    try {
      await plik.writeFile(tresc, 'utf8');
      await plik.sync(); // dane fizycznie na dysku, zanim podmienimy plik
    } finally {
      await plik.close();
    }
    // Na Windowsie podmianę potrafi na chwilę zablokować antywirus albo indeksowanie
    // plików (EPERM/EBUSY) — wtedy próbujemy jeszcze kilka razy.
    for (let proba = 1; ; proba++) {
      try {
        await rename(tymczasowy, sciezka);
        return;
      } catch (err) {
        if (proba === 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
        await new Promise((zakoncz) => setTimeout(zakoncz, 100 * proba));
      }
    }
  } catch (err) {
    await rm(tymczasowy, { force: true }).catch(() => {});
    throw err;
  }
}

async function eksportujJson(db) {
  const wiersze = db.prepare('SELECT * FROM zdjecia ORDER BY nazwa_pliku').all();

  const lista = wiersze.map((w) => ({
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
  const nowaTresc = JSON.stringify(lista, null, 2) + '\n';

  // Bez zmian (np. po "Anulowano") — nie dotykamy pliku, żeby git nie pokazywał zmian.
  // Porównujemy bez względu na końce linii (git na Windowsie zamienia LF na CRLF).
  const staraTresc = existsSync(JSON_PATH)
    ? bezBom(await readFile(JSON_PATH, 'utf8')).replace(/\r\n/g, '\n')
    : null;
  if (staraTresc === nowaTresc) return;

  try {
    await mkdir(dirname(JSON_PATH), { recursive: true });
    await zapiszAtomowo(JSON_PATH, nowaTresc);
  } catch (err) {
    throw new BladGlobalny(`nie udało się zapisać ${JSON_PATH} (${err.code ?? err.message}) — poprzednia wersja pliku została nietknięta.`);
  }
  zmienionoJson = true;
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
function bezPolskichLiter(tekst) {
  return tekst.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
}

function odczytajOpcje(argumenty) {
  // npm bez "--" zabiera opcję dla siebie: do skryptu dociera wtedy tylko nazwa pliku
  // (albo nic), a po opcji zostaje ślad w zmiennej środowiskowej npm_config_<opcja>.
  const polkniete = Object.keys(process.env)
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

// --- Główna logika ---
async function main() {
  console.log('🚀 sync-images — synchronizacja zdjęć z Cloudflare R2 + SQLite\n');

  let opcje;
  try {
    opcje = odczytajOpcje(process.argv.slice(2));
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const db = initDb();

  try {
    await odtworzZJson(db);
    await sprawdzWymiary(db, opcje.opcja === '--podmien' ? opcje.plik : null);

    try {
      if (opcje.opcja === '--usun') {
        await usunZdjecie(db, opcje.plik);
      } else if (opcje.opcja === '--podmien') {
        await podmienPlik(db, opcje.plik);
      } else if (opcje.opcja === '--uzupelnij') {
        await uzupelnijOpisy(db);
      } else if (opcje.opcja === '--wyroznij') {
        await zarzadzajWyroznieniami(db);
      } else {
        await dodajNoweZdjecia(db);
      }
    } catch (err) {
      // Ctrl+C przy pytaniu — wszystko do tej chwili jest już zapisane.
      if (!(err instanceof Przerwano)) throw err;
    }

    await eksportujJson(db);
    const ile = db.prepare('SELECT COUNT(*) AS n FROM zdjecia').get().n;
    console.log(
      zmienionoJson
        ? `📄 Zapisano ${JSON_PATH} (zdjęć w galerii: ${ile}). Pamiętaj o commicie tego pliku.`
        : `📄 ${JSON_PATH} bez zmian.`
    );
  } finally {
    db.close();
    rl.removeAllListeners('close'); // zamykamy sami — to nie jest przerwanie
    rl.close();
  }
}

main().catch((err) => {
  console.error('❌ Błąd krytyczny:', err.message);
  if (zmienionoJson) {
    console.error(`   Zmiany sprzed błędu są zapisane w ${JSON_PATH} — pamiętaj o commicie.`);
  }
  process.exit(1);
});
