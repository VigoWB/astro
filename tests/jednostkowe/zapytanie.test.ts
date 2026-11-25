import { describe, expect, test } from "vitest";
import { MAKS_DLUGOSC_OPISU, adresZapytania, oczyscOpis, tekstZapytania } from "../../src/lib/zapytanie";

// Link „Zapytaj o podobny retusz” (src/lib/zapytanie.ts): adres z opisem zdjęcia i tekst do pola „Wiadomość”.
// Parametr z adresu to tekst od obcej osoby — sprawdzamy, że funkcje zwracają go dosłownie i bezpiecznie
// dla adresu (kodowanie, limit, brak znaków sterujących). Ochrona przed HTML-em to wstawianie przez .value
// (testy e2e w tests/kontakt.spec.ts), a nie ucieczka znaków w tych funkcjach.

const PREFIKS = "Interesuje mnie retusz podobny do: ";

describe("oczyscOpis", () => {
	test.each([
		[null, ""],
		[undefined, ""],
		["", ""],
		["   ", ""],
		[" \n\t ", ""],
	])("brak opisu (%j) → pusty tekst", (wejscie, oczekiwane) => {
		expect(oczyscOpis(wejscie)).toBe(oczekiwane);
	});

	test("nowe linie, tabulatory i ciągi spacji zamienia na jedną spację", () => {
		expect(oczyscOpis("a\n\tb   c")).toBe("a b c");
		expect(oczyscOpis("a\r\nb")).toBe("a b");
	});

	test("obcina spacje z brzegów", () => {
		expect(oczyscOpis("  Złoty zegarek \n")).toBe("Złoty zegarek");
	});

	test.each([
		["\u0000", "NUL"],
		["\u001F", "koniec zakresu C0"],
		["\u007F", "DEL"],
		["\u0085", "znak sterujący z zakresu C1"],
	])("znak sterujący %j (%s) zamienia na spację", (znak) => {
		expect(oczyscOpis(`a${znak}b`)).toBe("a b");
		expect(oczyscOpis(`${znak}abc${znak}`)).toBe("abc");
	});

	test("twarda spacja i separator linii (U+2028) to też białe znaki", () => {
		expect(oczyscOpis("a b c")).toBe("a b c");
	});

	test("samotna połówka znaku (np. ucięte emoji) nie zostaje w tekście — encodeURIComponent by na niej rzucił błąd", () => {
		const wynik = oczyscOpis("a\uD83Db");
		expect(wynik).toBe("a b");
		expect(() => encodeURIComponent(wynik)).not.toThrow();
	});

	test("do MAKS_DLUGOSC_OPISU znaków zostaje bez zmian, dłuższy tekst jest ucinany", () => {
		expect(MAKS_DLUGOSC_OPISU).toBe(200);
		expect(oczyscOpis("a".repeat(200))).toBe("a".repeat(200));
		expect(oczyscOpis("a".repeat(250))).toBe("a".repeat(200));
	});

	test("emoji na granicy limitu zostaje całe albo wypada całe — nigdy na pół", () => {
		// 199 liter + emoji = dokładnie 200 znaków Unicode (emoji to 2 jednostki UTF-16, ale jeden znak).
		const miesciSie = "a".repeat(199) + "👍";
		expect(oczyscOpis(miesciSie)).toBe(miesciSie);

		// Emoji zaczyna się dopiero za limitem — wypada w całości, bez samotnej połówki.
		const poLimicie = oczyscOpis("a".repeat(200) + "👍");
		expect(poLimicie).toBe("a".repeat(200));

		// Dwa emoji na granicy: mieści się pierwsze, drugie wypada.
		const dwa = oczyscOpis("a".repeat(199) + "👍👍");
		expect(dwa).toBe("a".repeat(199) + "👍");
		expect(Array.from(dwa)).toHaveLength(200);
		expect(() => encodeURIComponent(dwa)).not.toThrow();
	});

	test("po ucięciu nie zostaje spacja na końcu", () => {
		expect(oczyscOpis("a".repeat(199) + " bbb")).toBe("a".repeat(199));
	});

	test("polskie znaki zostają, także przy limicie liczonym w znakach", () => {
		expect(oczyscOpis("Zażółć gęślą jaźń — ŻÓŁĆ")).toBe("Zażółć gęślą jaźń — ŻÓŁĆ");
		expect(oczyscOpis("ą".repeat(250))).toBe("ą".repeat(200));
	});

	test("oczyszczony tekst oczyszczony drugi raz się nie zmienia", () => {
		for (const tekst of ["a\n b  \tc", "a".repeat(199) + " bbb", "a".repeat(199) + "👍👍", "  x  "]) {
			expect(oczyscOpis(oczyscOpis(tekst))).toBe(oczyscOpis(tekst));
		}
	});
});

