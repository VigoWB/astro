import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { imageMetadata } from "astro/assets/utils";
import exifr from "exifr";
import piexif from "piexifjs";
import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";
import {
	dekoderPikseli,
	listaZBazy,
	pikseleIObrotBezZmian,
	plikiDoWgrania,
	segmentyJpeg,
	sprawdzCzyszczenie,
	tekstGalerii,
	wczytajListe,
	wyczyscExifDoR2,
	zapiszListeWBazie,
} from "../../scripts/sync-images-funkcje.mjs";

// Funkcje sync-images razem z prawdziwymi bibliotekami: czyszczenie plików do R2 na prawdziwych JPG-ach
// (sharp + piexifjs + exifr) i obieg galeria.json → baza SQLite → galeria.json.
// Baza jest w pamięci (":memory:") — test nie dotyka data/galeria.db, src/data/galeria.json ani R2.

// --- Pliki testowe do czyszczenia ---
// Składane z sharp (obraz), piexifjs (EXIF) i ręcznie doklejonych segmentów. W każdym polu, które ma
// zniknąć, leży napis-wartownik — po czyszczeniu żadnego nie może być w pliku. Bajty zapisane kodami.

const KLUCZ = "zdjecia/DSC_1.jpg";

const WARTOWNICY = [
	"SERIAL-AB12CD", // BodySerialNumber
	"OBIEKTYW-998877", // LensSerialNumber
	"SERIAL-DNG-C62F", // CameraSerialNumber
	"MAKERNOTE-SEKRET", // MakerNote
	"WLASCICIEL-JAN", // CameraOwnerName
	"UNIKALNE-ID-42", // ImageUniqueID
	"AUTOR-ARTIST", // Artist
	"PRAWA-COPYRIGHT", // Copyright
	"KOMENTARZ-USERCOMMENT", // UserComment
	"OPIS-IMAGEDESCRIPTION", // ImageDescription
	"KOMPUTER-HOST", // HostComputer
	"PROGRAM-SOFTWARE", // Software
	"2026:10:27 10:00:00", // DateTime (data zapisu przez program)
	"MINIATURA-EXIF", // miniatura z 1st IFD
	"XMP-SERIAL-777", // XMP: aux:SerialNumber
	"XMP-AUTOR", // XMP: dc:creator
	"XMP-ROZSZERZONY", // rozszerzony XMP
	"IPTC-AUTOR", // IPTC: By-line
	"IPTC-MIASTO", // IPTC: City
	"KOMENTARZ-COM", // COM
	"MPF-DANE", // APP2 MPF
	"C2PA-MANIFEST", // APP11 (Content Credentials)
	"MINIATURA-JFXX", // APP0 JFXX
	"PODGLAD-PO-EOI", // drugi JPEG doklejony za końcem obrazu (podgląd z aparatu)
	"MOTION-PHOTO", // film doklejony za końcem obrazu (Motion Photo z telefonu)
];

// Pola z białej listy pod nazwami z exifr (posortowane).
const POLA_EXIFR = {
	ifd0: ["Make", "Model", "Orientation"],
	exif: ["CreateDate", "DateTimeOriginal", "ExposureTime", "FNumber", "FocalLength", "ISO", "LensInfo", "LensMake", "LensModel"],
};

const SEGMENTY_Z_LISTY = /^(SOI|APP0 JFIF|APP1 Exif|APP2 ICC_PROFILE|APP14 Adobe|DQT|DHT|DRI|DAC|DNL|SOF\d+|SOS|EOI)$/;

const binarnie = (b: Buffer) => b.toString("binary");
const zBinarnego = (s: string) => Buffer.from(s, "binary");
const zExif = (jpeg: Buffer, exif: object) => zBinarnego(piexif.insert(piexif.dump(exif), binarnie(jpeg)));

function segment(znacznik: number, dane: Buffer | string): Buffer {
	const d = typeof dane === "string" ? Buffer.from(dane, "latin1") : dane;
	return Buffer.concat([Buffer.from([0xff, znacznik, (d.length + 2) >> 8, (d.length + 2) & 0xff]), d]);
}

const wstaw = (b: Buffer, pozycja: number, ...czesci: Buffer[]) =>
	Buffer.concat([b.subarray(0, pozycja), ...czesci, b.subarray(pozycja)]);

// Pozycja tuż za segmentami APPn na początku pliku (przed DQT).
function zaSegmentamiApp(b: Buffer): number {
	let i = 2;
	while (b[i] === 0xff && b[i + 1] >= 0xe0 && b[i + 1] <= 0xef) i += 2 + b.readUInt16BE(i + 2);
	return i;
}

// Pozycja pierwszego SOS — po długościach segmentów, bo miniatura w EXIF-ie też ma bajty FF DA.
function pierwszySos(b: Buffer): number {
	let i = 2;
	while (b[i + 1] !== 0xda) i += 2 + b.readUInt16BE(i + 2);
	return i;
}

