import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './pomocnicze';

// Tryb offline (public/sw.js). Zwykłe "offline" Playwrighta (context.setOffline) nie odcina
// zapytań, które wysyła sam service worker, więc sieć odcinamy (albo podmieniamy) przez context.route —
// ono przechwytuje też zapytania workera, a page.route ich nie widzi.
test('offline: odwiedzona strona działa bez sieci (także pod adresem z parametrem), a nieodwiedzona pokazuje stronę "Jesteś offline"', async ({ page, context }) => {
	await page.goto('/');
	// Worker instaluje się po "load" i zapisuje strony z listy w sw.js.
	await expect
		.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), {
			message: 'Service worker się nie zainstalował',
		})
		.toBe(true);
	// Po przeładowaniu worker obsługuje stronę — odwiedzona teraz galeria zapisuje się razem ze stylami i skryptami.
	await page.reload();
	await page.goto('/galeria/');
	// Strony /oferta/ nie ma na liście w sw.js, więc do pamięci trafia tylko przez tę wizytę z parametrem
	// (tak przychodzą wejścia z Facebooka). Kopia ma się zapisać pod adresem bez części po "?".
	await page.goto('/oferta/?fbclid=test-online');

	await context.route('**/*', (route) => route.abort('internetdisconnected'));

	// Adres z innym parametrem niż online: strona główna jest w pamięci, więc nie może wyjść "Jesteś offline".
	await page.goto('/?fbclid=test-offline');
	await expect(page.getByRole('heading', { name: 'Retusz zdjęć produktowych · Poznań', level: 1 })).toBeVisible();

	// Dowód, że kopia z wizyty z parametrem leży pod adresem bez "?".
	await page.goto('/oferta/');
	await expect(page.getByRole('heading', { name: 'Oferta', level: 1 })).toBeVisible();

	await page.goto('/galeria/');
	await expect(page.getByRole('heading', { name: 'Galeria', level: 1 })).toBeVisible();
	// Style są z pamięci (bez nich podgląd zdjęcia byłby widoczny od razu), skrypty też (otwiera się po kliknięciu).
	const podglad = page.getByRole('dialog', { name: 'Podgląd zdjęcia' });
	await expect(podglad).toBeHidden();
	await page.getByTestId('gallery-item').first().click();
	await expect(podglad).toBeVisible();

	// Strona, której nie ma w pamięci: zamiast błędu przeglądarki — nasza strona offline.
	await page.goto('/strona-ktorej-nie-ma-w-pamieci/');
	await expect(page.getByRole('heading', { name: 'Jesteś offline' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Wróć na stronę główną' })).toBeVisible();
	await expect(page.locator('head meta[name="robots"][content="noindex"]')).toHaveCount(1);
});

// --- Strategia workera: strony HTML najpierw z sieci, z limitem czasu (LIMIT_SIECI_MS = 4 s w sw.js) ---
// Pułapka 5 w AGENTS.md: przy kopii z pamięci na pierwszym miejscu odwiedzający po deployu widzieliby starą treść.
// Test „odwiedzona strona działa offline” wyżej przechodzi przy obu strategiach, więc te trzy sprawdzają ją wprost.

// Strona pod kontrolą workera: worker instaluje się po „load” (zapisuje /faq/ i resztę listy z sw.js),
// po przeładowaniu obsługuje już wszystkie zapytania strony.
async function uruchomPodWorkerem(page: Page) {
	await page.goto('/');
	await expect
		.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), {
			message: 'Service worker się nie zainstalował',
		})
		.toBe(true);
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
			message: 'Po przeładowaniu strona nie jest pod kontrolą service workera',
		})
		.toBe(true);
}

// Czeka podaną liczbę ms albo do zamknięcia kontekstu — zamknięcie po zakończeniu testu przerywa
// czekającą obsługę trasy, więc nie zostaje po niej timer ani błąd.
function odczekaj(context: BrowserContext, ms: number): Promise<void> {
	return new Promise((gotowe) => {
		const licznik = setTimeout(gotowe, ms);
		context.once('close', () => {
			clearTimeout(licznik);
			gotowe();
		});
	});
}

test('service worker: strony HTML najpierw z sieci — po deployu widać świeżą wersję, a nie kopię z pamięci', async ({ page, context }) => {
	await uruchomPodWorkerem(page);

	// „Deploy”: sieć oddaje /faq/ z dopiskiem w nagłówku. Kopia zapisana przy instalacji workera go nie ma.
	await context.route('**/faq/', async (route) => {
		const odpowiedz = await route.fetch();
		const html = (await odpowiedz.text()).replace(/(<h1\b[^>]*>[\s\S]*?)(<\/h1>)/, '$1 (świeża wersja)$2');
		await route.fulfill({ status: odpowiedz.status(), contentType: 'text/html; charset=utf-8', body: html });
	});

	await page.goto('/faq/');
	await expect(
		page.getByRole('heading', { level: 1 }),
		'Widać kopię z pamięci zamiast odpowiedzi z sieci — worker obsługuje strony HTML najpierw z pamięci (sw.js, obsluzNawigacje)'
	).toContainText('(świeża wersja)');
});

test('service worker: sieć milczy dłużej niż 4 s — worker pokazuje kopię z pamięci, zamiast czekać na sieć', async ({ page, context }) => {
	test.setTimeout(60_000);
	await uruchomPodWorkerem(page);

	// Sieć zawiesza się na 15 s. Worker ma czekać na nią tylko LIMIT_SIECI_MS (4 s), potem oddać zapisaną kopię /faq/.
	await context.route('**/faq/', async (route) => {
		await odczekaj(context, 15_000);
		await route.continue().catch(() => {});
	});

	const start = Date.now();
	await page.goto('/faq/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const czas = Date.now() - start;

	// Progi z zapasem na wolne CI: dolny odróżnia „worker czekał na sieć” od „oddał kopię od razu”,
	// górny — „oddał kopię po limicie” od „czekał, aż sieć odpowie po 15 s”.
	expect(czas, `Strona pojawiła się po ${czas} ms — worker nie czekał na sieć (kopia z pamięci od razu zamiast najpierw sieć)`).toBeGreaterThanOrEqual(3500);
	expect(czas, `Strona pojawiła się po ${czas} ms — worker czekał na zawieszoną sieć zamiast po limicie (LIMIT_SIECI_MS w sw.js) oddać kopię`).toBeLessThanOrEqual(9000);
});

test('service worker: sieć wolna, a strony nie ma w pamięci — czeka na sieć, zamiast pokazywać „Jesteś offline”', async ({ page, context }) => {
	test.setTimeout(60_000);
	await uruchomPodWorkerem(page);

	// /oferta/ nie ma w sw.js (ukryty szkic), więc nie jest w pamięci — ten test nie może jej wcześniej odwiedzić.
	await context.route('**/oferta/', async (route) => {
		await odczekaj(context, 6_000);
		await route.continue().catch(() => {});
	});

	await page.goto('/oferta/');
	await expect(page.getByRole('heading', { level: 1, name: 'Oferta' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Jesteś offline' })).toHaveCount(0);
});
