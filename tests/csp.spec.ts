import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test Content-Security-Policy (CSP).
//
// Serwer podglądu (`astro preview`) nie czyta public/_headers — robi to dopiero
// Cloudflare Pages. Dlatego test sam dokleja do każdej naszej strony HTML nagłówek
// CSP przepisany z public/_headers (pod tą samą nazwą: tryb próbny "-Report-Only"
// albo docelowy) i zbiera zdarzenia "securitypolicyviolation", które przeglądarka
// wysyła przy każdym naruszeniu — w obu trybach.
//
// Zewnętrzne usługi (Turnstile, statystyki Cloudflare) sprawdzają się tylko tam,
// gdzie jest do nich dostęp (np. CI na GitHubie). Bez sieci po prostu się nie
// ładują — to nie jest naruszenie CSP, więc test i tak przechodzi.

declare global {
	interface Window {
		naruszeniaCsp: string[];
	}
}

interface Polityka {
	naglowek: string;
	wartosc: string;
}

function wczytajPolityke(): Polityka {
	const linie = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').split(/\r?\n/);
	for (const linia of linie) {
		// Nagłówki w _headers są wcięte pod ścieżką; linijki komentarzy zaczynają się od "#".
		const dopasowanie = linia.match(/^\s+(Content-Security-Policy(?:-Report-Only)?):\s*(.+)$/i);
		if (dopasowanie) {
			return { naglowek: dopasowanie[1], wartosc: dopasowanie[2].trim() };
		}
	}
	throw new Error('W public/_headers nie ma nagłówka Content-Security-Policy.');
}

const polityka = wczytajPolityke();

const STRONY = [
	'/',
	'/galeria',
	'/o-mnie',
	'/kontakt',
	'/polityka-prywatnosci',
	'/offline.html',
	'/ta-strona-na-pewno-nie-istnieje',
];

// Service worker podawałby strony z pominięciem naszej podmiany nagłówków.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page, baseURL }) => {
	await page.route('**/*', async (route) => {
		const zapytanie = route.request();
		const naszaStrona =
			zapytanie.resourceType() === 'document' && !!baseURL && zapytanie.url().startsWith(baseURL);
		if (!naszaStrona) {
			await route.continue();
			return;
		}
		const odpowiedz = await route.fetch();
		await route.fulfill({
			response: odpowiedz,
			headers: { ...odpowiedz.headers(), [polityka.naglowek]: polityka.wartosc },
		});
	});

	await page.addInitScript(() => {
		window.naruszeniaCsp = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			const skad = e.sourceFile ? ` (${e.sourceFile}:${e.lineNumber})` : '';
			window.naruszeniaCsp.push(`${e.effectiveDirective}: ${e.blockedURI || 'kod wklejony w HTML'}${skad} ${e.sample}`.trim());
		});
	});
});

async function naruszenia(page: Page): Promise<string[]> {
	// Chwila na skrypty ładowane asynchronicznie (Turnstile, statystyki) i ich zdarzenia.
	await page.waitForTimeout(1000);
	return page.evaluate(() => window.naruszeniaCsp);
}

for (const sciezka of STRONY) {
	test(`CSP: ${sciezka} – brak naruszeń`, async ({ page }) => {
		await page.goto(sciezka, { waitUntil: 'load' });
		expect(await naruszenia(page), `Naruszenia CSP na ${sciezka} — patrz public/_headers`).toEqual([]);
	});
}

test('CSP: galeria z otwartym lightboxem i przełącznikiem "Pokaż przed" – brak naruszeń', async ({ page }) => {
	await page.goto('/galeria', { waitUntil: 'load' });

	const karta = page.locator('[data-testid="gallery-item"]').first();
	await karta.click();
	await expect(page.locator('#lightbox-img')).toBeVisible();

	const przelacznik = page.locator('[data-testid="lightbox-przelacznik"]');
	if (await przelacznik.isVisible()) {
		await przelacznik.click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');
	}

	expect(await naruszenia(page), 'Naruszenia CSP w lightboxie — patrz public/_headers').toEqual([]);
});

test('CSP: kontrola — test naprawdę wykrywa naruszenia', async ({ page }) => {
	await page.goto('/', { waitUntil: 'load' });

	// Celowo wklejamy skrypt prosto do HTML — polityka musi to wyłapać.
	// Jeśli ten test nie przechodzi, nagłówek z _headers nie jest nakładany
	// i pozostałe testy CSP niczego nie sprawdzają.
	await page.evaluate(() => {
		const skrypt = document.createElement('script');
		skrypt.textContent = 'void 0;';
		document.head.append(skrypt);
	});

	await expect.poll(() => page.evaluate(() => window.naruszeniaCsp.length)).toBeGreaterThan(0);
});
