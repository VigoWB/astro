import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, test } from "vitest";
import PorownanieSuwak from "../../src/components/PorownanieSuwak.astro";

// PorownanieSuwak.astro w obu trybach (suwak z linią i zwykły przełącznik „Pokaż przed”), renderowany
// w izolacji (Container API Astro). Sprawdzamy tylko klasy napisów leżących na zdjęciu, nie zachowanie:
// zasada z konwencji — biały napis na zdjęciu stoi na co najmniej bg-cien/75 (kontrast 7:1 na białym zdjęciu).

function wersja(nazwa: string) {
	return {
		src: `/_astro/${nazwa}.webp`,
		srcset: `/_astro/${nazwa}.webp 1280w`,
		sizes: "100vw",
		szerokosc: 1920,
		wysokosc: 1280,
	};
}

// Domyślnie zdjęcie ma wersję „przed” i opis „Złoty zegarek”; `przed: null` to zdjęcie bez wersji „przed”.
async function wyrenderuj(
	trybSuwaka: boolean,
	{ przed = wersja("przed"), opis = "Złoty zegarek" }: { przed?: ReturnType<typeof wersja> | null; opis?: string } = {}
) {
	const kontener = await AstroContainer.create({ astroConfig: { site: "https://balansbieli.pl" } });
	return kontener.renderToString(PorownanieSuwak, {
		props: {
			po: wersja("po"),
			przed: przed ?? undefined,
			opis,
			szerokoscOryginalu: 1920,
			wysokoscOryginalu: 1280,
			trybSuwaka,
		},
		request: new Request("https://balansbieli.pl/"),
	});
}

// Elementy, które zaczynają się od tekstu (etykiety, podpowiedź, przycisk): tekst i klasy.
function elementyZTekstem(html: string): { tekst: string; klasy: string }[] {
	return [...html.matchAll(/<(\w+)\s([^>]*)>\s*([^<\s][^<]*?)\s*<\/\1>/g)].map((m) => ({
		tekst: m[3],
		klasy: /class="([^"]*)"/.exec(m[2])?.[1] ?? "",
	}));
}

function klasyElementu(html: string, tekst: string): string {
	const element = elementyZTekstem(html).find((e) => e.tekst === tekst);
	expect(element, `w HTML nie ma elementu z tekstem „${tekst}”`).toBeDefined();
	return element!.klasy;
}

describe("PorownanieSuwak.astro: napisy na zdjęciu stoją na bg-cien/75", () => {
	test("tryb suwaka: etykiety „Przed” i „Po” oraz podpowiedź", async () => {
		const html = await wyrenderuj(true);

		for (const tekst of ["Przed", "Po", "Przesuń linię, żeby porównać"]) {
			expect(klasyElementu(html, tekst), tekst).toContain("bg-cien/75");
		}
	});

	test("tryb przełącznika: przycisk „Pokaż przed”", async () => {
		const html = await wyrenderuj(false);

		expect(klasyElementu(html, "Pokaż przed")).toContain("bg-cien/75");
	});

	test.each([
		["suwaka", true],
		["przełącznika", false],
	])("tryb %s: żaden element z tekstem nie ma nakładki słabszej niż /75", async (_nazwa, trybSuwaka) => {
		const html = await wyrenderuj(trybSuwaka);

		const zNakladka = elementyZTekstem(html).filter((e) => /bg-cien\/\d+/.test(e.klasy));
		expect(zNakladka.length).toBeGreaterThan(0);
		for (const element of zNakladka) {
			expect(element.klasy, element.tekst).not.toContain("bg-cien/70");
			expect(element.klasy, element.tekst).toContain("bg-cien/75");
		}
	});
});

// Struktura HTML w obu trybach: które elementy są na stronie, a których nie ma. Zachowanie w przeglądarce
// (przeciąganie, klawiatura) sprawdzają testy e2e na danych testowych, które mają parę do suwaka —
// dlatego tryb przełącznika sprawdzamy tutaj, na samym HTML-u.

// Wszystkie znaczniki otwierające, np. `<img src="…" alt="">` (komentarze i teksty pomijamy).
function znaczniki(html: string): string[] {
	return html.match(/<[a-z][^>]*>/g) ?? [];
}

function maAtrybut(znacznik: string, atrybut: string): boolean {
	return new RegExp(`\\s${atrybut}(?=[\\s=>])`).test(znacznik);
}

