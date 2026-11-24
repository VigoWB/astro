import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import * as modul from "../../scripts/sync-images-funkcje.mjs";
import {
	bezBom,
	bezPolskichLiter,
	czyDodacBezPrzed,
	czyJpg,
	kluczZnak,
	liczbaLubNull,
	nazwyWersjiPrzed,
	odczytajOpcje,
	parsujKategorie,
	plikiPrzedBezPary,
	podpowiedzDoBleduR2,
	podsumowanieSprawdzenia,
	rozbijNaNumery,
	segmentyJpeg,
	tekstLubNull,
	wybierzPlikPrzed,
	wybierzZdjecia,
	wyczyscExifDoR2,
	zdjeciaTracaceWyroznienie,
} from "../../scripts/sync-images-funkcje.mjs";

// Czyste funkcje skryptu sync-images. Importujemy TYLKO scripts/sync-images-funkcje.mjs —
// scripts/sync-images.mjs uruchomiłby się przy imporcie (pytania w terminalu, R2, zapis galeria.json).

describe("kluczZnak()", () => {
	test("zamienia folder zdjecia/ na znak/ tylko na początku klucza", () => {
		expect(kluczZnak("zdjecia/DSC_1.jpg")).toBe("znak/DSC_1.jpg");
		expect(kluczZnak("zdjecia/październik_26_PRZED_DSC7102.jpg")).toBe("znak/październik_26_PRZED_DSC7102.jpg");
		expect(kluczZnak("zdjecia/zdjecia/x.jpg")).toBe("znak/zdjecia/x.jpg");
	});

	test.each(["znak/DSC_1.jpg", "DSC_1.jpg", "Zdjecia/DSC_1.jpg"])("przerywa przy kluczu spoza zdjecia/: %s", (klucz) => {
		expect(() => kluczZnak(klucz)).toThrow("nieoczekiwany klucz R2");
	});
});

describe("nazwyWersjiPrzed()", () => {
	test("nowy sposób: PRZED_ w miejscu EDYCJA_, potem dawny", () => {
		expect(nazwyWersjiPrzed("październik_26_EDYCJA_DSC7102.jpg")).toEqual([
			"październik_26_PRZED_DSC7102.jpg",
			"październik_26_EDYCJA_przed_DSC7102.jpg",
		]);
		expect(nazwyWersjiPrzed("wrzesień_26_EDYCJA_DSC7062.jpg")).toEqual([
			"wrzesień_26_PRZED_DSC7062.jpg",
			"wrzesień_26_EDYCJA_przed_DSC7062.jpg",
		]);
	});

	test("dawny sposób: przed_ przed numerem DSC albo na początku nazwy", () => {
		expect(nazwyWersjiPrzed("DSC_1234.jpg")).toEqual(["przed_DSC_1234.jpg"]);
		expect(nazwyWersjiPrzed("DSC_4968-Edytuj.jpg")).toEqual(["przed_DSC_4968-Edytuj.jpg"]);
		expect(nazwyWersjiPrzed("DSC1234.jpg")).toEqual(["przed_DSC1234.jpg"]);
		expect(nazwyWersjiPrzed("zegarek.jpg")).toEqual(["przed_zegarek.jpg"]);
	});

	test("wielkość liter w EDYCJA i DSC bez znaczenia", () => {
		expect(nazwyWersjiPrzed("listopad_26_edycja_dsc8001.JPG")).toEqual([
			"listopad_26_PRZED_dsc8001.JPG",
			"listopad_26_edycja_przed_dsc8001.JPG",
		]);
	});

	test("zdjęcie z telefonu (IMG) i z Fuji (DSCF): PRZED_ w miejscu EDYCJA_", () => {
		expect(nazwyWersjiPrzed("listopad_26_EDYCJA_IMG_1234.jpg")).toEqual([
			"listopad_26_PRZED_IMG_1234.jpg",
			"przed_listopad_26_EDYCJA_IMG_1234.jpg",
		]);
		expect(nazwyWersjiPrzed("listopad_26_EDYCJA_DSCF1234.jpg")).toEqual([
			"listopad_26_PRZED_DSCF1234.jpg",
			"przed_listopad_26_EDYCJA_DSCF1234.jpg",
		]);
	});
});

