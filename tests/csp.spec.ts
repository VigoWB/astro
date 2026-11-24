import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	test,
	expect,
	ADRES_STATYSTYK,
	STRONY,
	podstawAtrapeTurnstile,
	poczekajNaTokenTurnstile,
	sprawdzIdFormspree,
	wypelnijFormularz,
} from './pomocnicze';

// Test Content-Security-Policy (CSP).
//
// Serwer podglądu (`astro preview`) nie czyta public/_headers — robi to dopiero
// Cloudflare Pages. Dlatego test sam dokleja do każdej naszej strony HTML nagłówek
// CSP przepisany z public/_headers (pod tą samą nazwą: tryb próbny "-Report-Only"
// albo docelowy, także oba naraz) i zbiera zdarzenia "securitypolicyviolation", które
// przeglądarka wysyła przy każdym naruszeniu — w obu trybach.
//
// Usług Cloudflare test nie woła naprawdę — działa bez sieci. Skrypt i ramkę Turnstile oraz skrypt statystyk
// (Web Analytics) i jego zapytanie podstawiają atrapy z tests/pomocnicze.ts, ale każda idzie spod adresu
// prawdziwej usługi, więc polityka sprawdza script-src, frame-src i connect-src tak, jak na produkcji:
// build testowy ma token statystyk (scripts/build-testowy.mjs), więc skrypt statystyk jest w HTML każdej strony.
// Zasada dla tras w tym pliku: zapytania, których nie podmieniamy, przepuszczamy przez route.fallback(),
// a nie route.continue() — continue() idzie prosto do sieci i omija atrapy z context.route (w tym atrapę statystyk).

declare global {
	interface Window {
		naruszeniaCsp: string[];
		kontrolaCsp: boolean;
	}
}

// Nagłówki CSP z public/_headers, np. { 'Content-Security-Policy': "default-src 'self'; …" }.
function wczytajPolityki(): Record<string, string> {
	const polityki: Record<string, string> = {};
	const linie = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').split(/\r?\n/);
	for (const linia of linie) {
		// Nagłówki w _headers są wcięte pod ścieżką; linijki komentarzy zaczynają się od "#".
		const dopasowanie = linia.match(/^\s+(Content-Security-Policy(?:-Report-Only)?):\s*(.+)$/i);
		if (!dopasowanie) continue;
		const [, naglowek, wartosc] = dopasowanie;
		if (naglowek in polityki) {
			throw new Error(`W public/_headers jest więcej niż jedna linijka ${naglowek} — test sprawdza tylko jedną. Rozbuduj tests/csp.spec.ts.`);
		}
		polityki[naglowek] = wartosc.trim();
	}
	if (Object.keys(polityki).length === 0) {
		throw new Error('W public/_headers nie ma nagłówka Content-Security-Policy.');
	}
	return polityki;
}

const polityki = wczytajPolityki();

// Service worker podawałby strony z pominięciem naszej podmiany nagłówków
// (sam service worker ma osobny test na dole pliku).
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page, baseURL }) => {
	await page.route('**/*', async (route) => {
		const zapytanie = route.request();
		const naszaStrona =
			zapytanie.resourceType() === 'document' && !!baseURL && zapytanie.url().startsWith(baseURL);
		if (!naszaStrona) {
			// fallback(), nie continue(): continue() wysyła zapytanie prosto do sieci, z pominięciem atrap
			// z context.route (statystyki Cloudflare) — a prawdziwej analityki testy nie wołają.
			await route.fallback();
			return;
		}
		const odpowiedz = await route.fetch();
		await route.fulfill({
			response: odpowiedz,
			headers: { ...odpowiedz.headers(), ...polityki },
		});
	});

	await page.addInitScript(() => {
		window.naruszeniaCsp = [];
		window.kontrolaCsp = false;
		document.addEventListener('securitypolicyviolation', (e) => {
			// Zgłoszenie od skryptu kontrolnego (patrz sprawdzBrakNaruszen) — to nie jest prawdziwe naruszenie.
			if (e.target instanceof Element && e.target.hasAttribute('data-kontrola-csp')) {
				window.kontrolaCsp = true;
				return;
			}
			const skad = e.sourceFile ? ` (${e.sourceFile}:${e.lineNumber})` : '';
			window.naruszeniaCsp.push(`${e.effectiveDirective}: ${e.blockedURI || 'kod wklejony w HTML'}${skad} ${e.sample}`.trim());
		});
	});
});