describe("adresZapytania", () => {
	test("bez opisu prowadzi na sam /kontakt/", () => {
		expect(adresZapytania("")).toBe("/kontakt/");
		expect(adresZapytania("   ")).toBe("/kontakt/");
		expect(adresZapytania("\n\t")).toBe("/kontakt/");
	});

	test("opis trafia do parametru ?zdjecie= zakodowany", () => {
		expect(adresZapytania("Zestaw: zegarek & spinki")).toBe("/kontakt/?zdjecie=Zestaw%3A%20zegarek%20%26%20spinki");
	});

	test("cudzysłowy „ ”, # i ? są zakodowane, a po odczytaniu wracają w całości", () => {
		const opis = "Spinki „AB” #1 — czy to ten? A=B";
		const adres = adresZapytania(opis);

		// Po znaku „?” przed parametrem nie ma niezakodowanych znaków, które zmieniłyby sens adresu.
		const parametr = adres.slice("/kontakt/?zdjecie=".length);
		expect(parametr).not.toMatch(/[#?&=„” ]/);
		expect(decodeURIComponent(parametr)).toBe(opis);

		// To samo z punktu widzenia przeglądarki: jeden parametr, bez fragmentu (#).
		const url = new URL(adres, "https://przyklad.pl");
		expect(url.pathname).toBe("/kontakt/");
		expect(url.hash).toBe("");
		expect([...url.searchParams.keys()]).toEqual(["zdjecie"]);
		expect(url.searchParams.get("zdjecie")).toBe(opis);
	});

	test("opis jest czyszczony i ucinany przed kodowaniem", () => {
		expect(adresZapytania("a\nb")).toBe("/kontakt/?zdjecie=a%20b");
		const dlugi = new URL(adresZapytania("x".repeat(1000)), "https://przyklad.pl").searchParams.get("zdjecie");
		expect(dlugi).toBe("x".repeat(MAKS_DLUGOSC_OPISU));
	});

	test("opis z samotną połówką znaku nie przerywa działania (encodeURIComponent rzuciłby błąd)", () => {
		expect(() => adresZapytania("a\uD83Db")).not.toThrow();
		expect(adresZapytania("a\uD83Db")).toBe("/kontakt/?zdjecie=a%20b");
	});
});

describe("tekstZapytania", () => {
	test("brak parametru albo sam biały znak: nic nie wpisujemy", () => {
		expect(tekstZapytania(null)).toBe("");
		expect(tekstZapytania("")).toBe("");
		expect(tekstZapytania("  ")).toBe("");
		expect(tekstZapytania("\n\t")).toBe("");
	});

	test("zdanie z opisem i dwiema nowymi liniami na końcu", () => {
		expect(tekstZapytania("Złoty zegarek")).toBe(`${PREFIKS}Złoty zegarek\n\n`);
	});

	test("HTML w parametrze zostaje dosłownym tekstem w środku zdania (ochroną jest wstawianie przez .value)", () => {
		expect(tekstZapytania("<img src=x onerror=alert(1)>")).toBe(`${PREFIKS}<img src=x onerror=alert(1)>\n\n`);
		expect(tekstZapytania("</textarea><script>alert(1)</script>")).toBe(`${PREFIKS}</textarea><script>alert(1)</script>\n\n`);
	});

	test("parametr jest czyszczony i ucinany do MAKS_DLUGOSC_OPISU znaków", () => {
		expect(tekstZapytania("a\nb")).toBe(`${PREFIKS}a b\n\n`);
		expect(tekstZapytania("ab".repeat(500))).toBe(`${PREFIKS}${"ab".repeat(100)}\n\n`);
	});

	test.each(["Zestaw: zegarek & spinki", "Spinki testowe z monogramem „AB”", "Zegarek 50% # 1? tak=nie"])(
		"cała droga: opis „%s” → adres → odczyt parametru → tekst wiadomości",
		(opis) => {
			const parametr = new URLSearchParams(new URL(adresZapytania(opis), "https://przyklad.pl").search).get("zdjecie");
			expect(tekstZapytania(parametr)).toBe(`${PREFIKS}${opis}\n\n`);
		}
	);
});
