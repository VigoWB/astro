import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { STRONY_POZA_SITEMAPA } from "../../astro.config.mjs";
import { STRONA_404, STRONA_OFFLINE, STRONY } from "../strony";

// Lista stron w tests/strony.ts jest wzorcem. Dwie inne listy pisane ręcznie muszą się z nią zgadzać:
// - public/sw.js (POZOSTALE) — strony zapisywane do trybu offline,
// - lighthouserc.json (ci.collect.url) — strony, które CI ocenia Lighthouse.
// Obie mają zawierać dokładnie „strony do pokazania”: wszystkie z listy STRONY poza stroną offline, stroną 404
// i szkicami ukrytymi przed Google (STRONY_POZA_SITEMAPA w astro.config.mjs, np. /oferta/).
// Sitemapę sprawdza tests/sitemapa.spec.ts (potrzebuje zbudowanej strony).

const stronyDoPokazania = STRONY.filter(
	(strona) => strona !== STRONA_OFFLINE && strona !== STRONA_404 && !STRONY_POZA_SITEMAPA.includes(strona)
);

function czytajPlik(sciezka: string): string {
	return readFileSync(join(process.cwd(), sciezka), "utf8");
}

// Czego brakuje w liście i co jest w niej nadmiarowe — w komunikacie testu, żeby od razu było widać, co poprawić.
function roznica(plik: string, znalezione: string[], oczekiwane: string[]) {
	const brakuje = oczekiwane.filter((strona) => !znalezione.includes(strona));
	const nadmiarowe = znalezione.filter((strona) => !oczekiwane.includes(strona));
	const komunikat =
		`${plik} nie zgadza się z listą stron do pokazania (tests/strony.ts bez strony offline, 404 i szkiców z STRONY_POZA_SITEMAPA). ` +
		`Brakuje: ${brakuje.length ? brakuje.join(", ") : "—"}. Nadmiarowe: ${nadmiarowe.length ? nadmiarowe.join(", ") : "—"}.`;
	return { brakuje, nadmiarowe, komunikat };
}

describe("lista stron do pokazania", () => {
	test("nie jest pusta i nie zawiera strony offline, 404 ani szkiców", () => {
		expect(stronyDoPokazania.length).toBeGreaterThan(0);
		expect(stronyDoPokazania).not.toContain(STRONA_OFFLINE);
		expect(stronyDoPokazania).not.toContain(STRONA_404);
		for (const szkic of STRONY_POZA_SITEMAPA) expect(stronyDoPokazania).not.toContain(szkic);
	});
});

describe("public/sw.js", () => {
	// Podstrony to wpisy z tablicy POZOSTALE kończące się na „/” (reszta to ikony, czcionki, manifest).
	function podstronyZSw(): string[] {
		const tekst = czytajPlik("public/sw.js");
		const tablica = tekst.match(/const POZOSTALE = \[([\s\S]*?)\];/);
		if (!tablica) {
			throw new Error("Nie znalazłem tablicy `const POZOSTALE = [...]` w public/sw.js — czy ktoś ją przemianował? Popraw tests/jednostkowe/strony.test.ts.");
		}
		const wpisy = [...tablica[1].matchAll(/(['"])(.*?)\1/g)].map(([, , adres]) => adres);
		return wpisy.filter((adres) => adres.endsWith("/"));
	}

	test("podstrony z POZOSTALE to dokładnie strony do pokazania (ukryta strona w sw.js = błąd)", () => {
		const { brakuje, nadmiarowe, komunikat } = roznica("public/sw.js (POZOSTALE)", podstronyZSw(), stronyDoPokazania);
		expect({ brakuje, nadmiarowe }, komunikat).toEqual({ brakuje: [], nadmiarowe: [] });
	});
});

describe("lighthouserc.json", () => {
	// Adresy w lighthouserc.json mają postać http://localhost/galeria/index.html (statyczny katalog dist/),
	// a lista stron — /galeria/. Strona główna: http://localhost/index.html ↔ /.
	function stronyZLighthouse(): string[] {
		const konfiguracja = JSON.parse(czytajPlik("lighthouserc.json")) as { ci?: { collect?: { url?: string[] } } };
		const adresy = konfiguracja.ci?.collect?.url;
		if (!Array.isArray(adresy)) {
			throw new Error("W lighthouserc.json nie ma listy ci.collect.url — czy ktoś zmienił układ pliku? Popraw tests/jednostkowe/strony.test.ts.");
		}
		return adresy.map((adres) => new URL(adres).pathname.replace(/index\.html$/, ""));
	}

	test("ci.collect.url to dokładnie strony do pokazania", () => {
		const { brakuje, nadmiarowe, komunikat } = roznica("lighthouserc.json (ci.collect.url)", stronyZLighthouse(), stronyDoPokazania);
		expect({ brakuje, nadmiarowe }, komunikat).toEqual({ brakuje: [], nadmiarowe: [] });
	});
});
