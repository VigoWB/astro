import type { APIRequestContext } from '@playwright/test';
import { test, expect, STRONY, STRONA_404, STRONA_OFFLINE, wczytajStronyPozaSitemapa } from './pomocnicze';

// Sitemapa (/sitemap-0.xml, robi ją @astrojs/sitemap przy buildzie) ma zawierać dokładnie „strony do pokazania”:
// wszystkie z listy STRONY (tests/strony.ts) poza stroną offline, stroną 404 i szkicami ukrytymi przed Google
// (STRONY_POZA_SITEMAPA w astro.config.mjs, np. /oferta/). Listy w public/sw.js i lighthouserc.json sprawdza
// tests/jednostkowe/strony.test.ts.

const DOMENA = 'https://balansbieli.pl';

const pozaSitemapa = wczytajStronyPozaSitemapa();
const stronyDoPokazania = STRONY.filter((strona) => strona !== STRONA_OFFLINE && strona !== STRONA_404 && !pozaSitemapa.includes(strona));

// Same <loc> stron. Zdjęcia galerii są w <image:loc> (osobny znacznik), więc ten wzorzec ich nie łapie.
async function adresyStronZSitemapy(request: APIRequestContext): Promise<string[]> {
	const odpowiedz = await request.get('/sitemap-0.xml');
	expect(odpowiedz.status(), 'Brak /sitemap-0.xml w buildzie testowym').toBe(200);
	const xml = await odpowiedz.text();
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, adres]) => adres);
}

test.describe('Sitemapa', () => {
	test('zawiera wszystkie strony do pokazania i nic ponadto', async ({ request }) => {
		const adresy = await adresyStronZSitemapy(request);
		const oczekiwane = stronyDoPokazania.map((strona) => `${DOMENA}${strona}`);

		const brakuje = oczekiwane.filter((adres) => !adresy.includes(adres));
		const nadmiarowe = adresy.filter((adres) => !oczekiwane.includes(adres));
		expect(
			{ brakuje, nadmiarowe },
			'Sitemapa nie zgadza się z listą stron do pokazania (tests/strony.ts bez strony offline, 404 i STRONY_POZA_SITEMAPA)'
		).toEqual({ brakuje: [], nadmiarowe: [] });
	});

	// Lista STRONY_POZA_SITEMAPA i sitemapa powstają z tego samego pliku, więc same nie wykryją błędnego wpisu
	// (strona gotowa, a wypisana z sitemapy: Google przestaje o niej wiedzieć). Niezależny dowód, że wpis jest
	// celowy: to szkic, a szkice mają noindex (astro.config.mjs, AGENTS.md sekcja 10, „Ukryta podstrona”).
	test('strony z STRONY_POZA_SITEMAPA to szkice z noindex', async ({ page }) => {
		for (const strona of pozaSitemapa) {
			await page.goto(strona);
			await expect(
				page.locator('meta[name="robots"]'),
				`${strona} jest w STRONY_POZA_SITEMAPA (astro.config.mjs), ale nie ma noindex — gotowa strona wypadłaby z sitemapy. Szkic ma mieć prop bezIndeksowania; gotową usuń z tej listy`
			).toHaveAttribute('content', 'noindex');
		}
	});

	test('nie ma w niej stron z STRONY_POZA_SITEMAPA', async ({ request }) => {
		const adresy = await adresyStronZSitemapy(request);
		for (const strona of pozaSitemapa) {
			expect(adresy, `${strona} jest w STRONY_POZA_SITEMAPA (astro.config.mjs), a trafiła do sitemapy`).not.toContain(`${DOMENA}${strona}`);
		}
	});
});
