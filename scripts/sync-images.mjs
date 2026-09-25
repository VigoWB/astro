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
 * korzysta strona podczas budowania (baza SQLite zostaje tylko na Twoim komputerze).
 *
 * Uruchomienie:
 *   npm run sync-images                  — dodaje nowe zdjęcia
 *   npm run sync-images -- --uzupelnij   — pyta o opis/kategorie tam, gdzie są puste
 */

import { DatabaseSync } from 'node:sqlite';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import readline from 'node:readline';

const IMAGES_DIR = 'images';
const DB_PATH = 'data/galeria.db';
const JSON_PATH = 'src/data/galeria.json';
const KATEGORIE = ['Portrety', 'Pracownia', 'Przyroda'];

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

  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return s3;
}

// --- Baza SQLite (wbudowana w Node 22.5+) ---
function initDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
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
      wgrano_o TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
// Gdyby baza na tym komputerze była pusta (np. nowy komputer, skasowany plik),
// a plik src/data/galeria.json istnieje w repozytorium — odtwarzamy z niego bazę,
// żeby skrypt nie uznał wszystkich zdjęć za "nowe" i nie wgrywał ich drugi raz.
async function odtworzZJsonJesliPusta(db) {
  const ile = db.prepare('SELECT COUNT(*) AS n FROM zdjecia').get().n;
  if (ile > 0 || !existsSync(JSON_PATH)) return;

  let lista;
  try {
    lista = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  } catch {
    return;
  }
  if (!Array.isArray(lista) || lista.length === 0) return;

  const wstaw = db.prepare(`
    INSERT INTO zdjecia
      (nazwa_pliku, nazwa_pliku_przed, opis, kategorie, szerokosc, wysokosc,
       iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, make, model, lens_model, r2_klucz, r2_klucz_przed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      z.kluczPrzed ?? null
    );
  }
  console.log(`♻️  Baza była pusta — odtworzono ją z ${JSON_PATH} (${lista.length} zdjęć).\n`);
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

async function zapytajOpisIKategorie(obecne = { opis: '', kategorie: [] }) {
  const pytanieOpis = obecne.opis
    ? `   Opis zdjęcia (Enter = zostaw „${obecne.opis}”): `
    : '   Opis zdjęcia (Enter = puste): ';
  const opis = (await zapytaj(pytanieOpis)) || obecne.opis;

  console.log(`   Dostępne kategorie: ${KATEGORIE.join(', ')}`);
  const pytanieKat = obecne.kategorie.length > 0
    ? `   Kategorie (oddziel przecinkiem, Enter = zostaw: ${obecne.kategorie.join(', ')}): `
    : '   Kategorie (oddziel przecinkiem, Enter = puste do uzupełnienia później): ';
  const kategorieRaw = await zapytaj(pytanieKat);

  // Rozpoznajemy kategorie bez względu na wielkość liter ("portrety" = "Portrety").
  const wpisane = kategorieRaw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .map((k) => KATEGORIE.find((kat) => kat.toLowerCase() === k))
    .filter(Boolean);

  if (kategorieRaw && wpisane.length === 0) {
    console.warn('   ⚠️  Nie rozpoznano żadnej kategorii — zostają dotychczasowe.');
  }

  return { opis, kategorie: wpisane.length > 0 ? wpisane : obecne.kategorie };
}

// --- Wgrywanie do R2 ---
async function wgrajDoR2(sciezkaLokalna, kluczR2) {
  const dane = await readFile(sciezkaLokalna);
  const contentType = kluczR2.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  await pobierzKlienta().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: kluczR2,
      Body: dane,
      ContentType: contentType,
    })
  );
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
      const { opis, kategorie } = await zapytajOpisIKategorie();

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
    const { opis, kategorie } = await zapytajOpisIKategorie({
      opis: w.opis ?? '',
      kategorie: parsujKategorie(w.kategorie),
    });
    aktualizuj.run(opis, JSON.stringify(kategorie), w.id);
    console.log('   ✅ Zapisano.');
  }
  console.log('');
}

// --- Plik src/data/galeria.json — to z niego korzysta strona ---
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
  console.log(`📄 Zapisano ${JSON_PATH} (${lista.length} zdjęć). Pamiętaj o commicie tego pliku.`);
}

// --- Główna logika ---
async function main() {
  console.log('🚀 sync-images — synchronizacja zdjęć z Cloudflare R2 + SQLite\n');

  const trybUzupelnij = process.argv.includes('--uzupelnij');
  const db = initDb();

  try {
    await odtworzZJsonJesliPusta(db);
    await odswiezWymiary(db);

    if (trybUzupelnij) {
      await uzupelnijOpisy(db);
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
