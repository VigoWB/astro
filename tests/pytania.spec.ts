import { test, expect } from '@playwright/test';
import { podstawAtrapeTurnstile } from './pomocnicze';

// Najczęstsze pytania na /faq/ (src/pages/faq.astro, treść w src/components/NajczestszePytania.astro):
// rozwijane <details>/<summary>, bez JavaScriptu. Dostępność i CSP tej strony sprawdzają a11y.spec.ts
// i csp.spec.ts; tu sprawdzamy, że pytania się rozwijają i że prowadzą do nich linki ze strony kontaktu i ze stopki.

test.describe('Najczęstsze pytania', () => {
	test('pytania są zwinięte i rozwijają się z klawiatury', async ({ page }) => {
		await page.goto('/faq/');
		const pytania = page.getByTestId('pytanie');
		await expect(pytania).not.toHaveCount(0);

		const pierwsze = pytania.first();
		const odpowiedz = pierwsze.getByTestId('pytanie-odpowiedz');
		await expect(odpowiedz).toBeHidden();

		await pierwsze.locator('summary').focus();
		await page.keyboard.press('Enter');
		await expect(pierwsze).toHaveAttribute('open', '');
		await expect(odpowiedz).toBeVisible();

		await page.keyboard.press('Enter');
		await expect(pierwsze).not.toHaveAttribute('open');
		await expect(odpowiedz).toBeHidden();
	});

	test('link „najczęstsze pytania” na stronie kontaktu prowadzi na /faq/', async ({ page }) => {
		await podstawAtrapeTurnstile(page);
		await page.goto('/kontakt/');
		await page.getByTestId('link-do-pytan').click();
		await expect(page).toHaveURL(/\/faq\/$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Najczęstsze pytania' })).toBeVisible();
	});

	test('stopka ma link do najczęstszych pytań', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Najczęstsze pytania' })).toHaveAttribute(
			'href',
			'/faq/'
		);
	});
});
