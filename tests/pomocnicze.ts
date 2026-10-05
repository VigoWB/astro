import { expect, type Locator, type Page } from '@playwright/test';

// Wspólne stałe i funkcje dla testów. To nie jest plik z testami — Playwright uruchamia
// tylko pliki *.spec.ts, a ten jest przez nie importowany.

/**
 * Wszystkie strony serwisu — jedna lista dla testów dostępności (a11y.spec.ts) i CSP (csp.spec.ts).
 * Nowa podstrona = dopisz ją tutaj (oraz do `url` w lighthouserc.json i do listy w public/sw.js).
 */
export const STRONY = [
	'/',
	'/galeria/',
	'/o-mnie/',
	'/kontakt/',
	'/polityka-prywatnosci/',
	'/offline.html',
	'/ta-strona-na-pewno-nie-istnieje', // strona 404
];

// Atrapa skryptu Cloudflare Turnstile: zamiast prawdziwego widżetu (wymaga sieci do Cloudflare,
// a klucz produkcyjny nie działa na localhost) od razu wstawia do formularza token testowy.
// Każde reset() — formularz woła je po każdej wysyłce — daje nowy token: atrapa-tokenu-1, -2…
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
	window.turnstile = {
		render: (cel) => { kontenery(cel).forEach(wstawToken); return 'atrapa'; },
		reset: (cel) => { setTimeout(() => kontenery(cel).forEach(wstawToken), 0); },
		getResponse: () => document.querySelector('input[name="cf-turnstile-response"]')?.value,
		remove: () => {},
	};
	const start = () => kontenery().forEach(wstawToken);
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
})();`;

/**
 * Podmienia skrypt Turnstile na atrapę (wywołać PRZED page.goto). Testy formularza sprawdzają
 * wtedy nasz kod, a nie dostęp do Cloudflare — przechodzą też bez sieci. Prawdziwy widżet
 * sprawdza osobny test w kontakt.spec.ts.
 */
export async function podstawAtrapeTurnstile(page: Page) {
	await page.route('https://challenges.cloudflare.com/turnstile/**', (route) =>
		route.fulfill({ contentType: 'text/javascript', body: ATRAPA_TURNSTILE })
	);
}

/** Wpisuje do formularza kontaktowego poprawne dane. */
export async function wypelnijFormularz(page: Page) {
	await page.getByTestId('contact-name').fill('Wiktor Testowy');
	await page.getByTestId('contact-email').fill('wiktor@example.com');
	await page.getByTestId('contact-message').fill('To jest testowa wiadomość o wystarczającej długości.');
}

/**
 * Bez PUBLIC_FORMSPREE_ID formularz celowo nic nie wysyła — to brak ustawienia w buildzie,
 * a nie błąd formularza. Test z wysyłką mówi wtedy wprost, czego brakuje.
 */
export async function sprawdzIdFormspree(page: Page) {
	expect(
		await page.getByTestId('contact-form').getAttribute('data-formspree-id'),
		'Build bez PUBLIC_FORMSPREE_ID — ustaw tę zmienną (np. w .env) i zbuduj stronę ponownie'
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
