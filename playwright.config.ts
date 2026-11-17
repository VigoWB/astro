import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	// Tylko pliki *.spec.ts. Pliki *.test.ts w tests/jednostkowe/ i tests/integracyjne/ należą do Vitesta
	// (vitest.config.ts) — Playwright próbowałby je uruchomić i padał na imporcie plików .astro.
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		// Podgląd builda na danych testowych (npm run build:testy → dist-testy/), nie prawdziwej strony.
		baseURL: 'http://localhost:4323',
		trace: 'on-first-retry',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
	],
	webServer: {
		command: 'node scripts/start-preview-if-needed.mjs',
		url: 'http://localhost:4323',
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
});