describe("wybierzPlikPrzed()", () => {
	test("znajduje plik w nowym sposobie nazywania", () => {
		const po = "październik_26_EDYCJA_DSC7102.jpg";
		expect(wybierzPlikPrzed(po, [po, "październik_26_PRZED_DSC7102.jpg"])).toBe("październik_26_PRZED_DSC7102.jpg");
	});

	test("znajduje plik w dawnym sposobie nazywania (polska litera w nazwie)", () => {
		expect(wybierzPlikPrzed("wrzesień_26_EDYCJA_DSC7062.jpg", ["wrzesień_26_EDYCJA_przed_DSC7062.jpg"])).toBe(
			"wrzesień_26_EDYCJA_przed_DSC7062.jpg"
		);
	});

	test("zwraca nazwę z listy przy innej wielkości liter", () => {
		expect(wybierzPlikPrzed("DSC_1234.jpg", ["DSC_1234.jpg", "PRZED_dsc_1234.JPG"])).toBe("PRZED_dsc_1234.JPG");
		expect(wybierzPlikPrzed("listopad_26_edycja_dsc8001.JPG", ["listopad_26_przed_dsc8001.jpg"])).toBe(
			"listopad_26_przed_dsc8001.jpg"
		);
	});

	test("nowy sposób ma pierwszeństwo, gdy są oba pliki", () => {
		expect(
			wybierzPlikPrzed("październik_26_EDYCJA_DSC7102.jpg", [
				"październik_26_EDYCJA_przed_DSC7102.jpg",
				"październik_26_PRZED_DSC7102.jpg",
			])
		).toBe("październik_26_PRZED_DSC7102.jpg");
	});

	test("bez pliku zwraca pierwszą oczekiwaną nazwę", () => {
		expect(wybierzPlikPrzed("DSC_5.jpg", [])).toBe("przed_DSC_5.jpg");
	});

	test("znajduje plik przed dla zdjęcia z telefonu (IMG) i z Fuji (DSCF); bez pliku podaje nazwę do komunikatu", () => {
		const po = ["listopad_26_EDYCJA_IMG_1234.jpg", "listopad_26_EDYCJA_DSCF1234.jpg"];
		const pliki = [...po, "listopad_26_PRZED_IMG_1234.jpg", "listopad_26_PRZED_DSCF1234.jpg"];
		expect(wybierzPlikPrzed(po[0], pliki)).toBe("listopad_26_PRZED_IMG_1234.jpg");
		expect(wybierzPlikPrzed(po[1], pliki)).toBe("listopad_26_PRZED_DSCF1234.jpg");
		expect(wybierzPlikPrzed(po[0], po)).toBe("listopad_26_PRZED_IMG_1234.jpg");
	});
});

describe("wybierzZdjecia()", () => {
	const pliki = [
		"._DSC_1.jpg",
		"DSC_1.jpg",
		"przed_DSC_1.jpg",
		"październik_26_EDYCJA_DSC7102.jpg",
		"październik_26_PRZED_DSC7102.jpg",
		"notatki.txt",
		"zegarek.jpg",
		"DSC_2.PNG",
		"DSC_3.jpeg",
		"DSC_4.tif",
		"listopad_26_EDYCJA_IMG_1234.jpg",
		"listopad_26_PRZED_IMG_1234.jpg",
		"listopad_26_EDYCJA_DSCF1234.jpg",
		"listopad_26_PRZED_DSCF1234.jpg",
		"IMG_5678.jpg",
		"logo.jpg",
		"._IMG_9.jpg",
		"DSC_5.HEIC",
		"DSC_6.heif",
		"DSC_7.TIFF",
		"foto.webp",
	];

	test("pomija pliki ukryte i inne niż JPG", () => {
		expect(wybierzZdjecia(pliki).zdjecia).toEqual([
			"DSC_1.jpg",
			"przed_DSC_1.jpg",
			"październik_26_EDYCJA_DSC7102.jpg",
			"październik_26_PRZED_DSC7102.jpg",
			"zegarek.jpg",
			"DSC_3.jpeg",
			"listopad_26_EDYCJA_IMG_1234.jpg",
			"listopad_26_PRZED_IMG_1234.jpg",
			"listopad_26_EDYCJA_DSCF1234.jpg",
			"listopad_26_PRZED_DSCF1234.jpg",
			"IMG_5678.jpg",
			"logo.jpg",
		]);
	});

	test("kandydaci: z EDYCJA_ albo numerem DSC, bez przed, posortowani", () => {
		expect(wybierzZdjecia(pliki).kandydaci).toEqual([
			"DSC_1.jpg",
			"DSC_3.jpeg",
			"listopad_26_EDYCJA_DSCF1234.jpg",
			"listopad_26_EDYCJA_IMG_1234.jpg",
			"październik_26_EDYCJA_DSC7102.jpg",
		]);
	});

	test("kandydaci: zdjęcie z telefonu (IMG) i z Fuji (DSCF) z EDYCJA_ — nie tylko z numerem DSC", () => {
		const { kandydaci } = wybierzZdjecia(pliki);
		expect(kandydaci).toContain("listopad_26_EDYCJA_IMG_1234.jpg");
		expect(kandydaci).toContain("listopad_26_EDYCJA_DSCF1234.jpg");
		expect(kandydaci).toContain("DSC_1.jpg"); // dawny sposób działa dalej
	});

	test("kandydaci: bez plików przed i bez ukrytych", () => {
		const { kandydaci } = wybierzZdjecia(pliki);
		expect(kandydaci).not.toContain("listopad_26_PRZED_IMG_1234.jpg");
		expect(kandydaci).not.toContain("przed_DSC_1.jpg");
		expect(kandydaci).not.toContain("._DSC_1.jpg");
	});

	test("kandydaci: wielkość liter w EDYCJA_ i rozszerzeniu bez znaczenia", () => {
		expect(wybierzZdjecia(["listopad_26_edycja_img_1.JPG", "listopad_26_Edycja_img_2.JPEG"]).kandydaci).toEqual([
			"listopad_26_Edycja_img_2.JPEG",
			"listopad_26_edycja_img_1.JPG",
		]);
	});

	test("bezOznaczenia: JPG bez EDYCJA_ i numeru DSC, posortowane, bez plików przed i ukrytych", () => {
		expect(wybierzZdjecia(pliki).bezOznaczenia).toEqual(["IMG_5678.jpg", "logo.jpg", "zegarek.jpg"]);
	});

	test("bezOznaczenia: pusta, gdy każdy JPG ma oznaczenie albo jest plikiem przed", () => {
		expect(wybierzZdjecia(["DSC_1.jpg", "przed_DSC_1.jpg", "listopad_26_EDYCJA_IMG_1.jpg", "listopad_26_PRZED_IMG_1.jpg"]).bezOznaczenia).toEqual(
			[]
		);
	});

	test("PNG na liście pominiętych (także przed_ i bez numeru DSC), posortowane, bez ukrytych", () => {
		expect(wybierzZdjecia(["DSC_1.jpg", "DSC_2.PNG"]).pominiete).toEqual(["DSC_2.PNG"]);
		expect(wybierzZdjecia(["DSC_2.PNG", "przed_DSC_2.png", "._DSC_9.png", "logo.png"]).pominiete).toEqual([
			"DSC_2.PNG",
			"logo.png",
			"przed_DSC_2.png",
		]);
	});

	test("pominiete: PNG, HEIC, HEIF, TIFF i WebP (wielkość liter bez znaczenia), posortowane, bez ukrytych", () => {
		expect(wybierzZdjecia([...pliki, "._ukryty.heic", "a.TIF", "b.png"]).pominiete).toEqual([
			"DSC_2.PNG",
			"DSC_4.tif",
			"DSC_5.HEIC",
			"DSC_6.heif",
			"DSC_7.TIFF",
			"a.TIF",
			"b.png",
			"foto.webp",
		]);
	});

	test("pominiete: nie zawiera JPG ani plików innych rodzajów (txt)", () => {
		const { pominiete } = wybierzZdjecia(pliki);
		expect(pominiete).not.toContain("notatki.txt");
		expect(pominiete).not.toContain("zegarek.jpg");
	});
});

