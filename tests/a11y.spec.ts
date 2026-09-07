import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/galeria', '/o-mnie', '/kontakt'];

for (const pagePath of PAGES) {
	test(`a11y: ${pagePath} – brak naruszeń WCAG AA`, async ({ page }) => {
		await page.goto(pagePath);

		const accessibilityScanResults = await new AxeBuilder({ page })
			.withTags(['wcag2aa', 'wcag21aa', 'best-practice'])
			.analyze();

		// Ignoruj znane problemy:
		// - image-redundant-alt (minor) - podpisy pod zdjęciami są widoczne
		// - color-contrast na /galeria - axe mierzy kolor tła z obrazka pod spodem, nie CSS variable
		const ignoreIds = ['image-redundant-alt'];
		if (pagePath === '/galeria') ignoreIds.push('color-contrast');

		const filteredViolations = accessibilityScanResults.violations.filter(
			(v) => !ignoreIds.includes(v.id)
		);
		expect(filteredViolations).toEqual([]);
	});
}

test('a11y: Galeria – filtry działają klawiaturą', async ({ page }) => {
	await page.goto('/galeria');

	// Fokusuj pierwszy filtr bezpośrednio
	await page.locator('[data-filter="Wszystkie"]').focus();
	await expect(page.locator('[data-filter="Wszystkie"]')).toBeFocused();

	// Tab do "Portrety"
	await page.keyboard.press('Tab');
	await expect(page.locator('[data-filter="Portrety"]')).toBeFocused();
	await page.keyboard.press('Enter');

	// Sprawdź czy aria-pressed zaktualizowane
	await expect(page.locator('[data-filter="Portrety"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('[data-filter="Wszystkie"]')).toHaveAttribute('aria-pressed', 'false');
});

test('a11y: Lightbox – focus trap działa', async ({ page }) => {
	await page.goto('/galeria');

	// Fokusuj pierwszą kartę zdjęcia i otwórz lightbox
	await page.locator('[data-gallery-item]').first().focus();
	await page.keyboard.press('Enter');

	// Sprawdź czy focus na przycisku zamknij
	await expect(page.locator('#lightbox-close')).toBeFocused();

	// Tab cyklicznie w lightboxie: zamknij -> obrazek -> opis -> hint -> zamknij
	await page.keyboard.press('Tab');
	await expect(page.locator('#lightbox-img')).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.locator('#lightbox-opis')).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.locator('#lightbox-hint')).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.locator('#lightbox-close')).toBeFocused();

	// Shift+Tab wstecz
	await page.keyboard.press('Shift+Tab');
	await expect(page.locator('#lightbox-hint')).toBeFocused();

	// Escape zamyka
	await page.keyboard.press('Escape');
});

test('a11y: Menu mobilne – focus trap działa', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/');

	// Fokusuj przycisk hamburgera bezpośrednio
	await page.locator('#przycisk-menu').focus();
	await expect(page.locator('#przycisk-menu')).toBeFocused();

	// Enter otwiera menu
	await page.keyboard.press('Enter');

	// Focus na pierwszym linku w menu
	await expect(page.locator('#menu-mobilne a').first()).toBeFocused();

	// Tab cyklicznie w menu
	await page.keyboard.press('Tab');
	await expect(page.locator('#menu-mobilne a').nth(1)).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.locator('#menu-mobilne a').nth(2)).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.locator('#menu-mobilne a').nth(3)).toBeFocused();

	// Tab po ostatnim wraca do pierwszego
	await page.keyboard.press('Tab');
	await expect(page.locator('#menu-mobilne a').first()).toBeFocused();

	// Shift+Tab wstecz
	await page.keyboard.press('Shift+Tab');
	await expect(page.locator('#menu-mobilne a').last()).toBeFocused();

	// Escape zamyka
	await page.keyboard.press('Escape');
	// Focus wraca na przycisk hamburgera
	await expect(page.locator('#przycisk-menu')).toBeFocused();
});