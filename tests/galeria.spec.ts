import { test, expect } from '@playwright/test';

test.describe('Galeria', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/galeria');
		// Poczekaj na załadowanie galerii
		await page.waitForLoadState('networkidle');
		await page.waitForSelector('[data-testid="gallery-item"]', { state: 'attached' });
	});

	test('filtr kategorii: pokazuje tylko zdjęcia z wybranej kategorii', async ({ page }) => {
		// Pobierz początkową liczbę widocznych kart (Wszystkie)
		const allItems = page.locator('[data-testid="gallery-item"]:not(.hidden)');
		const initialCount = await allItems.count();

		// Kliknij filtr "Portrety"
		await page.click('[data-testid="filter-portrety"]');

		// Sprawdź aria-pressed
		await expect(page.locator('[data-testid="filter-portrety"]')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('[data-testid="filter-wszystkie"]')).toHaveAttribute('aria-pressed', 'false');

		// Poczekaj na animację filtrowania
		await page.waitForTimeout(300);

		// Sprawdź, że widoczne są tylko karty z kategorią Portrety
		const visibleItems = page.locator('[data-testid="gallery-item"]:not(.hidden)');
		const visibleCount = await visibleItems.count();

		// Każda widoczna karta powinna mieć kategorię Portrety
		const items = await visibleItems.all();
		for (const item of items) {
			const kategoria = await item.getAttribute('data-kategoria');
			expect(kategoria).toContain('Portrety');
		}

		// Liczba widocznych kart powinna być mniejsza lub równa początkowej
		expect(visibleCount).toBeLessThanOrEqual(initialCount);
		expect(visibleCount).toBeGreaterThan(0);
	});

	test('filtr "Wszystkie" pokazuje wszystkie zdjęcia z powrotem', async ({ page }) => {
		// Najpierw przefiltruj do Portrety
		await page.click('[data-testid="filter-portrety"]');
		await page.waitForTimeout(300);

		const portretyCount = await page.locator('[data-testid="gallery-item"]:not(.hidden)').count();

		// Teraz kliknij "Wszystkie"
		await page.click('[data-testid="filter-wszystkie"]');
		await page.waitForTimeout(300);

		// Sprawdź aria-pressed
		await expect(page.locator('[data-testid="filter-wszystkie"]')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('[data-testid="filter-portrety"]')).toHaveAttribute('aria-pressed', 'false');

		// Wszystkie karty powinny być widoczne
		const allCount = await page.locator('[data-testid="gallery-item"]:not(.hidden)').count();
		expect(allCount).toBeGreaterThan(portretyCount);
	});

	test('"załaduj więcej": pokazuje kolejną porcję zdjęć, a licznik zgadza się z rzeczywistością', async ({ page }) => {
		const naStrone = Number(await page.locator('#galeria-grid').getAttribute('data-na-strone'));
		const wszystkie = await page.locator('[data-testid="gallery-item"]').count();

		// Przycisk pojawia się tylko wtedy, gdy zdjęć jest więcej niż jedna porcja.
		test.skip(wszystkie <= naStrone, 'Za mało zdjęć, żeby przycisk "załaduj więcej" się pojawił');

		const widoczne = page.locator('[data-testid="gallery-item"]:not(.hidden)');
		const licznik = page.locator('[data-testid="load-more-count"]');

		// Na start widać dokładnie jedną porcję, a licznik pokazuje, ile zostało.
		await expect(widoczne).toHaveCount(naStrone);
		await expect(licznik).toHaveText(String(wszystkie - naStrone));

		await page.click('[data-testid="load-more-btn"]');

		// Po kliknięciu dochodzi kolejna porcja (albo wszystkie pozostałe).
		await expect(widoczne).toHaveCount(Math.min(wszystkie, naStrone * 2));
		await expect(licznik).toHaveText(String(Math.max(wszystkie - naStrone * 2, 0)));

		// Gdy nie ma już czego doładowywać, przycisk znika.
		if (wszystkie <= naStrone * 2) {
			await expect(page.locator('[data-testid="load-more-container"]')).toBeHidden();
		}
	});

	test('load more po filtrowaniu: ładuje tylko zdjęcia z aktywnej kategorii', async ({ page }) => {
		// Filtruj do Portrety
		await page.click('[data-testid="filter-portrety"]');
		await page.waitForTimeout(300);

		// Sprawdź czy są jakiekolwiek zdjęcia do doładowania
		const initialLabel = await page.locator('[data-testid="load-more-count"]').textContent();
		const initialRemaining = parseInt(initialLabel || '0', 10);

		if (initialRemaining === 0) {
			await expect(page.locator('[data-testid="load-more-container"]')).toBeHidden();
			return;
		}

		const initialFilteredCount = await page.locator('[data-testid="gallery-item"]:not(.hidden)').count();

		// Kliknij "załaduj więcej"
		await page.click('[data-testid="load-more-btn"]');
		await page.waitForTimeout(500);

		// Nowe widoczne karty też muszą być z kategorią Portrety
		const newFilteredCount = await page.locator('[data-testid="gallery-item"]:not(.hidden)').count();
		expect(newFilteredCount).toBeGreaterThanOrEqual(initialFilteredCount);

		const items = await page.locator('[data-testid="gallery-item"]:not(.hidden)').all();
		for (const item of items) {
			const kategoria = await item.getAttribute('data-kategoria');
			expect(kategoria).toContain('Portrety');
		}
	});

	test('filtry działają klawiaturą (Tab + Enter)', async ({ page }) => {
		// Fokusuj pierwszy filtr
		await page.locator('[data-testid="filter-wszystkie"]').focus();
		await expect(page.locator('[data-testid="filter-wszystkie"]')).toBeFocused();

		// Tab do "Portrety"
		await page.keyboard.press('Tab');
		await expect(page.locator('[data-testid="filter-portrety"]')).toBeFocused();

		// Enter aktywuje filtr
		await page.keyboard.press('Enter');
		await page.waitForTimeout(300);

		await expect(page.locator('[data-testid="filter-portrety"]')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('[data-testid="filter-wszystkie"]')).toHaveAttribute('aria-pressed', 'false');
	});
});