describe("czyDodacBezPrzed()", () => {
	test.each(["tak", " TAK ", "Tak", "tAk", "\ttak\n"])("zgoda: %j", (odpowiedz) => {
		expect(czyDodacBezPrzed(odpowiedz)).toBe(true);
	});

	test.each(["", " ", "nie", "t", "tak tak", "taak", "yes", "tak.", "n"])("nie zgoda (także sam Enter): %j", (odpowiedz) => {
		expect(czyDodacBezPrzed(odpowiedz)).toBe(false);
	});
});

describe("podpowiedzDoBleduR2()", () => {
	const KLUCZE = " — sprawdź klucze R2_* w .env.";
	const BUCKET = " — sprawdź nazwę bucketu (R2_BUCKET_NAME) w .env.";
	const CHWILOWY =
		" — chwilowy kłopot po stronie Cloudflare R2. Odczekaj kilka minut i uruchom to samo polecenie jeszcze raz (to, co już zapisane, zostaje).";
	const NIEZNANY = " — wklej ten komunikat do czatu z Claude.";

	test.each([
		[401, KLUCZE],
		[403, KLUCZE],
		[404, BUCKET],
		[429, CHWILOWY],
		[500, CHWILOWY],
		[503, CHWILOWY],
		[599, CHWILOWY],
		[400, NIEZNANY],
		[409, NIEZNANY],
		[600, NIEZNANY],
	])("status %i", (status, dopisek) => {
		expect(podpowiedzDoBleduR2(status)).toBe(dopisek);
	});

	test("awaria po stronie Cloudflare nie odsyła do kluczy w .env", () => {
		for (const status of [429, 500, 502, 503, 504]) {
			expect(podpowiedzDoBleduR2(status)).not.toContain("klucze");
		}
	});
});

describe("czyJpg()", () => {
	test.each(["DSC_1.jpg", "DSC_1.JPG", "DSC_1.jpeg", "zdjecia/październik_26_EDYCJA_DSC7102.JPEG"])("JPG: %s", (nazwa) => {
		expect(czyJpg(nazwa)).toBe(true);
	});

	test.each(["DSC_1.png", "DSC_1.tif", "DSC_1.jpg.png", "DSC_1.jpgx", "jpg"])("nie JPG: %s", (nazwa) => {
		expect(czyJpg(nazwa)).toBe(false);
	});
});

