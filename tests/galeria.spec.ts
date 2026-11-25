import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { odmienZdjecia } from '../src/lib/odmiana.ts';
import { adresZapytania } from '../src/lib/zapytanie.ts';
import { test, expect, poczekajNaZdjecie, pokazanyPlik, plikiWersji, podstawAtrapeTurnstile, OPISY_ZE_ZNAKAMI_DO_ZAKODOWANIA } from './pomocnicze';

// Oczekiwane liczby test liczy sam — z atrybutów kart (data-kategoria) i z data-na-strone —
// zamiast wpisywać dzisiejsze dane na sztywno. Przypadki potrzebne testom (kategorie, wersje „przed”,
// więcej zdjęć niż jedna porcja) gwarantują dane testowe (tests/dane/galeria.json, pilnuje ich
// tests/dane-testowe.spec.ts). Brak takiego przypadku na stronie to błąd testu, nie pominięcie.

// Dane testowe, z których powstaje strona (tests/dane/galeria.json, patrz scripts/build-testowy.mjs). Oczekiwane liczby
// w testach „Załaduj więcej” wynikają z nich, a nie ze strony: gdyby strona zgubiła zdjęcie, test by to zauważył.
const daneTestowe = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'dane', 'galeria.json'), 'utf8')) as { kategorie: string[] }[];
const ileWDanychWKategorii = (kategoria: string) => daneTestowe.filter((zdjecie) => zdjecie.kategorie.includes(kategoria)).length;

const karty = (page: Page) => page.getByTestId('gallery-item');
// Karty, które są w układzie strony (bez ukrycia przez filtr albo "Załaduj więcej").
// Playwright liczy jako widoczne także karty z opacity 0 — to, czy naprawdę się
// pokazały, sprawdza osobny test "karty i miniatury naprawdę się pokazują".
const widoczneKarty = (page: Page) => karty(page).filter({ visible: true });
const przyciskFiltra = (page: Page, nazwa: string) =>
	page.getByTestId('gallery-filters').getByRole('button', { name: nazwa, exact: true });
