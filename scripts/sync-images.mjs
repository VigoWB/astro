#!/usr/bin/env node
/**
 * sync-images.mjs
 *
 * Skanuje folder images/ w poszukiwaniu nowych zdjęć (DSC_*.jpg, bez "przed_"),
 * wyciąga EXIF i wymiary, pyta o opis i kategorie w terminalu,
 * wgrywa pliki (po + opcjonalnie przed) do Cloudflare R2,
 * i zapisuje metadane w lokalnej bazie SQLite (data/galeria.db).
 *
 * Uruchomienie: npm run sync-images
 */

import { DatabaseSync } from 'node:sqlite';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import readline from 'node:readline';

const IMAGES_DIR = 'images';
const DB_PATH = 'data/galeria.db';
const KATEGORIE = ['Portrety', 'Pracownia', 'Przyroda'];

// --- Walidacja zmiennych środowiskowych R2 ---
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('❌ Brak wymaganych zmiennych środowiskowych R2_*.');
  console.error('   Skopiuj .env.example do .env i wypełnij: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.');
  process.exit(1);
}

// --- Klient S3 (Cloudflare R2 jest S3-kompatybilne) ---
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// --- Baza SQLite (wbudowana w Node 22.5+) ---
function initDb() {
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

// --- EXIF + wymiary obrazka (bez zależności od DOM/Image, czytamy nagłówek JPEG) ---
async function pobierzExif(sciezka) {
  const exifr = (await import('exifr')).default;
  let exif = {};
  try {
    exif = (await exifr.parse(sciezka, { pick: ['ISO', 'FNumber', 'FocalLength', 'ExposureTime', 'CreateDate', 'ExifImageWidth', 'ExifImageHeight'] })) ?? {};
  } catch {
    console.warn('⚠️  Nie udało się odczytać EXIF dla:', sciezka);
  }
  return {
    iso: exif.ISO ?? null,
    przyslona: exif.FNumber ? Number(exif.FNumber) : null,
    ogniskowa: exif.FocalLength ? Number(exif.FocalLength) : null,
    czas_naswietlania: exif.ExposureTime ?? null,
    data_wykonania: exif.CreateDate ? new Date(exif.CreateDate).toISOString() : null,
    szerokosc: exif.ExifImageWidth ?? null,
    wysokosc: exif.ExifImageHeight ?? null,
  };
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

async function zapytajOpisIKategorie() {
  const opis = await zapytaj('   Opis zdjęcia (Enter = puste): ');
  console.log(`   Dostępne kategorie: ${KATEGORIE.join(', ')}`);
  const kategorieRaw = await zapytaj('   Kategorie (oddziel przecinkiem, Enter = puste do uzupełnienia później): ');

  const kategorie = kategorieRaw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => KATEGORIE.includes(k));

  return { opis, kategorie };
}

// --- Wgrywanie do R2 ---
async function wgrajDoR2(sciezkaLokalna, kluczR2) {
  const dane = await readFile(sciezkaLokalna);
  const contentType = kluczR2.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: kluczR2,
      Body: dane,
      ContentType: contentType,
    })
  );
}

// --- Główna logika ---
async function main() {
  console.log('🚀 sync-images — synchronizacja zdjęć z Cloudflare R2 + SQLite\n');

  if (!existsSync(IMAGES_DIR)) {
    console.error(`❌ Folder ${IMAGES_DIR}/ nie istnieje.`);
    process.exit(1);
  }

  const db = initDb();
  const wgrane = pobierzWgrane(db);

  const wszystkiePliki = await readdir(IMAGES_DIR);
  const noweKandydaci = wszystkiePliki
    .filter((f) => f.startsWith('DSC_') && !f.startsWith('przed_'))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();

  const doWgrania = noweKandydaci.filter((f) => !wgrane.has(f));
  const jużWgrane = noweKandydaci.length - doWgrania.length;

  if (doWgrania.length === 0) {
    console.log(`✅ Brak nowych zdjęć do wgrania. (${jużWgrane} już w bazie, 0 nowych)`);
    db.close();
    rl.close();
    return;
  }

  console.log(`📦 Znaleziono ${doWgrania.length} nowych zdjęć (pominięto ${jużWgrane} już wgranych).\n`);

  const insertStmt = db.prepare(`
    INSERT INTO zdjecia
      (nazwa_pliku, nazwa_pliku_przed, opis, kategorie, szerokosc, wysokosc,
       iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, r2_klucz, r2_klucz_przed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      const exif = await pobierzExif(sciezkaPo);
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
        nazwaPrzed && maWersjePrzed ? nazwaPrzed : null,
        opis,
        JSON.stringify(kategorie),
        exif.szerokosc,
        exif.wysokosc,
        exif.iso,
        exif.przyslona,
        exif.ogniskowa,
        exif.czas_naswietlania,
        exif.data_wykonania,
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

  db.close();
  rl.close();

  console.log('\n' + '─'.repeat(40));
  console.log('📊 Podsumowanie:');
  console.log(`   Dodano:    ${dodanoLiczba}`);
  console.log(`   Pominięto: ${pominietoLiczba + jużWgrane} (${pominietoLiczba} błędy, ${jużWgrane} już w bazie)`);
  console.log('─'.repeat(40) + '\n');
}

main().catch((err) => {
  console.error('❌ Błąd krytyczny:', err.message);
  process.exit(1);
});
