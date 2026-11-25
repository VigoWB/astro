import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, OPISY_ZE_ZNAKAMI_DO_ZAKODOWANIA } from './pomocnicze';

// Testy idą na stronie zbudowanej z danych testowych (`npm test` → scripts/build-testowy.mjs →
// dist-testy/), a nie z prawdziwych zdjęć. Ten plik pilnuje dwóch rzeczy:
// 1. że to naprawdę ta strona (a nie np. prawdziwa, z innego podglądu na tym samym porcie),
// 2. że tests/dane/galeria.json dalej ma przypadki, których potrzebują inne testy —
//    bez nich testy galerii i suwaka padałyby z mniej jasnym komunikatem, a ten plik mówi wprost,
//    czego brakuje w danych.

interface ZdjecieTestowe {
	opis: string;
	kategorie: string[];
	kluczPrzed: string | null;
	paraSuwaka?: boolean;
}

const dane = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'dane', 'galeria.json'), 'utf8')) as ZdjecieTestowe[];

test.describe('Dane testowe', () => {
	test('galeria pokazuje zdjęcia z tests/dane/galeria.json, w tej samej kolejności', async ({ page }) => {
		await page.goto('/galeria/');
		const opisy = await page.getByTestId('gallery-item').evaluateAll((karty) => karty.map((karta) => karta.getAttribute('data-opis')));
		expect(opisy, 'Strona nie powstała z tests/dane/galeria.json — uruchom testy przez `npm test` (najpierw build testowy)').toEqual(
			dane.map((zdjecie) => zdjecie.opis)
		);
	});

	test('dane mają wszystkie przypadki potrzebne testom galerii i strony głównej', async ({ page }) => {
		await page.goto('/galeria/');
		const porcja = Number(await page.locator('#galeria-grid').getAttribute('data-na-strone'));
		const ileWKategorii = (kategoria: string) => dane.filter((zdjecie) => zdjecie.kategorie.includes(kategoria)).length;
		const kategorie = [...new Set(dane.flatMap((zdjecie) => zdjecie.kategorie))];

		expect(dane.length, `więcej zdjęć niż jedna porcja (${porcja}) — „Załaduj więcej”`).toBeGreaterThan(porcja);
		expect(kategorie.some((k) => ileWKategorii(k) > porcja), `kategoria z więcej niż ${porcja} zdjęciami`).toBe(true);
		expect(kategorie.some((k) => ileWKategorii(k) >= 2 && ileWKategorii(k) <= porcja), 'kategoria mieszcząca się w jednej porcji, z min. 2 zdjęciami').toBe(true);
		expect(kategorie.some((k) => ileWKategorii(k) === 1), 'kategoria z dokładnie jednym zdjęciem').toBe(true);
		expect(dane[0].kluczPrzed, 'pierwsze zdjęcie z wersją „przed”').toBeTruthy();
		expect(dane[1].kluczPrzed, 'drugie zdjęcie z wersją „przed” (reset przełącznika po przejściu dalej)').toBeTruthy();
		expect(dane.some((zdjecie) => !zdjecie.kluczPrzed), 'zdjęcie bez wersji „przed”').toBe(true);
		expect(dane.filter((zdjecie) => zdjecie.paraSuwaka), 'dokładnie jedna para do suwaka').toHaveLength(1);
		// Link „Zapytaj o podobny retusz” (tests/galeria.spec.ts): opisy ze znakami, które w adresie trzeba zakodować („&”, cudzysłów „ ”).
		for (const opis of OPISY_ZE_ZNAKAMI_DO_ZAKODOWANIA) {
			expect(dane.map((zdjecie) => zdjecie.opis), `zdjęcie z opisem „${opis}” (link „Zapytaj o podobny retusz” — kodowanie adresu)`).toContain(opis);
		}

		await page.goto('/');
		await expect(page.locator('[data-porownanie-suwak]'), 'suwak przed/po na stronie głównej (para w tych samych proporcjach)').toHaveCount(1);

		// Build testowy ustawia testowy klucz Turnstile. Bez niego poczekajNaTokenTurnstile() (pomocnicze.ts)
		// i asercje w kontakt.spec.ts oraz csp.spec.ts po cichu pomijałyby token.
		await page.goto('/kontakt/');
		await expect(
			page.getByTestId('contact-form'),
			'Formularz bez włączonego Turnstile — build testowy powinien ustawić testowy PUBLIC_TURNSTILE_SITE_KEY (scripts/build-testowy.mjs)'
		).toHaveAttribute('data-turnstile-enabled', 'true');
	});
});
