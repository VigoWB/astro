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

	test('stuknięcie obok menu zamyka je, a przyciemnione tło znika', async ({ page }) => {
		const przycisk = page.getByRole('button', { name: 'Menu', exact: true });
		const menu = page.locator('#menu-mobilne');
		const tlo = page.locator('#tlo-menu');

		await expect(tlo).toBeHidden();
		await przycisk.click();
		await expect(menu).toBeVisible();
		await expect(tlo).toBeVisible();

		// Dół ekranu — pod menu, w przyciemnione tło.
		await tlo.click({ position: { x: 187, y: 600 } });
		await expect(menu).toBeHidden();
		await expect(tlo).toBeHidden();
		await expect(przycisk).toHaveAttribute('aria-expanded', 'false');
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

// Przyklejony pasek u góry (telefon, tablet) nie może zasłaniać elementu, który dostaje fokus z klawiatury
// (WCAG 2.4.11 „Focus Not Obscured”) — zwłaszcza przy Shift+Tab w górę strony, gdy przeglądarka dosuwa
// element do górnej krawędzi okna.
test.describe('fokus a przyklejony pasek na telefonie', () => {
	test('Shift+Tab w górę po galerii nie chowa elementu z fokusem pod paskiem', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/galeria/');

		const karty = page.getByTestId('gallery-item');
		const widoczne = karty.filter({ visible: true });
		const ile = await widoczne.count();
		expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi').toBeGreaterThanOrEqual(4);

		// Start na dole strony, na ostatniej widocznej karcie (fokus z klawiatury: najpierw filtr, potem Tab).
		await page.getByTestId('gallery-filters').getByRole('button').last().focus();
		await page.keyboard.press('Tab');
		await expect(widoczne.first()).toBeFocused();
		for (let i = 1; i < ile; i++) await page.keyboard.press('Tab');
		await expect(widoczne.last()).toBeFocused();
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await expect.poll(() => wysokoscPaska(page)).toBe(60);

		// Wracamy Shift+Tabem karta po karcie aż do filtrów — po każdym kroku element z fokusem leży pod paskiem, a nie za nim.
		for (let krok = 0; krok < ile + 2; krok++) {
			await page.keyboard.press('Shift+Tab');
			const odstep = await page.evaluate(() => {
				const pasek = document.getElementById('pasek-naglowka')!.getBoundingClientRect();
				const aktywny = document.activeElement!.getBoundingClientRect();
				return aktywny.top - pasek.bottom;
			});
			expect(odstep, `Krok ${krok + 1}: element z fokusem schowany pod paskiem (jego górna krawędź jest ${-odstep} px nad dolną krawędzią paska)`).toBeGreaterThanOrEqual(0);
		}
	});
});

// Stopka: link do bieżącej strony ma aria-current="page", tak jak w nagłówku — reszta linków nie.
test.describe('stopka: aria-current', () => {
	for (const [adres, nazwa] of [
		['/galeria/', 'Galeria'],
		['/o-mnie/', 'O mnie'],
		['/faq/', 'Najczęstsze pytania'],
		['/polityka-prywatnosci/', 'Polityka prywatności'],
	]) {
		test(`${adres}: w stopce tylko „${nazwa}” jest aktualną stroną`, async ({ page }) => {
			await page.goto(adres);
			const stopka = page.getByRole('contentinfo');
			await expect(stopka.getByRole('link', { name: nazwa, exact: true })).toHaveAttribute('aria-current', 'page');
			await expect(stopka.locator('a[aria-current="page"]')).toHaveCount(1);
		});
	}

	test('strona bez linku w stopce (404) nie ma w niej aria-current', async ({ page }) => {
		await page.goto('/ta-strona-na-pewno-nie-istnieje');
		await expect(page.getByRole('contentinfo').locator('[aria-current]')).toHaveCount(0);
	});
});
