import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STRONY, podstawAtrapeTurnstile, poczekajNaTokenTurnstile, sprawdzIdFormspree, wypelnijFormularz } from './pomocnicze';

// Test Content-Security-Policy (CSP).
//
// Serwer podglądu (`astro preview`) nie czyta public/_headers — robi to dopiero
// Cloudflare Pages. Dlatego test sam dokleja do każdej naszej strony HTML nagłówek
// CSP przepisany z public/_headers (pod tą samą nazwą: tryb próbny "-Report-Only"
// albo docelowy, także oba naraz) i zbiera zdarzenia "securitypolicyviolation", które
// przeglądarka wysyła przy każdym naruszeniu — w obu trybach.
//
// Zewnętrzne usługi (Turnstile, statystyki Cloudflare) sprawdzają się tylko tam,
// gdzie jest do nich dostęp (np. CI na GitHubie). Bez sieci po prostu się nie
// ładują — to nie jest naruszenie CSP, więc test i tak przechodzi.

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
			await route.continue();
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
		await page.goto(sciezka, { waitUntil: 'load' });
		await sprawdzBrakNaruszen(page, sciezka);
	});
}

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