// Sprawdza, że na stronie nie było naruszeń — i że polityka w ogóle na niej działa.
// Najpierw czekamy, aż ucichnie sieć (skrypty ładowane asynchronicznie: Turnstile, statystyki) —
// najwyżej 10 s; gdyby jakaś usługa łączyła się bez przerwy, test idzie dalej zamiast stać.
// Potem wklejamy skrypt kontrolny, który polityka MUSI zgłosić. Zgłoszenia przychodzą po kolei,
// więc gdy dotrze kontrolne, wszystkie wcześniejsze naruszenia są już na liście. Gdyby kontrolne
// nie dotarło, polityka nie została nałożona i pusta lista niczego by nie dowodziła.
async function sprawdzBrakNaruszen(page: Page, gdzie: string) {
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
	await page.evaluate(() => {
		const skrypt = document.createElement('script');
		skrypt.setAttribute('data-kontrola-csp', '');
		skrypt.textContent = 'void 0;';
		document.head.append(skrypt);
	});
	await expect
		.poll(() => page.evaluate(() => window.kontrolaCsp), {
			message: `Polityka CSP nie działa na: ${gdzie} — nagłówek z _headers nie został nałożony, test niczego by nie sprawdził`,
		})
		.toBe(true);
	expect(await page.evaluate(() => window.naruszeniaCsp), `Naruszenia CSP: ${gdzie} — patrz public/_headers`).toEqual([]);
}

for (const sciezka of STRONY) {
	test(`CSP: ${sciezka} – brak naruszeń`, async ({ page }) => {
		// Na stronach bez formularza atrapa Turnstile niczego nie zmienia; na /kontakt/ zastępuje prawdziwy
		// widżet (wynik nie zależy od sieci), a jej ramka z domeny Cloudflare sprawdza frame-src.
		await podstawAtrapeTurnstile(page);
		await page.goto(sciezka, { waitUntil: 'load' });
		if (sciezka === '/kontakt/') {
			await expect(
				page.locator('iframe[title="Atrapa Turnstile"]'),
				'Na /kontakt/ nie ma ramki Turnstile (atrapa z tests/pomocnicze.ts dokłada ją do .cf-turnstile) — bez niej test nie sprawdzi frame-src'
			).toHaveCount(1);
		}
		await sprawdzBrakNaruszen(page, sciezka);
	});
}

test('CSP: statystyki Cloudflare (atrapa beacona) – skrypt i wysyłka nie są blokowane', async ({ page }) => {
	// Skrypt statystyk (script-src) i jego zapytanie (connect-src) podstawia atrapa z tests/pomocnicze.ts;
	// zapytanie musi faktycznie wyjść — gdyby polityka zablokowała skrypt, nic by nie wysłał,
	// a pusta lista naruszeń niczego by nie dowodziła.
	const zapytania: string[] = [];
	page.on('request', (zapytanie) => {
		if (zapytanie.url().startsWith(ADRES_STATYSTYK)) zapytania.push(zapytanie.url());
	});

	await page.goto('/', { waitUntil: 'load' });
	await expect
		.poll(() => zapytania, {
			message: `Skrypt statystyk nie wysłał zapytania pod ${ADRES_STATYSTYK} — zablokowała go polityka (script-src: static.cloudflareinsights.com w public/_headers) albo strona nie ma go w HTML (PUBLIC_CF_BEACON_TOKEN w scripts/build-testowy.mjs)`,
			timeout: 10_000,
		})
		.toContain(ADRES_STATYSTYK);

	await sprawdzBrakNaruszen(page, 'statystyki Cloudflare');
});

