import { test, expect, type Page } from '@playwright/test';
import { poczekajNaZdjecie, pokazanyPlik, plikiWersji } from './pomocnicze';

// Oczekiwane liczby test liczy sam — z atrybutów kart (data-kategoria) i z data-na-strone —
// zamiast wpisywać dzisiejsze dane na sztywno. Dzięki temu testy przeżyją wymianę zdjęć
// testowych na prawdziwe (inne kategorie, inna liczba zdjęć).

const karty = (page: Page) => page.getByTestId('gallery-item');
// Karty, które są w układzie strony (bez ukrycia przez filtr albo "Załaduj więcej").
// Playwright liczy jako widoczne także karty z opacity 0 — to, czy naprawdę się
// pokazały, sprawdza osobny test "karty i miniatury naprawdę się pokazują".
const widoczneKarty = (page: Page) => karty(page).filter({ visible: true });
const przyciskFiltra = (page: Page, nazwa: string) =>
	page.getByTestId('gallery-filters').getByRole('button', { name: nazwa, exact: true });
const zdjecieLightboxa = (page: Page) => page.locator('#lightbox-img');

async function naStrone(page: Page): Promise<number> {
	return Number(await page.locator('#galeria-grid').getAttribute('data-na-strone'));
}

// Nazwy kategorii z paska filtrów (bez "Wszystkie").
async function nazwyKategorii(page: Page): Promise<string[]> {
	const nazwy = await page
		.getByTestId('gallery-filters')
		.getByRole('button')
		.evaluateAll((przyciski) => przyciski.map((p) => (p as HTMLElement).dataset.filter ?? ''));
	return nazwy.filter((nazwa) => nazwa && nazwa !== 'Wszystkie');
}

// Ile kart ma daną kategorię (data-kategoria to lista zapisana jako JSON).
async function liczbaWKategorii(page: Page, kategoria: string): Promise<number> {
	const listy = await karty(page).evaluateAll((el) =>
		el.map((karta) => JSON.parse((karta as HTMLElement).dataset.kategoria || '[]') as string[])
	);
	return listy.filter((lista) => lista.includes(kategoria)).length;
}

// Pierwsza kategoria, której liczba zdjęć spełnia warunek (albo "", gdy żadna).
async function kategoriaGdzie(page: Page, warunek: (ile: number) => boolean): Promise<string> {
	for (const nazwa of await nazwyKategorii(page)) {
		if (warunek(await liczbaWKategorii(page, nazwa))) return nazwa;
	}
	return '';
}

// Kategorie widocznej karty na danej pozycji (liczonej od zera).
async function kategorieKarty(page: Page, indeks: number): Promise<string[]> {
	return JSON.parse((await widoczneKarty(page).nth(indeks).getAttribute('data-kategoria')) ?? '[]');
}