function wartosc(znacznik: string, atrybut: string): string | null {
	return new RegExp(`\\s${atrybut}="([^"]*)"`).exec(znacznik)?.[1] ?? null;
}

function zAtrybutem(html: string, atrybut: string): string[] {
	return znaczniki(html).filter((z) => maAtrybut(z, atrybut));
}

function jedenZAtrybutem(html: string, atrybut: string): string {
	const znalezione = zAtrybutem(html, atrybut);
	expect(znalezione, `w HTML ma być dokładnie jeden element z atrybutem ${atrybut}`).toHaveLength(1);
	return znalezione[0];
}

function klasy(znacznik: string): string[] {
	return (wartosc(znacznik, "class") ?? "").split(/\s+/).filter(Boolean);
}

function zdjeciePo(html: string): string | undefined {
	return znaczniki(html).find((z) => z.startsWith("<img") && wartosc(z, "src") === "/_astro/po.webp");
}

describe("PorownanieSuwak.astro: struktura HTML w obu trybach", () => {
	test("tryb przełącznika z „przed”: jeden przycisk „Pokaż przed”, ukryte „przed”, bez elementów suwaka", async () => {
		const html = await wyrenderuj(false);

		expect(html.match(/<button\b/g), "ma być dokładnie jeden <button>").toHaveLength(1);
		const przycisk = jedenZAtrybutem(html, "data-porownanie-przelacznik");
		expect(przycisk.startsWith("<button")).toBe(true);
		expect(wartosc(przycisk, "type")).toBe("button");
		expect(wartosc(przycisk, "aria-pressed")).toBe("false");
		expect(html).toMatch(/<button\b[^>]*>\s*Pokaż przed\s*<\/button>/);

		const przed = jedenZAtrybutem(html, "data-porownanie-przed");
		expect(wartosc(przed, "alt")).toBe("");
		expect(wartosc(przed, "aria-hidden")).toBe("true");
		expect(klasy(przed)).toContain("hidden");
		expect(klasy(przed)).toContain("object-contain");

		for (const atrybut of ["data-porownanie-suwak", "data-porownanie-linia", "data-porownanie-podpowiedz"]) {
			expect(zAtrybutem(html, atrybut), atrybut).toHaveLength(0);
		}
		const teksty = elementyZTekstem(html).map((e) => e.tekst);
		for (const tekst of ["Przed", "Po", "Przesuń linię, żeby porównać"]) {
			expect(teksty, tekst).not.toContain(tekst);
		}
		expect(html).not.toContain("Przesuń linię, żeby porównać");
	});

	test("tryb suwaka z „przed”: suwak z etykietą, bez przycisku, „przed” widoczne", async () => {
		const html = await wyrenderuj(true);

		const suwak = jedenZAtrybutem(html, "data-porownanie-suwak");
		expect(suwak.startsWith("<input")).toBe(true);
		expect(wartosc(suwak, "type")).toBe("range");
		expect(wartosc(suwak, "value")).toBe("50");
		expect(wartosc(suwak, "aria-label")).toBe("Porównaj zdjęcie przed i po retuszu: Złoty zegarek");

		expect(zAtrybutem(html, "data-porownanie-przelacznik")).toHaveLength(0);
		expect(html).not.toContain("<button");

		const przed = jedenZAtrybutem(html, "data-porownanie-przed");
		expect(klasy(przed)).not.toContain("hidden");
	});

	test.each([
		["suwaka", true],
		["przełącznika", false],
	])("tryb %s bez „przed”: tylko zdjęcie „po”, bez „przed”, suwaka i przycisku", async (_nazwa, trybSuwaka) => {
		const html = await wyrenderuj(trybSuwaka, { przed: null });

		for (const atrybut of ["data-porownanie-przed", "data-porownanie-suwak", "data-porownanie-przelacznik"]) {
			expect(zAtrybutem(html, atrybut), atrybut).toHaveLength(0);
		}
		expect(zdjeciePo(html), "zdjęcie „po” ma być na stronie").toBeDefined();
	});

	test.each([
		["", "Zdjęcie po retuszu"],
		["Złoty zegarek", "Złoty zegarek"],
	])("opis „%s” → alt zdjęcia „po”: „%s”", async (opis, oczekiwanyAlt) => {
		const html = await wyrenderuj(false, { opis });

		const po = zdjeciePo(html);
		expect(po, "zdjęcie „po” ma być na stronie").toBeDefined();
		expect(wartosc(po!, "alt")).toBe(oczekiwanyAlt);
	});
});
