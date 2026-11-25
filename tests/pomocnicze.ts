import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wspólne stałe i funkcje dla testów. To nie jest plik z testami — Playwright uruchamia
// tylko pliki *.spec.ts, a ten jest przez nie importowany.

// Lista stron leży w tests/strony.ts (bez importów, żeby czytał ją też Vitest) — tu tylko ją
// przekazujemy dalej, więc spec-i dalej importują ją stąd. Nową podstronę dopisujesz w tests/strony.ts.
export { STRONY, STRONA_OFFLINE, STRONA_404 } from './strony';

// --- Statystyki Cloudflare (Web Analytics) ---
// Build testowy ma token statystyk (scripts/build-testowy.mjs), więc każda strona z Layout.astro
// ładuje skrypt https://static.cloudflareinsights.com/beacon.min.js. Prawdziwego skryptu testy
// nie pobierają: zamiast niego idzie atrapa, która wysyła jedno zapytanie pod adres, z którym łączy się
// prawdziwy skrypt. Dzięki temu Content-Security-Policy (script-src i connect-src w public/_headers)
// sprawdza się w CSP także dla statystyk — tests/csp.spec.ts.
export const ADRES_STATYSTYK = 'https://cloudflareinsights.com/cdn-cgi/rum';

const ATRAPA_ANALITYKI = `fetch('${ADRES_STATYSTYK}', { method: 'POST', body: '{}', keepalive: true }).catch(() => {});`;

/**
 * Podmienia skrypt statystyk Cloudflare na atrapę, a zapytanie, które ona wysyła, kończy odpowiedzią 204.
 * Żaden test nie łączy się z prawdziwą analityką. Wywołuje to automatycznie `test` z tego pliku
 * (przed każdym testem), więc w spec-ach nie trzeba o tym pamiętać.
 * Przez context.route (a nie page.route), żeby działało też dla stron otwartych w innych kartach
 * i nie kolidowało z trasami strony — te ostatnie przepuszczają zapytania przez route.fallback().
 */
export async function podstawAtrapeAnalityki(context: BrowserContext) {
	await context.route('https://static.cloudflareinsights.com/**', (route) =>
		route.fulfill({ contentType: 'text/javascript', body: ATRAPA_ANALITYKI })
	);
	await context.route('https://cloudflareinsights.com/**', (route) => route.fulfill({ status: 204 }));
}

/**
 * `test` Playwrighta z automatyczną atrapą statystyk Cloudflare: każdy test e2e importuje `test` i `expect`
 * stąd, a nie z '@playwright/test' (typy, np. Page i Locator, mogą zostać stamtąd).
 */
export const test = base.extend<{ atrapaAnalityki: void }>({
	atrapaAnalityki: [
		async ({ context }, use) => {
			await podstawAtrapeAnalityki(context);
			await use();
		},
		{ auto: true },
	],
});
export { expect };

// Atrapa skryptu Cloudflare Turnstile: zamiast prawdziwego widżetu (wymaga sieci do Cloudflare,
// a klucz produkcyjny nie działa na localhost) od razu wstawia do formularza token testowy.
// Każde reset() — formularz woła je po każdej wysyłce — daje nowy token: atrapa-tokenu-1, -2…
// Tak jak prawdziwy widżet, dokłada do kontenera ramkę z domeny Cloudflare (render() i start, czyli
// samoczynne wyrenderowanie kontenerów .cf-turnstile — formularz sam render() nie woła), więc
// Content-Security-Policy sprawdza też frame-src (tests/csp.spec.ts).
const ATRAPA_TURNSTILE = `(() => {
	let licznik = 0;
	const kontenery = (cel) =>
		(cel ? [typeof cel === 'string' ? document.querySelector(cel) : cel] : [...document.querySelectorAll('.cf-turnstile')]).filter(Boolean);
	const wstawToken = (kontener) => {
		let pole = kontener.querySelector('input[name="cf-turnstile-response"]');
		if (!pole) {
			pole = document.createElement('input');
			pole.type = 'hidden';
			pole.name = 'cf-turnstile-response';
			kontener.append(pole);
		}
		pole.value = 'atrapa-tokenu-' + ++licznik;
	};
	const wstawRamke = (kontener) => {
		if (kontener.querySelector('iframe')) return;
		const ramka = document.createElement('iframe');
		ramka.title = 'Atrapa Turnstile';
		ramka.src = 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/atrapa';
		kontener.append(ramka);
	};
	const wyrenderuj = (kontener) => { wstawRamke(kontener); wstawToken(kontener); };
	window.turnstile = {
		render: (cel) => { kontenery(cel).forEach(wyrenderuj); return 'atrapa'; },
		reset: (cel) => { setTimeout(() => kontenery(cel).forEach(wstawToken), 0); },
		getResponse: () => document.querySelector('input[name="cf-turnstile-response"]')?.value,
		remove: () => {},
	};
	const start = () => kontenery().forEach(wyrenderuj);
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
})();`;

