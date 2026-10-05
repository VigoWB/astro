import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STRONY } from './pomocnicze';

// Pełny zestaw reguł WCAG 2.0, 2.1 i 2.2 na poziomach A i AA + dobre praktyki axe.
// Uwaga: sam tag "wcag2aa" NIE obejmuje reguł poziomu A (tekst alternatywny obrazka,
// nazwa przycisku i linku, etykieta pola, język strony…) — każdy poziom trzeba wymienić.
const TAGI_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// Uruchamia axe i zwraca naruszenia jako krótkie opisy (reguła, opis, elementy) —
// w raporcie od razu widać, co i gdzie poprawić. Wyłączenie reguły tylko jawnie, z powodem.
// Pomijamy okienko Turnstile: to ramka z kodem Cloudflare, na który nie mamy wpływu.
async function naruszeniaAxe(page: Page, wylaczoneReguly: string[] = []): Promise<string[]> {
	const wynik = await new AxeBuilder({ page })
		.withTags(TAGI_WCAG)
		.exclude('.cf-turnstile')
		.disableRules(wylaczoneReguly)
		.analyze();
	return wynik.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const sciezka of STRONY) {
	test(`a11y: ${sciezka} – brak naruszeń WCAG A/AA`, async ({ page }) => {
		await page.goto(sciezka);
		expect(await naruszeniaAxe(page)).toEqual([]);
	});
}

test('a11y: Skip link pozwala pominąć nawigację klawiaturą', async ({ page }) => {
	await page.goto('/');

	// Pierwszy Tab na stronie ma trafić w link "Przejdź do treści"
	await page.keyboard.press('Tab');
	const skipLink = page.getByRole('link', { name: 'Przejdź do treści' });
	await expect(skipLink).toBeFocused();

	// Aktywacja linku przenosi focus na główną treść
	await page.keyboard.press('Enter');
	await expect(page.locator('#glowna-tresc')).toBeFocused();
});

// Zależnie od tego, czy w galeria.json jest oznaczona para do suwaka (npm run sync-images
// -- --wyroznij) z pasującymi proporcjami "przed"/"po", strona główna pokazuje suwak albo
// zastępczy przełącznik "Pokaż przed" — test sprawdza to, co faktycznie jest na stronie.
test('a11y: Strona główna – porównanie przed/po działa klawiaturą i naprawdę zmienia obraz', async ({ page }) => {
	await page.goto('/');

	const przed = page.locator('[data-porownanie-przed]');
	const suwak = page.locator('[data-porownanie-suwak]');
	if ((await suwak.count()) > 0) {
		await suwak.focus();
		await expect(suwak).toBeFocused();
		await expect(suwak).toHaveValue('50');
		await page.keyboard.press('ArrowRight');
		await expect(suwak).toHaveValue('51');
		// Wartość suwaka zmienia sama przeglądarka — sprawdzamy, że nasz skrypt przesunął
		// też odsłonięcie zdjęcia "przed" (clip-path) i linię podziału.
		await expect(przed).toHaveAttribute('style', /49%/);
		await expect(page.locator('[data-porownanie-linia]')).toHaveAttribute('style', /left: 51%/);
		return;
	}

	const przelacznik = page.locator('[data-porownanie-przelacznik]');
	await przelacznik.focus();
	await expect(przelacznik).toBeFocused();
	await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
	await expect(przed).toBeHidden();

	await page.keyboard.press('Enter');
	await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');
	await expect(przed).toBeVisible();

	await page.keyboard.press('Space');
	await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
	await expect(przed).toBeHidden();
});

test('a11y: Galeria – filtry działają klawiaturą (Tab, Enter, Spacja)', async ({ page }) => {
	await page.goto('/galeria/');

	const przyciski = page.getByTestId('gallery-filters').getByRole('button');
	test.skip((await przyciski.count()) < 2, 'W galerii nie ma jeszcze żadnej kategorii');
	const wszystkie = przyciski.first();
	const kategoria = przyciski.nth(1);

	await wszystkie.focus();
	await page.keyboard.press('Tab');
	await expect(kategoria).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(kategoria).toHaveAttribute('aria-pressed', 'true');
	await expect(wszystkie).toHaveAttribute('aria-pressed', 'false');

	await page.keyboard.press('Shift+Tab');
	await expect(wszystkie).toBeFocused();
	await page.keyboard.press('Space');
	await expect(wszystkie).toHaveAttribute('aria-pressed', 'true');
	await expect(kategoria).toHaveAttribute('aria-pressed', 'false');
});

