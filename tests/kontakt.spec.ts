import { test, expect, type Page } from '@playwright/test';
import { podstawAtrapeTurnstile, poczekajNaTokenTurnstile, sprawdzIdFormspree, wypelnijFormularz } from './pomocnicze';

// Testy formularza nie zależą od Cloudflare: skrypt Turnstile podmieniamy atrapą, która
// od razu wstawia token (tests/pomocnicze.ts). Nieudany test znaczy więc "formularz zepsuty",
// a nie "brak sieci do Cloudflare". Prawdziwy widżet sprawdza osobny test na końcu pliku —
// jego komunikat mówi wprost, czego brakuje (sieci czy właściwego klucza).

const status = (page: Page) => page.getByTestId('contact-status');

interface Wyslane {
	adres: string;
	tresc: string;
}

// Podstawia odpowiedź Formspree i zapisuje, co formularz faktycznie wysłał.
async function podstawFormspree(page: Page, reakcja: { status: number; body?: unknown } | 'brak-sieci'): Promise<Wyslane[]> {
	const wyslane: Wyslane[] = [];
	await page.route('**/formspree.io/**', async (route) => {
		wyslane.push({ adres: route.request().url(), tresc: route.request().postDataBuffer()?.toString('utf8') ?? '' });
		if (reakcja === 'brak-sieci') {
			await route.abort('failed');
			return;
		}
		await route.fulfill({ status: reakcja.status, contentType: 'application/json', body: JSON.stringify(reakcja.body ?? {}) });
	});
	return wyslane;
}

async function otworzFormularz(page: Page) {
	await podstawAtrapeTurnstile(page);
	await page.goto('/kontakt/');
}