/**
 * Podmienia skrypt Turnstile na atrapę (wywołać PRZED page.goto). Testy formularza sprawdzają
 * wtedy nasz kod, a nie dostęp do Cloudflare — przechodzą też bez sieci. Prawdziwy widżet
 * sprawdza osobny test w kontakt.spec.ts. Na stronach bez formularza ta funkcja niczego nie zmienia.
 * Ramka z atrapy (https://challenges.cloudflare.com/cdn-cgi/…) dostaje pustą stronę.
 */
export async function podstawAtrapeTurnstile(page: Page) {
	await page.route('https://challenges.cloudflare.com/turnstile/**', (route) =>
		route.fulfill({ contentType: 'text/javascript', body: ATRAPA_TURNSTILE })
	);
	await page.route('https://challenges.cloudflare.com/cdn-cgi/**', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>atrapa</title>' })
	);
}

/**
 * Strony-szkice, które nie trafiają do sitemapy: tablica STRONY_POZA_SITEMAPA z astro.config.mjs.
 * Playwright nie importuje astro.config.mjs (ciągnie całe Astro), więc czytamy tablicę z tekstu pliku.
 * (Vitest importuje ją normalnie — tests/jednostkowe/strony.test.ts.)
 */
export function wczytajStronyPozaSitemapa(): string[] {
	const tekst = readFileSync(join(process.cwd(), 'astro.config.mjs'), 'utf8');
	const dopasowanie = tekst.match(/\bSTRONY_POZA_SITEMAPA\s*=\s*\[([^\]]*)\]/);
	if (!dopasowanie) {
		throw new Error(
			'Nie znalazłem tablicy STRONY_POZA_SITEMAPA w astro.config.mjs (oczekuję zapisu `STRONY_POZA_SITEMAPA = [...]`). Czy ktoś ją przemianował albo przeniósł? Popraw wczytajStronyPozaSitemapa() w tests/pomocnicze.ts.'
		);
	}
	return [...dopasowanie[1].matchAll(/(['"])(.*?)\1/g)].map(([, , adres]) => adres);
}

/**
 * Opisy zdjęć z danych testowych (tests/dane/galeria.json) ze znakami, które w adresie linku „Zapytaj o podobny retusz”
 * trzeba zakodować: „&” (uciąłby parametr) i cudzysłów „ ” (znaki spoza ASCII). Używają ich galeria.spec.ts i dane-testowe.spec.ts.
 */
export const OPISY_ZE_ZNAKAMI_DO_ZAKODOWANIA = ['Zestaw: zegarek & spinki', 'Spinki testowe z monogramem „AB”'];

/** Wpisuje do formularza kontaktowego poprawne dane. */
export async function wypelnijFormularz(page: Page) {
	await page.getByTestId('contact-name').fill('Wiktor Testowy');
	await page.getByTestId('contact-email').fill('wiktor@example.com');
	await page.getByTestId('contact-message').fill('To jest testowa wiadomość o wystarczającej długości.');
}

/**
 * Bez PUBLIC_FORMSPREE_ID formularz celowo nic nie wysyła — to brak ustawienia w buildzie,
 * a nie błąd formularza. Build testowy (scripts/build-testowy.mjs) zawsze ustawia wartość testową.
 */
export async function sprawdzIdFormspree(page: Page) {
	expect(
		await page.getByTestId('contact-form').getAttribute('data-formspree-id'),
		'Build bez PUBLIC_FORMSPREE_ID — uruchom testy przez `npm test` (build testowy ustawia wartość testową)'
	).toBeTruthy();
}

/** Czeka na token Turnstile — chyba że build jest bez PUBLIC_TURNSTILE_SITE_KEY (formularz wtedy go nie wymaga). */
export async function poczekajNaTokenTurnstile(page: Page) {
	const wlaczony = await page.getByTestId('contact-form').getAttribute('data-turnstile-enabled');
	if (wlaczony !== 'true') return;
	await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/);
}

/** Czeka, aż <img> wczyta plik. */
export async function poczekajNaZdjecie(img: Locator) {
	await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
}

/** Ścieżka pliku, który <img> faktycznie pokazuje (np. /_astro/abc.webp), bez domeny. */
export async function pokazanyPlik(img: Locator): Promise<string> {
	return img.evaluate((el: HTMLImageElement) => (el.currentSrc ? decodeURIComponent(new URL(el.currentSrc).pathname) : ''));
}

/** Pliki wersji "po" albo "przed" zapisane w atrybutach karty (data-po, data-po-srcset…). */
export async function plikiWersji(karta: Locator, ktora: 'po' | 'przed'): Promise<string[]> {
	const src = (await karta.getAttribute(`data-${ktora}`)) ?? '';
	const srcset = (await karta.getAttribute(`data-${ktora}-srcset`)) ?? '';
	return [src, ...srcset.split(',').map((wpis) => wpis.trim().split(/\s+/)[0])]
		.filter(Boolean)
		.map((sciezka) => decodeURIComponent(sciezka));
}