// Obraz z gradientem i szumem: dużo bajtów FF w danych skanu i bogate tabele Huffmana.
function obraz(szerokosc: number, wysokosc: number, ziarno = 1) {
	const piksele = Buffer.alloc(szerokosc * wysokosc * 3);
	let s = ziarno;
	for (let i = 0; i < piksele.length; i += 3) {
		const x = (i / 3) % szerokosc;
		const y = Math.floor(i / 3 / szerokosc);
		s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
		const szum = (s >> 16) & 63;
		piksele[i] = ((x * 255) / szerokosc + szum) & 255;
		piksele[i + 1] = ((y * 255) / wysokosc + szum) & 255;
		piksele[i + 2] = ((x + y) & 255) ^ szum;
	}
	return sharp(piksele, { raw: { width: szerokosc, height: wysokosc, channels: 3 } });
}

const GPS_POZNAN = {
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
};

// XMP z GPS, numerem seryjnym i autorem — tak potrafi zapisać Lightroom.
const XMP =
	"http://ns.adobe.com/xap/1.0/\x00" +
	'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
	'<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:aux="http://ns.adobe.com/exif/1.0/aux/" ' +
	'xmlns:dc="http://purl.org/dc/elements/1.1/" exif:GPSLatitude="52,24.0N" exif:GPSLongitude="16,55.0E" aux:SerialNumber="XMP-SERIAL-777">' +
	"<dc:creator><rdf:Seq><rdf:li>XMP-AUTOR</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>";

function rozszerzonyXmp(): Buffer {
	const tresc = Buffer.from('<x:xmpmeta xmlns:x="adobe:ns:meta/"><!-- XMP-ROZSZERZONY --></x:xmpmeta>');
	const dlugosci = Buffer.alloc(8); // pełna długość rozszerzonego XMP i przesunięcie tej części
	dlugosci.writeUInt32BE(tresc.length, 0);
	return Buffer.concat([Buffer.from("http://ns.adobe.com/xmp/extension/\x00" + "0".repeat(32), "latin1"), dlugosci, tresc]);
}

// APP13 "Photoshop 3.0" z blokiem IPTC (8BIM 0x0404): autor (2:80) i miasto (2:90).
function iptc(): Buffer {
	const pole = (numer: number, tekst: string) =>
		Buffer.concat([Buffer.from([0x1c, 0x02, numer, 0x00, tekst.length]), Buffer.from(tekst)]);
	const dane = Buffer.concat([pole(80, "IPTC-AUTOR"), pole(90, "IPTC-MIASTO")]);
	const dlugosc = Buffer.alloc(4);
	dlugosc.writeUInt32BE(dane.length);
	return Buffer.concat([Buffer.from("Photoshop 3.0\x008BIM\x04\x04\x00\x00", "latin1"), dlugosc, dane, Buffer.alloc(dane.length % 2)]);
}

