import { test, expect } from '@playwright/test';
import { podstawAtrapeTurnstile } from './pomocnicze';

// Najczęstsze pytania na /kontakt/ (src/components/NajczestszePytania.astro): rozwijane
// <details>/<summary>, bez JavaScriptu. Dostępność i CSP tej strony sprawdzają a11y.spec.ts
// i csp.spec.ts; tu sprawdzamy, że pytania faktycznie się rozwijają i że link do nich działa.

test.describe('Najczęstsze pytania', () => {
	test.beforeEach(async ({ page }) => {
		await podstawAtrapeTurnstile(page);
		await page.goto('/kontakt/');
	});

	test('pytania są zwinięte i rozwijają się z klawiatury', async ({ page }) => {
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

	test('link „najczęstsze pytania” pod nagłówkiem przewija do sekcji z pytaniami', async ({ page }) => {
		const naglowek = page.getByRole('heading', { name: 'Najczęstsze pytania' });
		await page.getByTestId('link-do-pytan').click();
		await expect(page).toHaveURL(/#pytania$/);
		await expect(naglowek).toBeInViewport();
	});
});
