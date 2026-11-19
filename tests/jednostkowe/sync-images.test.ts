import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import * as modul from "../../scripts/sync-images-funkcje.mjs";
import {
	bezBom,
	bezPolskichLiter,
	kluczZnak,
	liczbaLubNull,
	nazwyWersjiPrzed,
	odczytajOpcje,
	parsujKategorie,
	plikiPrzedBezPary,
	rozbijNaNumery,
	tekstLubNull,
	wybierzPlikPrzed,
	wybierzZdjecia,
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
	];

	test("pomija pliki ukryte i inne niż JPG/PNG", () => {
		expect(wybierzZdjecia(pliki).zdjecia).toEqual([
			"DSC_1.jpg",
			"przed_DSC_1.jpg",
			"październik_26_EDYCJA_DSC7102.jpg",
			"październik_26_PRZED_DSC7102.jpg",
			"zegarek.jpg",
			"DSC_2.PNG",
			"DSC_3.jpeg",
		]);
	});

	test("kandydaci: z numerem DSC, bez przed, posortowani", () => {
		expect(wybierzZdjecia(pliki).kandydaci).toEqual([
			"DSC_1.jpg",
			"DSC_2.PNG",
			"DSC_3.jpeg",
			"październik_26_EDYCJA_DSC7102.jpg",
		]);
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
		expect(bezBom("﻿[]")).toBe("[]");
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
});
