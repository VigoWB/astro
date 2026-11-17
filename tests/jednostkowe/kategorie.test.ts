import { afterEach, describe, expect, test, vi } from "vitest";

// Lista przycisków filtrów w galerii (src/data/kategorie.ts) liczona z galeria.json —
// tu z podstawionych danych, więc test nie zależy od prawdziwych zdjęć.

const GALERIA = "../../src/data/galeria.json";
const pelne = { klucz: "zdjecia/DSC_1.jpg", szerokosc: 3000, wysokosc: 2000 };

async function kategorieDla(zdjecia: unknown[]) {
	vi.resetModules();
	vi.doMock(GALERIA, () => ({ default: zdjecia }));
	const { kategorie } = await import("../../src/data/kategorie");
	return kategorie;
}

afterEach(() => {
	vi.doUnmock(GALERIA);
});

describe("kategorie filtrów", () => {
	test("„Wszystkie” na początku, reszta bez powtórzeń, ułożona po polsku", async () => {
		const kategorie = await kategorieDla([
			{ ...pelne, kategorie: ["Zegarki", "Łańcuszki"] },
			{ ...pelne, kategorie: ["Lustra", "Zegarki"] },
		]);
		expect(kategorie).toEqual(["Wszystkie", "Lustra", "Łańcuszki", "Zegarki"]);
	});

	test("pomija zdjęcia, których galeria nie pokaże (bez klucza albo wymiarów)", async () => {
		const kategorie = await kategorieDla([
			{ ...pelne, kategorie: ["Zegarki"] },
			{ ...pelne, klucz: null, kategorie: ["Spinki"] },
			{ ...pelne, szerokosc: null, kategorie: ["Pióra"] },
		]);
		expect(kategorie).toEqual(["Wszystkie", "Zegarki"]);
	});

	test("pomija pustą nazwę i „Wszystkie” wpisane przy zdjęciu", async () => {
		const kategorie = await kategorieDla([{ ...pelne, kategorie: ["", "  ", "Wszystkie", "Spinki"] }]);
		expect(kategorie).toEqual(["Wszystkie", "Spinki"]);
	});

	test("bez zdjęć zostaje sam przycisk „Wszystkie”", async () => {
		expect(await kategorieDla([])).toEqual(["Wszystkie"]);
	});
});