// Przejazd po znacznikach na małych plikach złożonych z bajtów: czytamy tylko strukturę JPEG-a,
// więc treść tabel może być byle jaka (takich plików nie da się zdekodować — piksele sprawdzają
// testy integracyjne na prawdziwych JPG-ach). Bajty zapisane kodami.
describe("przejazd po znacznikach JPEG-a (segmentyJpeg, wyczyscExifDoR2)", () => {
	const KLUCZ = "zdjecia/DSC_1.jpg";
	const seg = (znacznik: number, ...bajty: number[]) => [0xff, znacznik, (bajty.length + 2) >> 8, (bajty.length + 2) & 0xff, ...bajty];
	const tekst = (t: string) => [...Buffer.from(t, "latin1")];
	const jpeg = (...czesci: number[][]) => Buffer.from(czesci.flat());
	const SOI = [0xff, 0xd8];
	const EOI = [0xff, 0xd9];
	const DQT = seg(0xdb, 0x00, ...Array<number>(64).fill(1));
	const SOF0 = seg(0xc0, 8, 0, 8, 0, 8, 1, 1, 0x11, 0);
	const SOF2 = seg(0xc2, 8, 0, 8, 0, 8, 1, 1, 0x11, 0);
	const SOS = seg(0xda, 1, 1, 0x00, 0, 63, 0);
	const DANE = [0x12, 0x34]; // dane skanu
	// EXIF bez żadnego pola: nagłówek TIFF (MM) i pusty IFD0.
	const EXIF_PUSTY = seg(0xe1, ...tekst("Exif\x00\x00MM\x00\x2a\x00\x00\x00\x08\x00\x00\x00\x00\x00\x00"));

	test("FF 00 i RST0–7 w danych skanu to nie koniec obrazu", () => {
		const plik = jpeg(SOI, SOF0, SOS, [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd7, 0x78], EOI);
		expect(segmentyJpeg(plik)).toEqual(["SOI", "SOF0", "SOS", "EOI"]);
		expect(wyczyscExifDoR2(plik, KLUCZ).equals(plik)).toBe(true);
	});

	test("bajty wypełnienia FF przed znacznikiem", () => {
		const plik = jpeg(SOI, [0xff, 0xff], DQT, SOF0, SOS, [0x12, 0xff, 0xff], EOI);
		expect(segmentyJpeg(plik)).toEqual(["SOI", "DQT", "SOF0", "SOS", "EOI"]);
		expect(wyczyscExifDoR2(plik, KLUCZ).equals(jpeg(SOI, DQT, SOF0, SOS, [0x12], EOI))).toBe(true);
	});

	test("FF D9 w tabeli DHT między skanami nie kończy obrazu", () => {
		const dhtZFfD9 = seg(0xc4, 0x13, 1, 1, ...Array<number>(14).fill(0), 0xff, 0xd9);
		const plik = jpeg(SOI, SOF2, SOS, DANE, dhtZFfD9, SOS, [0x56], EOI);
		expect(segmentyJpeg(plik)).toEqual(["SOI", "SOF2", "SOS", "DHT", "SOS", "EOI"]);
		expect(wyczyscExifDoR2(plik, KLUCZ).equals(plik)).toBe(true);
	});

	test("APPn i COM po pierwszym skanie wypadają", () => {
		const xmp = seg(0xe1, ...tekst("http://ns.adobe.com/xap/1.0/\x00<x/>"));
		const plik = jpeg(SOI, SOF2, SOS, DANE, xmp, seg(0xfe, ...tekst("KOMENTARZ")), SOS, [0x56], EOI);
		expect(segmentyJpeg(wyczyscExifDoR2(plik, KLUCZ))).toEqual(["SOI", "SOF2", "SOS", "SOS", "EOI"]);
	});

	test("dane za końcem obrazu wypadają", () => {
		const plik = jpeg(SOI, SOF0, SOS, DANE, EOI, tekst("PODGLAD"));
		expect(segmentyJpeg(plik)).toEqual(["SOI", "SOF0", "SOS", "EOI", "(po EOI: 7 B)"]);
		expect(wyczyscExifDoR2(plik, KLUCZ).equals(jpeg(SOI, SOF0, SOS, DANE, EOI))).toBe(true);
	});

	test("biała lista APPn: JFIF bez miniatury, wszystkie części ICC, Adobe 12 bajtów; reszta wypada", () => {
		const jfif = seg(0xe0, ...tekst("JFIF\x00"), 1, 2, 1, 0, 72, 0, 72, 2, 1, 10, 20, 30, 40, 50, 60);
		const icc1 = seg(0xe2, ...tekst("ICC_PROFILE\x00"), 1, 2, 0xaa);
		const icc2 = seg(0xe2, ...tekst("ICC_PROFILE\x00"), 2, 2, 0xbb);
		const adobe = seg(0xee, ...tekst("Adobe"), 0, 100, 0, 0, 0, 0, 1, 0xcc, 0xdd); // 2 bajty za dużo
		const inne = [
			seg(0xe0, ...tekst("JFXX\x00\x10")),
			seg(0xe1, ...tekst("http://ns.adobe.com/xap/1.0/\x00<x/>")),
			seg(0xe2, ...tekst("MPF\x00MM")),
			seg(0xeb, ...tekst("JP\x00\x00C2PA")),
			seg(0xed, ...tekst("Photoshop 3.0\x00")),
			seg(0xfe, ...tekst("KOMENTARZ")),
		];
		const plik = jpeg(SOI, jfif, icc1, icc2, adobe, ...inne, DQT, SOF0, SOS, DANE, EOI);
		const jfifBezMiniatury = seg(0xe0, ...tekst("JFIF\x00"), 1, 2, 1, 0, 72, 0, 72, 0, 0); // długość 16
		const adobe12 = seg(0xee, ...tekst("Adobe"), 0, 100, 0, 0, 0, 0, 1); // długość 14
		expect(wyczyscExifDoR2(plik, KLUCZ).equals(jpeg(SOI, jfifBezMiniatury, icc1, icc2, adobe12, DQT, SOF0, SOS, DANE, EOI))).toBe(true);
	});

	test("EXIF bez pól z białej listy: segment APP1 Exif wypada", () => {
		const plik = jpeg(SOI, EXIF_PUSTY, SOF0, SOS, DANE, EOI);
		expect(segmentyJpeg(plik)).toContain("APP1 Exif"); // strażnik
		expect(wyczyscExifDoR2(plik, KLUCZ).equals(jpeg(SOI, SOF0, SOS, DANE, EOI))).toBe(true);
	});

	test.each([
		["bez SOI", Buffer.from("to nie jest jpeg"), "to nie jest plik JPEG"],
		["bez EOI (plik urwany)", jpeg(SOI, SOF0, SOS, DANE), "plik urwany — brak znacznika końca obrazu"],
		["segment dłuższy niż plik", jpeg(SOI, [0xff, 0xe1, 0x00, 0x50, 0x01]), "segment FFE1 wychodzi poza plik"],
		["śmieci między segmentami", jpeg(SOI, DQT, [0x00, 0x00], SOF0, SOS, DANE, EOI), "nieoczekiwane bajty"],
		["nieznany znacznik", jpeg(SOI, seg(0xf7, 0x00), SOF0, SOS, DANE, EOI), "nieznany segment FFF7"],
		["drugi SOF", jpeg(SOI, SOF0, SOF0, SOS, DANE, EOI), "drugi nagłówek obrazu (SOF)"],
		["SOS przed SOF", jpeg(SOI, SOS, DANE, EOI), "SOS przed SOF"],
		["RST poza danymi skanu", jpeg(SOI, [0xff, 0xd0], SOF0, SOS, DANE, EOI), "nieoczekiwany znacznik FFD0"],
		["FF 00 poza danymi skanu", jpeg(SOI, [0xff, 0x00], SOF0, SOS, DANE, EOI), "nieoczekiwany znacznik FF00"],
		["dwa bloki EXIF", jpeg(SOI, EXIF_PUSTY, EXIF_PUSTY, SOF0, SOS, DANE, EOI), "plik ma dwa bloki EXIF"],
		["nagłówek JFIF za krótki", jpeg(SOI, seg(0xe0, ...tekst("JFIF\x00"), 1, 2), SOF0, SOS, DANE, EOI), "uszkodzony nagłówek JFIF"],
		["segment Adobe za krótki", jpeg(SOI, seg(0xee, ...tekst("Adobe"), 0, 100), SOF0, SOS, DANE, EOI), "uszkodzony segment Adobe"],
		["bez danych obrazu", jpeg(SOI, SOF0, EOI), "brak danych obrazu"],
	] as [string, Buffer, string][])("%s: błąd, pliku nie wysyłamy", (_, plik, powod) => {
		expect(() => wyczyscExifDoR2(plik, KLUCZ)).toThrow(`nie udało się wyczyścić pliku (`);
		expect(() => wyczyscExifDoR2(plik, KLUCZ)).toThrow(powod);
	});

	test("komunikat błędu czyszczenia ma stały kształt", () => {
		expect(() => wyczyscExifDoR2(jpeg(SOI, SOF0, SOS, DANE), KLUCZ)).toThrow(
			new Error(
				"nie udało się wyczyścić pliku (plik urwany — brak znacznika końca obrazu) — nie wysyłam pliku, w którym mogłyby zostać " +
					"dane prywatne (GPS, numer seryjny, autor). Wyeksportuj zdjęcie jeszcze raz jako JPG i spróbuj ponownie."
			)
		);
	});

	test("nie JPG po nazwie: błąd, zanim cokolwiek przeczyta", () => {
		expect(() => wyczyscExifDoR2(jpeg(SOI, SOF0, SOS, DANE, EOI), "zdjecia/DSC_2.png")).toThrow(
			"nie udało się wyczyścić pliku (to nie JPG — do R2 wysyłamy tylko JPG)"
		);
	});
});

