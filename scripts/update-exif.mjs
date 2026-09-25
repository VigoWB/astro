#!/usr/bin/env node
/**
 * Aktualizuje EXIF w bazie dla zdjęć, które mają wersję "przed".
 * Czyta EXIF z pliku "przed" (oryginał z aparatu) zamiast "po".
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const IMAGES_DIR = 'images';
const DB_PATH = 'data/galeria.db';
const JSON_PATH = 'src/data/galeria.json';

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

function parsujKategorie(tekst) {
  try {
    const wynik = JSON.parse(tekst ?? '[]');
    return Array.isArray(wynik) ? wynik : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log('🔧 Aktualizacja EXIF z plików "przed"...');

  const db = new DatabaseSync(DB_PATH);

  try {
    // Dodaj kolumny jeśli nie istnieją (dla istniejących baz)
    try { db.exec(`ALTER TABLE zdjecia ADD COLUMN make TEXT;`); } catch {}
    try { db.exec(`ALTER TABLE zdjecia ADD COLUMN model TEXT;`); } catch {}
    try { db.exec(`ALTER TABLE zdjecia ADD COLUMN lens_model TEXT;`); } catch {}

    // Pobierz wszystkie zdjęcia, które mają wersję "przed"
    const wiersze = db.prepare(`
      SELECT id, nazwa_pliku, nazwa_pliku_przed, iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, make, model, lens_model
      FROM zdjecia
      WHERE nazwa_pliku_przed IS NOT NULL
    `).all();

    const aktualizuj = db.prepare(`
      UPDATE zdjecia
      SET iso = ?, przyslona = ?, ogniskowa = ?, czas_naswietlania = ?, data_wykonania = ?, make = ?, model = ?, lens_model = ?
      WHERE id = ?
    `);

    let zaktualizowano = 0;

    for (const w of wiersze) {
      const sciezkaPrzed = `${IMAGES_DIR}/${w.nazwa_pliku_przed}`;

      if (!existsSync(sciezkaPrzed)) {
        console.warn(`⚠️  Brak pliku "przed": ${sciezkaPrzed}`);
        continue;
      }

      const exif = await pobierzExif(sciezkaPrzed);

      // Sprawdź czy dane się zmieniły
      const staryIso = w.iso;
      const staraPrzyslona = w.przyslona;
      const staraOgniskowa = w.ogniskowa;
      const staryCzas = w.czas_naswietlania;
      const staraData = w.data_wykonania;
      const staryMake = w.make;
      const staryModel = w.model;
      const staryLensModel = w.lens_model;

      if (
        exif.iso !== staryIso ||
        exif.przyslona !== staraPrzyslona ||
        exif.ogniskowa !== staraOgniskowa ||
        exif.czas_naswietlania !== staryCzas ||
        exif.data_wykonania !== staraData ||
        exif.make !== staryMake ||
        exif.model !== staryModel ||
        exif.lens_model !== staryLensModel
      ) {
        aktualizuj.run(
          exif.iso,
          exif.przyslona,
          exif.ogniskowa,
          exif.czas_naswietlania,
          exif.data_wykonania,
          exif.make,
          exif.model,
          exif.lens_model,
          w.id
        );
        console.log(`✅ ${w.nazwa_pliku}: ISO ${exif.iso} • f/${exif.przyslona} • ${exif.ogniskowa}mm • ${exif.czas_naswietlania}s • ${exif.make} ${exif.model} • ${exif.lens_model}`);
        zaktualizowano++;
      } else {
        console.log(`⏭️  ${w.nazwa_pliku}: bez zmian`);
      }
    }

    console.log(`\n📊 Zaktualizowano ${zaktualizowano} z ${wiersze.length} zdjęć z wersją "przed".`);

    // Wygeneruj nowy galeria.json
    const wszystkie = db.prepare('SELECT * FROM zdjecia ORDER BY nazwa_pliku').all();

    const lista = wszystkie.map((w) => {
      return {
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
      };
    });

    await mkdir(dirname(JSON_PATH), { recursive: true });
    await writeFile(JSON_PATH, JSON.stringify(lista, null, 2) + '\n', 'utf8');
    console.log(`📄 Zapisano ${JSON_PATH} (${lista.length} zdjęć).`);

  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('❌ Błąd:', err.message);
  process.exit(1);
});