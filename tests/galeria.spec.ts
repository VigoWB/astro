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

	test('lightbox: pokazuje zmniejszone zdjęcie z naszej domeny, a nie oryginał z R2', async ({ page, baseURL }) => {
		const karta = page.locator('[data-testid="gallery-item"]').first();
		await karta.click();

		const zdjecie = page.locator('#lightbox-img');
		await expect(zdjecie).toBeVisible();

		// Poczekaj, aż przeglądarka wybierze i wczyta plik z srcset.
		await expect.poll(() => zdjecie.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
		const { adres, szerokosc } = await zdjecie.evaluate((img: HTMLImageElement) => ({
			adres: img.currentSrc,
			szerokosc: img.naturalWidth,
		}));

		expect(adres.startsWith(`${baseURL}/_astro/`)).toBe(true);
		expect(adres).toMatch(/\.webp$/);
		expect(szerokosc).toBeLessThanOrEqual(1920);

		// Wersja "przed" (jeśli jest) też pochodzi z /_astro/, a nie z R2.
		const przed = await karta.getAttribute('data-przed');
		if (przed) {
			expect(przed).toMatch(/^\/_astro\/.+\.webp$/);
		}
	});

	test('lightbox: przełącznik "Pokaż przed" działa klawiaturą i podmienia zdjęcie', async ({ page }) => {
		const karta = page.locator('[data-testid="gallery-item"]').first();
		const maWersjePrzed = Boolean(await karta.getAttribute('data-przed'));
		test.skip(!maWersjePrzed, 'Pierwsze zdjęcie w danych testowych nie ma wersji "przed"');

		await karta.click();

		const zdjecie = page.locator('#lightbox-img');
		const przelacznik = page.locator('[data-testid="lightbox-przelacznik"]');

		await expect(przelacznik).toBeVisible();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');

		await expect.poll(() => zdjecie.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
		const adresPo = await zdjecie.evaluate((img: HTMLImageElement) => img.currentSrc);

		// Klawiatura: dojście do przełącznika samym Tabem (jak ktoś bez myszki) i Enter.
		await expect(page.locator('#lightbox-close')).toBeFocused();
		for (let i = 0; i < 5 && !(await przelacznik.evaluate((el) => el === document.activeElement)); i++) {
			await page.keyboard.press('Tab');
		}
		await expect(przelacznik).toBeFocused();
		await page.keyboard.press('Enter');

		await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => zdjecie.evaluate((img: HTMLImageElement) => img.currentSrc)).not.toBe(adresPo);

		// Powrót do "po" tym samym przełącznikiem.
		await przelacznik.click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
		await expect.poll(() => zdjecie.evaluate((img: HTMLImageElement) => img.currentSrc)).toBe(adresPo);
	});

	test('lightbox: przyciski poprzednie/następne, licznik i stan na krawędziach', async ({ page }) => {
		// Nawigacja liczy tylko zdjęcia aktualnie widoczne (filtr, "Załaduj więcej") —
		// przy więcej niż jednej porcji to mniej niż wszystkie karty w DOM.
		const wszystkie = await page.locator('[data-testid="gallery-item"]:not(.hidden)').count();
		test.skip(wszystkie < 2, 'Potrzeba co najmniej 2 widocznych zdjęć, żeby sprawdzić nawigację');

		await page.locator('[data-testid="gallery-item"]').first().click();

		const licznik = page.locator('[data-testid="lightbox-licznik"]');
		const poprzednie = page.locator('[data-testid="lightbox-poprzednie"]');
		const nastepne = page.locator('[data-testid="lightbox-nastepne"]');
		const zdjecie = page.locator('#lightbox-img');

		// Pierwsze zdjęcie: licznik "1 / N", "poprzednie" wyłączone.
		await expect(licznik).toHaveText(`1 / ${wszystkie}`);
		await expect(poprzednie).toBeDisabled();
		await expect(nastepne).toBeEnabled();

		await expect.poll(() => zdjecie.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
		const adresPierwszego = await zdjecie.evaluate((img: HTMLImageElement) => img.currentSrc);

		await nastepne.click();
		await expect(licznik).toHaveText(`2 / ${wszystkie}`);
		await expect(poprzednie).toBeEnabled();
		await expect.poll(() => zdjecie.evaluate((img: HTMLImageElement) => img.currentSrc)).not.toBe(adresPierwszego);

		// Powrót strzałką klawiatury.
		await page.keyboard.press('ArrowLeft');
		await expect(licznik).toHaveText(`1 / ${wszystkie}`);
		await expect(poprzednie).toBeDisabled();

		// Przejście na sam koniec listy (klawiaturą) — "następne" ma się wyłączyć.
		for (let i = 1; i < wszystkie; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await expect(licznik).toHaveText(`${wszystkie} / ${wszystkie}`);
		await expect(nastepne).toBeDisabled();
		await expect(poprzednie).toBeEnabled();
	});

	test('lightbox: przełącznik "Pokaż przed" resetuje się po przejściu do kolejnego zdjęcia', async ({ page }) => {
		const karty = page.locator('[data-testid="gallery-item"]');
		const wszystkie = await karty.count();
		test.skip(wszystkie < 2, 'Potrzeba co najmniej 2 zdjęć');

		const pierwszaMaPrzed = Boolean(await karty.first().getAttribute('data-przed'));
		test.skip(!pierwszaMaPrzed, 'Pierwsze zdjęcie w danych testowych nie ma wersji "przed"');

		await karty.first().click();

		const przelacznik = page.locator('[data-testid="lightbox-przelacznik"]');
		await przelacznik.click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');

		await page.locator('[data-testid="lightbox-nastepne"]').click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
	});

	test('lightbox: przeglądanie działa dotykiem (przesunięcie palcem)', async ({ page }) => {
		const wszystkie = await page.locator('[data-testid="gallery-item"]:not(.hidden)').count();
		test.skip(wszystkie < 2, 'Potrzeba co najmniej 2 widocznych zdjęć');

		await page.locator('[data-testid="gallery-item"]').first().click();

		const zdjecie = page.locator('#lightbox-img');
		const licznik = page.locator('[data-testid="lightbox-licznik"]');
		await expect(licznik).toHaveText(`1 / ${wszystkie}`);

		// Symulacja przesunięcia palcem bez potrzeby kontekstu z prawdziwym dotykiem —
		// odpalamy te same zdarzenia, które łapie nasz listener (touchstart/touchend
		// z changedTouches[0].clientX). "identifier" jest wymagane przez konstruktor Touch.
		await zdjecie.dispatchEvent('touchstart', { changedTouches: [{ identifier: 0, clientX: 300, clientY: 200 }] });
		await zdjecie.dispatchEvent('touchend', { changedTouches: [{ identifier: 0, clientX: 200, clientY: 200 }] });

		// Przesunięcie w lewo (mniejsze X na końcu) → następne zdjęcie.
		await expect(licznik).toHaveText(`2 / ${wszystkie}`);
	});
});
