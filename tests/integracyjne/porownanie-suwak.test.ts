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

async function wyrenderuj(trybSuwaka: boolean) {
	const kontener = await AstroContainer.create({ astroConfig: { site: "https://balansbieli.pl" } });
	return kontener.renderToString(PorownanieSuwak, {
		props: {
			po: wersja("po"),
			przed: wersja("przed"),
			opis: "Złoty zegarek",
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