test.describe('Galeria', () => {
	test.beforeEach(async ({ page }) => {
		// goto czeka na zdarzenie "load" — skrypt galerii jest już wtedy uruchomiony.
		await page.goto('/galeria/');
	});

	test('filtr kategorii: każdy przycisk pokazuje wszystkie zdjęcia ze swojej kategorii i tylko je', async ({ page }) => {
		const kategorie = await nazwyKategorii(page);
		test.skip(kategorie.length === 0, 'W galerii nie ma jeszcze żadnej kategorii');
		const porcja = await naStrone(page);

		for (const kategoria of kategorie) {
			const przycisk = przyciskFiltra(page, kategoria);
			await przycisk.click();
			await expect(przycisk).toHaveAttribute('aria-pressed', 'true');
			await expect(przyciskFiltra(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'false');

			const pasujace = await liczbaWKategorii(page, kategoria);
			expect(pasujace, `Przycisk "${kategoria}" nie ma w galerii żadnego zdjęcia`).toBeGreaterThan(0);
			// Widać WSZYSTKIE zdjęcia z kategorii (do wielkości porcji), a nie np. tylko pierwsze.
			await expect(widoczneKarty(page)).toHaveCount(Math.min(pasujace, porcja));
			for (let i = 0; i < Math.min(pasujace, porcja); i++) {
				expect(await kategorieKarty(page, i), `Karta spoza kategorii "${kategoria}"`).toContain(kategoria);
			}
		}
	});

	test('filtr "Wszystkie" przywraca pierwszą porcję zdjęć i licznik "Załaduj więcej"', async ({ page }) => {
		const [kategoria] = await nazwyKategorii(page);
		test.skip(!kategoria, 'W galerii nie ma jeszcze żadnej kategorii');
		const porcja = await naStrone(page);
		const wszystkie = await karty(page).count();

		await przyciskFiltra(page, kategoria).click();
		await przyciskFiltra(page, 'Wszystkie').click();

		await expect(przyciskFiltra(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'true');
		await expect(przyciskFiltra(page, kategoria)).toHaveAttribute('aria-pressed', 'false');
		await expect(widoczneKarty(page)).toHaveCount(Math.min(wszystkie, porcja));
		await expect(page.getByTestId('load-more-count')).toHaveText(String(Math.max(wszystkie - porcja, 0)));
	});

	test('"Załaduj więcej": pokazuje kolejną porcję zdjęć, a licznik zgadza się z rzeczywistością', async ({ page }) => {
		const porcja = await naStrone(page);
		const wszystkie = await karty(page).count();
		// Przycisk pojawia się tylko wtedy, gdy zdjęć jest więcej niż jedna porcja.
		test.skip(wszystkie <= porcja, 'Za mało zdjęć, żeby przycisk "Załaduj więcej" się pojawił');

		const licznik = page.getByTestId('load-more-count');

		// Na start widać dokładnie jedną porcję, a licznik pokazuje, ile zostało.
		await expect(widoczneKarty(page)).toHaveCount(porcja);
		await expect(licznik).toHaveText(String(wszystkie - porcja));

		await page.getByTestId('load-more-btn').click();

		// Po kliknięciu dochodzi kolejna porcja (albo wszystkie pozostałe).
		await expect(widoczneKarty(page)).toHaveCount(Math.min(wszystkie, porcja * 2));
		await expect(licznik).toHaveText(String(Math.max(wszystkie - porcja * 2, 0)));

		// Gdy nie ma już czego doładowywać, przycisk znika.
		if (wszystkie <= porcja * 2) {
			await expect(page.getByTestId('load-more-container')).toBeHidden();
		}
	});

	test('zmiana filtra po "Załaduj więcej" zaczyna od pierwszej porcji, a licznik się zgadza', async ({ page }) => {
		const porcja = await naStrone(page);
		const wszystkie = await karty(page).count();
		const [kategoria] = await nazwyKategorii(page);
		test.skip(wszystkie <= porcja || !kategoria, 'Potrzeba więcej zdjęć niż jedna porcja i co najmniej jednej kategorii');

		const licznik = page.getByTestId('load-more-count');
		const kontener = page.getByTestId('load-more-container');

		await page.getByTestId('load-more-btn').click();
		await expect(widoczneKarty(page)).toHaveCount(Math.min(wszystkie, porcja * 2));

		// Filtr: tylko zdjęcia z kategorii, liczone od pierwszej porcji (a nie od rozwiniętej listy).
		const pasujace = await liczbaWKategorii(page, kategoria);
		await przyciskFiltra(page, kategoria).click();
		await expect(widoczneKarty(page)).toHaveCount(Math.min(pasujace, porcja));
		await expect(licznik).toHaveText(String(Math.max(pasujace - porcja, 0)));
		if (pasujace <= porcja) {
			await expect(kontener).toBeHidden();
		}

		// Powrót do "Wszystkie": znowu jedna porcja i przycisk z poprawnym licznikiem.
		await przyciskFiltra(page, 'Wszystkie').click();
		await expect(widoczneKarty(page)).toHaveCount(porcja);
		await expect(licznik).toHaveText(String(wszystkie - porcja));
		await expect(kontener).toBeVisible();
	});

	test('"Załaduj więcej" przy włączonym filtrze dokłada tylko zdjęcia z tej kategorii', async ({ page }) => {
		const porcja = await naStrone(page);
		const kategoria = await kategoriaGdzie(page, (ile) => ile > porcja);
		// Brak takiej kategorii = test jawnie pominięty (z powodem w raporcie), a nie zaliczony.
		test.skip(!kategoria, `Żadna kategoria nie ma więcej niż ${porcja} zdjęć — na obecnych danych nie da się tego sprawdzić`);
		const pasujace = await liczbaWKategorii(page, kategoria);

		await przyciskFiltra(page, kategoria).click();
		await expect(widoczneKarty(page)).toHaveCount(porcja);
		await expect(page.getByTestId('load-more-count')).toHaveText(String(pasujace - porcja));

		await page.getByTestId('load-more-btn').click();
		await expect(widoczneKarty(page)).toHaveCount(Math.min(pasujace, porcja * 2));
		for (let i = 0; i < Math.min(pasujace, porcja * 2); i++) {
			expect(await kategorieKarty(page, i), `Karta spoza kategorii "${kategoria}"`).toContain(kategoria);
		}
	});

	test('karty i miniatury naprawdę się pokazują po przewinięciu (animacja wejścia i wczytanie)', async ({ page }) => {
		for (const karta of await widoczneKarty(page).all()) {
			await karta.evaluate((el) => el.scrollIntoView({ block: 'center' }));
			await expect(karta).toHaveCSS('opacity', '1');
			await expect(karta.locator('img')).toHaveCSS('opacity', '1');
		}
	});

	test('przy ograniczonym ruchu (prefers-reduced-motion) karty widać od razu, bez przewijania', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.setViewportSize({ width: 375, height: 400 });
		await page.reload();

		const ostatnia = widoczneKarty(page).last();
		// Sens testu: ostatnia karta jest poza ekranem — z animacją czekałaby na przewinięcie.
		const pozaEkranem = await ostatnia.evaluate((el) => el.getBoundingClientRect().top > window.innerHeight);
		test.skip(!pozaEkranem, 'Za mało zdjęć — wszystkie mieszczą się na ekranie, nie ma czego sprawdzić');
		await expect(ostatnia).toHaveCSS('opacity', '1');
	});

	test('lightbox: pokazuje zmniejszone zdjęcie z naszej domeny, a nie oryginał z R2', async ({ page, baseURL }) => {
		const karta = karty(page).first();
		await karta.click();

		const zdjecie = zdjecieLightboxa(page);
		await expect(zdjecie).toBeVisible();

		// Poczekaj, aż przeglądarka wybierze i wczyta plik z srcset.
		await poczekajNaZdjecie(zdjecie);
		const { adres, szerokosc } = await zdjecie.evaluate((img: HTMLImageElement) => ({
			adres: img.currentSrc,
			szerokosc: img.naturalWidth,
		}));

		expect(adres.startsWith(`${baseURL}/_astro/`)).toBe(true);
		expect(adres).toMatch(/\.webp$/);
		expect(szerokosc).toBeLessThanOrEqual(1920);

		// Wersja "przed" (jeśli jest) też pochodzi z /_astro/, a nie z R2.
		for (const plik of await plikiWersji(karta, 'przed')) {
			expect(plik).toMatch(/^\/_astro\/.+\.webp$/);
		}
	});

	test('lightbox: przełącznik "Pokaż przed" działa klawiaturą i pokazuje wersję "przed" tego zdjęcia', async ({ page }) => {
		const karta = karty(page).first();
		test.skip(!(await karta.getAttribute('data-przed')), 'Pierwsze zdjęcie nie ma wersji "przed"');

		await karta.click();

		const zdjecie = zdjecieLightboxa(page);
		const przelacznik = page.getByTestId('lightbox-przelacznik');

		await expect(przelacznik).toBeVisible();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
		await poczekajNaZdjecie(zdjecie);
		const plikiPo = await plikiWersji(karta, 'po');
		const plikiPrzed = await plikiWersji(karta, 'przed');
		expect(plikiPo).toContain(await pokazanyPlik(zdjecie));

		// Klawiatura: dojście do przełącznika samym Tabem (jak ktoś bez myszki) i Enter.
		await expect(page.locator('#lightbox-close')).toBeFocused();
		for (let i = 0; i < 6 && !(await przelacznik.evaluate((el) => el === document.activeElement)); i++) {
			await page.keyboard.press('Tab');
		}
		await expect(przelacznik).toBeFocused();
		await page.keyboard.press('Enter');

		// Lightbox pokazuje wersję "przed" TEGO zdjęcia (a nie po prostu jakiś inny plik).
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(async () => plikiPrzed.includes(await pokazanyPlik(zdjecie))).toBe(true);

		// Powrót do "po" tym samym przełącznikiem.
		await przelacznik.click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
		await expect.poll(async () => plikiPo.includes(await pokazanyPlik(zdjecie))).toBe(true);
	});

	test('lightbox: zdjęcie bez wersji "przed" nie ma przełącznika, a fokus z niego nie ginie', async ({ page }) => {
		const lista = widoczneKarty(page);
		const ile = await lista.count();
		test.skip(ile < 2, 'Potrzeba co najmniej 2 widocznych zdjęć');
		test.skip(!(await lista.first().getAttribute('data-przed')), 'Pierwsze zdjęcie nie ma wersji "przed"');

		// W danych każde zdjęcie może mieć parę — drugiemu "zabieramy" ją na czas testu
		// (lightbox czyta te atrybuty karty dopiero przy pokazaniu zdjęcia).
		await lista.nth(1).evaluate((el) => {
			el.setAttribute('data-przed', '');
			el.setAttribute('data-przed-srcset', '');
			el.setAttribute('data-przed-sizes', '');
		});

		await lista.first().click();
		const przelacznik = page.getByTestId('lightbox-przelacznik');
		await expect(page.locator('#lightbox-close')).toBeFocused();
		await expect(przelacznik).toBeVisible();
		await przelacznik.focus();

		// Strzałka w prawo przy fokusie na przełączniku: następne zdjęcie nie ma "przed".
		await page.keyboard.press('ArrowRight');
		await expect(page.getByTestId('lightbox-licznik')).toHaveText(`2 / ${ile}`);
		await expect(przelacznik).toBeHidden();
		// Fokus przechodzi na zdjęcie, a nie spada na <body> (wtedy Tab wyszedłby na stronę pod spodem).
		await expect(zdjecieLightboxa(page)).toBeFocused();

		// Powrót do zdjęcia z parą: przełącznik wraca, ustawiony na "po".
		await page.keyboard.press('ArrowLeft');
		await expect(przelacznik).toBeVisible();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
	});

	test('lightbox: poprzednie/następne, strzałki i licznik prowadzą po kolejnych widocznych zdjęciach', async ({ page }) => {
		// Nawigacja liczy tylko zdjęcia aktualnie widoczne (filtr, "Załaduj więcej") —
		// przy więcej niż jednej porcji to mniej niż wszystkie karty w HTML.
		const lista = widoczneKarty(page);
		const ile = await lista.count();
		test.skip(ile < 2, 'Potrzeba co najmniej 2 widocznych zdjęć, żeby sprawdzić nawigację');

		await lista.first().click();

		const licznik = page.getByTestId('lightbox-licznik');
		const poprzednie = page.getByTestId('lightbox-poprzednie');
		const nastepne = page.getByTestId('lightbox-nastepne');
		const opis = page.locator('#lightbox-opis');

		// Pierwsze zdjęcie: licznik "1 / N", "poprzednie" wyłączone.
		await expect(licznik).toHaveText(`1 / ${ile}`);
		await expect(poprzednie).toBeDisabled();
		await expect(nastepne).toBeEnabled();

		await nastepne.click();
		await expect(licznik).toHaveText(`2 / ${ile}`);
		await expect(poprzednie).toBeEnabled();
		// Lightbox pokazuje właśnie DRUGIE zdjęcie (jego plik i podpis), a nie jakiekolwiek inne.
		const plikiDrugiego = await plikiWersji(lista.nth(1), 'po');
		await expect.poll(async () => plikiDrugiego.includes(await pokazanyPlik(zdjecieLightboxa(page)))).toBe(true);
		await expect(opis).toHaveText((await lista.nth(1).getAttribute('data-opis')) ?? '');

		// Powrót strzałką klawiatury.
		await page.keyboard.press('ArrowLeft');
		await expect(licznik).toHaveText(`1 / ${ile}`);
		await expect(poprzednie).toBeDisabled();

		// Przejście na sam koniec listy (klawiaturą) — "następne" ma się wyłączyć.
		for (let i = 1; i < ile; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await expect(licznik).toHaveText(`${ile} / ${ile}`);
		await expect(opis).toHaveText((await lista.last().getAttribute('data-opis')) ?? '');
		await expect(nastepne).toBeDisabled();
		await expect(poprzednie).toBeEnabled();

		// Na ostatnim zdjęciu strzałka w prawo nic nie robi (bez zawijania w kółko).
		await page.keyboard.press('ArrowRight');
		await expect(licznik).toHaveText(`${ile} / ${ile}`);
	});

	test('lightbox przy włączonym filtrze przegląda tylko zdjęcia z tej kategorii', async ({ page }) => {
		const kategoria = await kategoriaGdzie(page, (ile) => ile >= 2);
		test.skip(!kategoria, 'Żadna kategoria nie ma co najmniej 2 zdjęć');
		const ile = Math.min(await liczbaWKategorii(page, kategoria), await naStrone(page));

		await przyciskFiltra(page, kategoria).click();
		const lista = widoczneKarty(page);
		await expect(lista).toHaveCount(ile);

		await lista.first().click();
		await expect(page.getByTestId('lightbox-licznik')).toHaveText(`1 / ${ile}`);
		for (let i = 1; i < ile; i++) {
			await page.keyboard.press('ArrowRight');
			await expect(page.locator('#lightbox-opis')).toHaveText((await lista.nth(i).getAttribute('data-opis')) ?? '');
		}
		await expect(page.getByTestId('lightbox-nastepne')).toBeDisabled();
	});

	test('lightbox: przy jednym widocznym zdjęciu nie ma strzałek ani licznika', async ({ page }) => {
		const kategoria = await kategoriaGdzie(page, (ile) => ile === 1);
		test.skip(!kategoria, 'Żadna kategoria nie ma dokładnie jednego zdjęcia');

		await przyciskFiltra(page, kategoria).click();
		await expect(widoczneKarty(page)).toHaveCount(1);
		await widoczneKarty(page).first().click();

		await expect(page.getByRole('dialog', { name: 'Podgląd zdjęcia' })).toBeVisible();
		await expect(page.getByTestId('lightbox-poprzednie')).toBeHidden();
		await expect(page.getByTestId('lightbox-nastepne')).toBeHidden();
		await expect(page.getByTestId('lightbox-licznik')).toBeHidden();
	});

	test('lightbox: przełącznik "Pokaż przed" resetuje się po przejściu do kolejnego zdjęcia', async ({ page }) => {
		const lista = widoczneKarty(page);
		test.skip((await lista.count()) < 2, 'Potrzeba co najmniej 2 widocznych zdjęć');
		test.skip(!(await lista.first().getAttribute('data-przed')), 'Pierwsze zdjęcie nie ma wersji "przed"');

		await lista.first().click();

		const przelacznik = page.getByTestId('lightbox-przelacznik');
		await przelacznik.click();
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'true');

		await page.getByTestId('lightbox-nastepne').click();
		// Następne zdjęcie startuje od wersji "po" — i przycisk, i samo zdjęcie.
		await expect(przelacznik).toHaveAttribute('aria-pressed', 'false');
		const plikiPo = await plikiWersji(lista.nth(1), 'po');
		await expect.poll(async () => plikiPo.includes(await pokazanyPlik(zdjecieLightboxa(page)))).toBe(true);
	});

	test('lightbox: przesunięcie palcem zmienia zdjęcie, a ruch w pionie i krótkie muśnięcie nie', async ({ page }) => {
		const ile = await widoczneKarty(page).count();
		test.skip(ile < 2, 'Potrzeba co najmniej 2 widocznych zdjęć');

		await widoczneKarty(page).first().click();

		const zdjecie = zdjecieLightboxa(page);
		const licznik = page.getByTestId('lightbox-licznik');
		await expect(licznik).toHaveText(`1 / ${ile}`);

		// Symulacja przesunięcia palcem bez potrzeby kontekstu z prawdziwym dotykiem —
		// odpalamy te same zdarzenia, które łapie skrypt galerii (touchstart/touchend
		// z changedTouches[0]). "identifier" jest wymagane przez konstruktor Touch.
		const przesun = async (odX: number, doX: number, odY = 200, doY = 200) => {
			await zdjecie.dispatchEvent('touchstart', { changedTouches: [{ identifier: 0, clientX: odX, clientY: odY }] });
			await zdjecie.dispatchEvent('touchend', { changedTouches: [{ identifier: 0, clientX: doX, clientY: doY }] });
		};

		await przesun(300, 200); // w lewo → następne
		await expect(licznik).toHaveText(`2 / ${ile}`);
		await przesun(200, 300); // w prawo → poprzednie
		await expect(licznik).toHaveText(`1 / ${ile}`);

		await przesun(300, 280); // za krótko (poniżej progu 50 px) → bez zmiany
		await przesun(300, 220, 100, 400); // bardziej w pionie niż w poziomie (np. przewijanie) → bez zmiany
		await expect(licznik).toHaveText(`1 / ${ile}`);
	});

	test('lightbox: zamyka się przyciskiem × i kliknięciem w tło, a strona pod spodem znów się przewija', async ({ page }) => {
		const lightbox = page.getByRole('dialog', { name: 'Podgląd zdjęcia' });
		const strona = page.locator('html');

		await karty(page).first().click();
		await expect(lightbox).toBeVisible();
		// Pod otwartym lightboksem strona się nie przewija.
		await expect(strona).toHaveCSS('overflow', 'hidden');

		await page.getByRole('button', { name: 'Zamknij podgląd' }).click();
		await expect(lightbox).toBeHidden();
		await expect(strona).not.toHaveCSS('overflow', 'hidden');

		await karty(page).first().click();
		await expect(lightbox).toBeVisible();
		await lightbox.click({ position: { x: 5, y: 5 } }); // róg czarnego tła, poza zdjęciem i przyciskami
		await expect(lightbox).toBeHidden();
	});
});