const zdjecieLightboxa = (page: Page) => page.locator('#lightbox-img');
const linkZapytaj = (page: Page) => page.getByTestId('lightbox-zapytaj');
const NAPIS_LINKU_ZAPYTAJ = 'Zapytaj o podobny retusz';

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
		expect(kategorie.length, 'Pasek filtrów bez kategorii — dane testowe je mają, więc zgubiła je strona (sprawdź Galeria.astro i kategorie.ts)').toBeGreaterThan(0);
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
		expect(kategoria, 'Pasek filtrów bez kategorii — dane testowe je mają, więc zgubiła je strona (sprawdź Galeria.astro i kategorie.ts)').toBeTruthy();
		const porcja = await naStrone(page);
		const wszystkie = await karty(page).count();

		await przyciskFiltra(page, kategoria).click();
		await przyciskFiltra(page, 'Wszystkie').click();

		await expect(przyciskFiltra(page, 'Wszystkie')).toHaveAttribute('aria-pressed', 'true');
		await expect(przyciskFiltra(page, kategoria)).toHaveAttribute('aria-pressed', 'false');
		await expect(widoczneKarty(page)).toHaveCount(Math.min(wszystkie, porcja));
		await expect(page.getByTestId('load-more-count')).toHaveText(String(Math.max(wszystkie - porcja, 0)));
	});

	// Liczy wywołania document.startViewTransition w atrybucie data-przejscia na <html>.
	async function liczPrzejscia(page: Page) {
		await page.evaluate(() => {
			if (!('startViewTransition' in document)) return;
			const oryginal = document.startViewTransition.bind(document);
			document.startViewTransition = (...argumenty: Parameters<Document['startViewTransition']>) => {
				const html = document.documentElement;
				html.dataset.przejscia = String(Number(html.dataset.przejscia ?? '0') + 1);
				return oryginal(...argumenty);
			};
		});
	}

	test('zmiana filtra idzie płynnym przejściem (View Transitions), a po nim nic nie ma nazwy przejścia', async ({ page }) => {
		const [kategoria] = await nazwyKategorii(page);
		expect(kategoria, 'Pasek filtrów bez kategorii — dane testowe je mają, więc zgubiła je strona (sprawdź Galeria.astro i kategorie.ts)').toBeTruthy();
		test.skip(!(await page.evaluate(() => 'startViewTransition' in document)), 'Przeglądarka bez View Transitions');
		await liczPrzejscia(page);

		await przyciskFiltra(page, kategoria).click();
		await expect(przyciskFiltra(page, kategoria)).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('html')).toHaveAttribute('data-przejscia', '1');
		// Nazwy (view-transition-name) są potrzebne tylko w trakcie przejścia — potem znikają.
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						Array.from(document.querySelectorAll<HTMLElement>('[style]')).filter((el) =>
							el.style.getPropertyValue('view-transition-name')
						).length
				)
			)
			.toBe(0);
	});

	test('przy ograniczonym ruchu filtr zmienia się od razu, bez przejścia', async ({ page }) => {
		const [kategoria] = await nazwyKategorii(page);
		expect(kategoria, 'Pasek filtrów bez kategorii — dane testowe je mają, więc zgubiła je strona (sprawdź Galeria.astro i kategorie.ts)').toBeTruthy();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.reload();
		await liczPrzejscia(page);

		await przyciskFiltra(page, kategoria).click();
		await expect(przyciskFiltra(page, kategoria)).toHaveAttribute('aria-pressed', 'true');
		expect(await page.locator('html').getAttribute('data-przejscia')).toBeNull();
	});

	test('"Załaduj więcej": pokazuje kolejną porcję zdjęć, a licznik zgadza się z rzeczywistością', async ({ page }) => {
		const porcja = await naStrone(page);
		// Liczby wynikają z tests/dane/galeria.json (12 zdjęć) i z porcji (8): po jednym kliknięciu widać wszystkie zdjęcia,
		// licznik pokazuje 0, a przycisk znika. Zmieniasz dane albo porcję — popraw oczekiwania poniżej, a nie chowaj ich w warunku.
		const wszystkie = daneTestowe.length;
		expect(wszystkie, 'Dane testowe (tests/dane/galeria.json) mają mniej zdjęć niż jedna porcja — test „Załaduj więcej” nie ma czego doładować').toBeGreaterThan(porcja);
		expect(wszystkie, 'Dane testowe (tests/dane/galeria.json) nie mieszczą się w dwóch porcjach — po jednym kliknięciu zostałoby jeszcze coś do doładowania; ten test zakłada, że nie, więc rozbuduj go').toBeLessThanOrEqual(porcja * 2);
		await expect(karty(page), 'Strona ma inną liczbę kart niż tests/dane/galeria.json — sprawdź Galeria.astro i galeria.ts').toHaveCount(wszystkie);

		const licznik = page.getByTestId('load-more-count');

		// Na start widać dokładnie jedną porcję, a licznik pokazuje, ile zostało.
		await expect(widoczneKarty(page)).toHaveCount(porcja);
		await expect(licznik).toHaveText(String(wszystkie - porcja));

		await page.getByTestId('load-more-btn').click();

		// Doszły wszystkie pozostałe zdjęcia, licznik zszedł do zera, a przycisk zniknął — nie ma już czego doładowywać.
		await expect(widoczneKarty(page)).toHaveCount(wszystkie);
		await expect(licznik).toHaveText('0');
		await expect(page.getByTestId('load-more-container')).toBeHidden();
	});

	test('zmiana filtra po "Załaduj więcej" zaczyna od pierwszej porcji, a licznik się zgadza', async ({ page }) => {
		const porcja = await naStrone(page);
		const wszystkie = daneTestowe.length;
		expect(wszystkie, 'Dane testowe (tests/dane/galeria.json) mają mniej zdjęć niż jedna porcja — test „Załaduj więcej” nie ma czego doładować').toBeGreaterThan(porcja);
		expect(wszystkie, 'Dane testowe (tests/dane/galeria.json) nie mieszczą się w dwóch porcjach — ten test zakłada, że po jednym kliknięciu widać wszystkie zdjęcia').toBeLessThanOrEqual(porcja * 2);

		// Filtrujemy po kategorii, która ma więcej zdjęć niż jedna porcja (w danych: „Zegarki”, 9 przy porcji 8). Pierwsza kategoria
		// z paska („Pióra”, 1 zdjęcie) nie odróżniałaby „od pierwszej porcji” od „z rozwiniętej listy” — w obu przypadkach widać 1 zdjęcie.
		const duza = await kategoriaGdzie(page, (ile) => ile > porcja);
		expect(duza, `Żadna kategoria nie ma więcej niż ${porcja} zdjęć — tests/dane/galeria.json ma taką, więc strona gubi zdjęcia lub kategorie`).toBeTruthy();
		// I kategorię, która mieści się w jednej porcji (w danych: „Spinki”, 3) — przy niej przycisk „Załaduj więcej” znika.
		const mala = await kategoriaGdzie(page, (ile) => ile >= 2 && ile <= porcja);
		expect(mala, `Żadna kategoria nie ma od 2 do ${porcja} zdjęć — tests/dane/galeria.json ma taką, więc strona gubi zdjęcia lub kategorie`).toBeTruthy();
		const wDuzej = ileWDanychWKategorii(duza);
		const wMalej = ileWDanychWKategorii(mala);

		const licznik = page.getByTestId('load-more-count');
		const kontener = page.getByTestId('load-more-container');

		await page.getByTestId('load-more-btn').click();
		await expect(widoczneKarty(page)).toHaveCount(wszystkie);

		// Filtr po dużej kategorii: liczone od pierwszej porcji (8 zdjęć), a nie od rozwiniętej listy (wtedy byłoby 9 i bez przycisku).
		await przyciskFiltra(page, duza).click();
		await expect(widoczneKarty(page)).toHaveCount(porcja);
		await expect(licznik).toHaveText(String(wDuzej - porcja));
		await expect(kontener).toBeVisible();

		// Filtr po małej kategorii: wszystkie jej zdjęcia mieszczą się w jednej porcji, więc przycisk znika.
		await przyciskFiltra(page, mala).click();
		await expect(widoczneKarty(page)).toHaveCount(wMalej);
		await expect(licznik).toHaveText('0');
		await expect(kontener).toBeHidden();

		// Powrót do "Wszystkie": znowu jedna porcja i przycisk z poprawnym licznikiem.
		await przyciskFiltra(page, 'Wszystkie').click();
		await expect(widoczneKarty(page)).toHaveCount(porcja);
		await expect(licznik).toHaveText(String(wszystkie - porcja));
		await expect(kontener).toBeVisible();
	});

	test('"Załaduj więcej" przy włączonym filtrze dokłada tylko zdjęcia z tej kategorii', async ({ page }) => {
		const porcja = await naStrone(page);
		const kategoria = await kategoriaGdzie(page, (ile) => ile > porcja);
		expect(kategoria, `Żadna kategoria nie ma więcej niż ${porcja} zdjęć — dane testowe mają taką, więc strona gubi zdjęcia lub kategorie`).toBeTruthy();
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

	// Odstęp (w px) między najniżej położoną widoczną kartą a stopką.
	// Zwraca null, gdy nie ma żadnej widocznej karty (nie ma czego mierzyć).
	async function odstepOdStopki(page: Page): Promise<number | null> {
		return page.evaluate(() => {
			const doly = Array.from(document.querySelectorAll<HTMLElement>('[data-gallery-item]'))
				.filter((karta) => karta.getClientRects().length > 0)
				.map((karta) => karta.getBoundingClientRect().bottom);
			if (doly.length === 0) return null;
			return document.querySelector('footer')!.getBoundingClientRect().top - Math.max(...doly);
		});
	}

	// Odstęp nad stopką dawał kiedyś tylko margines przycisku "Załaduj więcej" — znikał razem z nim.
	// Ograniczony ruch: karty stoją od razu na swoim miejscu (bez wjeżdżania z dołu), więc pomiar jest dokładny.
	test('odstęp nad stopką zostaje, gdy po "Załaduj więcej" znika przycisk', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.reload();
		const zaladujWiecej = page.getByTestId('load-more-btn');
		await expect(zaladujWiecej, 'Przycisk "Załaduj więcej" się nie pokazał — dane testowe mają więcej zdjęć niż jedna porcja, więc zgubiła go strona').toBeVisible();

		while (await zaladujWiecej.isVisible()) {
			await zaladujWiecej.click();
		}
		const odstep = await odstepOdStopki(page);
		expect(odstep, 'Brak widocznych kart — pomiaru odstępu nie da się zrobić').not.toBeNull();
		expect(odstep!).toBeGreaterThanOrEqual(40);
	});

	test('odstęp nad stopką zostaje po wybraniu filtra, w którym zdjęcia mieszczą się w jednej porcji', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.reload();
		const porcja = await naStrone(page);
		const kategoria = await kategoriaGdzie(page, (ile) => ile <= porcja);
		expect(kategoria, `Każda kategoria ma więcej niż ${porcja} zdjęć — dane testowe mają kategorię mieszczącą się w jednej porcji`).toBeTruthy();

		await przyciskFiltra(page, kategoria).click();
		await expect(page.getByTestId('load-more-container')).toBeHidden();
		const odstep = await odstepOdStopki(page);
		expect(odstep, 'Brak widocznych kart — pomiaru odstępu nie da się zrobić').not.toBeNull();
		expect(odstep!).toBeGreaterThanOrEqual(40);
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
		expect(pozaEkranem, 'Wszystkie karty mieszczą się na ekranie 375×400 — dane testowe mają ich więcej, więc strona pokazuje za mało zdjęć').toBeTruthy();
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
		expect(await karta.getAttribute('data-przed'), 'Pierwsze zdjęcie bez wersji "przed" — dane testowe ją mają, więc zgubiła ją strona (sprawdź Karta.astro)').toBeTruthy();

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
		expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(2);
		expect(await lista.first().getAttribute('data-przed'), 'Pierwsze zdjęcie bez wersji "przed" — dane testowe ją mają, więc zgubiła ją strona (sprawdź Karta.astro)').toBeTruthy();

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
		expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(2);

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
		expect(kategoria, 'Żadna kategoria nie ma co najmniej 2 zdjęć — dane testowe mają taką, więc strona gubi zdjęcia lub kategorie').toBeTruthy();
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
		expect(kategoria, 'Żadna kategoria nie ma dokładnie jednego zdjęcia — dane testowe mają taką, więc strona gubi zdjęcia lub kategorie').toBeTruthy();

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
		expect(await lista.count(), 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(2);
		expect(await lista.first().getAttribute('data-przed'), 'Pierwsze zdjęcie bez wersji "przed" — dane testowe ją mają, więc zgubiła ją strona (sprawdź Karta.astro)').toBeTruthy();

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
		expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(2);

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
	// Otwiera podgląd tak, jak w Safari i z VoiceOverem na iPhonie: kliknięcie nie daje karcie fokusu,
	// więc w chwili otwarcia aktywny element to <body>.
	async function otworzBezFokusu(karta: Locator) {
		const fokusNaBody = await karta.evaluate((el) => {
			(document.activeElement as HTMLElement | null)?.blur();
			(el as HTMLElement).click();
			return document.activeElement === document.body;
		});
		expect(fokusNaBody, 'Sens testu: w chwili otwarcia podglądu fokus ma być na <body>, jak w Safari').toBe(true);
	}

	const lightbox = (page: Page) => page.getByRole('dialog', { name: 'Podgląd zdjęcia' });

	const SPOSOBY_ZAMKNIECIA: [string, (page: Page) => Promise<void>][] = [
		['Esc', (page) => page.keyboard.press('Escape')],
		['przycisk „Zamknij podgląd”', (page) => page.getByRole('button', { name: 'Zamknij podgląd' }).click()],
		['kliknięcie w tło', (page) => lightbox(page).click({ position: { x: 5, y: 5 } })],
	];

	for (const [nazwa, zamknij] of SPOSOBY_ZAMKNIECIA) {
		test(`lightbox: po zamknięciu (${nazwa}) fokus wraca na kartę ostatnio oglądanego zdjęcia, nawet gdy otwarto bez fokusu`, async ({ page }) => {
			const lista = widoczneKarty(page);
			const ile = await lista.count();
			expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(3);

			await otworzBezFokusu(lista.first());
			await expect(page.locator('#lightbox-close')).toBeFocused();
			await page.keyboard.press('ArrowRight');
			await expect(page.getByTestId('lightbox-licznik')).toHaveText(`2 / ${ile}`);

			await zamknij(page);
			await expect(lightbox(page)).toBeHidden();
			// Fokus na drugiej karcie (tej, którą było widać na końcu), a nie na pierwszej ani na <body>.
			await expect(lista.nth(1)).toBeFocused();
		});
	}

	test('lightbox: gdy karta ostatniego zdjęcia jest niewidoczna, fokus idzie na kartę otwarcia, a potem na pierwszą widoczną', async ({ page }) => {
		expect(await widoczneKarty(page).count(), 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(4);
		// Karty wybieramy z pełnej listy (nie z widocznych) — po schowaniu karty numeracja widocznych by się przesunęła.
		const [pierwsza, , otwarcia, ostatnia] = [0, 1, 2, 3].map((i) => karty(page).nth(i));
		const ukryj = (...lista: Locator[]) => Promise.all(lista.map((karta) => karta.evaluate((el) => el.classList.add('hidden'))));

		// Podgląd otwarty z 3. karty, przejście na 4.; karta 4. znika (np. filtr zmieniony w innej karcie) → fokus na 3.
		await otworzBezFokusu(otwarcia);
		await page.keyboard.press('ArrowRight');
		await ukryj(ostatnia);
		await page.keyboard.press('Escape');
		await expect(lightbox(page)).toBeHidden();
		await expect(otwarcia).toBeFocused();

		// Znikają obie karty (otwarcia i ostatnia) → fokus na pierwszej widocznej.
		await ostatnia.evaluate((el) => el.classList.remove('hidden'));
		await otworzBezFokusu(otwarcia);
		await page.keyboard.press('ArrowRight');
		await ukryj(otwarcia, ostatnia);
		await page.keyboard.press('Escape');
		await expect(lightbox(page)).toBeHidden();
		await expect(pierwsza).toBeFocused();
	});

	test('lightbox: strzałki z Alt, Ctrl, Meta albo Shift nie zmieniają zdjęcia i zostają przeglądarce (bez preventDefault)', async ({ page }) => {
		const ile = await widoczneKarty(page).count();
		expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(3);
		await widoczneKarty(page).first().click();
		const licznik = page.getByTestId('lightbox-licznik');
		await page.keyboard.press('ArrowRight');
		await expect(licznik).toHaveText(`2 / ${ile}`);

		// Nasłuch na window działa po tym z document (bąbelkowanie), więc widzi, czy galeria zrobiła preventDefault.
		await page.evaluate(() => {
			window.addEventListener('keydown', (e) => {
				document.documentElement.dataset.keydownAnulowany = String(e.defaultPrevented);
			});
		});
		for (const modyfikator of ['Alt', 'Control', 'Meta', 'Shift']) {
			for (const strzalka of ['ArrowLeft', 'ArrowRight']) {
				await page.keyboard.press(`${modyfikator}+${strzalka}`);
				await expect(licznik, `${modyfikator}+${strzalka} zmieniło zdjęcie`).toHaveText(`2 / ${ile}`);
				await expect(page.locator('html'), `${modyfikator}+${strzalka}: galeria wywołała preventDefault`).toHaveAttribute('data-keydown-anulowany', 'false');
			}
		}

		// Zwykłe strzałki dalej działają.
		await page.keyboard.press('ArrowLeft');
		await expect(licznik).toHaveText(`1 / ${ile}`);
	});

	test('komunikat dla czytnika ekranu: pusty na starcie, po filtrze i po "Załaduj więcej" mówi, ile jest zdjęć', async ({ page }) => {
		const komunikat = page.locator('#galeria-komunikat');
		await expect(komunikat).toHaveAttribute('role', 'status');
		await expect(komunikat).toBeEmpty();

		const porcja = await naStrone(page);
		const wszystkie = await karty(page).count();
		const kategorie = await nazwyKategorii(page);
		expect(kategorie.length, 'Pasek filtrów bez kategorii — dane testowe je mają, więc zgubiła je strona (sprawdź Galeria.astro i kategorie.ts)').toBeGreaterThan(0);

		// Filtr: liczba wszystkich zdjęć z kategorii, a nie tylko widocznych w pierwszej porcji.
		for (const kategoria of [...kategorie, 'Wszystkie']) {
			const przycisk = przyciskFiltra(page, kategoria);
			await przycisk.click();
			await expect(przycisk).toHaveAttribute('aria-pressed', 'true');
			const pasujace = kategoria === 'Wszystkie' ? wszystkie : await liczbaWKategorii(page, kategoria);
			await expect(komunikat).toHaveText(`Filtr „${kategoria}”: ${pasujace} ${odmienZdjecia(pasujace)}.`);
		}

		// „Załaduj więcej”: ile doszło i ile jest teraz widocznych z ilu pasujących.
		expect(wszystkie, 'Dane testowe mają więcej zdjęć niż jedna porcja, a strona pokazuje ich mniej — sprawdź Galeria.astro i galeria.ts').toBeGreaterThan(porcja);
		await page.getByTestId('load-more-btn').click();
		const widocznych = Math.min(wszystkie, porcja * 2);
		const doszlo = widocznych - porcja;
		await expect(komunikat).toHaveText(
			`Wczytano ${doszlo} ${odmienZdjecia(doszlo)} więcej, razem ${widocznych} z ${wszystkie}.`
		);
	});

	test('karta: podpis pokazuje się też przy fokusie z klawiatury, na tle co najmniej cien/75', async ({ page }) => {
		// Klawiatura: z ostatniego filtra jeden Tab na pierwszą kartę.
		await page.getByTestId('gallery-filters').getByRole('button').last().focus();
		const podpis = karty(page).first().getByTestId('podpis-karty');
		const naklada = podpis.locator('xpath=..');
		const przezroczystoscTla = () =>
			naklada.evaluate((el) => {
				const kolor = getComputedStyle(el).backgroundColor;
				const alfa = kolor.match(/\/\s*([\d.]+)\s*\)/);
				return alfa ? Number(alfa[1]) : 1;
			});
		await expect(podpis).toHaveCSS('opacity', '0');

		await page.keyboard.press('Tab');
		await expect(karty(page).first()).toBeFocused();
		await expect(podpis).toHaveCSS('opacity', '1');
		await expect.poll(przezroczystoscTla).toBeGreaterThanOrEqual(0.75);
		await expect(podpis).toHaveText((await karty(page).first().getAttribute('data-opis')) ?? '');
	});

	test('lightbox: „Pokaż przed” ma co najmniej 44×44 px, a wersja „przed” dostaje własny alt', async ({ page }) => {
		const karta = karty(page).first();
		const opis = (await karta.getAttribute('data-opis')) ?? '';
		expect(await karta.getAttribute('data-przed'), 'Pierwsze zdjęcie bez wersji "przed" — dane testowe ją mają, więc zgubiła ją strona (sprawdź Karta.astro)').toBeTruthy();
		await karta.click();

		const przelacznik = page.getByTestId('lightbox-przelacznik');
		await expect(przelacznik).toBeVisible();
		const ramka = await przelacznik.boundingBox();
		expect(ramka!.height).toBeGreaterThanOrEqual(44);
		expect(ramka!.width).toBeGreaterThanOrEqual(44);

		await expect(zdjecieLightboxa(page)).toHaveAttribute('alt', opis);
		await przelacznik.click();
		await expect(zdjecieLightboxa(page)).toHaveAttribute('alt', `${opis} — przed retuszem`);
		await przelacznik.click();
		await expect(zdjecieLightboxa(page)).toHaveAttribute('alt', opis);
	});

	// --- Link „Zapytaj o podobny retusz” (src/lib/zapytanie.ts, ContactForm.astro) ---

	test('lightbox: link „Zapytaj o podobny retusz” prowadzi na /kontakt/ z opisem zdjęcia i zmienia się razem ze zdjęciem', async ({ page }) => {
		const lista = widoczneKarty(page);
		expect(await lista.count(), 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(3);
		const opisPierwszego = (await lista.nth(0).getAttribute('data-opis')) ?? '';
		const opisDrugiego = (await lista.nth(1).getAttribute('data-opis')) ?? '';
		expect(opisPierwszego, 'Pierwsze zdjęcie bez opisu — dane testowe go mają').not.toBe('');
		expect(adresZapytania(opisDrugiego), 'Dwa pierwsze zdjęcia mają ten sam opis — test nie odróżniłby zmiany linku').not.toBe(adresZapytania(opisPierwszego));
		// Trzeciemu zdjęciu „zabieramy” opis na czas testu (lightbox czyta atrybuty karty dopiero przy pokazaniu zdjęcia).
		await lista.nth(2).evaluate((el) => el.setAttribute('data-opis', ''));

		await lista.first().click();
		const link = linkZapytaj(page);
		await expect(link).toBeVisible();
		await expect(link).toHaveText(NAPIS_LINKU_ZAPYTAJ);
		// Porównujemy z opisem zapisanym w karcie (data-opis), a nie z tekstem wpisanym w teście.
		await expect(link).toHaveAttribute('href', adresZapytania(opisPierwszego));
		// Zwykła nawigacja w tej samej karcie: bez target, więc działa też środkowy klik i „otwórz w nowej karcie”.
		await expect(link).not.toHaveAttribute('target', /.+/);

		// Następne zdjęcie: adres z jego opisem.
		await page.getByTestId('lightbox-nastepne').click();
		await expect(link).toHaveAttribute('href', adresZapytania(opisDrugiego));

		// Zdjęcie bez opisu: link zostaje i prowadzi na samo /kontakt/.
		await page.keyboard.press('ArrowRight');
		await expect(page.getByTestId('lightbox-licznik')).toHaveText(/^3 \//);
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', '/kontakt/');

		// Poprzednie: znowu adres drugiego zdjęcia.
		await page.getByTestId('lightbox-poprzednie').click();
		await expect(link).toHaveAttribute('href', adresZapytania(opisDrugiego));
	});

	// Opisy ze znakami, które w adresie trzeba zakodować („&”, cudzysłów „ ”): pełna droga od kliknięcia w kartę
	// do tekstu w polu „Wiadomość”. Opisy są w tests/pomocnicze.ts, a ich obecność w danych pilnuje też dane-testowe.spec.ts.
	for (const opis of OPISY_ZE_ZNAKAMI_DO_ZAKODOWANIA) {
		test(`lightbox: klik w link „Zapytaj o podobny retusz” przy zdjęciu „${opis}” otwiera formularz z tym opisem w wiadomości`, async ({ page }) => {
			await podstawAtrapeTurnstile(page);
			const karta = page.locator(`[data-gallery-item][data-opis=${JSON.stringify(opis)}]`);
			await expect(karta, `Na stronie nie ma karty z opisem „${opis}” — dane testowe go mają, więc strona gubi zdjęcie`).toHaveCount(1);
			// Zdjęcia poza pierwszą porcją czekają na „Załaduj więcej”.
			if (!(await karta.isVisible())) await page.getByTestId('load-more-btn').click();
			await expect(karta).toBeVisible();
			const opisKarty = (await karta.getAttribute('data-opis')) ?? '';
			expect(opisKarty).toBe(opis);

			await karta.click();
			const link = linkZapytaj(page);
			await expect(link).toHaveAttribute('href', adresZapytania(opisKarty));
			await link.click();

			await expect(page).toHaveURL(/\/kontakt\/\?zdjecie=/);
			// Parametr po odczytaniu to dokładnie opis zdjęcia (nic nie zginęło przy kodowaniu: „&” nie ucina parametru, „ ” zostają).
			expect(new URL(page.url()).searchParams.get('zdjecie')).toBe(opisKarty);
			await expect(page.getByTestId('contact-message')).toHaveValue(`Interesuje mnie retusz podobny do: ${opisKarty}\n\n`);
		});
	}

	test('lightbox: Tab krąży po lightboksie i trafia na link „Zapytaj o podobny retusz”, a Enter na linku przechodzi na /kontakt/', async ({ page }) => {
		await podstawAtrapeTurnstile(page);
		const karta = karty(page).first();
		expect(await karta.getAttribute('data-przed'), 'Pierwsze zdjęcie bez wersji "przed" — dane testowe ją mają, więc zgubiła ją strona (sprawdź Karta.astro)').toBeTruthy();
		const opis = (await karta.getAttribute('data-opis')) ?? '';
		await karta.click();
		await expect(page.locator('#lightbox-close')).toBeFocused();

		// Kolejność Tab z „Zamknij” (na pierwszym zdjęciu „Poprzednie” jest wyłączone i wypada z kolejności):
		// link jest ostatni, a po nim fokus wraca na „Zamknij” — nigdy na stronę pod spodem.
		const idFokusu = () => page.evaluate(() => document.activeElement?.id ?? '');
		const kolejnosc: string[] = [];
		for (let i = 0; i < 10 && kolejnosc.at(-1) !== 'lightbox-close'; i++) {
			await page.keyboard.press('Tab');
			kolejnosc.push(await idFokusu());
		}
		expect(kolejnosc, 'Tab nie dochodzi do linku „Zapytaj o podobny retusz” albo wychodzi poza lightbox (selektor w elementyFokusowalne, Galeria.astro)').toEqual([
			'lightbox-nastepne',
			'lightbox-img',
			'lightbox-opis',
			'lightbox-przelacznik',
			'lightbox-zapytaj',
			'lightbox-close',
		]);

		// Shift+Tab z pierwszego elementu idzie na ostatni — czyli na link.
		await page.keyboard.press('Shift+Tab');
		await expect(linkZapytaj(page)).toBeFocused();

		// Enter na linku to zwykła nawigacja.
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/\/kontakt\/\?zdjecie=/);
		await expect(page.getByTestId('contact-message')).toHaveValue(`Interesuje mnie retusz podobny do: ${opis}\n\n`);
	});

	// Wszystko w podglądzie (zdjęcie, opis, „Pokaż przed”, link, licznik, EXIF) ma się mieścić w oknie bez przewijania.
	// Telefon (projekt mobile-chrome): Pixel 5, iPhone SE (375×667) i Android 360×640 — w najwęższym oknie wiersz z linkiem
	// zawija się do trzech linii (opis, „Pokaż przed”, link osobno), czyli zajmuje najwięcej miejsca. Komputer: laptop 1366×768
	// i 1280×720 — tam wiersz mieści się w jednej linii. Sprawdzamy każde widoczne zdjęcie, także pionowe i z „przed” (najwyższe).
	// Zapas wysokości zdjęcia (max-h na #lightbox-img w Galeria.astro) jest dobrany do tych okien.
	test('lightbox: zdjęcie, wiersz z linkiem, licznik i EXIF mieszczą się w oknie bez przewijania', async ({ page, isMobile }) => {
		const rozmiaryOkien = isMobile
			? [page.viewportSize()!, { width: 375, height: 667 }, { width: 360, height: 640 }]
			: [{ width: 1366, height: 768 }, { width: 1280, height: 720 }];
		const lista = widoczneKarty(page);
		const ile = await lista.count();
		expect(ile, 'Za mało widocznych zdjęć — dane testowe mają ich więcej, więc strona je gubi (sprawdź Galeria.astro)').toBeGreaterThanOrEqual(2);
		const elementy = ['#lightbox-img', '#lightbox-opis', '#lightbox-przelacznik', '#lightbox-zapytaj', '#lightbox-licznik', '#lightbox-exif'];

		for (const rozmiar of rozmiaryOkien) {
			await page.setViewportSize(rozmiar);
			await lista.first().click();
			const okno = await page.evaluate(() => ({ szerokosc: window.innerWidth, wysokosc: window.innerHeight }));

			for (let i = 0; i < ile; i++) {
				if (i > 0) await page.keyboard.press('ArrowRight');
				await expect(page.getByTestId('lightbox-licznik')).toHaveText(`${i + 1} / ${ile}`);
				await poczekajNaZdjecie(zdjecieLightboxa(page));
				const opis = (await lista.nth(i).getAttribute('data-opis')) ?? '';

				for (const selektor of elementy) {
					const element = page.locator(selektor);
					if (!(await element.isVisible())) continue; // np. „Pokaż przed” przy zdjęciu bez „przed”
					const ramka = await element.boundingBox();
					expect(ramka, `${selektor}: brak ramki (zdjęcie ${i + 1}: ${opis})`).not.toBeNull();
					const gdzie = `${selektor} (zdjęcie ${i + 1}: ${opis}, okno ${okno.szerokosc}×${okno.wysokosc}): ${JSON.stringify(ramka)}`;
					expect(ramka!.x, `Wychodzi poza lewą krawędź okna — ${gdzie}`).toBeGreaterThanOrEqual(0);
					expect(ramka!.y, `Wychodzi poza górną krawędź okna — ${gdzie}`).toBeGreaterThanOrEqual(0);
					expect(ramka!.x + ramka!.width, `Wychodzi poza prawą krawędź okna — ${gdzie}`).toBeLessThanOrEqual(okno.szerokosc);
					expect(ramka!.y + ramka!.height, `Wychodzi poza dolną krawędź okna — ${gdzie}`).toBeLessThanOrEqual(okno.wysokosc);
				}
			}

			// Link nie jest przykryty przez inny element (trial: sprawdza, że kliknięcie trafiłoby w link, ale go nie klika).
			await linkZapytaj(page).click({ trial: true });
			await page.keyboard.press('Escape');
			await expect(lightbox(page)).toBeHidden();
		}
	});
});

// Strona główna: „Wybrane prace” to ta sama galeria i ten sam podgląd — link ma tam działać tak samo.
test.describe('Galeria na stronie głównej', () => {
	test('lightbox „Wybranych prac”: link „Zapytaj o podobny retusz” z opisem zdjęcia prowadzi na /kontakt/', async ({ page }) => {
		await podstawAtrapeTurnstile(page);
		await page.goto('/');
		const karta = karty(page).first();
		expect(await karta.count(), 'Strona główna bez kart z galerii — dane testowe mają zdjęcia wyróżnione').toBe(1);
		const opis = (await karta.getAttribute('data-opis')) ?? '';
		expect(opis, 'Pierwsza karta na stronie głównej bez opisu — dane testowe go mają').not.toBe('');

		await karta.click();
		const link = linkZapytaj(page);
		await expect(link).toBeVisible();
		await expect(link).toHaveText(NAPIS_LINKU_ZAPYTAJ);
		await expect(link).toHaveAttribute('href', adresZapytania(opis));

		await link.click();
		await expect(page).toHaveURL(/\/kontakt\/\?zdjecie=/);
		await expect(page.getByTestId('contact-message')).toHaveValue(`Interesuje mnie retusz podobny do: ${opis}\n\n`);
	});
});

// Bez JavaScriptu galeria ma pokazać wszystkie zdjęcia (karty i miniatury startują przezroczyste, a część kart ukryta
// do "Załaduj więcej" — bez skryptu nic by ich nie odkryło). Warianty noscript: w Karta.astro i Galeria.astro
// to media query scripting: none, a nie <noscript><style> (blokuje je CSP).
test.describe('Galeria bez JavaScriptu', () => {
	test.use({ javaScriptEnabled: false });

	const dane = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'dane', 'galeria.json'), 'utf8')) as unknown[];

	// Karty i miniatury w pełni widoczne: opacity 1, bez przesunięcia i rozmycia.
	async function sprawdzKartyWidoczne(page: Page) {
		for (const karta of await karty(page).all()) {
			await expect(karta).toBeVisible();
			await expect(karta).toHaveCSS('opacity', '1');
			await expect(karta).toHaveCSS('translate', /^(none|0px( 0px)*)$/);
			await expect(karta.locator('img')).toHaveCSS('opacity', '1');
			await expect(karta.locator('img')).toHaveCSS('filter', 'none');
		}
	}

	test('/galeria/: widać wszystkie zdjęcia z danych, a filtry i "Załaduj więcej" są ukryte', async ({ page }) => {
		await page.goto('/galeria/');
		const porcja = await naStrone(page);
		expect(dane.length, 'Dane testowe mają więcej zdjęć niż jedna porcja — inaczej test nie sprawdza zdjęć z "Załaduj więcej"').toBeGreaterThan(porcja);

		await expect(karty(page)).toHaveCount(dane.length);
		await expect(widoczneKarty(page)).toHaveCount(dane.length);
		await sprawdzKartyWidoczne(page);
		await expect(page.getByTestId('gallery-filters')).toBeHidden();
		await expect(page.getByTestId('load-more-container')).toBeHidden();
	});

	test('strona główna: karty "Wybrane prace" są widoczne, bez filtrów i "Załaduj więcej"', async ({ page }) => {
		await page.goto('/');
		expect(await karty(page).count(), 'Strona główna bez kart z galerii — dane testowe mają zdjęcia wyróżnione').toBeGreaterThan(0);

		await expect(widoczneKarty(page)).toHaveCount(await karty(page).count());
		await sprawdzKartyWidoczne(page);
		await expect(page.getByTestId('gallery-filters')).toBeHidden();
		await expect(page.getByTestId('load-more-container')).toBeHidden();
	});
});
