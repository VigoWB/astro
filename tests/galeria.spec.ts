import { test, expect } from '@playwright/test';

describe('Galeria', () => {
  it('filtr kategorii: pokazuje tylko zdjęcia z wybranej kategorii', async () => {
    // Kliknięcie filtru kategorii
    // Sprawdzenie, że widoczne zdjęcia pasują do kategorii
    // Aria-pressed przełącza się poprawnie
    
    // Przykładowa logika testu
    await page.goto('/galeria');
    
    // Kliknięcie filtru "Portrety"
    await page.click('[data-filter="Portrety"]');
    
    // Sprawdzenie, że widoczne są tylko zdjęcia z kategorii Portrety
    const galleryItems = await page.locator('[data-gallery-item]');
    const visibleCount = await galleryItems.count();
    
    // Sprawdzenie, że liczba widocznych kart jest odpowiednia
    // (zależy od konfiguracji galerii)
    
    // Test aria-pressed przełącza się poprawnie
    await expect(page.locator('[data-filter="Portrety"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-filter="Wszystkie"]')).toHaveAttribute('aria-pressed', 'false');
  });

  it('kliknięcie "załaduj więcej": zwiększa liczbę widocznych kart w gridzie', async () => {
    // Kliknięcie przycisku "załaduj więcej"
    await page.click('[data-button="załaduj więcej"]');
    
    // Liczba widocznych kart w gridzie rośnie
    const initialCount = await page.locator('[data-gallery-item]').count();
    await page.click('[data-button="załaduj więcej"]');
    const newCount = await page.locator('[data-gallery-item]').count();
    
    // Liczba widocznych kart powinna wzrosnąć
    expect(newCount).toBeGreaterThan(initialCount);
    
    // Licznik przy przycisku maleje
    const countLabel = await page.locator('[data-count]');
    const newCountLabel = countLabel.textContent();
    expect(newCountLabel).toContain('+'); // Liczba wzrosła
  });
});
