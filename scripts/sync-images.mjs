#!/usr/bin/env node
/**
 * sync-images.mjs
 *
 * Skanuje folder images/ w poszukiwaniu nowych zdjęć (DSC_*.jpg, bez "przed_"),
 * odczytuje wymiary z samego pliku i dane z aparatu (EXIF), pyta o opis i kategorie,
 * wgrywa pliki (po + opcjonalnie przed) do Cloudflare R2
 * i zapisuje metadane w lokalnej bazie SQLite (data/galeria.db).
 *
 * Na końcu ZAWSZE generuje plik src/data/galeria.json — to właśnie z niego
 * korzysta strona podczas budowania.
 *
 * Źródłem prawdy jest galeria.json (leży w gicie). Baza SQLite to tylko robocza
 * kopia: przy KAŻDYM uruchomieniu jest budowana od nowa z galeria.json, więc stara
 * baza z innego komputera nie może nadpisać nowszych zdjęć ani opisów.
 * Przed uruchomieniem zawsze zrób git pull.
 *
 * Uruchomienie:
 *   npm run sync-images                  — dodaje nowe zdjęcia
 *   npm run sync-images -- --uzupelnij   — pyta o opis/kategorie tam, gdzie są puste
 *   npm run sync-images -- --wyroznij    — wybór zdjęć na stronę główną (Roadmapa pkt 4):
 *                                           pokazywane w sekcji "wybrane" i para do suwaka przed/po
 */

import { DatabaseSync } from 'node:sqlite';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import readline from 'node:readline';

const IMAGES_DIR = 'images';
const DB_PATH = 'data/galeria.db';
const JSON_PATH = 'src/data/galeria.json';

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

// --- Baza SQLite (wbudowana w Node 22.5+) ---
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
      para_suwaka INTEGER DEFAULT 0,
      wgrano_o TEXT DEFAULT CURRENT_TIMESTAMP
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

// --- Odtworzenie bazy z pliku JSON ---

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