// Emoji zapisane kodami: ✅ to ✅, ❌ to ❌.
describe("podsumowanieSprawdzenia()", () => {
	test("wszystkie pliki czyste: kod wyjścia 0", () => {
		expect(podsumowanieSprawdzenia(4, 0)).toEqual({ tekst: "✅ Wszystkie pliki czyste (4)", kodWyjscia: 0 });
	});

	test("problemy: kod wyjścia 1", () => {
		expect(podsumowanieSprawdzenia(8, 2)).toEqual({
			tekst: "❌ Problemy: 2 — tych zdjęć nie podmieniaj, wklej wynik do czatu z Claude",
			kodWyjscia: 1,
		});
	});

	test("nie było czego sprawdzić: kod wyjścia 1, a nie „wszystko czyste”", () => {
		expect(podsumowanieSprawdzenia(0, 0)).toEqual({ tekst: expect.stringContaining("Nie ma plików JPG do sprawdzenia"), kodWyjscia: 1 });
	});
});

describe("plikiPrzedBezPary()", () => {
	const zdjecia = [
		"DSC_1.jpg",
		"przed_DSC_1.jpg",
		"przed_DSC_9.jpg",
		"listopad_26_PRZED_DSC8000.jpg",
		"październik_26_EDYCJA_DSC7102.jpg",
		"październik_26_PRZED_DSC7102.jpg",
		"wrzesień_26_EDYCJA_przed_DSC7062.jpg",
	];
	const nazwyPo = ["DSC_1.jpg", "październik_26_EDYCJA_DSC7102.jpg"];

	test("wskazuje pliki przed bez pary i podpowiada nazwę po", () => {
		expect(plikiPrzedBezPary(zdjecia, nazwyPo)).toEqual([
			{ plik: "przed_DSC_9.jpg", pasujacePo: "DSC_9.jpg" },
			{ plik: "listopad_26_PRZED_DSC8000.jpg", pasujacePo: "listopad_26_EDYCJA_DSC8000.jpg" },
			{ plik: "wrzesień_26_EDYCJA_przed_DSC7062.jpg", pasujacePo: "wrzesień_26_EDYCJA_DSC7062.jpg" },
		]);
	});

	test("zdjęcie z telefonu (IMG) i z Fuji (DSCF) z plikiem przed ma parę", () => {
		const para = ["listopad_26_PRZED_IMG_1234.jpg", "listopad_26_PRZED_DSCF1234.jpg"];
		const po = ["listopad_26_EDYCJA_IMG_1234.jpg", "listopad_26_EDYCJA_DSCF1234.jpg"];
		expect(plikiPrzedBezPary([...po, ...para], po)).toEqual([]);
	});

	test("pomija przed, którego po jest już w bazie", () => {
		expect(plikiPrzedBezPary(zdjecia, [...nazwyPo, "wrzesień_26_EDYCJA_DSC7062.jpg"])).toEqual([
			{ plik: "przed_DSC_9.jpg", pasujacePo: "DSC_9.jpg" },
			{ plik: "listopad_26_PRZED_DSC8000.jpg", pasujacePo: "listopad_26_EDYCJA_DSC8000.jpg" },
		]);
	});
});

