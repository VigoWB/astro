import { beforeEach, describe, expect, test, vi } from "vitest";

// src/lib/galeria.ts przy buildzie: pyta R2 o każdy plik (HEAD), wybiera wersję ze znakiem wodnym
// albo czysty oryginał, dopisuje do adresu wersję z ETag i zleca webp do lightboksa.
// Tu R2 to atrapa `fetch`, a astro:assets — atrapa getImage() i inferRemoteSize(); dane zdjęć są podstawione.

vi.mock("astro:assets", () => ({
	getImage: vi.fn(async ({ src, width }: { src: string; width: number }) => ({
		src: `/_astro/atrapa-${width}.webp`,
		srcSet: { attribute: `atrapa ${src}` },
	})),
	inferRemoteSize: vi.fn(async () => ({ width: 3000, height: 2000 })),
}));

const R2 = "https://r2.atrapa.test";
const GALERIA = "../../src/data/galeria.json";
const ETAG = '"0123456789abcdef0123456789abcdef"';
const WERSJA = "0123456789ab"; // pierwsze 12 znaków ETag-u

function zdjecie(zmiany: Record<string, unknown> = {}) {
	return {
		nazwaPliku: "DSC_1.jpg",
		opis: "Złoty zegarek",
		kategorie: ["Zegarki"],
		szerokosc: 3000,
		wysokosc: 2000,
		klucz: "zdjecia/DSC_1.jpg",
		kluczPrzed: null,
		exif: { iso: null, przyslona: null, ogniskowa: null, czasNaswietlania: null, dataWykonania: null, make: null, model: null, lensModel: null },
		...zmiany,
	};
}

type Odpowiedz = { status: number; naglowki?: Record<string, string> } | Error;

// Atrapa R2: dla każdego zapytania funkcja dostaje adres bez części po „?” i zwraca odpowiedź albo błąd sieci.
function atrapaR2(odpowiedz: (adres: string) => Odpowiedz = () => ({ status: 200, naglowki: { etag: ETAG } })) {
	const zapytania: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (adres: string, opcje?: RequestInit) => {
			zapytania.push(`${opcje?.method ?? "GET"} ${adres}`);
			const wynik = odpowiedz(adres.split("?")[0]);
			if (wynik instanceof Error) throw wynik;
			return new Response(null, { status: wynik.status, headers: wynik.naglowki });
		})
	);
	return zapytania;
}

// Świeży moduł galeria.ts dla każdego testu: wynik wczytajZdjecia() jest zapamiętywany na cały build.
async function wczytaj(dane: unknown[]) {
	vi.resetModules();
	vi.doMock(GALERIA, () => ({ default: dane }));
	const galeria = await import("../../src/lib/galeria");
	const assets = await import("astro:assets");
	return { galeria, getImage: vi.mocked(assets.getImage), inferRemoteSize: vi.mocked(assets.inferRemoteSize) };
}

