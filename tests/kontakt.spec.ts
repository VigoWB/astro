import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, podstawAtrapeTurnstile, poczekajNaTokenTurnstile, sprawdzIdFormspree, wypelnijFormularz } from './pomocnicze';

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

// Jak podstawFormspree, ale odpowiedź (200) wychodzi dopiero po zwolnij() — test ma czas sprawdzić stan „w trakcie
// wysyłki”. Gdy zapytanie zdążyło już przerwać przeglądarka (limit czasu), odpowiedź po zwolnieniu idzie w próżnię.
async function podstawWstrzymanaFormspree(page: Page): Promise<{ wyslane: Wyslane[]; zwolnij: () => void }> {
	let zwolnij = () => {};
	const odpowiedzGotowa = new Promise<void>((gotowe) => (zwolnij = gotowe));
	const wyslane: Wyslane[] = [];
	await page.route('**/formspree.io/**', async (route) => {
		wyslane.push({ adres: route.request().url(), tresc: route.request().postDataBuffer()?.toString('utf8') ?? '' });
		await odpowiedzGotowa;
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }).catch(() => {});
	});
	return { wyslane, zwolnij: () => zwolnij() };
}

// Udaje Safari przed 16 (iPhone'y z iOS 15): tam nie ma AbortSignal.timeout. Wywołać PRZED page.goto.
// Skrypt startowy działa na każdej stronie otwartej w tym teście; sam test potwierdza po goto, że funkcji naprawdę nie ma.
async function udawajSafari15(page: Page) {
	await page.addInitScript(() => {
		Reflect.deleteProperty(AbortSignal, 'timeout');
	});
}

async function sprawdzBrakAbortSignalTimeout(page: Page) {
	expect(
		await page.evaluate(() => typeof AbortSignal.timeout),
		'AbortSignal.timeout nadal istnieje — udawanie Safari 15 nie zadziałało, test niczego by nie sprawdzał'
	).toBe('undefined');
}

// Zamienia treść wysyłki (multipart/form-data) na pary nazwa pola → wartość.
function polaWysylki(tresc: string): Record<string, string> {
	const pola: Record<string, string> = {};
	for (const [, nazwa, wartosc] of tresc.matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g)) pola[nazwa] = wartosc;
	return pola;
}

const POLA_SZCZEGOLOW = ['usluga', 'liczba_zdjec', 'termin', 'link_do_plikow'];

