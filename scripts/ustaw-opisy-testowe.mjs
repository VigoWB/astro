#!/usr/bin/env node
/**
 * ustaw-opisy-testowe.mjs — JEDNORAZOWY skrypt.
 *
 * Wpisuje opisy i kategorie do 9 testowych zdjęć, które są już w bazie
 * (data/galeria.db). Opisy są testowe — gdy dodasz prawdziwe zdjęcia,
 * ten plik możesz po prostu usunąć.
 *
 * Uruchomienie (raz):  node scripts/ustaw-opisy-testowe.mjs
 * Potem:               npm run sync-images   (odświeży plik src/data/galeria.json)
 */

import { DatabaseSync } from 'node:sqlite';

const OPISY = {
  'DSC_1111.jpg': { opis: 'Portret w zielonej tonacji', kategorie: ['Portrety'] },
  'DSC_1112.jpg': { opis: 'Portret w zielonym świetle, ujęcie z pracowni', kategorie: ['Portrety', 'Pracownia'] },
  'DSC_1113.jpg': { opis: 'Portret w fioletowej tonacji', kategorie: ['Portrety'] },
  'DSC_1114.jpg': { opis: 'Kwadratowy kadr z pracowni w zieleni', kategorie: ['Pracownia'] },
  'DSC_1115.jpg': { opis: 'Kwadratowy kadr z pracowni, druga wersja w zieleni', kategorie: ['Pracownia'] },
  'DSC_1116.jpg': { opis: 'Kwadratowy kadr z pracowni w fiolecie', kategorie: ['Pracownia'] },
  'DSC_4968-Edytuj.jpg': { opis: 'Autoportret z kotem', kategorie: ['Portrety', 'Przyroda'] },
  'DSC_4971-Edytuj.jpg': { opis: 'Portret w stylizacji filmowej', kategorie: ['Portrety'] },
  'DSC_4975-Edytuj.jpg': { opis: 'Kadr z pracowni w stylizacji filmowej', kategorie: ['Pracownia'] },
};

const db = new DatabaseSync('data/galeria.db');
const aktualizuj = db.prepare('UPDATE zdjecia SET opis = ?, kategorie = ? WHERE nazwa_pliku = ?');

let zaktualizowano = 0;
for (const [nazwaPliku, dane] of Object.entries(OPISY)) {
  const wynik = aktualizuj.run(dane.opis, JSON.stringify(dane.kategorie), nazwaPliku);
  if (wynik.changes === 0) {
    console.warn(`⚠️  Nie znaleziono w bazie: ${nazwaPliku}`);
  } else {
    zaktualizowano++;
  }
}

db.close();
console.log(`✅ Zaktualizowano ${zaktualizowano} z ${Object.keys(OPISY).length} zdjęć.`);
console.log('   Teraz uruchom:  npm run sync-images');