// Zdjęcie „jak z aparatu i Lightrooma naraz”: EXIF (MM) ze wszystkim, co ma zniknąć, JFIF z miniaturą,
// XMP, rozszerzony XMP, IPTC, COM, MPF, C2PA i JFXX, a za końcem obrazu podgląd z aparatu i „Motion Photo”.
async function zdjecieZAparatu({ progresywny = false, icc }: { progresywny?: boolean; icc?: string } = {}): Promise<Buffer> {
	let bazowy = obraz(320, 240);
	if (icc) bazowy = bazowy.withIccProfile(icc);
	const miniatura = wstaw(await obraz(16, 12, 7).jpeg().toBuffer(), 2, segment(0xfe, "MINIATURA-EXIF"));
	let plik = zExif(await bazowy.jpeg({ quality: 90, progressive: progresywny }).toBuffer(), {
		"0th": {
			[piexif.ImageIFD.Make]: "NIKON CORPORATION",
			[piexif.ImageIFD.Model]: "NIKON D7500",
			[piexif.ImageIFD.Orientation]: 6,
			[piexif.ImageIFD.XResolution]: [300, 1],
			[piexif.ImageIFD.YResolution]: [300, 1],
			[piexif.ImageIFD.ResolutionUnit]: 2,
			[piexif.ImageIFD.Software]: "PROGRAM-SOFTWARE",
			[piexif.ImageIFD.DateTime]: "2026:10:27 10:00:00",
			[piexif.ImageIFD.Artist]: "AUTOR-ARTIST",
			[piexif.ImageIFD.Copyright]: "PRAWA-COPYRIGHT",
			[piexif.ImageIFD.ImageDescription]: "OPIS-IMAGEDESCRIPTION",
			[piexif.ImageIFD.HostComputer]: "KOMPUTER-HOST",
			[piexif.ImageIFD.CameraSerialNumber]: "SERIAL-DNG-C62F",
		},
		Exif: {
			[piexif.ExifIFD.ExposureTime]: [1, 250],
			[piexif.ExifIFD.FNumber]: [56, 10],
			[piexif.ExifIFD.ISOSpeedRatings]: 200,
			[piexif.ExifIFD.DateTimeOriginal]: "2026:10:26 12:00:00",
			[piexif.ExifIFD.DateTimeDigitized]: "2026:10:26 12:00:00",
			[piexif.ExifIFD.FocalLength]: [50, 1],
			[piexif.ExifIFD.LensSpecification]: [
				[50, 1],
				[50, 1],
				[14, 10],
				[14, 10],
			],
			[piexif.ExifIFD.LensMake]: "NIKKOR", // 7 bajtów razem z zerem — następna wartość wymaga dopełnienia
			[piexif.ExifIFD.LensModel]: "50.0 mm f/1.4",
			[piexif.ExifIFD.BodySerialNumber]: "SERIAL-AB12CD",
			[piexif.ExifIFD.LensSerialNumber]: "OBIEKTYW-998877",
			[piexif.ExifIFD.CameraOwnerName]: "WLASCICIEL-JAN",
			[piexif.ExifIFD.ImageUniqueID]: "UNIKALNE-ID-42",
			[piexif.ExifIFD.UserComment]: "ASCII\x00\x00\x00KOMENTARZ-USERCOMMENT",
			[piexif.ExifIFD.MakerNote]: "MAKERNOTE-SEKRET",
		},
		GPS: GPS_POZNAN,
		Interop: { [piexif.InteropIFD.InteroperabilityIndex]: "R03" },
		"1st": { [piexif.ImageIFD.XResolution]: [72, 1], [piexif.ImageIFD.YResolution]: [72, 1], [piexif.ImageIFD.ResolutionUnit]: 2 },
		thumbnail: binarnie(miniatura),
	});
	// JFIF z miniaturą 2×1 (6 bajtów RGB) na samym początku, jak w starych programach.
	const jfif = Buffer.concat([Buffer.from("JFIF\x00\x01\x02\x01\x00\x48\x00\x48\x02\x01", "latin1"), Buffer.from([10, 20, 30, 40, 50, 60])]);
	plik = wstaw(plik, 2, segment(0xe0, jfif));
	const jfxx = Buffer.concat([
		Buffer.from("JFXX\x00\x10", "latin1"),
		wstaw(await obraz(8, 8, 3).jpeg().toBuffer(), 2, segment(0xfe, "MINIATURA-JFXX")),
	]);
	plik = wstaw(
		plik,
		zaSegmentamiApp(plik),
		segment(0xe1, XMP),
		segment(0xe1, rozszerzonyXmp()),
		segment(0xed, iptc()),
		segment(0xfe, "KOMENTARZ-COM"),
		segment(0xe2, "MPF\x00MM\x00\x2a\x00\x00\x00\x08MPF-DANE"),
		segment(0xeb, "JP\x00\x00\x00\x00\x00\x01C2PA-MANIFEST"),
		segment(0xe0, jfxx)
	);
	// Za końcem obrazu: podgląd z aparatu (drugi JPEG z własnym EXIF-em i GPS) i "Motion Photo" (MP4).
	const podglad = zExif(await obraz(32, 24, 5).jpeg().toBuffer(), { "0th": { [piexif.ImageIFD.Make]: "PODGLAD-PO-EOI" }, GPS: GPS_POZNAN });
	return Buffer.concat([plik, podglad, Buffer.from("\x00\x00\x00\x18ftypmp42MOTION-PHOTO", "latin1")]);
}

// Przed drugim SOS dodatkowa tabela DHT (nieużywana: AC nr 3) z bajtami FF D9 w danych.
function zTabelaFfD9MiedzySkanami(b: Buffer): Buffer {
	const drugiSos = b.indexOf(Buffer.from([0xff, 0xda]), pierwszySos(b) + 2);
	const bity = Buffer.alloc(16);
	bity[0] = 1; // jeden kod o długości 1
	bity[1] = 1; // jeden kod o długości 2
	return wstaw(b, drugiSos, segment(0xc4, Buffer.concat([Buffer.from([0x13]), bity, Buffer.from([0xff, 0xd9])])));
}

// EXIF w kolejności bajtów II (Intel: np. Canon, Samsung) złożony ręcznie — sharp.withExif() pomija Orientation.
// Wpisy celowo nie rosnąco, a wartości pod nieparzystymi offsetami: czyszczenie ma to poprawić.
function exifII(): Buffer {
	const t = Buffer.alloc(208);
	t.write("II", 0, "latin1");
	t.writeUInt16LE(42, 2);
	t.writeUInt32LE(8, 4);
	const wpis = (p: number, pole: number, typ: number, ile: number, wartosc: number) => {
		t.writeUInt16LE(pole, p);
		t.writeUInt16LE(typ, p + 2);
		t.writeUInt32LE(ile, p + 4);
		t.writeUInt32LE(wartosc, p + 8);
	};
	// IFD0 pod 8: 6 wpisów (do 85), wartości od 87.
	t.writeUInt16LE(6, 8);
	wpis(10, 0x0112, 3, 1, 6); // Orientation = 6
	wpis(22, 0x010f, 2, 6, 87); // Make
	wpis(34, 0x0110, 2, 15, 93); // Model
	wpis(46, 0x013b, 2, 13, 108); // Artist
	wpis(58, 0x8769, 4, 1, 122); // katalog Exif
	wpis(70, 0x8825, 4, 1, 190); // katalog GPS
	t.write("Canon\x00", 87, "latin1");
	t.write("EOS R6 Mark II\x00", 93, "latin1");
	t.write("AUTOR-ARTIST\x00", 108, "latin1");
	// Katalog Exif pod 122: 2 wpisy (do 151), wartości od 153.
	t.writeUInt16LE(2, 122);
	wpis(124, 0xa434, 2, 16, 153); // LensModel
	wpis(136, 0x9003, 2, 20, 169); // DateTimeOriginal
	t.write("RF50mm F1.8 STM\x00", 153, "latin1");
	t.write("2026:10:26 12:00:00\x00", 169, "latin1");
	// Katalog GPS pod 190: GPSLatitudeRef "N" (krótka wartość w samym wpisie).
	t.writeUInt16LE(1, 190);
	wpis(192, 0x0001, 2, 2, 0);
	t.write("N\x00", 200, "latin1");
	return Buffer.concat([Buffer.from("Exif\x00\x00", "latin1"), t]);
}

