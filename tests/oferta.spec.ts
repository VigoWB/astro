import { test, expect, STRONY, STRONA_OFFLINE, podstawAtrapeTurnstile } from './pomocnicze';

// /oferta/ to na razie szkic bez cen (src/pages/oferta.astro). Ma zostać ukryty: noindex, poza sitemapą
// i bez linku z innych stron. Gdy strona ma się pokazać, zmień ten test razem z resztą kroków
// z AGENTS.md (sekcja 10, „Ukryta podstrona”). Że /oferta/ nie ma w public/sw.js ani w lighthouserc.json,
// pilnuje tests/jednostkowe/strony.test.ts, a że sitemapa ma dokładnie strony do pokazania — tests/sitemapa.spec.ts.

test.describe('Oferta (szkic, ukryta)', () => {
	test('strona działa, ale Google ma jej nie indeksować', async ({ page }) => {
		const odpowiedz = await page.goto('/oferta/');
		expect(odpowiedz?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1, name: 'Oferta' })).toBeVisible();
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	});

	test('pozostałe strony nie linkują do niej i nie mają noindex', async ({ page }) => {
		await podstawAtrapeTurnstile(page);
		for (const sciezka of STRONY.filter((s) => s !== '/oferta/')) {
			await page.goto(sciezka);
			// Wszystkie linki zamieniamy na adresy bezwzględne — wpis w stopce z pełnym adresem
			// (https://balansbieli.pl/oferta/) albo z adresem względnym (../oferta/) też jest linkiem do szkicu.
			const hrefy = await page.locator('a[href]').evaluateAll((linki) => linki.map((a) => a.getAttribute('href') ?? ''));
			const doOferty = hrefy.filter((href) => new URL(href, page.url()).pathname.startsWith('/oferta'));
			expect(doOferty, `${sciezka}: linki do /oferta`).toEqual([]);
			if (sciezka !== STRONA_OFFLINE) {
				// Strona offline ma noindex celowo (Google nie ma indeksować „Jesteś offline”) — sprawdza to tests/offline.spec.ts.
				await expect(page.locator('meta[name="robots"]'), sciezka).toHaveCount(0);
			}
		}
	});

	test('nie ma jej w sitemapie', async ({ request }) => {
		// Że pozostałe strony w sitemapie są, sprawdza tests/sitemapa.spec.ts.
		const sitemapa = await (await request.get('/sitemap-0.xml')).text();
		expect(sitemapa).not.toContain('/oferta/');
	});
});
