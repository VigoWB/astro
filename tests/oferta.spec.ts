import { test, expect } from '@playwright/test';
import { STRONY, podstawAtrapeTurnstile } from './pomocnicze';

// /oferta/ to na razie szkic bez cen (src/pages/oferta.astro). Ma zostać ukryty: noindex, poza sitemapą
// i bez linku z innych stron. Gdy strona ma się pokazać, zmień ten test razem z resztą kroków
// z AGENTS.md (sekcja 10, „Ukryta podstrona”).

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
			await expect(page.locator('a[href^="/oferta"]'), sciezka).toHaveCount(0);
			await expect(page.locator('meta[name="robots"]'), sciezka).toHaveCount(0);
		}
	});

	test('nie ma jej w sitemapie, a pozostałe strony są', async ({ request }) => {
		const sitemapa = await (await request.get('/sitemap-0.xml')).text();
		expect(sitemapa).toContain('/faq/');
		expect(sitemapa).not.toContain('/oferta/');
	});
});
