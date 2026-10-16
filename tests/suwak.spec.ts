import { test, expect, type Page } from '@playwright/test';

// Suwak przed/po na stronie głównej (PorownanieSuwak.astro): przeciąganie myszą i palcem oraz opis wartości
// dla czytnika ekranu. Sprawdzamy skutek: gdzie stoi linia i które zdjęcie widać po obu jej stronach.
// Klawiaturę sprawdza a11y.spec.ts. Bez pary do suwaka (galeria.json) strona pokazuje przełącznik — testy się pomijają.

/** Środek linii jako procent szerokości zdjęcia (0 = lewa krawędź). */
function pozycjaLinii(page: Page): Promise<number> {
	return page.evaluate(() => {
		const ramka = document.querySelector('[data-porownanie]')!.getBoundingClientRect();
		const linia = document.querySelector('[data-porownanie-linia]')!.getBoundingClientRect();
		return ((linia.left + linia.width / 2 - ramka.left) / ramka.width) * 100;
	});
}

/** Czy w tym punkcie ekranu widać zdjęcie „przed” (clip-path odsłania je tylko po lewej stronie linii). */
function widacPrzed(page: Page, x: number, y: number): Promise<boolean> {
	return page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.hasAttribute('data-porownanie-przed') ?? false, [x, y]);
}

async function otworzSuwak(page: Page) {
	await page.goto('/');
	test.skip((await page.locator('[data-porownanie-suwak]').count()) === 0, 'Brak pary do suwaka — strona pokazuje przełącznik „Pokaż przed”');
	const ramka = (await page.locator('[data-porownanie]').boundingBox())!;
	return { y: ramka.y + ramka.height / 2, x: (procent: number) => ramka.x + (ramka.width * procent) / 100 };
}

test('suwak: przeciąganie myszą przesuwa linię i odsłania „przed” po lewej', async ({ page }) => {
	const { x, y } = await otworzSuwak(page);

	await page.mouse.move(x(50), y);
	await page.mouse.down();
	await page.mouse.move(x(25), y, { steps: 5 });
	await page.mouse.up();

	expect(await pozycjaLinii(page)).toBeCloseTo(25, 0);
	expect(await widacPrzed(page, x(10), y)).toBe(true);
	expect(await widacPrzed(page, x(40), y)).toBe(false);

	// Po puszczeniu przycisku samo najechanie myszą nie rusza linii.
	await page.mouse.move(x(80), y, { steps: 5 });
	expect(await pozycjaLinii(page)).toBeCloseTo(25, 0);
});

test('suwak: palcem — stuknięcie i ruch w poziomie przesuwają linię, przewijanie w pionie nie', async ({ page, browserName }, testInfo) => {
	test.skip(browserName !== 'chromium' || !testInfo.project.use.hasTouch, 'Dotyk sprawdzamy w Chromium z ekranem dotykowym (mobile-chrome)');
	const { x, y } = await otworzSuwak(page);
	// Playwright ma tylko stuknięcie (tap) — przeciąganie palcem wysyłamy przez protokół Chrome (CDP).
	const cdp = await page.context().newCDPSession(page);
	const dotyk = (type: 'touchStart' | 'touchMove' | 'touchEnd', punkt?: { x: number; y: number }) =>
		cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punkt ? [punkt] : [] });

	// Stuknięcie: linia skacze w stuknięte miejsce.
	await page.touchscreen.tap(x(75), y);
	expect(await pozycjaLinii(page)).toBeCloseTo(75, 0);

	// Ruch palcem w poziomie: linia idzie za palcem, po lewej widać „przed”.
	await dotyk('touchStart', { x: x(75), y });
	for (let krok = 1; krok <= 10; krok++) await dotyk('touchMove', { x: x(75 - 4.5 * krok), y });
	await dotyk('touchEnd');
	expect(await pozycjaLinii(page)).toBeCloseTo(30, 0);
	expect(await widacPrzed(page, x(15), y)).toBe(true);
	expect(await widacPrzed(page, x(45), y)).toBe(false);

	// Przewijanie w pionie zaczęte na zdjęciu: strona jedzie w dół, linia zostaje na 30%.
	await dotyk('touchStart', { x: x(80), y });
	for (let krok = 1; krok <= 10; krok++) await dotyk('touchMove', { x: x(80), y: y - 20 * krok });
	await dotyk('touchEnd');
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
	expect(await pozycjaLinii(page)).toBeCloseTo(30, 0);
});

test('suwak: czytnik ekranu dostaje opis wartości, a nie samą liczbę', async ({ page }) => {
	await otworzSuwak(page);
	const suwak = page.locator('[data-porownanie-suwak]');

	await expect(suwak).toHaveAttribute('aria-valuetext', '50% zdjęcia przed retuszem, 50% po retuszu');
	await suwak.focus();
	await page.keyboard.press('ArrowRight');
	await expect(suwak).toHaveAttribute('aria-valuetext', '51% zdjęcia przed retuszem, 49% po retuszu');
});