test('CSP: strona główna – suwak/przełącznik przed-po i lightbox wybranych prac – brak naruszeń', async ({ page }) => {
	await page.goto('/', { waitUntil: 'load' });

	// Pozycję suwaka i podmianę zdjęcia w przełączniku ustawia skrypt przez
	// element.style.* (AGENTS.md pułapka 7) — to jest tu właśnie sprawdzane.
	const suwak = page.locator('[data-porownanie-suwak]');
	if ((await suwak.count()) > 0) {
		await suwak.fill('80');
	} else {
		await page.locator('[data-porownanie-przelacznik]').click();
	}

	const karta = page.getByTestId('gallery-item').first();
	if ((await karta.count()) > 0) {
		await karta.click();
		await expect(page.locator('#lightbox-img')).toBeVisible();
	}

	await sprawdzBrakNaruszen(page, 'strona główna z porównaniem i lightboksem');
});

test('CSP: galeria – filtr, "Załaduj więcej", lightbox z "Pokaż przed" i przejściem dalej – brak naruszeń', async ({ page }) => {
	await page.goto('/galeria/', { waitUntil: 'load' });

	const kategoria = page.getByTestId('gallery-filters').getByRole('button').nth(1);
	if ((await kategoria.count()) > 0) {
		await kategoria.click();
		await page.locator('[data-filter="Wszystkie"]').click();
		// Zmiana filtra idzie płynnym przejściem — nowy stan (i przycisk niżej) jest chwilę po kliknięciu.
		await expect(page.locator('[data-filter="Wszystkie"]')).toHaveAttribute('aria-pressed', 'true');
	}
	const zaladujWiecej = page.getByTestId('load-more-btn');
	if (await zaladujWiecej.isVisible()) {
		await zaladujWiecej.click();
	}

	const karta = page.getByTestId('gallery-item').first();
	await karta.click();
	await expect(page.locator('#lightbox-img')).toBeVisible();
	if (await karta.getAttribute('data-przed')) {
		const przelacznik = page.getByTestId('lightbox-przelacznik');
		await przelacznik.click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');
	}
	// Następne zdjęcie (i wczytanie kolejnego z wyprzedzeniem).
	await page.keyboard.press('ArrowRight');

	await sprawdzBrakNaruszen(page, 'galeria z lightboksem');
});

test('CSP: wysyłka formularza kontaktowego do Formspree – brak naruszeń', async ({ page }) => {
	// Odpowiedź Formspree jest podstawiona (nic nie wychodzi do internetu), ale polityka
	// i tak sprawdza sam adres: bez https://formspree.io w connect-src przeglądarka
	// zablokuje wysyłkę, zanim zapytanie w ogóle wyjdzie.
	await page.route('**/formspree.io/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
	);
	// Atrapa Turnstile ładuje się spod adresu prawdziwego skryptu, więc script-src też jest sprawdzane.
	await podstawAtrapeTurnstile(page);
	await page.goto('/kontakt/', { waitUntil: 'load' });
	await sprawdzIdFormspree(page);

	await wypelnijFormularz(page);
	await poczekajNaTokenTurnstile(page);
	await page.getByTestId('contact-submit').click();
	await expect(page.getByTestId('contact-status')).toContainText('Dziękuję! Wiadomość została wysłana');

	await sprawdzBrakNaruszen(page, 'wysyłka formularza');
});

test('CSP: kontrola — wykrywany jest też zasób spoza listy (obrazek z innej domeny)', async ({ page }) => {
	await page.goto('/', { waitUntil: 'load' });

	// Celowo pobieramy obrazek z domeny spoza img-src — polityka musi to zgłosić.
	await page.evaluate(() => {
		const obrazek = new Image();
		obrazek.src = 'https://example.com/obrazek-spoza-listy.png';
	});

	await expect.poll(() => page.evaluate(() => window.naruszeniaCsp.join('\n'))).toContain('img-src');
});

test.describe('z service workerem', () => {
	test.use({ serviceWorkers: 'allow' });

	test('CSP: rejestracja service workera (tryb offline) nie jest blokowana', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' });
		await sprawdzBrakNaruszen(page, 'rejestracja service workera');
		// Rejestrację uruchamia Layout.astro po "load"; błąd rejestracji strona po cichu połyka,
		// więc sprawdzamy wprost, że worker jest zarejestrowany.
		await expect
			.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())), {
				message: 'Service worker się nie zarejestrował — tryb offline nie zadziała',
			})
			.toBe(true);
	});
});