let ostrzezenia: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	// Ukośnik na końcu celowo — galeria.ts ma go usunąć.
	vi.stubEnv("PUBLIC_R2_URL", `${R2}/`);
	ostrzezenia = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("wczytajZdjecia()", () => {
	test("miniatura z czystego oryginału, lightbox z wersji ze znakiem — oba z wersją z ETag", async () => {
		const zapytania = atrapaR2();
		const { galeria, getImage } = await wczytaj([zdjecie()]);
		const [z] = await galeria.wczytajZdjecia();

		expect(z.po).toEqual({ src: `${R2}/zdjecia/DSC_1.jpg?v=${WERSJA}`, width: 3000, height: 2000 });
		expect(getImage).toHaveBeenCalledWith({
			src: `${R2}/znak/DSC_1.jpg?v=${WERSJA}`,
			width: 1920,
			height: 1280,
			widths: [1280, 1920],
			format: "webp",
		});
		expect(z.lightbox.po).toMatchObject({ szerokosc: 1920, wysokosc: 1280 });
		expect(z.lightbox.przed).toBeUndefined();
		// Każde sprawdzenie w R2 to HEAD z jednorazowym ?sprawdz= (omija pamięć Cloudflare).
		expect(zapytania.length).toBeGreaterThan(0);
		for (const zapytanie of zapytania) expect(zapytanie).toMatch(/^HEAD .+\?sprawdz=\d+$/);
	});

	test("brak wersji ze znakiem (404) → czysty oryginał i ostrzeżenie z podpowiedzią", async () => {
		atrapaR2((adres) => (adres.includes("/znak/") ? { status: 404 } : { status: 200, naglowki: { etag: ETAG } }));
		const { galeria, getImage } = await wczytaj([zdjecie()]);
		await galeria.wczytajZdjecia();

		expect(getImage).toHaveBeenCalledWith(expect.objectContaining({ src: `${R2}/zdjecia/DSC_1.jpg?v=${WERSJA}` }));
		expect(ostrzezenia).toHaveBeenCalledWith(expect.stringContaining("npm run sync-images -- --podmien DSC_1.jpg"));
	});

	test("R2 zwraca błąd (500) → build przerwany", async () => {
		atrapaR2(() => ({ status: 500 }));
		const { galeria } = await wczytaj([zdjecie()]);
		await expect(galeria.wczytajZdjecia()).rejects.toThrow("R2 zwróciło 500");
	});

	test("R2 nie odpowiada → build przerwany", async () => {
		atrapaR2(() => new TypeError("fetch failed"));
		const { galeria } = await wczytaj([zdjecie()]);
		await expect(galeria.wczytajZdjecia()).rejects.toThrow("R2 nie odpowiada");
	});

	test("bez ETag wersja z daty ostatniej zmiany (Last-Modified)", async () => {
		const data = "Tue, 17 Nov 2026 10:00:00 GMT";
		atrapaR2(() => ({ status: 200, naglowki: { "last-modified": data } }));
		const { galeria } = await wczytaj([zdjecie()]);
		const [z] = await galeria.wczytajZdjecia();
		expect(z.po.src).toBe(`${R2}/zdjecia/DSC_1.jpg?v=${Date.parse(data) / 1000}`);
	});

	test("polskie litery w nazwie pliku są zakodowane w adresie", async () => {
		atrapaR2();
		const { galeria } = await wczytaj([zdjecie({ klucz: "zdjecia/październik_26_EDYCJA_DSC7102.jpg" })]);
		const [z] = await galeria.wczytajZdjecia();
		expect(z.po.src).toBe(`${R2}/zdjecia/pa%C5%BAdziernik_26_EDYCJA_DSC7102.jpg?v=${WERSJA}`);
	});

	test("zdjęcie bez klucza albo wymiarów jest pomijane z ostrzeżeniem", async () => {
		atrapaR2();
		const { galeria } = await wczytaj([zdjecie(), zdjecie({ nazwaPliku: "DSC_2.jpg", klucz: null })]);
		expect(await galeria.wczytajZdjecia()).toHaveLength(1);
		expect(ostrzezenia).toHaveBeenCalledWith(expect.stringContaining("pomijam DSC_2.jpg"));
	});

	test("„przed” ze znakiem: wymiary z R2 i osobna wersja do lightboksa", async () => {
		atrapaR2();
		const { galeria, inferRemoteSize } = await wczytaj([zdjecie({ kluczPrzed: "zdjecia/przed_DSC_1.jpg" })]);
		inferRemoteSize.mockResolvedValueOnce({ width: 2000, height: 3000, format: "jpg" });
		const [z] = await galeria.wczytajZdjecia();

		expect(inferRemoteSize).toHaveBeenCalledWith(`${R2}/znak/przed_DSC_1.jpg?v=${WERSJA}`);
		expect(z.lightbox.przed).toMatchObject({ szerokosc: 1280, wysokosc: 1920 });
	});

	test("brak pliku „przed” → build przerwany z nazwą zdjęcia", async () => {
		atrapaR2();
		const { galeria, inferRemoteSize } = await wczytaj([zdjecie({ kluczPrzed: "zdjecia/przed_DSC_1.jpg" })]);
		inferRemoteSize.mockRejectedValueOnce(new Error("404"));
		await expect(galeria.wczytajZdjecia()).rejects.toThrow('nie mogę pobrać wersji "przed" dla DSC_1.jpg');
	});

	test("bez PUBLIC_R2_URL build kończy się jasnym błędem", async () => {
		vi.stubEnv("PUBLIC_R2_URL", "");
		await expect(wczytaj([zdjecie()])).rejects.toThrow("Brak zmiennej PUBLIC_R2_URL");
	});
});

describe("zdjeciaDlaGoogle()", () => {
	test("bierze dużą wersję z lightboksa, nie oryginał z R2", async () => {
		atrapaR2();
		const { galeria } = await wczytaj([zdjecie()]);
		const zdjecia = await galeria.wczytajZdjecia();
		expect(galeria.zdjeciaDlaGoogle(zdjecia)).toEqual([
			{ po: { src: "/_astro/atrapa-1920.webp", width: 1920, height: 1280 }, opis: "Złoty zegarek" },
		]);
	});
});