test.describe('Formularz kontaktowy', () => {
	test('wysyłka: wpisane dane trafiają do Formspree, przycisk blokuje się na czas wysyłki, potem podziękowanie', async ({ page }) => {
		// Odpowiedź Formspree wstrzymujemy do chwili, aż test sprawdzi stan "w trakcie wysyłki".
		let zwolnijOdpowiedz = () => {};
		const odpowiedzGotowa = new Promise<void>((gotowe) => (zwolnijOdpowiedz = gotowe));
		const wyslane: Wyslane[] = [];
		await page.route('**/formspree.io/**', async (route) => {
			wyslane.push({ adres: route.request().url(), tresc: route.request().postDataBuffer()?.toString('utf8') ?? '' });
			await odpowiedzGotowa;
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
		});

		await otworzFormularz(page);
		await sprawdzIdFormspree(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		const przycisk = page.getByTestId('contact-submit');
		await przycisk.click();

		// W trakcie wysyłki przycisk jest zablokowany (bez podwójnej wysyłki).
		await expect(przycisk).toBeDisabled();
		await expect(status(page)).toHaveText('Wysyłanie...');
		zwolnijOdpowiedz();

		await expect(status(page)).toContainText('Dziękuję! Wiadomość została wysłana');
		await expect(przycisk).toBeEnabled();

		// Do Formspree poszło dokładnie raz to, co wpisano (a nie np. pusty formularz).
		const formularz = page.getByTestId('contact-form');
		expect(wyslane).toHaveLength(1);
		expect(wyslane[0].adres).toBe(`https://formspree.io/f/${await formularz.getAttribute('data-formspree-id')}`);
		expect(wyslane[0].tresc).toContain('Wiktor Testowy');
		expect(wyslane[0].tresc).toContain('wiktor@example.com');
		expect(wyslane[0].tresc).toContain('To jest testowa wiadomość o wystarczającej długości.');
		if ((await formularz.getAttribute('data-turnstile-enabled')) === 'true') {
			expect(wyslane[0].tresc).toContain('atrapa-tokenu-1');
			// Token działa tylko raz — po wysyłce formularz prosi widżet o nowy (kolejna wiadomość bez odświeżania strony).
			await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue('atrapa-tokenu-2');
		}

		// Formularz wyczyszczony.
		await expect(page.getByTestId('contact-name')).toHaveValue('');
		await expect(page.getByTestId('contact-email')).toHaveValue('');
		await expect(page.getByTestId('contact-message')).toHaveValue('');
	});

	test('walidacja: puste pola pokazują błędy po polsku, fokus trafia do pierwszego pola, nic nie jest wysyłane', async ({ page }) => {
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);

		await page.getByTestId('contact-submit').click();

		// Komunikaty błędów dla wszystkich trzech pól
		await expect(page.locator('#kontakt-name-blad')).toHaveText('Podaj imię i nazwisko.');
		await expect(page.locator('#kontakt-email-blad')).toHaveText('Podaj adres email.');
		await expect(page.locator('#kontakt-message-blad')).toHaveText('Napisz treść wiadomości.');
		for (const pole of ['contact-name', 'contact-email', 'contact-message']) {
			await expect(page.getByTestId(pole)).toHaveAttribute('aria-invalid', 'true');
		}
		await expect(status(page)).toHaveText('Popraw zaznaczone pola powyżej.');
		await expect(page.getByTestId('contact-name')).toBeFocused();

		expect(wyslane).toHaveLength(0);
	});

	test('walidacja: zły e-mail pokazuje błąd po wyjściu z pola, blokuje wysyłkę i znika po poprawieniu', async ({ page }) => {
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);

		const email = page.getByTestId('contact-email');
		const blad = page.locator('#kontakt-email-blad');

		await page.getByTestId('contact-name').fill('Wiktor Testowy');
		await email.fill('nie-email');
		await expect(blad).toBeEmpty(); // w trakcie pisania jeszcze bez błędu
		await email.press('Tab'); // wyjście z pola pokazuje błąd
		await expect(blad).toHaveText('Ten adres email wygląda na niepoprawny.');
		await expect(email).toHaveAttribute('aria-invalid', 'true');
		await page.getByTestId('contact-message').fill('To jest testowa wiadomość o wystarczającej długości.');

		// Reszta pól bez błędów
		await expect(page.locator('#kontakt-name-blad')).toBeEmpty();
		await expect(page.locator('#kontakt-message-blad')).toBeEmpty();
		await expect(page.getByTestId('contact-name')).not.toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByTestId('contact-message')).not.toHaveAttribute('aria-invalid', 'true');

		// Próba wysyłki z błędnym adresem: nic nie wychodzi, fokus wraca do pola e-mail.
		await page.getByTestId('contact-submit').click();
		await expect(status(page)).toHaveText('Popraw zaznaczone pola powyżej.');
		await expect(email).toBeFocused();
		expect(wyslane).toHaveLength(0);

		// Poprawienie adresu na bieżąco zdejmuje błąd i komunikat pod przyciskiem.
		await email.fill('wiktor@example.com');
		await expect(blad).toBeEmpty();
		await expect(email).not.toHaveAttribute('aria-invalid', 'true');
		await expect(status(page)).toBeEmpty();
	});

	test('błąd sieci: komunikat o braku połączenia, wpisana wiadomość zostaje', async ({ page }) => {
		await podstawFormspree(page, 'brak-sieci');
		await otworzFormularz(page);
		await sprawdzIdFormspree(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		await page.getByTestId('contact-submit').click();

		await expect(status(page)).toHaveText('Brak połączenia z internetem. Sprawdź sieć i spróbuj ponownie.');
		// Można spróbować jeszcze raz bez przepisywania wiadomości.
		await expect(page.getByTestId('contact-message')).toHaveValue('To jest testowa wiadomość o wystarczającej długości.');
	});

	test('błąd Formspree (500): własny, polski komunikat z adresem e-mail zamiast surowego błędu', async ({ page }) => {
		await podstawFormspree(page, { status: 500, body: { ok: false, errors: [{ message: 'Internal server error' }] } });
		await otworzFormularz(page);
		await sprawdzIdFormspree(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		await page.getByTestId('contact-submit').click();

		await expect(status(page)).toContainText('Usługa formularza chwilowo nie działa');
		await expect(status(page)).not.toContainText('Internal server error');
		const adresMailowy = await page.getByTestId('contact-form').getAttribute('data-email');
		if (adresMailowy) {
			await expect(status(page)).toContainText(adresMailowy);
		}
	});
});

test.describe('Turnstile (prawdziwy widżet Cloudflare)', () => {
	test('widżet wczytuje się i wydaje token', async ({ page }) => {
		await page.goto('/kontakt/');
		test.skip(
			(await page.getByTestId('contact-form').getAttribute('data-turnstile-enabled')) !== 'true',
			'Build bez PUBLIC_TURNSTILE_SITE_KEY — Turnstile jest wyłączony'
		);

		const skryptWczytany = await page
			.waitForFunction(() => 'turnstile' in window, undefined, { timeout: 10_000 })
			.then(() => true, () => false);
		// Lokalnie bez dostępu do Cloudflare test jest pomijany (z powodem w raporcie); w CI musi przejść.
		test.skip(!skryptWczytany && !process.env.CI, 'Brak połączenia z challenges.cloudflare.com — ten test sprawdza CI');
		expect(skryptWczytany, 'Skrypt Turnstile się nie wczytał — brak połączenia z challenges.cloudflare.com').toBe(true);

		await expect(
			page.locator('input[name="cf-turnstile-response"]'),
			'Widżet nie wydał tokenu. Lokalnie użyj klucza testowego: $env:PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"; npm test'
		).toHaveValue(/.+/, { timeout: 15_000 });
	});
});
