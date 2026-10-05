import { test, expect } from '@playwright/test';

// Tryb offline (public/sw.js). Zwykłe "offline" Playwrighta (context.setOffline) nie odcina
// zapytań, które wysyła sam service worker, więc sieć odcinamy przez context.route —
// ono przechwytuje też zapytania workera.
test('offline: odwiedzona strona działa bez sieci, a nieodwiedzona pokazuje stronę "Jesteś offline"', async ({ page, context }) => {
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

	await context.route('**/*', (route) => route.abort('internetdisconnected'));

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
});