describe("bezPolskichLiter()", () => {
	test("usuwa polskie litery z nazw opcji", () => {
		expect(bezPolskichLiter("--usuń")).toBe("--usun");
		expect(bezPolskichLiter("--wyróżnij")).toBe("--wyroznij");
		expect(bezPolskichLiter("--podmień")).toBe("--podmien");
		expect(bezPolskichLiter("Łódź")).toBe("Lodz");
	});
});

// Zawsze z jawnym env: npm test sam ustawia mnóstwo zmiennych npm_config_*.
describe("odczytajOpcje()", () => {
	test("bez opcji zwraca puste wartości", () => {
		expect(odczytajOpcje([], {})).toEqual({ opcja: null, plik: null });
	});

	test("rozpoznaje opcję bez względu na wielkość liter i polskie litery", () => {
		expect(odczytajOpcje(["--uzupelnij"], {})).toEqual({ opcja: "--uzupelnij", plik: null });
		expect(odczytajOpcje(["--WYRÓŻNIJ"], {}).opcja).toBe("--wyroznij");
	});

	test("nazwa pliku po opcji zostaje bez zmian", () => {
		expect(odczytajOpcje(["--USUŃ", "DSC_1.JPG"], {})).toEqual({ opcja: "--usun", plik: "DSC_1.JPG" });
		expect(odczytajOpcje(["--podmień", "październik_26_EDYCJA_DSC7102.jpg"], {})).toEqual({
			opcja: "--podmien",
			plik: "październik_26_EDYCJA_DSC7102.jpg",
		});
	});

	test("brak nazwy pliku po --usun", () => {
		expect(() => odczytajOpcje(["--usun"], {})).toThrow("Podaj nazwę pliku");
		expect(() => odczytajOpcje(["--usun", "--wyroznij"], {})).toThrow("Podaj nazwę pliku");
	});

	test("dwie opcje naraz", () => {
		expect(() => odczytajOpcje(["--wyroznij", "--uzupelnij"], {})).toThrow("Podaj jedną opcję naraz");
	});

	test("nieznana opcja albo argument", () => {
		expect(() => odczytajOpcje(["--cos"], {})).toThrow('Nieznana opcja albo argument: "--cos"');
		expect(() => odczytajOpcje(["DSC_1.jpg"], {})).toThrow("Nieznana opcja albo argument");
	});

	test("wykrywa opcję przejętą przez npm", () => {
		expect(() => odczytajOpcje(["DSC_1.jpg"], { npm_config_usun: "true" })).toThrow("Opcję --usun przejął npm");
	});

	test("inne zmienne npm_config_* nie przeszkadzają", () => {
		expect(odczytajOpcje([], { npm_config_cache: "/tmp" })).toEqual({ opcja: null, plik: null });
	});
});

describe("rozbijNaNumery()", () => {
	test("rozbija numery oddzielone przecinkiem i spacją, bez powtórzeń", () => {
		expect(rozbijNaNumery("1, 3 5", 5)).toEqual([1, 3, 5]);
		expect(rozbijNaNumery("3,1,3", 5)).toEqual([3, 1]);
		expect(rozbijNaNumery("  2  ", 5)).toEqual([2]);
	});

	test.each(["1;3", "1-3", "0", "6", "abc", ",", ""])("odrzuca cały wpis przy błędnym fragmencie: %j", (tekst) => {
		const ostrzezenie = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(rozbijNaNumery(tekst, 5)).toBeNull();
		expect(ostrzezenie).toHaveBeenCalledWith(expect.stringContaining("od 1 do 5"));
	});
});

