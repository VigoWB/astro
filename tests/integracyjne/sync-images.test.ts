import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import exifr from "exifr";
import piexif from "piexifjs";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import {
	listaZBazy,
	tekstGalerii,
	wczytajListe,
	wyczyscExifDoR2,
	zapiszListeWBazie,
} from "../../scripts/sync-images-funkcje.mjs";

// Funkcje sync-images razem z prawdziwymi bibliotekami: czyszczenie EXIF-u na prawdziwym JPG
// (sharp + piexifjs + exifr) i obieg galeria.json → baza SQLite → galeria.json.
// Baza jest w pamięci (":memory:") — test nie dotyka data/galeria.db, src/data/galeria.json ani R2.

// --- Czyszczenie EXIF-u ---

async function jpegBezExif() {
	return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 140, b: 90 } } })
		.jpeg()
		.toBuffer();
}

// Zdjęcie jak z aparatu: model, obiektyw, data, numery seryjne, MakerNote i GPS (Poznań).
async function jpegZExif() {
	const exif = {
		"0th": {
			[piexif.ImageIFD.Make]: "NIKON CORPORATION",
			[piexif.ImageIFD.Model]: "NIKON D7500",
		},
		Exif: {
			[piexif.ExifIFD.DateTimeOriginal]: "2026:10:26 12:00:00",
			[piexif.ExifIFD.LensModel]: "50.0 mm f/1.4",
			[piexif.ExifIFD.BodySerialNumber]: "SERIAL-AB12CD",
			[piexif.ExifIFD.LensSerialNumber]: "OBIEKTYW-998877",
			[piexif.ExifIFD.MakerNote]: "MAKERNOTE-SEKRET",
		},
		GPS: {
			[piexif.GPSIFD.GPSLatitudeRef]: "N",
			[piexif.GPSIFD.GPSLatitude]: [
				[52, 1],
				[24, 1],
				[0, 1],
			],
			[piexif.GPSIFD.GPSLongitudeRef]: "E",
			[piexif.GPSIFD.GPSLongitude]: [
				[16, 1],
				[55, 1],
				[0, 1],
			],
		},
	};
	const binarny = (await jpegBezExif()).toString("binary");
	return Buffer.from(piexif.insert(piexif.dump(exif), binarny), "binary");
}

const piksele = (bufor: Buffer) => sharp(bufor).raw().toBuffer();

describe("wyczyscExifDoR2()", () => {
	test("zdjęcie testowe naprawdę ma GPS i numery seryjne", async () => {
		const bufor = await jpegZExif();
		const dane = await exifr.parse(bufor, { gps: true });
		expect(dane.latitude).toBeCloseTo(52.4, 1);
		expect(bufor.includes("SERIAL-AB12CD")).toBe(true);
		expect(bufor.includes("OBIEKTYW-998877")).toBe(true);
		expect(bufor.includes("MAKERNOTE-SEKRET")).toBe(true);
	});

	test("usuwa GPS, numery seryjne i MakerNote, reszta EXIF-u zostaje", async () => {
		const wynik = wyczyscExifDoR2(await jpegZExif(), "zdjecia/DSC_1.jpg");
		const dane = await exifr.parse(wynik, { gps: true });

		expect(dane.latitude).toBeUndefined();
		expect(dane.longitude).toBeUndefined();
		expect(wynik.includes("SERIAL-AB12CD")).toBe(false);
		expect(wynik.includes("OBIEKTYW-998877")).toBe(false);
		expect(wynik.includes("MAKERNOTE-SEKRET")).toBe(false);

		expect(dane.Make).toBe("NIKON CORPORATION");
		expect(dane.Model).toBe("NIKON D7500");
		expect(dane.LensModel).toBe("50.0 mm f/1.4");
		expect(new Date(dane.DateTimeOriginal).getFullYear()).toBe(2026);
	});

	test("nie kompresuje zdjęcia drugi raz (piksele bez zmian)", async () => {
		const bufor = await jpegZExif();
		const wynik = wyczyscExifDoR2(bufor, "zdjecia/DSC_1.jpg");
		expect((await piksele(wynik)).equals(await piksele(bufor))).toBe(true);
	});

	test("czyści też plik .JPG wielkimi literami", async () => {
		const wynik = wyczyscExifDoR2(await jpegZExif(), "zdjecia/DSC_1.JPG");
		expect(wynik.includes("SERIAL-AB12CD")).toBe(false);
		expect((await exifr.parse(wynik, { gps: true })).latitude).toBeUndefined();
	});

	test("JPEG bez EXIF-u przechodzi bez błędu", async () => {
		const wynik = wyczyscExifDoR2(await jpegBezExif(), "zdjecia/DSC_1.jpg");
		const meta = await sharp(wynik).metadata();
		expect(meta.width).toBe(64);
		expect(meta.height).toBe(48);
	});

	test("PNG zwraca bez zmian", async () => {
		const bufor = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();
		expect(wyczyscExifDoR2(bufor, "zdjecia/DSC_2.png")).toBe(bufor);
	});

	test("uszkodzonego pliku nie wysyła", () => {
		expect(() => wyczyscExifDoR2(Buffer.from("to nie jest jpeg"), "zdjecia/DSC_1.jpg")).toThrow("nie wysyłam pliku");
	});
});