// Źródłem prawdy jest src/data/galeria.json — leży w gicie, więc po git pull jest taki
// sam na każdym komputerze. Baza SQLite to tylko robocza kopia, dlatego przy KAŻDYM
// uruchomieniu budujemy ją od nowa z pliku JSON. Stara baza z innego komputera nie może
// wtedy nadpisać nowszych zdjęć ani opisów, a zdjęcia usunięte z JSON-a nie wracają.
// Obieg JSON → baza → JSON daje identyczny plik, więc nic nie ginie.
async function odtworzZJson(db) {
  if (!existsSync(JSON_PATH)) return; // pierwsze uruchomienie — nie ma jeszcze z czego odtwarzać

  let lista;
  try {
    lista = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  } catch (err) {
    // Uszkodzony plik (np. nierozwiązany konflikt gita) — przerywamy, żeby go nie nadpisać.
    throw new Error(
      `Plik ${JSON_PATH} nie jest poprawnym JSON-em (${err.message}). ` +
      'Możliwy nierozwiązany konflikt gita. Nic nie zmieniono — napraw plik albo przywróć jego poprzednią wersję z gita.'
    );
  }
  if (!Array.isArray(lista) || lista.some((z) => !z || typeof z.nazwaPliku !== 'string' || !z.nazwaPliku)) {
    throw new Error(`Plik ${JSON_PATH} ma nieoczekiwany format (oczekiwana lista zdjęć z polem nazwaPliku). Nic nie zmieniono.`);
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
      wstaw.run(
        z.nazwaPliku,
        z.kluczPrzed ? `przed_${z.nazwaPliku}` : null,
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
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw new Error(`Nie udało się odtworzyć bazy z ${JSON_PATH}: ${err.message}`);
  }

  console.log(`♻️  Baza odtworzona z ${JSON_PATH}: ${lista.length} zdjęć (w starej bazie było ${ileBylo}).`);
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
async function pobierzExif(sciezka) {
  const exifr = (await import('exifr')).default;
  let exif = {};
  try {
    exif = (await exifr.parse(sciezka, { pick: ['ISO', 'FNumber', 'FocalLength', 'ExposureTime', 'CreateDate', 'Make', 'Model', 'LensModel'] })) ?? {};
  } catch {
    console.warn('⚠️  Nie udało się odczytać EXIF dla:', sciezka);
  }

  let dataWykonania = null;
  if (exif.CreateDate) {
    const data = new Date(exif.CreateDate);
    if (!Number.isNaN(data.getTime())) dataWykonania = data.toISOString();
  }

  return {
    iso: exif.ISO ?? null,
    przyslona: exif.FNumber ? Number(exif.FNumber) : null,
    ogniskowa: exif.FocalLength ? Number(exif.FocalLength) : null,
    czas_naswietlania: exif.ExposureTime ?? null,
    data_wykonania: dataWykonania,
    make: exif.Make ?? null,
    model: exif.Model ?? null,
    lens_model: exif.LensModel ?? null,
  };
}

// Przy każdym uruchomieniu poprawiamy wymiary zdjęć, które mamy lokalnie
// (naprawia też wpisy dodane wcześniej z pustymi lub błędnymi wymiarami).
async function odswiezWymiary(db) {
  const wiersze = db.prepare('SELECT id, nazwa_pliku, szerokosc, wysokosc FROM zdjecia').all();
  const aktualizuj = db.prepare('UPDATE zdjecia SET szerokosc = ?, wysokosc = ? WHERE id = ?');
  let poprawione = 0;

  for (const w of wiersze) {
    const sciezka = `${IMAGES_DIR}/${w.nazwa_pliku}`;

    if (!existsSync(sciezka)) {
      if (!w.szerokosc || !w.wysokosc) {
        console.warn(`⚠️  Brak wymiarów dla ${w.nazwa_pliku}, a pliku nie ma lokalnie w ${IMAGES_DIR}/ — strona pominie to zdjęcie.`);
      }
      continue;
    }

    try {
      const { szerokosc, wysokosc } = await pobierzWymiary(sciezka);
      if (szerokosc !== w.szerokosc || wysokosc !== w.wysokosc) {
        aktualizuj.run(szerokosc, wysokosc, w.id);
        poprawione++;
      }
    } catch (err) {
      console.warn(`⚠️  Nie udało się odczytać wymiarów ${w.nazwa_pliku}: ${err.message}`);
    }
  }

  if (poprawione > 0) {
    console.log(`📐 Zaktualizowano wymiary dla ${poprawione} zdjęć.\n`);
  }
}

// --- Terminal: pytanie o opis i kategorie ---
// Uwaga: używamy JEDNEGO wspólnego interfejsu readline na cały czas działania
// skryptu (tworzenie nowego interfejsu przy każdym pytaniu psuje odczyt danych
// z potoku/stdin po pierwszym zamknięciu).
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function zapytaj(pytanie) {
  return new Promise((resolve) => {
    rl.question(pytanie, (odpowiedz) => resolve(odpowiedz.trim()));
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
async function wgrajDoR2(sciezkaLokalna, kluczR2) {
  const dane = await readFile(sciezkaLokalna);
  const contentType = kluczR2.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const odpowiedz = await pobierzKlienta().fetch(adresR2(kluczR2), {
    method: 'PUT',
    body: dane,
    headers: { 'Content-Type': contentType },
  });

  if (!odpowiedz.ok) {
    throw new Error(`R2 odrzuciło wgrywanie ${kluczR2}: ${odpowiedz.status} ${odpowiedz.statusText}`);
  }
}

// --- Tryb "dodaj nowe zdjęcia" ---
async function dodajNoweZdjecia(db) {
  const wgrane = pobierzWgrane(db);

  if (!existsSync(IMAGES_DIR)) {
    console.warn(`⚠️  Folder ${IMAGES_DIR}/ nie istnieje — nie ma czego dodawać.`);
  }

  const wszystkiePliki = existsSync(IMAGES_DIR) ? await readdir(IMAGES_DIR) : [];
  const kandydaci = wszystkiePliki
    .filter((f) => f.startsWith('DSC_') && !f.startsWith('przed_'))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();

  const doWgrania = kandydaci.filter((f) => !wgrane.has(f));
  const jużWgrane = kandydaci.length - doWgrania.length;

  if (doWgrania.length === 0) {
    console.log(`✅ Brak nowych zdjęć do wgrania. (${jużWgrane} już w bazie, 0 nowych)\n`);
    return;
  }

  // Sprawdzamy klucze R2 od razu, zanim zaczniemy zadawać pytania.
  pobierzKlienta();

  console.log(`📦 Znaleziono ${doWgrania.length} nowych zdjęć (pominięto ${jużWgrane} już wgranych).\n`);

  const insertStmt = db.prepare(`
    INSERT INTO zdjecia
      (nazwa_pliku, nazwa_pliku_przed, opis, kategorie, szerokosc, wysokosc,
       iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, make, model, lens_model, r2_klucz, r2_klucz_przed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let dodanoLiczba = 0;
  let pominietoLiczba = 0;

  for (const nazwaPliku of doWgrania) {
    console.log(`\n🖼️  ${nazwaPliku}`);

    const sciezkaPo = `${IMAGES_DIR}/${nazwaPliku}`;
    const nazwaPrzed = `przed_${nazwaPliku}`;
    const sciezkaPrzed = `${IMAGES_DIR}/${nazwaPrzed}`;
    const maWersjePrzed = existsSync(sciezkaPrzed);

    if (maWersjePrzed) {
      console.log(`   Znaleziono wersję "przed": ${nazwaPrzed}`);
    }

    try {
      const wymiary = await pobierzWymiary(sciezkaPo);
      const sciezkaExif = maWersjePrzed ? sciezkaPrzed : sciezkaPo;
      const exif = await pobierzExif(sciezkaExif);
      const dostepneKategorie = pobierzUzywaneKategorie(db); // odświeżone, żeby widzieć też kategorię dodaną chwilę wcześniej w tym samym uruchomieniu
      const { opis, kategorie } = await zapytajOpisIKategorie(dostepneKategorie);
      const kluczR2Po = `zdjecia/${nazwaPliku}`;
      const kluczR2Przed = maWersjePrzed ? `zdjecia/${nazwaPrzed}` : null;

      console.log('   ⬆️  Wgrywanie do R2...');
      await wgrajDoR2(sciezkaPo, kluczR2Po);
      if (maWersjePrzed) {
        await wgrajDoR2(sciezkaPrzed, kluczR2Przed);
      }

      insertStmt.run(
        nazwaPliku,
        maWersjePrzed ? nazwaPrzed : null,
        opis,
        JSON.stringify(kategorie),
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
      await eksportujJson(db, { cicho: true });

      console.log(`   ✅ Wgrano i zapisano w bazie.`);
      dodanoLiczba++;
    } catch (err) {
      console.error(`   ❌ Błąd przy przetwarzaniu ${nazwaPliku}: ${err.message}`);
      pominietoLiczba++;
    }
  }

  console.log('\n' + '─'.repeat(40));
  console.log('📊 Podsumowanie:');
  console.log(`   Dodano:    ${dodanoLiczba}`);
  console.log(`   Pominięto: ${pominietoLiczba + jużWgrane} (${pominietoLiczba} błędy, ${jużWgrane} już w bazie)`);
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

  console.log(`✏️  ${doUzupelnienia.length} zdjęć wymaga uzupełnienia opisu lub kategorii.\n`);

  const aktualizuj = db.prepare('UPDATE zdjecia SET opis = ?, kategorie = ? WHERE id = ?');

  for (const w of doUzupelnienia) {
    console.log(`\n🖼️  ${w.nazwa_pliku}`);
    const dostepneKategorie = pobierzUzywaneKategorie(db);
    const { opis, kategorie } = await zapytajOpisIKategorie(dostepneKategorie, {
      opis: w.opis ?? '',
      kategorie: parsujKategorie(w.kategorie),
    });
    aktualizuj.run(opis, JSON.stringify(kategorie), w.id);
    await eksportujJson(db, { cicho: true }); // jak wyżej: JSON zawsze nadąża za bazą
    console.log('   ✅ Zapisano.');
  }
  console.log('');
}

// Zamienia np. "1, 3 5" na [1, 3, 5] — pomija nieprawidłowe/poza zakresem numery (z ostrzeżeniem).
function rozbijNaNumery(tekst, maks) {
  const numery = tekst
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  const poprawne = numery.filter((n) => Number.isInteger(n) && n >= 1 && n <= maks);
  const bledne = numery.filter((n) => !Number.isInteger(n) || n < 1 || n > maks);
  if (bledne.length > 0) {
    console.warn(`   ⚠️  Pominięto nieprawidłowe numery: ${bledne.join(', ')} (zakres 1–${maks}).`);
  }
  return [...new Set(poprawne)];
}

// --- Tryb "wyróżnij": wybór zdjęć na stronę główną (Roadmapa pkt 4) ---
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
    const noweId =
      wejscieWyroznione.trim().toLowerCase() === 'brak'
        ? new Set()
        : new Set(rozbijNaNumery(wejscieWyroznione, wszystkie.length).map((n) => wszystkie[n - 1].id));

    const ustawWyroznione = db.prepare('UPDATE zdjecia SET wyroznione = ? WHERE id = ?');
    for (const w of wszystkie) {
      ustawWyroznione.run(noweId.has(w.id) ? 1 : 0, w.id);
    }
    console.log(`   ✅ Wyróżnionych zdjęć: ${noweId.size}.`);
  }

  console.log('\n   Suwak przed/po na pierwszym ekranie pokazuje jedną parę — potrzebuje "przed"');
  console.log('   w IDENTYCZNYM kadrze co "po" (patrz Roadmapa pkt 4, sposób przygotowania pary).');
  const wejscieSuwak = await zapytaj('   Numer zdjęcia do suwaka (jedna liczba; Enter = bez zmian, 0 = wyłącz): ');

  if (wejscieSuwak) {
    if (wejscieSuwak.trim() === '0') {
      db.prepare('UPDATE zdjecia SET para_suwaka = 0').run();
      console.log('   ✅ Suwak wyłączony — strona główna pokaże zastępcze zdjęcie z przełącznikiem "Pokaż przed".');
    } else {
      const [numer] = rozbijNaNumery(wejscieSuwak, wszystkie.length);
      if (numer === undefined) {
        console.warn('   ⚠️  Nieprawidłowy numer — nie zmieniono suwaka.');
      } else {
        const wybrane = wszystkie[numer - 1];
        if (!wybrane.nazwa_pliku_przed) {
          console.warn(`   ⚠️  ${wybrane.nazwa_pliku} nie ma wersji "przed" — suwak i tak nie zadziała (build pokaże tryb zastępczy).`);
        }
        db.prepare('UPDATE zdjecia SET para_suwaka = 0').run();
        db.prepare('UPDATE zdjecia SET para_suwaka = 1 WHERE id = ?').run(wybrane.id);
        console.log(`   ✅ Para do suwaka: ${wybrane.nazwa_pliku}.`);
      }
    }
  }

  console.log('');
}

// --- Plik src/data/galeria.json — to z niego korzysta strona ---
async function eksportujJson(db, { cicho = false } = {}) {
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

  await mkdir(dirname(JSON_PATH), { recursive: true });
  await writeFile(JSON_PATH, JSON.stringify(lista, null, 2) + '\n', 'utf8');
  if (!cicho) {
    console.log(`📄 Zapisano ${JSON_PATH} (${lista.length} zdjęć). Pamiętaj o commicie tego pliku.`);
  }
}

// --- Główna logika ---
async function main() {
  console.log('🚀 sync-images — synchronizacja zdjęć z Cloudflare R2 + SQLite\n');

  const trybUzupelnij = process.argv.includes('--uzupelnij');
  const trybWyroznij = process.argv.includes('--wyroznij');
  const db = initDb();

  try {
    await odtworzZJson(db);
    await odswiezWymiary(db);

    if (trybUzupelnij) {
      await uzupelnijOpisy(db);
    } else if (trybWyroznij) {
      await zarzadzajWyroznieniami(db);
    } else {
      await dodajNoweZdjecia(db);
    }

    await eksportujJson(db);
  } finally {
    db.close();
    rl.close();
  }
}

main().catch((err) => {
  console.error('❌ Błąd krytyczny:', err.message);
  process.exit(1);
});
