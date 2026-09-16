import Database from 'better-sqlite3';
import exifr from 'exifr';
import * as fs from 'fs';
import readline from 'readline';

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;

if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
  console.error('Brak zmiennych R2_*. Skopiuj .env.example do .env.');
  process.exit(1);
}

// Import AWS SDK - domyślny eksport
const s3 = new (await import('@aws-sdk/client-s3')).createClient({
  region: 'auto',
  endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey }
});

const KATEGORIE = ['Portrety', 'Pracownia', 'Przyroda'];

function initDB() {
  const db = new Database('data/galeria.db', { readonly: false });
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

function getWgrano(db) {
  const rows = db.all('SELECT nazwa_pliku FROM zdjecia');
  return new Set(rows.map(r => r.nazwa_pliku));
}

async function pobierzDane(plik) {
  const wyniki = { exif: {}, wymiary: { szerokosc: 0, wysokosc: 0 } };
  try {
    const exif = exifr.parse(plik);
    wyniki.exif = { iso: exif.ISO ?? null, przyslona: exif.FNumber ? parseFloat(exif.FNumber) : null, ogniskowa: exif.FocalLength ? parseFloat(exif.FocalLength) : null, czas_naswietlania: exif.ExposureTime ?? null, data_wykonania: exif.CreateDate ?? null };
  } catch (e) { console.warn('EXIF blad:', plik); }
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { wyniki.wymiary = { szerokosc: img.width, wysokosc: img.height }; resolve(wyniki); };
    img.onerror = () => resolve(wyniki);
    img.src = 'file://' + plik;
  });
}

function zapytajTerminal(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function main() {
  console.log('Rozpoczynanie sync-images...\n');
  const db = initDB();
  const wgrano = getWgrano(db);

  const imagesDir = 'images';
  try {
    const wszystkiePliki = fs.readdirSync(imagesDir);
    const nowePliki = wszystkiePliki.filter(f => f.startsWith('DSC_') && !f.startsWith('przed_'));

    if (nowePliki.length === 0) {
      console.log('Brak nowych zdjec do wgrania.');
      db.close();
      return;
    }

    const dodano = [];
    const pominięto = [];

    for (const nazwaPliku of nowePliki) {
      if (wgrano.has(nazwaPliku)) {
        pominięto.push(nazwaPliku);
        console.log('Pominieto:' + nazwaPliku + ' (juz w bazie)');
        continue;
      }

      const sciezkaPo = resolve(imagesDir, nazwaPliku);
      const sciezkaPrzed = resolve(imagesDir, 'przed_' + nazwaPliku);
      const czyIstniejePrzed = fs.existsSync(sciezkaPrzed);

      const dane = await pobierzDane(sciezkaPo);
      const opis = await zapytajTerminal('Podaj opis (Enter = puste): ');
      console.log('Kategorie:', KATEGORIE.join(', '));
      const kategorieInput = await zapytajTerminal('Wybierz kategorie (Enter = wszystkie): ');
      const kategorie = kategorieInput.trim() ? kategorieInput.split(',').map(k => k.trim()).filter(k => KATEGORIE.includes(k)) : [...KATEGORIE];
      const kategorieString = JSON.stringify(kategorie);

      const r2KeyPo = 'zdjecia/' + nazwaPliku;
      const r2KeyPrzed = czyIstniejePrzed ? 'zdjecia/przed_' + nazwaPliku : null;

      try {
        const dataPo = await readFile(sciezkaPo);
        await s3.putObject({ Bucket: r2BucketName, Key: r2KeyPo, Body: dataPo, ContentType: 'image/jpeg' });

        let r2KeyPrzedFinal = null;
        if (czyIstniejePrzed) {
          const dataPrzed = await readFile(sciezkaPrzed);
          await s3.putObject({ Bucket: r2BucketName, Key: r2KeyPrzed, Body: dataPrzed, ContentType: 'image/jpeg' });
          r2KeyPrzedFinal = r2KeyPrzed;
        }

        const stmt = db.prepare('INSERT INTO zdjecia (nazwa_pliku, nazwa_pliku_przed, opis, kategorie, szerokosc, wysokosc, iso, przyslona, ogniskowa, czas_naswietlania, data_wykonania, r2_klucz, r2_klucz_przed, wgrano_o) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
        stmt.run([nazwaPliku, r2KeyPrzedFinal, opis || '', kategorieString, dane.wymiary.szerokosc, dane.wymiary.wysokosc, dane.exif.iso, dane.exif.przyslona, dane.exif.ogniskowa, dane.exif.czas_naswietlania, dane.exif.data_wykonania, r2KeyPo, r2KeyPrzedFinal]);

        dodano.push(nazwaPliku);
        console.log('Wgrano:' + nazwaPliku);
      } catch (err) {
        console.error('Błąd' + nazwaPliku + ':' + err.message);
        pominięto.push(nazwaPliku);
      }
    }

    console.log('Podsumowanie:');
    console.log('Dodano: ' + dodano.length + ' zdjec');
    console.log('Pominięto: ' + pominięto.length + ' zdjec');
    db.close();
  } catch (err) {
    console.error('Blad czytania katalogu:', err.message);
    db.close();
    process.exit(1);
  }
}

main().catch(err => { console.error('Krytyczny blad:', err); process.exit(1); });
