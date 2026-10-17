import { test, expect, type Page } from '@playwright/test';

// Nagłówek ma dwa układy (Header.astro): na telefonie i tablecie pasek u góry, który
// zwija się przy przewijaniu (96 → 60 px), a na komputerze (od 1024 px) pasek boczny.

const wysokoscPaska = (page: Page) =>
	page.locator('#pasek-naglowka').evaluate((el) => el.getBoundingClientRect().height);

// Górna krawędź treści liczona od początku strony (nie od okna) — przy zwijaniu paska nie może się zmienić.
const poczatekTresci = (page: Page) =>
	page.locator('#glowna-tresc').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

test.describe('nagłówek na telefonie', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/galeria/');
	});

	test('na górze strony pasek ma 96 px, po przewinięciu zwija się do 60 px, a treść się nie przesuwa', async ({ page }) => {
		await expect.poll(() => wysokoscPaska(page)).toBe(96);
		const przed = await poczatekTresci(page);

		await page.evaluate(() => window.scrollTo(0, 400));
		await expect.poll(() => wysokoscPaska(page)).toBe(60);
		expect(await poczatekTresci(page)).toBe(przed);

		await page.evaluate(() => window.scrollTo(0, 0));
		await expect.poll(() => wysokoscPaska(page)).toBe(96);
	});

	test('menu otwiera się tuż pod paskiem — i dużym, i zwiniętym', async ({ page }) => {
		const przycisk = page.getByRole('button', { name: 'Menu', exact: true });
		const menu = page.locator('#menu-mobilne');
		const gornaKrawedzMenu = () => menu.evaluate((el) => el.getBoundingClientRect().top);

		await przycisk.click();
		await expect(menu).toBeVisible();
		await expect.poll(gornaKrawedzMenu).toBe(96);
		await przycisk.click();

		await page.evaluate(() => window.scrollTo(0, 400));
		await expect.poll(() => wysokoscPaska(page)).toBe(60);
		await przycisk.click();
		await expect(menu).toBeVisible();
		await expect.poll(gornaKrawedzMenu).toBe(60);
	});
});

test.describe('nagłówek na komputerze', () => {
	test('pasek boczny z menu stoi w miejscu, a treść zaczyna się obok niego', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto('/galeria/');

		const naglowek = page.locator('#naglowek');
		await expect(page.getByRole('navigation', { name: 'Główna nawigacja' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden();

		const prawaKrawedzPaska = await naglowek.evaluate((el) => el.getBoundingClientRect().right);
		const lewaKrawedzTresci = await page.locator('#glowna-tresc').evaluate((el) => el.getBoundingClientRect().left);
		expect(lewaKrawedzTresci).toBeGreaterThanOrEqual(prawaKrawedzPaska);

		await page.evaluate(() => window.scrollTo(0, 400));
		await expect.poll(() => naglowek.evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
	});
});
