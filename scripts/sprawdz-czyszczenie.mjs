#!/usr/bin/env node
/**
 * sprawdz-czyszczenie.mjs
 *
 * Pokazuje, co czyszczenie z sync-images zostawi w zdjęciach z images/, ZANIM trafią do R2
 * (np. przed `npm run sync-images -- --podmien`). Przy każdym pliku: segmenty przed i po
 * czyszczeniu, GPS przed i po, pola EXIF, które zostaną, i czy piksele i obrót są bez zmian.
 *
 * Tylko czyta: nie łączy się z R2, nie używa .env i niczego nie zapisuje. Uruchamia go tylko
 * Wiktor (czyta zdjęcia z images/), z folderu projektu:
 *   node scripts/sprawdz-czyszczenie.mjs                — wszystkie JPG z images/ (bez ukrytych)
 *   node scripts/sprawdz-czyszczenie.mjs DSC_6910.jpg   — jeden plik z images/ (albo ścieżka do pliku)
 *
 * Kod wyjścia 1 = są problemy (tych zdjęć nie podmieniaj) albo nie było czego sprawdzić.
 * Logika jest w scripts/sync-images-funkcje.mjs i tam ma testy; tu tylko pętla i wypisywanie.
 * Test w tests/jednostkowe/sync-images.test.ts czyta ten plik jako tekst i pilnuje, że niczego
 * nie wysyła ani nie zapisuje.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import exifr from 'exifr';
import { dekoderPikseli, podsumowanieSprawdzenia, sprawdzCzyszczenie, wybierzZdjecia } from './sync-images-funkcje.mjs';

const IMAGES_DIR = 'images';

// Bez nazw plików: wszystkie JPG z images/ (te same, które widzi sync-images, razem z plikami "przed").
const argumenty = process.argv.slice(2);
const sciezki =
  argumenty.length > 0
    ? argumenty.map((plik) => (existsSync(plik) ? plik : join(IMAGES_DIR, plik)))
    : wybierzZdjecia(existsSync(IMAGES_DIR) ? readdirSync(IMAGES_DIR) : []).zdjecia.map((plik) => join(IMAGES_DIR, plik));

const dekoduj = dekoderPikseli(sharp);
let problemy = 0;

for (const sciezka of sciezki) {
  console.log(`\n=== ${basename(sciezka)}`);
  if (!existsSync(sciezka)) {
    console.log(`Błąd: nie ma pliku ${sciezka}`);
    problemy++;
    continue;
  }
  const { linie, problem } = await sprawdzCzyszczenie(readFileSync(sciezka), basename(sciezka), { dekoduj, exifr });
  for (const linia of linie) console.log(linia);
  if (problem) problemy++;
}

const { tekst, kodWyjscia } = podsumowanieSprawdzenia(sciezki.length, problemy);
console.log(`\n${tekst}`);
process.exitCode = kodWyjscia;
