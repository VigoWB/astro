import { test, expect } from '@playwright/test';

test.describe('Strona 404', () => {
	test('nieistniejący adres zwraca kod 404 i pokazuje komunikat', async ({ page }) => {
		const response = await page.goto('/ta-strona-na-pewno-nie-istnieje');

		expect(response?.status()).toBe(404);
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
		await expect(page.getByText('Nie znaleziono strony')).toBeVisible();
	});

	test('link zwrotny prowadzi na stronę główną', async ({ page }) => {
		await page.goto('/ta-strona-na-pewno-nie-istnieje');

		await page.getByRole('link', { name: /Wróć na stronę główną/ }).click();
		await expect(page).toHaveURL('/');
	});
});