describe("zdjeciaTracaceWyroznienie()", () => {
	const wszystkie = [
		{ id: 1, nazwa_pliku: "A.jpg", wyroznione: 1 },
		{ id: 2, nazwa_pliku: "B.jpg", wyroznione: 1 },
		{ id: 3, nazwa_pliku: "C.jpg", wyroznione: 0 },
		{ id: 4, nazwa_pliku: "D.jpg", wyroznione: 1 },
	];
	const tracace = (numery: number[]) =>
		zdjeciaTracaceWyroznienie(wszystkie, numery).map((w) => ({ nazwa: w.nazwa_pliku, numer: w.numer }));

	test("sam numer nowego zdjęcia zdejmuje wyróżnienie z pozostałych", () => {
		expect(tracace([3])).toEqual([
			{ nazwa: "A.jpg", numer: 1 },
			{ nazwa: "B.jpg", numer: 2 },
			{ nazwa: "D.jpg", numer: 4 },
		]);
	});

	test("wszystkie numery: nikt nie traci", () => {
		expect(tracace([1, 2, 3, 4])).toEqual([]);
	});

	test("brak: tracą wszystkie wyróżnione", () => {
		expect(tracace([])).toEqual([
			{ nazwa: "A.jpg", numer: 1 },
			{ nazwa: "B.jpg", numer: 2 },
			{ nazwa: "D.jpg", numer: 4 },
		]);
	});

	test("część numerów: traci reszta", () => {
		expect(tracace([2, 4])).toEqual([{ nazwa: "A.jpg", numer: 1 }]);
	});
});

describe("liczbaLubNull() i tekstLubNull()", () => {
	test("bierze pierwszą liczbę z listy", () => {
		expect(liczbaLubNull(100)).toBe(100);
		expect(liczbaLubNull([100, 0])).toBe(100);
		expect(liczbaLubNull(new Uint16Array([200, 0]))).toBe(200);
	});

	test.each([0, -1, NaN, Infinity, "100", null, undefined, {}])("odrzuca zero, ujemne, NaN, tekst i obiekty: %j", (wartosc) => {
		expect(liczbaLubNull(wartosc)).toBeNull();
	});

	test("przycina tekst, pusty daje null", () => {
		expect(tekstLubNull("  NIKON D7500 ")).toBe("NIKON D7500");
		for (const wartosc of ["", "   ", 5, null]) expect(tekstLubNull(wartosc)).toBeNull();
	});
});

describe("parsujKategorie() i bezBom()", () => {
	test("lista kategorii z polskimi literami", () => {
		expect(parsujKategorie('["Zegarki","Złoto"]')).toEqual(["Zegarki", "Złoto"]);
	});

	test("zły format daje pustą listę", () => {
		expect(parsujKategorie('"Zegarki"')).toEqual([]);
		expect(parsujKategorie("zepsute")).toEqual([]);
		expect(parsujKategorie(null)).toEqual([]);
	});

	test("usuwa BOM z początku", () => {
		expect(bezBom("\uFEFF[]")).toBe("[]");
		expect(bezBom("[]")).toBe("[]");
	});
});