test('a11y: Lightbox – Tab krąży tylko po lightboksie, Escape zamyka i oddaje fokus karcie', async ({ page }) => {
	await page.goto('/galeria/');

	const karta = page.getByTestId('gallery-item').first();
	const lightbox = page.getByRole('dialog', { name: 'Podgląd zdjęcia' });
	const zamknij = page.getByRole('button', { name: 'Zamknij podgląd' });
	const fokusWLightboksie = () => lightbox.evaluate((el) => el.contains(document.activeElement));

	await karta.focus();
	await page.keyboard.press('Enter');
	await expect(lightbox).toBeVisible();
	await expect(zamknij).toBeFocused();

	// Tab przechodzi po elementach lightboxa i z ostatniego wraca na "Zamknij" — nigdy na stronę pod spodem.
	let wrocilNaZamknij = false;
	for (let i = 0; i < 10 && !wrocilNaZamknij; i++) {
		await page.keyboard.press('Tab');
		expect(await fokusWLightboksie(), 'Tab wyprowadził fokus poza lightbox').toBe(true);
		wrocilNaZamknij = await zamknij.evaluate((el) => el === document.activeElement);
	}
	expect(wrocilNaZamknij, 'Tab z ostatniego elementu nie wrócił na "Zamknij"').toBe(true);

	// Shift+Tab z pierwszego elementu idzie na ostatni element lightboxa, a nie na stronę.
	await page.keyboard.press('Shift+Tab');
	expect(await fokusWLightboksie(), 'Shift+Tab wyprowadził fokus poza lightbox').toBe(true);
	await expect(zamknij).not.toBeFocused();

	// Escape zamyka i oddaje fokus karcie, z której otwarto podgląd.
	await page.keyboard.press('Escape');
	await expect(lightbox).toBeHidden();
	await expect(karta).toBeFocused();
});

test('a11y: Lightbox otwarty – brak naruszeń WCAG A/AA', async ({ page }) => {
	await page.goto('/galeria/');
	await page.getByTestId('gallery-item').first().click();
	await expect(page.getByRole('dialog', { name: 'Podgląd zdjęcia' })).toBeVisible();

	expect(await naruszeniaAxe(page)).toEqual([]);
});

test('a11y: Menu mobilne – otwiera się klawiaturą, Tab krąży po menu, Escape zamyka', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/');

	const przycisk = page.getByRole('button', { name: 'Menu', exact: true });
	const menu = page.locator('#menu-mobilne');
	const linki = menu.getByRole('link');

	await expect(menu).toBeHidden();
	await przycisk.focus();
	await page.keyboard.press('Enter');
	await expect(menu).toBeVisible();
	await expect(przycisk).toHaveAttribute('aria-expanded', 'true');
	await expect(linki.first()).toBeFocused();

	// Tab idzie po kolei po wszystkich linkach (ile ich jest — test nie zakłada liczby),
	// a po ostatnim wraca na przycisk menu (pułapka fokusu).
	const ileLinkow = await linki.count();
	for (let i = 1; i < ileLinkow; i++) {
		await page.keyboard.press('Tab');
		await expect(linki.nth(i)).toBeFocused();
	}
	await page.keyboard.press('Tab');
	await expect(przycisk).toBeFocused();

	// Shift+Tab z przycisku wraca na ostatni link
	await page.keyboard.press('Shift+Tab');
	await expect(linki.last()).toBeFocused();

	// Escape zamyka menu (naprawdę znika) i oddaje fokus przyciskowi.
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(przycisk).toHaveAttribute('aria-expanded', 'false');
	await expect(przycisk).toBeFocused();
});

test('a11y: Menu mobilne otwarte – brak naruszeń WCAG A/AA', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Menu', exact: true }).click();
	await expect(page.locator('#menu-mobilne')).toBeVisible();

	expect(await naruszeniaAxe(page)).toEqual([]);
});

test('a11y: Formularz z komunikatami błędów – brak naruszeń WCAG A/AA', async ({ page }) => {
	// Komunikaty błędów (czerwony tekst) pojawiają się dopiero po próbie wysyłki —
	// zwykły skan /kontakt/ ich nie widzi, więc ich kontrast sprawdzamy tutaj.
	await page.goto('/kontakt/');
	await page.getByTestId('contact-submit').click();
	await expect(page.locator('#kontakt-name-blad')).not.toBeEmpty();

	expect(await naruszeniaAxe(page)).toEqual([]);
});