async function zdjecieZExifII(): Promise<Buffer> {
	return wstaw(await obraz(60, 40, 9).jpeg().toBuffer(), 2, segment(0xe1, exifII()));
}

// Mały JPEG złożony ręcznie: szary 16×8, 2 bloki, DRI = 1, więc w danych skanu jest znacznik RST0.
// Tabele Huffmana standardowe (luminancja, z normy JPEG).
function jpegZRst(): Buffer {
	const dqt = segment(0xdb, Buffer.from([0x00, ...Array<number>(64).fill(1)]));
	const sof = segment(0xc0, Buffer.from([8, 0, 8, 0, 16, 1, 1, 0x11, 0]));
	const dc = segment(0xc4, Buffer.from([0x00, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, ...Array.from({ length: 12 }, (_, k) => k)]));
	const acBity = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
	const acWartosci = [
		0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91,
		0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a,
		0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53,
		0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
		0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
		0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
		0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2,
		0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
	];
	const ac = segment(0xc4, Buffer.from([0x10, ...acBity, ...acWartosci]));
	const dri = segment(0xdd, Buffer.from([0, 1]));
	const sos = segment(0xda, Buffer.from([1, 1, 0x00, 0, 63, 0]));
	// Blok: różnica DC 0 (kod "00"), koniec bloku (kod "1010"), dopełnienie jedynkami → 0b00101011 = 0x2B.
	const skan = Buffer.from([0x2b, 0xff, 0xd0, 0x2b]);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), dqt, sof, dc, ac, dri, sos, skan, Buffer.from([0xff, 0xd9])]);
}