// Błąd pola ma się pokazać dopiero po wyjściu z niego, a nie w trakcie pisania. Samo toBeEmpty() zaraz po fill()
// przechodziło też wtedy, gdy błąd pojawiał się chwilę później (np. opóźniona walidacja): Playwright kończy czekanie
// przy pierwszym spełnionym warunku. Dlatego najpierw przepuszczamy dwie klatki animacji (wszystko, co skrypt
// zaplanował na „zaraz”), a dopiero potem sprawdzamy, że błędu nie ma — ani w treści, ani w aria-invalid.
async function sprawdzBrakBleduWTrakciePisania(page: Page, blad: Locator, pole: Locator) {
	await page.evaluate(() => new Promise<void>((gotowe) => requestAnimationFrame(() => requestAnimationFrame(() => gotowe()))));
	await expect(blad).toBeEmpty();
	await expect(pole).not.toHaveAttribute('aria-invalid', 'true');
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
		// Turnstile ma być włączony — build testowy ustawia klucz testowy (scripts/build-testowy.mjs, pilnuje tego też
		// dane-testowe.spec.ts). Bez tej asercji poczekajNaTokenTurnstile() po cichu pomijałoby token.
		await expect(
			page.getByTestId('contact-form'),
			'Formularz bez włączonego Turnstile — build testowy powinien ustawić testowy PUBLIC_TURNSTILE_SITE_KEY (scripts/build-testowy.mjs)'
		).toHaveAttribute('data-turnstile-enabled', 'true');
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
		// Konkretne pola (nazwy z ContactForm.astro), a nie „gdziekolwiek w treści”: imię jest też w temacie maila,
		// więc samo toContain('Wiktor Testowy') przeszłoby, nawet gdyby pole „name” poszło puste albo pod inną nazwą.
		const pola = polaWysylki(wyslane[0].tresc);
		expect(pola.name).toBe('Wiktor Testowy');
		expect(pola.email).toBe('wiktor@example.com');
		expect(pola.message).toBe('To jest testowa wiadomość o wystarczającej długości.');
		expect(pola.subject).toBe('Zapytanie o wycenę — Wiktor Testowy');
		expect(pola['cf-turnstile-response']).toBe('atrapa-tokenu-1');
		// Token działa tylko raz — po wysyłce formularz prosi widżet o nowy (kolejna wiadomość bez odświeżania strony).
		await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue('atrapa-tokenu-2');

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
		await expect(page.locator('#kontakt-email-blad')).toHaveText('Podaj adres e-mail.');
		await expect(page.locator('#kontakt-message-blad')).toHaveText('Napisz treść wiadomości.');
		for (const pole of ['contact-name', 'contact-email', 'contact-message']) {
			await expect(page.getByTestId(pole)).toHaveAttribute('aria-invalid', 'true');
		}
		await expect(status(page)).toHaveText('Popraw zaznaczone pola powyżej.');
		await expect(page.getByTestId('contact-name')).toBeFocused();

		// Szczegóły zlecenia są nieobowiązkowe — puste nie dają błędu.
		await expect(page.locator('#kontakt-link-blad')).toBeEmpty();
		await expect(page.getByTestId('contact-link')).not.toHaveAttribute('aria-invalid', 'true');

		expect(wyslane).toHaveLength(0);
	});

	test('walidacja: zły e-mail pokazuje błąd po wyjściu z pola, blokuje wysyłkę i znika po poprawieniu', async ({ page }) => {
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);

		const email = page.getByTestId('contact-email');
		const blad = page.locator('#kontakt-email-blad');

		await page.getByTestId('contact-name').fill('Wiktor Testowy');
		await email.fill('nie-email');
		await sprawdzBrakBleduWTrakciePisania(page, blad, email); // w trakcie pisania jeszcze bez błędu
		await email.press('Tab'); // wyjście z pola pokazuje błąd
		await expect(blad).toHaveText('Ten adres e-mail wygląda na niepoprawny.');
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

	test('walidacja: e-mail z kropką na końcu („a@b.com.”) jest odrzucany po wyjściu z pola i blokuje wysyłkę', async ({ page }) => {
		// Sam regex formularza przepuszcza taki adres — odrzuca go dopiero reguła przeglądarki dla type="email" (typeMismatch).
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		const email = page.getByTestId('contact-email');
		const blad = page.locator('#kontakt-email-blad');

		await email.fill('a@b.com.');
		await sprawdzBrakBleduWTrakciePisania(page, blad, email); // w trakcie pisania jeszcze bez błędu
		await email.press('Tab'); // wyjście z pola pokazuje błąd
		await expect(blad).toHaveText('Ten adres e-mail wygląda na niepoprawny.');
		await expect(email).toHaveAttribute('aria-invalid', 'true');

		// Próba wysyłki: nic nie wychodzi, fokus wraca do pola e-mail.
		await page.getByTestId('contact-submit').click();
		await expect(status(page)).toHaveText('Popraw zaznaczone pola powyżej.');
		await expect(email).toBeFocused();
		expect(wyslane).toHaveLength(0);

		// Ten sam adres bez kropki na końcu przechodzi.
		await email.fill('a@b.com');
		await expect(blad).toBeEmpty();
		await expect(email).not.toHaveAttribute('aria-invalid', 'true');
	});

	test('szczegóły zlecenia: puste pola nie idą do Formspree, wypełnione idą bez spacji, temat maila z imieniem', async ({ page }) => {
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);
		await sprawdzIdFormspree(page);

		// Lista usług pochodzi z siteConfig.json, na końcu zawsze „Inne / jeszcze nie wiem”.
		// Pusta lista = pola „Rodzaj usługi” nie ma wcale (reszta formularza działa tak samo).
		const { uslugi } = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'siteConfig.json'), 'utf8')) as { uslugi: string[] };
		const usluga = page.getByTestId('contact-usluga');
		const saUslugi = uslugi.length > 0;
		if (saUslugi) await expect(usluga.locator('option')).toHaveText(['Wybierz', ...uslugi, 'Inne / jeszcze nie wiem']);
		else await expect(usluga).toHaveCount(0);

		// 1. Wysyłka bez szczegółów: w mailu nie ma pustych pól.
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);
		await page.getByTestId('contact-submit').click();
		await expect(status(page)).toContainText('Dziękuję! Wiadomość została wysłana');
		expect(wyslane).toHaveLength(1);
		const bezSzczegolow = polaWysylki(wyslane[0].tresc);
		for (const nazwa of POLA_SZCZEGOLOW) expect(Object.keys(bezSzczegolow)).not.toContain(nazwa);
		// Temat z imieniem składa nasz skrypt; pole name idzie bez zmian.
		expect(bezSzczegolow.subject).toBe('Zapytanie o wycenę — Wiktor Testowy');
		expect(bezSzczegolow.name).toBe('Wiktor Testowy');

		// 2. Wysyłka ze szczegółami (bez odświeżania strony).
		await wypelnijFormularz(page);
		if (saUslugi) await usluga.selectOption(uslugi[0]);
		await page.getByTestId('contact-liczba-zdjec').selectOption('6–20');
		await page.getByTestId('contact-termin').fill('  do końca miesiąca  ');
		await page.getByTestId('contact-link').fill(' https://www.swisstransfer.com/d/atrapa-123 ');
		await poczekajNaTokenTurnstile(page);
		await page.getByTestId('contact-submit').click();
		await expect.poll(() => wyslane.length).toBe(2);
		expect(polaWysylki(wyslane[1].tresc)).toMatchObject({
			...(saUslugi ? { usluga: uslugi[0] } : {}),
			liczba_zdjec: '6–20',
			termin: 'do końca miesiąca',
			link_do_plikow: 'https://www.swisstransfer.com/d/atrapa-123',
		});

		// Po wysyłce szczegóły też są wyczyszczone.
		await expect(status(page)).toContainText('Dziękuję! Wiadomość została wysłana');
		if (saUslugi) await expect(usluga).toHaveValue('');
		await expect(page.getByTestId('contact-liczba-zdjec')).toHaveValue('');
		await expect(page.getByTestId('contact-termin')).toHaveValue('');
		await expect(page.getByTestId('contact-link')).toHaveValue('');
	});

	test('szczegóły zlecenia: zły link do plików pokazuje błąd i blokuje wysyłkę, puste pole nie przeszkadza', async ({ page }) => {
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);
		await wypelnijFormularz(page);

		const link = page.getByTestId('contact-link');
		const blad = page.locator('#kontakt-link-blad');

		await link.fill('swisstransfer.com/d/atrapa-123');
		await sprawdzBrakBleduWTrakciePisania(page, blad, link); // w trakcie pisania jeszcze bez błędu
		await link.press('Tab'); // wyjście z pola pokazuje błąd
		await expect(blad).toHaveText('Wklej cały link — zaczyna się od https://');
		await expect(link).toHaveAttribute('aria-invalid', 'true');

		// Próba wysyłki: nic nie wychodzi, fokus wraca do linku (imię, e-mail i wiadomość są poprawne).
		await page.getByTestId('contact-submit').click();
		await expect(status(page)).toHaveText('Popraw zaznaczone pola powyżej.');
		await expect(link).toBeFocused();
		expect(wyslane).toHaveLength(0);

		// Wyczyszczenie pola zdejmuje błąd — link jest nieobowiązkowy.
		await link.fill('');
		await expect(blad).toBeEmpty();
		await expect(link).not.toHaveAttribute('aria-invalid', 'true');
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

test.describe('Formularz kontaktowy: stary Safari i fokus po wysyłce', () => {
	test('iOS 15 (bez AbortSignal.timeout): wiadomość wychodzi, a nie fałszywy błąd „Brak połączenia”', async ({ page }) => {
		await udawajSafari15(page);
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzFormularz(page);
		await sprawdzBrakAbortSignalTimeout(page);
		await sprawdzIdFormspree(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		await page.getByTestId('contact-submit').click();

		await expect(status(page)).toContainText('Dziękuję! Wiadomość została wysłana');
		await expect(status(page)).not.toContainText('Brak połączenia');
		expect(wyslane).toHaveLength(1);
		expect(polaWysylki(wyslane[0].tresc).name).toBe('Wiktor Testowy');
	});

	test('iOS 15: limit 15 s działa też w wersji zapasowej — „Wysyłka trwa zbyt długo”, a nie „Brak połączenia”', async ({ page }) => {
		// Bez czekania 15 s naprawdę: zegar strony jest sztuczny (page.clock) i przesuwamy go po wysłaniu zapytania.
		// Zegar instalujemy przed goto, żeby setTimeout z wersji zapasowej od początku był sztuczny.
		// Kolejność ma znaczenie: page.clock sam podstawia własne AbortSignal.timeout, więc usunięcie tej funkcji
		// (udawajSafari15) musi przyjść PO page.clock.install() — inaczej zegar przywraca ją i test sprawdzałby
		// ścieżkę natywną zamiast zapasowej (pilnuje tego sprawdzBrakAbortSignalTimeout).
		await page.clock.install();
		await udawajSafari15(page);
		const { wyslane, zwolnij } = await podstawWstrzymanaFormspree(page); // Formspree nie odpowiada
		await otworzFormularz(page);
		await sprawdzBrakAbortSignalTimeout(page);
		await sprawdzIdFormspree(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		const przycisk = page.getByTestId('contact-submit');
		await przycisk.click();
		await expect(przycisk).toBeDisabled();
		await expect(status(page)).toHaveText('Wysyłanie...');
		// Zapytanie jest już w drodze, więc timer limitu (ustawiany tuż przed fetch) działa.
		await expect.poll(() => wyslane.length).toBe(1);

		// Przed upływem limitu nic się nie dzieje.
		await page.clock.fastForward(14_000);
		await expect(status(page)).toHaveText('Wysyłanie...');
		await expect(przycisk).toBeDisabled();

		await page.clock.fastForward(2_000); // razem 16 s > 15 s
		await expect(status(page)).toContainText('Wysyłka trwa zbyt długo');
		await expect(status(page)).not.toContainText('Brak połączenia');
		await expect(przycisk).toBeEnabled();
		// Wpisana wiadomość zostaje — można spróbować jeszcze raz.
		await expect(page.getByTestId('contact-message')).toHaveValue('To jest testowa wiadomość o wystarczającej długości.');
		zwolnij();
	});

	test('po wysyłce z klawiatury fokus wraca na przycisk (wyłączony przycisk gubi fokus)', async ({ page }) => {
		const { wyslane, zwolnij } = await podstawWstrzymanaFormspree(page);
		await otworzFormularz(page);
		await sprawdzIdFormspree(page);
		await wypelnijFormularz(page);
		await poczekajNaTokenTurnstile(page);

		const przycisk = page.getByTestId('contact-submit');
		await przycisk.focus();
		await expect(przycisk).toBeFocused();
		await page.keyboard.press('Enter');

		// W trakcie wysyłki przycisk jest wyłączony, a przeglądarka zdejmuje z niego fokus — to jest powód poprawki.
		// Czekamy na to jawnie (odpowiedź jest wstrzymana), żeby nie sprawdzać po cichu zbyt krótkiego okna.
		await expect(przycisk).toBeDisabled();
		await expect(przycisk, 'Przeglądarka nie zdjęła fokusu z wyłączonego przycisku — test niczego by nie sprawdzał').not.toBeFocused();
		expect(wyslane).toHaveLength(1);
		zwolnij();

		await expect(status(page)).toContainText('Dziękuję! Wiadomość została wysłana');
		await expect(przycisk).toBeEnabled();
		await expect(przycisk, 'Po wysyłce fokus ma wrócić na przycisk, a nie zostać na <body>').toBeFocused();
	});
});

// --- Wiadomość z linku „Zapytaj o podobny retusz” (/kontakt/?zdjecie=<opis>, src/lib/zapytanie.ts) ---
// Parametr z adresu to tekst od obcej osoby: do pola trafia wyłącznie przez textarea.value, jako zwykły tekst.

const PREFIKS_ZAPYTANIA = 'Interesuje mnie retusz podobny do: ';

// Parametr podajemy odkodowany — adres składa funkcja encodeURIComponent, tak jak robi to link w lightboksie.
async function otworzZParametrem(page: Page, opis: string | null) {
	await podstawAtrapeTurnstile(page);
	await page.goto(opis === null ? '/kontakt/' : `/kontakt/?zdjecie=${encodeURIComponent(opis)}`);
}

test.describe('Formularz kontaktowy: wiadomość z linku „Zapytaj o podobny retusz”', () => {
	test('bez parametru, z pustym i z samymi spacjami pole „Wiadomość” zostaje puste', async ({ page }) => {
		const wiadomosc = page.getByTestId('contact-message');
		await podstawAtrapeTurnstile(page);
		for (const adres of ['/kontakt/', '/kontakt/?zdjecie=', '/kontakt/?zdjecie=%20%20', '/kontakt/?zdjecie=%0A%09%20']) {
			await page.goto(adres);
			await expect(wiadomosc, `Pole nie jest puste pod adresem ${adres}`).toHaveValue('');
		}
	});

	for (const opis of ['Złoty zegarek', 'Zestaw: zegarek & spinki', 'Spinki testowe z monogramem „AB”', 'Zegarek 50% #1 — czy to ten?']) {
		test(`parametr „${opis}” trafia do pola jako zdanie z dwiema nowymi liniami na końcu, bez błędu i bez fokusu`, async ({ page }) => {
			await otworzZParametrem(page, opis);
			const wiadomosc = page.getByTestId('contact-message');

			await expect(wiadomosc).toHaveValue(`${PREFIKS_ZAPYTANIA}${opis}\n\n`);
			// Wpisanie z adresu nie pokazuje błędu (to nie jest pisanie klienta) i nie otwiera klawiatury na telefonie.
			await expect(page.locator('#kontakt-message-blad')).toBeEmpty();
			await expect(wiadomosc).not.toHaveAttribute('aria-invalid', 'true');
			await expect(wiadomosc).not.toBeFocused();
			expect(await page.evaluate(() => document.activeElement === document.body), 'Fokus nie jest na <body> — coś go przeniosło po wejściu na stronę').toBe(true);
		});
	}

	test('nowe linie i znaki sterujące w parametrze zamieniają się na spacje, a pozostałych pól formularza adres nie rusza', async ({ page }) => {
		await podstawAtrapeTurnstile(page);
		// Poza ?zdjecie= adres ma „podpowiedzi” do innych pól — formularz ma je ignorować.
		await page.goto(
			`/kontakt/?zdjecie=${encodeURIComponent('Pierwsza linia\nDruga\tlinia\u0000')}&name=Obca%20Osoba&email=obca@example.com&usluga=Inne%20%2F%20jeszcze%20nie%20wiem&liczba_zdjec=ponad%2050&termin=jutro&link_do_plikow=https%3A%2F%2Fexample.com%2Fa`
		);

		await expect(page.getByTestId('contact-message')).toHaveValue(`${PREFIKS_ZAPYTANIA}Pierwsza linia Druga linia\n\n`);
		for (const pole of ['contact-name', 'contact-email', 'contact-usluga', 'contact-liczba-zdjec', 'contact-termin', 'contact-link']) {
			await expect(page.getByTestId(pole), `Pole ${pole} zostało wypełnione z adresu`).toHaveValue('');
		}
	});

	test('bardzo długi parametr (1000 znaków) daje w polu prefiks i najwyżej 200 znaków opisu', async ({ page }) => {
		await otworzZParametrem(page, 'ab'.repeat(500));
		await expect(page.getByTestId('contact-message')).toHaveValue(`${PREFIKS_ZAPYTANIA}${'ab'.repeat(100)}\n\n`);
	});

	// Kod HTML w parametrze ma zostać zwykłym tekstem. Gdyby ktoś wstawił go jako HTML (innerHTML, insertAdjacentHTML…),
	// <img onerror> wykonałby kod, a w formularzu pojawiłyby się nowe elementy.
	for (const ladunek of ['<img src=x onerror=alert(1)>', '</textarea><img src=x onerror=alert(1)>', '"><svg onload=alert(1)>']) {
		test(`kod HTML w parametrze (${ladunek}) zostaje tekstem w polu: nic się nie wykonuje i nie przybywa elementów`, async ({ page }) => {
			const okna: string[] = [];
			page.on('dialog', async (okno) => {
				okna.push(okno.message());
				await okno.dismiss();
			});

			// Punkt odniesienia: ile elementów ma formularz bez parametru (razem z tym, co dokłada atrapa Turnstile).
			await otworzZParametrem(page, null);
			await poczekajNaTokenTurnstile(page);
			const elementowBezParametru = await page.locator('#formularz-kontaktowy *').count();

			await otworzZParametrem(page, ladunek);
			await poczekajNaTokenTurnstile(page);
			await expect(page.getByTestId('contact-message')).toHaveValue(`${PREFIKS_ZAPYTANIA}${ladunek}\n\n`);
			await expect(page.locator('#formularz-kontaktowy img'), 'W formularzu pojawił się <img> z parametru — tekst trafił do HTML-a').toHaveCount(0);
			await expect(page.locator('img[src="x"]')).toHaveCount(0);
			expect(await page.locator('#formularz-kontaktowy *').count(), 'Formularz ma więcej elementów niż bez parametru').toBe(elementowBezParametru);

			// onerror odpala się dopiero po nieudanym pobraniu obrazka — dajemy mu czas, zanim stwierdzimy, że nic się nie wykonało.
			await page.waitForLoadState('networkidle');
			await page.evaluate(() => new Promise<void>((gotowe) => requestAnimationFrame(() => requestAnimationFrame(() => gotowe()))));
			expect(okna, 'Parametr z adresu wykonał kod (okno dialogowe)').toEqual([]);
		});
	}

	// Po „Wstecz” przeglądarka przywraca to, co klient wpisał w pole, a tekst z adresu nie może tego nadpisać. Samo
	// page.goBack() niczego tu nie dowodzi: Chromium przywraca pole dopiero PO skrypcie formularza, więc wynik jest ten sam
	// z warunkiem „tylko do pustego pola” i bez niego. Dlatego tekst wpisujemy sami, po zakończeniu parsowania strony
	// (readyState „interactive”), ale przed skryptami modułowymi, które startują dopiero potem — pole ma już zawartość,
	// gdy skrypt formularza dochodzi do głosu.
	test('nie nadpisuje tekstu, który już jest w polu, gdy startuje skrypt formularza (tak jak po „Wstecz”)', async ({ page }) => {
		const wlasnyTekst = 'Mój własny tekst, który zdążyłem już napisać.';
		await page.addInitScript((tekst) => {
			document.addEventListener('readystatechange', () => {
				if (document.readyState !== 'interactive') return;
				const pole = document.getElementById('kontakt-message');
				if (pole instanceof HTMLTextAreaElement) pole.value = tekst;
			});
		}, wlasnyTekst);
		const wiadomosc = page.getByTestId('contact-message');

		// Kontrola: bez parametru pole ma wpisany tekst — czyli skrypt startowy działa i skrypt formularza go nie rusza.
		await otworzZParametrem(page, null);
		await expect(wiadomosc, 'Skrypt startowy testu nie wpisał tekstu do pola — test niczego by nie sprawdził').toHaveValue(wlasnyTekst);

		await otworzZParametrem(page, 'Złoty zegarek');
		await expect(wiadomosc, 'Tekst z adresu nadpisał to, co już było w polu').toHaveValue(wlasnyTekst);
	});

	test('formularz z tekstem z adresu przechodzi walidację, wiadomość idzie do Formspree, a po wysyłce pole jest puste', async ({ page }) => {
		const wyslane = await podstawFormspree(page, { status: 200 });
		await otworzZParametrem(page, 'Złoty zegarek');
		await sprawdzIdFormspree(page);
		// Wiadomości klient nie dopisuje — wystarczy imię i e-mail.
		await page.getByTestId('contact-name').fill('Wiktor Testowy');
		await page.getByTestId('contact-email').fill('wiktor@example.com');
		await poczekajNaTokenTurnstile(page);

		await page.getByTestId('contact-submit').click();

		await expect(status(page)).toContainText('Dziękuję! Wiadomość została wysłana');
		expect(wyslane).toHaveLength(1);
		// Multipart zapisuje nowe linie jako CRLF — przed porównaniem sprowadzamy je do zwykłych.
		expect(polaWysylki(wyslane[0].tresc).message.replace(/\r\n/g, '\n')).toBe(`${PREFIKS_ZAPYTANIA}Złoty zegarek\n\n`);

		// formularz.reset() czyści pole (ustawiliśmy .value, nie wartość domyślną), więc po wysyłce nie wraca tekst z adresu.
		await expect(page.getByTestId('contact-message')).toHaveValue('');
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
			'Widżet nie wydał tokenu. Build testowy ma klucz testowy Cloudflare (scripts/build-testowy.mjs) — uruchom testy przez `npm test`'
		).toHaveValue(/.+/, { timeout: 15_000 });
	});
});