// --- Obieg galeria.json → baza → galeria.json ---

const SCIEZKA = "src/data/galeria.json"; // tylko do komunikatów błędów — pliku nie czytamy

function exif(zmiany: Record<string, unknown> = {}) {
	return {
		iso: null,
		przyslona: null,
		ogniskowa: null,
		czasNaswietlania: null,
		dataWykonania: null,
		make: null,
		model: null,
		lensModel: null,
		...zmiany,
	};
}

// Trzy zdjęcia w układzie pól jak w src/data/galeria.json, posortowane po nazwie (tak jak eksport).
const LISTA_Z_GITA = [
	{
		nazwaPliku: "DSC_0001.jpg",
		opis: 'Złoty zegarek „na białym” & pasek "skórzany"',
		kategorie: ["Zegarki", "Biżuteria"],
		szerokosc: 3000,
		wysokosc: 2000,
		klucz: "zdjecia/DSC_0001.jpg",
		kluczPrzed: "zdjecia/przed_DSC_0001.jpg",
		wyroznione: true,
		paraSuwaka: false,
		exif: exif({
			iso: 100,
			przyslona: 5.6,
			ogniskowa: 50,
			czasNaswietlania: 0.004,
			dataWykonania: "2026-10-26T12:00:00.000Z",
			make: "NIKON CORPORATION",
			model: "NIKON D7500",
			lensModel: "50.0 mm f/1.4",
		}),
	},
	{
		nazwaPliku: "październik_26_EDYCJA_DSC7102.jpg",
		opis: "Pierścionek",
		kategorie: ["Biżuteria"],
		szerokosc: 2000,
		wysokosc: 2000,
		klucz: "zdjecia/październik_26_EDYCJA_DSC7102.jpg",
		kluczPrzed: "zdjecia/październik_26_PRZED_DSC7102.jpg",
		wyroznione: false,
		paraSuwaka: true,
		exif: exif({ iso: 200 }),
	},
	{
		nazwaPliku: "wrzesień_26_EDYCJA_DSC7062.jpg",
		opis: "",
		kategorie: [],
		szerokosc: null,
		wysokosc: null,
		klucz: "zdjecia/wrzesień_26_EDYCJA_DSC7062.jpg",
		kluczPrzed: null,
		wyroznione: false,
		paraSuwaka: false,
		exif: exif(),
	},
];