// Katalogi IFD0 i Exif z segmentu APP1 Exif (w czystym pliku jest jeden): numery pól, offsety wartości
// dłuższych niż 4 bajty, położenie katalogu Exif i wskaźnik następnego katalogu po IFD0.
function katalogiExif(jpeg: Buffer) {
	const s = jpeg.indexOf("Exif\x00\x00");
	const tiff = jpeg.subarray(s + 6, s - 2 + jpeg.readUInt16BE(s - 2));
	const kolejnosc = tiff.toString("latin1", 0, 2);
	const u16 = (o: number) => (kolejnosc === "II" ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
	const u32 = (o: number) => (kolejnosc === "II" ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
	const rozmiarTypu: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
	const czytaj = (offset: number) =>
		Array.from({ length: u16(offset) }, (_, k) => {
			const p = offset + 2 + k * 12;
			return { pole: u16(p), dlugosc: rozmiarTypu[u16(p + 2)] * u32(p + 4), wartosc: u32(p + 8) };
		});
	const ifd0Offset = u32(4);
	const ifd0 = czytaj(ifd0Offset);
	const exifOffset = ifd0.find((w) => w.pole === 0x8769)?.wartosc ?? null;
	const exif = exifOffset === null ? [] : czytaj(exifOffset);
	return {
		kolejnosc,
		ifd0Offset,
		exifOffset,
		nastepnyPoIfd0: u32(ifd0Offset + 2 + ifd0.length * 12),
		pola: { ifd0: ifd0.map((w) => w.pole), exif: exif.map((w) => w.pole) },
		offsetyDlugichWartosci: [...ifd0, ...exif].filter((w) => w.dlugosc > 4).map((w) => w.wartosc),
	};
}

// Trzy główne pliki testowe, każdy z kompletem danych do usunięcia.
const WARIANTY: [string, Buffer][] = [
	["z aparatu", await zdjecieZAparatu()],
	["z profilem ICC Display P3", await zdjecieZAparatu({ icc: "p3" })],
	["progresywny z FF D9 w tabeli między skanami", zTabelaFfD9MiedzySkanami(await zdjecieZAparatu({ progresywny: true }))],
];
const [[, Z_APARATU], [, Z_ICC], [, PROGRESYWNY]] = WARIANTY;
const PNG = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();

// --- Czyszczenie pliku do R2 ---

describe("wyczyscExifDoR2()", () => {
	test.each(WARIANTY)("%s: plik testowy naprawdę ma wszystko, co trzeba usunąć", async (_, plik) => {
		expect(WARTOWNICY.filter((w) => !plik.includes(w))).toEqual([]);
		expect((await exifr.gps(plik)).latitude).toBeCloseTo(52.4, 1);
		const dane = await exifr.parse(plik, { ifd1: true, interop: true, xmp: true, iptc: true, mergeOutput: false });
		expect(dane.exif.GPSLatitude).toBe("52,24.0N"); // GPS z XMP (exifr wkłada XMP pod klucze przestrzeni nazw)
		expect(dane.aux.SerialNumber).toBe("XMP-SERIAL-777");
		expect(dane.iptc.Byline).toBe("IPTC-AUTOR");
		expect(dane.interop.InteropIndex).toBe("R03");
		expect(dane.ifd1).toBeDefined();
		expect(await exifr.thumbnail(plik)).toBeDefined();
		expect(segmentyJpeg(plik).at(-1)).toMatch(/^\(po EOI: \d+ B\)$/);
	});

	test.each(WARIANTY)("%s: exifr nie znajduje nic spoza białej listy", async (_, plik) => {
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		const dane = await exifr.parse(czysty, {
			tiff: true,
			ifd1: true,
			gps: true,
			interop: true,
			makerNote: true,
			userComment: true,
			xmp: true,
			iptc: true,
			icc: true,
			jfif: true,
			multiSegment: true,
			mergeOutput: false,
		});
		// Przy mergeOutput: false XMP trafia pod klucze przestrzeni nazw (exif, aux, dc…), więc warunek
		// „w exif tylko pola z listy” łapie też GPS i numer seryjny z XMP.
		expect(Object.keys(dane).filter((blok) => !["ifd0", "exif", "icc", "jfif"].includes(blok))).toEqual([]);
		expect(Object.keys(dane.ifd0).sort()).toEqual(POLA_EXIFR.ifd0);
		expect(Object.keys(dane.exif).sort()).toEqual(POLA_EXIFR.exif);
		expect(await exifr.gps(czysty)).toBeUndefined();
		expect(await exifr.thumbnail(czysty)).toBeUndefined();
	});

	test.each(WARIANTY)("%s: nie zostaje żaden napis-wartownik ani nic za końcem obrazu", (_, plik) => {
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		// exifr nie czyta danych za EOI, więc sprawdzamy sam bufor.
		expect(WARTOWNICY.filter((w) => czysty.includes(w))).toEqual([]);
		expect([...czysty.subarray(-2)]).toEqual([0xff, 0xd9]);
		expect(segmentyJpeg(czysty).at(-1)).toBe("EOI");
	});

	test.each(WARIANTY)("%s: zostają tylko segmenty z białej listy", (_, plik) => {
		const segmenty = segmentyJpeg(wyczyscExifDoR2(plik, KLUCZ));
		expect(segmenty.filter((s) => !SEGMENTY_Z_LISTY.test(s))).toEqual([]);
		expect(segmenty).toContain("APP1 Exif");
	});

	test.each(WARIANTY)("%s: piksele, wymiary i obrót bez zmian, miniatura jak w Astro identyczna", async (_, plik) => {
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		const surowe = (b: Buffer) => sharp(b).raw().toBuffer();
		const poObrocie = (b: Buffer) => sharp(b).rotate().raw().toBuffer();
		const miniatura = (b: Buffer) => sharp(b).rotate().resize({ width: 160 }).webp().toBuffer(); // jak serwis sharp w Astro
		expect((await surowe(czysty)).equals(await surowe(plik))).toBe(true);
		expect((await poObrocie(czysty)).equals(await poObrocie(plik))).toBe(true);
		expect((await miniatura(czysty)).equals(await miniatura(plik))).toBe(true);
		expect(await pikseleIObrotBezZmian(plik, czysty, dekoderPikseli(sharp))).toBe(true);
	});

	test.each(WARIANTY)("%s: Astro widzi te same wymiary i obrót (imageMetadata, z niego korzysta inferRemoteSize)", async (_, plik) => {
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		expect(await imageMetadata(czysty)).toEqual(await imageMetadata(plik));
		expect(await imageMetadata(czysty)).toMatchObject({ width: 240, height: 320, orientation: 6 });
	});

	test.each(WARIANTY)("%s: drugie czyszczenie nic nie zmienia", (_, plik) => {
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		expect(wyczyscExifDoR2(czysty, KLUCZ).equals(czysty)).toBe(true);
	});

	test("zostają pola z białej listy i profil ICC bajt w bajt", async () => {
		const czysty = wyczyscExifDoR2(Z_ICC, KLUCZ);
		const dane = await exifr.parse(czysty, { translateValues: false });
		expect(dane).toMatchObject({
			Make: "NIKON CORPORATION",
			Model: "NIKON D7500",
			Orientation: 6,
			LensMake: "NIKKOR",
			LensModel: "50.0 mm f/1.4",
			LensInfo: [50, 50, 1.4, 1.4],
			ExposureTime: 0.004,
			FNumber: 5.6,
			ISO: 200,
			FocalLength: 50,
		});
		expect(new Date(dane.DateTimeOriginal).getFullYear()).toBe(2026);
		expect(new Date(dane.CreateDate).getFullYear()).toBe(2026);
		const [przed, po] = await Promise.all([sharp(Z_ICC).metadata(), sharp(czysty).metadata()]);
		expect(przed.icc).toBeDefined();
		expect(po.icc).toEqual(przed.icc);
	});

	test("progresywny: FF D9 w tabeli DHT między skanami nie kończy obrazu", () => {
		const czysty = wyczyscExifDoR2(PROGRESYWNY, KLUCZ);
		// Strażnik: pierwsze FF D9 za pierwszym SOS leży w dodatkowej tabeli, daleko przed końcem pliku.
		expect(czysty.indexOf(Buffer.from([0xff, 0xd9]), pierwszySos(czysty)) + 2).toBeLessThan(czysty.length);
		expect(segmentyJpeg(czysty).filter((s) => s === "SOS").length).toBeGreaterThan(1);
	});

	test("EXIF w kolejności II: obrót zostaje, autor i GPS znikają", async () => {
		const plik = await zdjecieZExifII();
		expect(plik.includes("AUTOR-ARTIST")).toBe(true); // strażnik
		expect((await exifr.parse(plik, { gps: true, mergeOutput: false })).gps).toBeDefined(); // strażnik
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		const dane = await exifr.parse(czysty, { gps: true, translateValues: false, mergeOutput: false });
		expect(dane.ifd0).toEqual({ Make: "Canon", Model: "EOS R6 Mark II", Orientation: 6 });
		expect(dane.exif.LensModel).toBe("RF50mm F1.8 STM");
		expect(dane.gps).toBeUndefined();
		expect(czysty.includes("AUTOR-ARTIST")).toBe(false);
		expect((await sharp(czysty).metadata()).orientation).toBe(6);
		expect(await imageMetadata(czysty)).toEqual(await imageMetadata(plik));
		expect(await pikseleIObrotBezZmian(plik, czysty, dekoderPikseli(sharp))).toBe(true);
	});

	test.each([
		["MM (piexifjs)", () => zdjecieZAparatu(), "MM", [0x010f, 0x0110, 0x0112, 0x8769], [0x829a, 0x829d, 0x8827, 0x9003, 0x9004, 0x920a, 0xa432, 0xa433, 0xa434]],
		["II (złożony ręcznie)", () => zdjecieZExifII(), "II", [0x010f, 0x0110, 0x0112, 0x8769], [0x9003, 0xa434]],
	] as [string, () => Promise<Buffer>, string, number[], number[]][])(
		"EXIF %s: wpisy rosnąco, IFD0 pod offsetem 8, długie wartości pod parzystym offsetem",
		async (_, zrob, kolejnosc, polaIfd0, polaExif) => {
			const k = katalogiExif(wyczyscExifDoR2(await zrob(), KLUCZ));
			expect(k.kolejnosc).toBe(kolejnosc);
			expect(k.ifd0Offset).toBe(8);
			expect(k.nastepnyPoIfd0).toBe(0); // bez 1st IFD z miniaturą
			expect(k.pola).toEqual({ ifd0: polaIfd0, exif: polaExif }); // dokładnie biała lista, rosnąco
			expect(k.offsetyDlugichWartosci.length).toBeGreaterThan(0);
			expect(k.offsetyDlugichWartosci.filter((o) => o % 2 !== 0)).toEqual([]);
			expect((k.exifOffset ?? 1) % 2).toBe(0);
		}
	);

	test("JFIF z miniaturą: zostaje APP0 o długości 16 z miniaturą 0×0", () => {
		const odJfif = (b: Buffer) => b.subarray(b.indexOf("JFIF\x00") - 4); // od znacznika FF E0
		expect([...odJfif(Z_APARATU).subarray(0, 4)]).toEqual([0xff, 0xe0, 0x00, 22]); // strażnik: nagłówek + 6 bajtów miniatury
		expect([odJfif(Z_APARATU)[16], odJfif(Z_APARATU)[17]]).toEqual([2, 1]);
		const jfif = odJfif(wyczyscExifDoR2(Z_APARATU, KLUCZ));
		expect([...jfif.subarray(0, 4)]).toEqual([0xff, 0xe0, 0x00, 16]);
		expect([jfif[16], jfif[17]]).toEqual([0, 0]); // szerokość i wysokość miniatury
	});

	test("EXIF z samym GPS i Software: segment APP1 Exif wypada", async () => {
		const plik = zExif(await obraz(64, 48).jpeg().toBuffer(), { "0th": { [piexif.ImageIFD.Software]: "PROGRAM-SOFTWARE" }, GPS: GPS_POZNAN });
		expect(segmentyJpeg(plik)).toContain("APP1 Exif"); // strażnik
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		expect(segmentyJpeg(czysty)).not.toContain("APP1 Exif");
		expect(czysty.includes("PROGRAM-SOFTWARE")).toBe(false);
		expect(await exifr.gps(czysty)).toBeUndefined();
	});

	test("bez pól z katalogu Exif z białej listy: IFD0 bez wskaźnika Exif", async () => {
		const plik = zExif(await obraz(64, 48).jpeg().toBuffer(), {
			"0th": { [piexif.ImageIFD.Make]: "NIKON CORPORATION", [piexif.ImageIFD.Orientation]: 6 },
			Exif: { [piexif.ExifIFD.BodySerialNumber]: "SERIAL-AB12CD", [piexif.ExifIFD.ImageUniqueID]: "UNIKALNE-ID-42" },
		});
		const k = katalogiExif(wyczyscExifDoR2(plik, KLUCZ));
		expect(k.pola).toEqual({ ifd0: [0x010f, 0x0112], exif: [] });
		expect(k.exifOffset).toBeNull();
	});

	test("czyści też plik .JPG wielkimi literami", () => {
		const czysty = wyczyscExifDoR2(Z_APARATU, "zdjecia/DSC_1.JPG");
		expect(czysty.includes("SERIAL-AB12CD")).toBe(false);
	});

	test("JPEG bez EXIF-u przechodzi bez zmian", async () => {
		const plik = await obraz(64, 48).jpeg().toBuffer();
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		expect(czysty.equals(plik)).toBe(true);
		const meta = await sharp(czysty).metadata();
		expect([meta.width, meta.height]).toEqual([64, 48]);
	});

	test("JPEG z DRI i znacznikiem RST0 w danych skanu: przechodzi bajt w bajt", async () => {
		const plik = jpegZRst();
		expect(segmentyJpeg(plik)).toEqual(["SOI", "DQT", "SOF0", "DHT", "DHT", "DRI", "SOS", "EOI"]);
		const czysty = wyczyscExifDoR2(plik, KLUCZ);
		expect(czysty.equals(plik)).toBe(true);
		expect(await pikseleIObrotBezZmian(plik, czysty, dekoderPikseli(sharp))).toBe(true); // sharp go dekoduje
	});

	test("PNG odrzuca — po nazwie i po treści", () => {
		expect(() => wyczyscExifDoR2(PNG, "zdjecia/DSC_2.png")).toThrow("(to nie JPG — do R2 wysyłamy tylko JPG)");
		expect(() => wyczyscExifDoR2(PNG, "zdjecia/DSC_2.jpg")).toThrow("(to nie jest plik JPEG)");
	});

	test.each([
		["urwany w danych obrazu", Z_APARATU.subarray(0, pierwszySos(Z_APARATU) + 500), "plik urwany"],
		["to nie jest jpeg", Buffer.from("to nie jest jpeg"), "to nie jest plik JPEG"],
		["dwa bloki EXIF", wstaw(Z_APARATU, 2, segment(0xe1, "Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x00\x00\x00\x00\x00")), "plik ma dwa bloki EXIF"],
	] as [string, Buffer, string][])("uszkodzonego pliku nie wysyła: %s", (_, plik, powod) => {
		expect(() => wyczyscExifDoR2(plik, KLUCZ)).toThrow(powod);
		expect(() => wyczyscExifDoR2(plik, KLUCZ)).toThrow("nie wysyłam pliku");
	});
});

// --- Pliki do R2: czyszczenie, porównanie, znak wodny ---

describe("plikiDoWgrania()", () => {
	const dekoduj = dekoderPikseli(sharp);
	const atrapaZnaku = () => vi.fn(async (_bufor: Buffer) => Buffer.from("ZNAK-WODNY"));
	const KOMUNIKAT_POROWNANIA =
		"nie udało się wyczyścić pliku (po czyszczeniu zmieniły się piksele albo obrót — to błąd skryptu, nie zdjęcia) — nie wysyłam pliku. " +
		"Zachowaj ten plik i wklej komunikat do czatu z Claude.";

	test("pod zdjecia/ idzie czysty plik, a znak wodny powstaje z czystego", async () => {
		const nalozZnak = atrapaZnaku();
		const pliki = await plikiDoWgrania(Z_APARATU, KLUCZ, { nalozZnak, dekoduj });
		const czysty = wyczyscExifDoR2(Z_APARATU, KLUCZ);
		expect(pliki.map((p) => [p.klucz, p.typ])).toEqual([
			["zdjecia/DSC_1.jpg", "image/jpeg"],
			["znak/DSC_1.jpg", "image/jpeg"],
		]);
		expect(pliki[0].bufor.equals(czysty)).toBe(true);
		expect(WARTOWNICY.filter((w) => pliki[0].bufor.includes(w))).toEqual([]);
		expect(nalozZnak).toHaveBeenCalledTimes(1);
		expect(nalozZnak.mock.calls[0][0].equals(czysty)).toBe(true);
		expect(pliki[1].bufor.toString()).toBe("ZNAK-WODNY");
	});

	test.each([
		["PNG (po nazwie)", KLUCZ.replace(".jpg", ".png"), Z_APARATU, "to nie JPG"],
		["PNG nazwany .jpg (po treści)", KLUCZ, PNG, "to nie jest plik JPEG"],
		["klucz spoza zdjecia/", "znak/DSC_1.jpg", Z_APARATU, "nieoczekiwany klucz R2"],
	] as [string, string, Buffer, string][])("%s: błąd, zanim powstanie znak wodny", async (_, klucz, plik, komunikat) => {
		const nalozZnak = atrapaZnaku();
		await expect(plikiDoWgrania(plik, klucz, { nalozZnak, dekoduj })).rejects.toThrow(komunikat);
		expect(nalozZnak).not.toHaveBeenCalled();
	});

	const OBRAZ = { piksele: Buffer.from([1, 2, 3]), szerokosc: 3, wysokosc: 1, orientacja: 6 as number | undefined };
	test.each([
		["inne piksele", { ...OBRAZ, piksele: Buffer.from([1, 2, 4]) }],
		["inny obrót", { ...OBRAZ, orientacja: 1 }],
		["inne wymiary", { ...OBRAZ, szerokosc: 1, wysokosc: 3 }],
		["czysty plik nie do odczytania", null],
	] as [string, typeof OBRAZ | null][])("dekoder po czyszczeniu pokazuje: %s — błąd i bez znaku wodnego", async (_, poCzyszczeniu) => {
		const czysty = wyczyscExifDoR2(Z_APARATU, KLUCZ);
		const dekodujAtrapa = async (bufor: Buffer) => {
			if (!bufor.equals(czysty)) return OBRAZ;
			if (!poCzyszczeniu) throw new Error("nie do odczytania");
			return poCzyszczeniu;
		};
		const nalozZnak = atrapaZnaku();
		await expect(plikiDoWgrania(Z_APARATU, KLUCZ, { nalozZnak, dekoduj: dekodujAtrapa })).rejects.toThrow(new Error(KOMUNIKAT_POROWNANIA));
		expect(nalozZnak).not.toHaveBeenCalled();
	});

	test("oryginału nie da się odczytać: błąd czyszczenia i bez znaku wodnego", async () => {
		const nalozZnak = atrapaZnaku();
		const dekodujAtrapa = async (_bufor: Buffer): Promise<typeof OBRAZ> => {
			throw new Error("Input buffer is corrupt");
		};
		await expect(plikiDoWgrania(Z_APARATU, KLUCZ, { nalozZnak, dekoduj: dekodujAtrapa })).rejects.toThrow(
			"nie udało się wyczyścić pliku (nie da się odczytać obrazu: Input buffer is corrupt) — nie wysyłam pliku"
		);
		expect(nalozZnak).not.toHaveBeenCalled();
	});
});

// --- Logika scripts/sprawdz-czyszczenie.mjs (sam skrypt uruchamia tylko Wiktor) ---

describe("sprawdzCzyszczenie()", () => {
	const zaleznosci = { dekoduj: dekoderPikseli(sharp), exifr };

	test("plik do wyczyszczenia: segmenty, GPS, co zostaje i porównanie — bez problemu", async () => {
		const czysty = wyczyscExifDoR2(Z_APARATU, KLUCZ);
		const { linie, problem } = await sprawdzCzyszczenie(Z_APARATU, "DSC_1.jpg", zaleznosci);
		expect(problem).toBe(false);
		expect(linie).toEqual([
			`Segmenty przed: ${segmentyJpeg(Z_APARATU).join(", ")}`,
			`Segmenty po:    ${segmentyJpeg(czysty).join(", ")}`,
			expect.stringMatching(/^GPS przed: \{"latitude":52\.4,"longitude":16\.9\d*\} \| po: brak$/),
			expect.stringMatching(/^Zostaje: \{"ifd0":\{"Make":"NIKON CORPORATION",/),
			"Piksele i obrót bez zmian: tak",
		]);
	});

	test.each([
		["nie JPEG", Buffer.from("to nie jest jpeg"), "DSC_1.jpg", "(to nie jest plik JPEG)"],
		["PNG", Buffer.from("PNG"), "DSC_2.png", "(to nie JPG — do R2 wysyłamy tylko JPG)"],
	] as [string, Buffer, string, string][])("%s: Błąd i problem", async (_, plik, nazwa, powod) => {
		const { linie, problem } = await sprawdzCzyszczenie(plik, nazwa, zaleznosci);
		expect(problem).toBe(true);
		expect(linie).toHaveLength(1);
		expect(linie[0]).toMatch(/^Błąd: nie udało się wyczyścić pliku \(/);
		expect(linie[0]).toContain(powod);
	});

	test("inny obrót po czyszczeniu: NIE i problem", async () => {
		const czysty = wyczyscExifDoR2(Z_APARATU, KLUCZ);
		const obraz = { piksele: Buffer.from([1]), szerokosc: 1, wysokosc: 1, orientacja: 6 as number | undefined };
		const dekoduj = async (bufor: Buffer) => (bufor.equals(czysty) ? { ...obraz, orientacja: 1 } : obraz);
		const { linie, problem } = await sprawdzCzyszczenie(Z_APARATU, "DSC_1.jpg", { dekoduj, exifr });
		expect(problem).toBe(true);
		expect(linie.at(-1)).toBe("Piksele i obrót bez zmian: NIE");
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
