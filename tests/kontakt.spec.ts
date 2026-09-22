import { test, expect } from '@playwright/test';

const FORMSPREE_URL = 'https://formspree.io/f/';

test.describe('Formularz kontaktowy', () => {
	test('happy-path: wypełnienie poprawnych danych i wysłanie formularza', async ({ page }) => {
		// Mock Formspree success response
		await page.route('**/formspree.io/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ok: true, success: true }),
			});
		});

		await page.goto('/kontakt');

		// Wypełnij formularz poprawnymi danymi
		await page.fill('[data-testid="contact-name"]', 'Wiktor Testowy');
		await page.fill('[data-testid="contact-email"]', 'wiktor@example.com');
		await page.fill('[data-testid="contact-message"]', 'To jest testowa wiadomość o wystarczającej długości.');

		// Kliknij przycisk wysyłania
		await page.click('[data-testid="contact-submit"]');

		// Poczekaj na sukces (status "wysyłanie" może być zbyt krótki by go złapać)
		await expect(page.locator('[data-testid="contact-status"]')).toHaveClass(/text-green-700/, { timeout: 10000 });
		await expect(page.locator('[data-testid="contact-status"]')).toContainText('Dziękuję! Wiadomość została wysłana');

		// Sprawdź, że formularz został zresetowany
		await expect(page.locator('[data-testid="contact-name"]')).toHaveValue('');
		await expect(page.locator('[data-testid="contact-email"]')).toHaveValue('');
		await expect(page.locator('[data-testid="contact-message"]')).toHaveValue('');
	});

	test('walidacja: puste pola wyświetlają błędy po polsku, bez wysyłki', async ({ page }) => {
		// Nie mockujemy Formspree - żaden request nie powinien wylecieć
		let formspreeCalled = false;
		await page.route('**/formspree.io/**', async (route) => {
			formspreeCalled = true;
			await route.abort();
		});

		await page.goto('/kontakt');

		// Kliknij submit bez wypełniania
		await page.click('[data-testid="contact-submit"]');

		// Sprawdź komunikaty błędów dla wszystkich trzech pól
		await expect(page.locator('#kontakt-name-blad')).toContainText('Podaj imię i nazwisko.');
		await expect(page.locator('#kontakt-email-blad')).toContainText('Podaj adres email.');
		await expect(page.locator('#kontakt-message-blad')).toContainText('Napisz treść wiadomości.');

		// Sprawdź aria-invalid
		await expect(page.locator('[data-testid="contact-name"]')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('[data-testid="contact-email"]')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('[data-testid="contact-message"]')).toHaveAttribute('aria-invalid', 'true');

		// Potwierdź, że Formspree nie został wywołany
		expect(formspreeCalled).toBe(false);
	});

	test('walidacja: niepoprawny format e-maila wyświetla błąd', async ({ page }) => {
		let formspreeCalled = false;
		await page.route('**/formspree.io/**', async (route) => {
			formspreeCalled = true;
			await route.abort();
		});

		await page.goto('/kontakt');

		// Wypełnij imię i wiadomość, ale zły email
		await page.fill('[data-testid="contact-name"]', 'Wiktor Testowy');
		await page.fill('[data-testid="contact-email"]', 'nie-email');
		await page.fill('[data-testid="contact-message"]', 'To jest testowa wiadomość o wystarczającej długości.');

		// Trigger walidacji przez blur na polu email
		await page.locator('[data-testid="contact-email"]').blur();

		// Sprawdź błąd emaila
		await expect(page.locator('#kontakt-email-blad')).toContainText('Ten adres email wygląda na niepoprawny.');
		await expect(page.locator('[data-testid="contact-email"]')).toHaveAttribute('aria-invalid', 'true');

		// Reszta pól bez błędów
		await expect(page.locator('#kontakt-name-blad')).toBeEmpty();
		await expect(page.locator('#kontakt-message-blad')).toBeEmpty();
		await expect(page.locator('[data-testid="contact-name"]')).not.toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('[data-testid="contact-message"]')).not.toHaveAttribute('aria-invalid', 'true');

		expect(formspreeCalled).toBe(false);
	});

	test('bład sieci: wyświetla komunikat o braku połączenia', async ({ page }) => {
		// Mock network error
		await page.route('**/formspree.io/**', async (route) => {
			await route.abort('failed');
		});

		await page.goto('/kontakt');

		await page.fill('[data-testid="contact-name"]', 'Wiktor Testowy');
		await page.fill('[data-testid="contact-email"]', 'wiktor@example.com');
		await page.fill('[data-testid="contact-message"]', 'To jest testowa wiadomość o wystarczającej długości.');

		await page.click('[data-testid="contact-submit"]');

		// Sprawdź komunikat błędu sieci
		await expect(page.locator('[data-testid="contact-status"]')).toHaveClass(/text-red-700/, { timeout: 10000 });
		await expect(page.locator('[data-testid="contact-status"]')).toContainText('Brak połączenia z internetem');
	});

	test('bład Formspree (500): wyświetla generyczny komunikat błędu', async ({ page }) => {
		await page.route('**/formspree.io/**', async (route) => {
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ ok: false, errors: [{ message: 'Internal server error' }] }),
			});
		});

		await page.goto('/kontakt');

		await page.fill('[data-testid="contact-name"]', 'Wiktor Testowy');
		await page.fill('[data-testid="contact-email"]', 'wiktor@example.com');
		await page.fill('[data-testid="contact-message"]', 'To jest testowa wiadomość o wystarczającej długości.');

		await page.click('[data-testid="contact-submit"]');

		await expect(page.locator('[data-testid="contact-status"]')).toHaveClass(/text-red-700/, { timeout: 10000 });
		// Kod formularza bierze komunikat z odpowiedzi Formspree
		await expect(page.locator('[data-testid="contact-status"]')).toContainText('Internal server error');
	});
});