function obieg(tekst: string, db = new DatabaseSync(":memory:")) {
	zapiszListeWBazie(db, wczytajListe(tekst, SCIEZKA), SCIEZKA);
	return { db, tekst: tekstGalerii(listaZBazy(db)) };
}

describe("obieg galeria.json → baza → galeria.json", () => {
	test("plik w formacie z gita wraca identyczny co do znaku", () => {
		const tekst = JSON.stringify(LISTA_Z_GITA, null, 2) + "\n";
		expect(obieg(tekst).tekst).toBe(tekst);
	});

	test("nazwa przed w bazie pochodzi z klucza", () => {
		const { db } = obieg(JSON.stringify(LISTA_Z_GITA));
		const wiersz = db
			.prepare("SELECT nazwa_pliku_przed FROM zdjecia WHERE nazwa_pliku = ?")
			.get("październik_26_EDYCJA_DSC7102.jpg") as { nazwa_pliku_przed: string };
		expect(wiersz.nazwa_pliku_przed).toBe("październik_26_PRZED_DSC7102.jpg");
	});

	test("tests/dane/galeria.json: dane bez strat, drugi obieg identyczny", () => {
		const tekst = readFileSync(new URL("../dane/galeria.json", import.meta.url), "utf8");
		const dane: { nazwaPliku: string }[] = JSON.parse(tekst);
		// Eksport sortuje po nazwie (SQLite porównuje bajty UTF-8, „<” znaki UTF-16 — dla tych nazw to ta sama kolejność).
		const posortowane = [...dane].sort((a, b) => (a.nazwaPliku < b.nazwaPliku ? -1 : a.nazwaPliku > b.nazwaPliku ? 1 : 0));

		const pierwszy = obieg(tekst).tekst;
		expect(JSON.parse(pierwszy)).toEqual(posortowane);
		expect(obieg(pierwszy).tekst).toBe(pierwszy);
	});

	test("zastępuje starą bazę z innego komputera", () => {
		const db = new DatabaseSync(":memory:");
		db.exec("CREATE TABLE zdjecia (id INTEGER PRIMARY KEY, nazwa_pliku TEXT)");
		db.prepare("INSERT INTO zdjecia (nazwa_pliku) VALUES (?)").run("STARE_DSC_9999.jpg");

		zapiszListeWBazie(db, LISTA_Z_GITA, SCIEZKA);
		expect(listaZBazy(db)).toEqual(LISTA_Z_GITA);
	});

	test("błąd w połowie zostawia poprzednią bazę", () => {
		const { db } = obieg(JSON.stringify(LISTA_Z_GITA));
		const zPowtorzeniem = [LISTA_Z_GITA[0], LISTA_Z_GITA[1], LISTA_Z_GITA[0]];

		expect(() => zapiszListeWBazie(db, zPowtorzeniem, SCIEZKA)).toThrow("Nie udało się odtworzyć bazy");
		expect(listaZBazy(db)).toEqual(LISTA_Z_GITA);
	});
});

describe("wczytajListe()", () => {
	test("działa z BOM", () => {
		expect(wczytajListe("\uFEFF" + JSON.stringify(LISTA_Z_GITA), SCIEZKA)).toEqual(LISTA_Z_GITA);
	});

	test("konflikt gita to nie JSON", () => {
		expect(() => wczytajListe("<<<<<<< HEAD\n[]\n=======\n[]\n>>>>>>> main\n", SCIEZKA)).toThrow(
			"nie jest poprawnym JSON-em"
		);
	});

	test.each([
		["kategorie jako tekst", [{ nazwaPliku: "DSC_1.jpg", kategorie: "Zegarki" }]],
		["brak nazwaPliku", [{ opis: "bez nazwy" }]],
		["obiekt zamiast listy", { nazwaPliku: "DSC_1.jpg" }],
	])("nieoczekiwany format: %s", (_, dane) => {
		expect(() => wczytajListe(JSON.stringify(dane), SCIEZKA)).toThrow("nieoczekiwany format");
	});
});