// Testy nie mogą uruchomić scripts/sync-images.mjs (zakaz w AGENTS.md), więc czytamy go jako tekst.
// Błąd przenosin (np. brak nazwy w imporcie) wyszedłby inaczej dopiero u Wiktora przy dodawaniu zdjęć.
describe("Skrypt korzysta z modułu poprawnie", () => {
	const skrypt = readFileSync(new URL("../../scripts/sync-images.mjs", import.meta.url), "utf8");
	const tekstModulu = readFileSync(new URL("../../scripts/sync-images-funkcje.mjs", import.meta.url), "utf8");
	const eksportowane = Object.keys(modul);

	const dopasowanie = skrypt.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/sync-images-funkcje\.mjs'/);
	const zaimportowane = (dopasowanie?.[1] ?? "")
		.split(",")
		.map((n) => n.trim())
		.filter(Boolean);

	// Kod skryptu bez komentarzy. Proste wyrażenie utnie też np. "https://…" w tekście do końca linii —
	// na takich liniach nie ma nazw z modułu, więc wynik testu to nie zmienia.
	const kodBezKomentarzy = skrypt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
	const kodBezImportu = kodBezKomentarzy.replace(/import\s*\{[^}]*\}\s*from\s*'\.\/sync-images-funkcje\.mjs';?/, "");

	test("importuje tylko nazwy eksportowane przez moduł", () => {
		expect(zaimportowane.length).toBeGreaterThan(0);
		for (const nazwa of zaimportowane) expect(eksportowane, `nazwa z importu: ${nazwa}`).toContain(nazwa);
	});

	test("importuje każdą funkcję modułu, której używa", () => {
		const uzywane = eksportowane.filter((nazwa) => new RegExp(`\\b${nazwa}\\b`).test(kodBezImportu));
		for (const nazwa of uzywane) expect(zaimportowane, `używana w skrypcie: ${nazwa}`).toContain(nazwa);
	});

	test("nie definiuje drugi raz funkcji z modułu", () => {
		for (const nazwa of eksportowane) {
			expect(kodBezKomentarzy, `definicja: ${nazwa}`).not.toMatch(new RegExp(`function\\s+${nazwa}\\s*\\(|const\\s+${nazwa}\\s*=`));
		}
	});

	test("moduł nie ma readline ani process.exit", () => {
		expect(tekstModulu).not.toContain("readline");
		expect(tekstModulu).not.toContain("process.exit");
	});

	// Do R2 pod zdjecia/ może iść tylko bufor z plikiDoWgrania() — czysty i sprawdzony z oryginałem.
	// Ciało funkcji skryptu: od nagłówka do pierwszej klamry zamykającej na początku linii.
	const cialo = (nazwa: string) =>
		kodBezKomentarzy.match(new RegExp(`async function ${nazwa}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";

	test("przygotujDoWgrania() składa pliki przez plikiDoWgrania()", () => {
		expect(cialo("przygotujDoWgrania")).toMatch(/\bplikiDoWgrania\s*\(/);
	});

	test("skrypt nie woła sam wyczyscExifDoR2()", () => {
		expect(kodBezKomentarzy).not.toMatch(/\bwyczyscExifDoR2\s*\(/);
	});

	test("wyslijBuforDoR2() jest wołane tylko w wgrajDoR2()", () => {
		const wystapienia = kodBezKomentarzy.match(/\bwyslijBuforDoR2\s*\(/g) ?? [];
		const definicje = kodBezKomentarzy.match(/function\s+wyslijBuforDoR2\s*\(/g) ?? [];
		expect(definicje).toHaveLength(1);
		expect(wystapienia.length - definicje.length).toBe(1);
		expect(cialo("wgrajDoR2")).toMatch(/\bwyslijBuforDoR2\s*\(/);
	});

	// Decyzje (czy dodać zdjęcie bez „przed”, co podpowiedzieć przy błędzie R2) są w module i mają testy
	// wyżej — skrypt ma z nich korzystać, a nie rozstrzygać na własną rękę.
	test("pytanie o brak „przed” rozstrzyga czyDodacBezPrzed()", () => {
		expect(cialo("dodajNoweZdjecia")).toMatch(/\bczyDodacBezPrzed\s*\(/);
	});

	test("błędy R2 dostają dopisek z podpowiedzDoBleduR2(), bez kluczy R2 wpisanych na sztywno", () => {
		for (const nazwa of ["wyslijBuforDoR2", "usunZR2"]) {
			expect(cialo(nazwa), `${nazwa}: podpowiedzDoBleduR2`).toMatch(/\bpodpowiedzDoBleduR2\s*\(/);
			expect(cialo(nazwa), `${nazwa}: tekst na sztywno`).not.toContain("sprawdź klucze R2_* w .env");
		}
		expect(kodBezKomentarzy).not.toContain("sprawdź klucze R2_*");
	});

	test("zwykłe dodawanie wypisuje pominięte pliki i JPG bez oznaczenia, a nie tylko PNG", () => {
		const dodawanie = cialo("dodajNoweZdjecia");
		expect(dodawanie).toMatch(/\bbezOznaczenia\b/);
		expect(dodawanie).toMatch(/\bostrzezOPominietych\s*\(\s*pominiete\s*,\s*bezOznaczenia\s*\)/);
		expect(kodBezKomentarzy).not.toContain("Pominięte PNG");
		expect(kodBezKomentarzy).not.toContain("Pomijam pliki PNG");
	});

	test("przerwana --podmien mówi, że wystarczy uruchomić to samo polecenie jeszcze raz", () => {
		expect(kodBezKomentarzy).toContain("Podmiana nie skończyła się — baza i galeria.json są bez zmian.");
		expect(kodBezKomentarzy).toMatch(/npm run sync-images -- --podmien \$\{opcjeUruchomienia\.plik\}/);
	});
});

// scripts/sprawdz-czyszczenie.mjs uruchamia tylko Wiktor (czyta images/), więc testy czytają go jako tekst:
// ma tylko czytać — bez R2, .env i zapisu plików. Jego logika (sprawdzCzyszczenie, podsumowanieSprawdzenia)
// jest w module i ma testy wyżej i w tests/integracyjne/sync-images.test.ts.
describe("scripts/sprawdz-czyszczenie.mjs tylko czyta", () => {
	const skrypt = readFileSync(new URL("../../scripts/sprawdz-czyszczenie.mjs", import.meta.url), "utf8");
	const kod = skrypt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

	test("importuje tylko node:fs, node:path, sharp, exifr i moduł", () => {
		const zrodla = [...kod.matchAll(/\bimport\b[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1]);
		expect(zrodla.length).toBeGreaterThan(0);
		for (const zrodlo of zrodla) {
			expect(["node:fs", "node:path", "sharp", "exifr", "./sync-images-funkcje.mjs"], `import: ${zrodlo}`).toContain(zrodlo);
		}
		expect(kod).not.toMatch(/\bimport\s*\(/); // bez ładowania czegokolwiek w trakcie działania
		expect(kod).not.toMatch(/\brequire\s*\(/);
	});

	test("nie wysyła, nie zapisuje plików i nie czyta zmiennych środowiskowych", () => {
		const zakazane = [
			/wyslij/i,
			/aws4fetch/,
			/\bfetch\s*\(/,
			/writeFile/,
			/appendFile/,
			/createWriteStream/,
			/copyFile/,
			/\brename/,
			/\bunlink/,
			/\brm(Sync|dir)?\b/,
			/\bmkdir/,
			/process\.env/,
		];
		for (const wzorzec of zakazane) expect(kod, String(wzorzec)).not.toMatch(wzorzec);
	});

	test("importuje z modułu tylko nazwy, które moduł eksportuje", () => {
		const nazwy = (kod.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/sync-images-funkcje\.mjs'/)?.[1] ?? "")
			.split(",")
			.map((n) => n.trim())
			.filter(Boolean);
		expect(nazwy.length).toBeGreaterThan(0);
		for (const nazwa of nazwy) expect(Object.keys(modul), `nazwa z importu: ${nazwa}`).toContain(nazwa);
	});
});
