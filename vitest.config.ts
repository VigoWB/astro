/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Testy jednostkowe i integracyjne (Vitest). Testy e2e to Playwright: tests/*.spec.ts, playwright.config.ts.
// getViteConfig() wczytuje astro.config.mjs, więc testy widzą projekt tak jak build:
// importy plików .astro, astro:assets, import.meta.env.
// Pliki Vitesta kończą się na .test.ts, pliki Playwrighta na .spec.ts — każde narzędzie bierze tylko swoje.
export default getViteConfig({
	test: {
		// Po każdym teście: zmienne środowiskowe, globalne atrapy (np. fetch) i podglądy console.* wracają do stanu sprzed testu.
		unstubEnvs: true,
		unstubGlobals: true,
		restoreMocks: true,
		projects: [
			{
				extends: true,
				test: {
					name: "jednostkowe",
					// Jeden moduł naraz, bez sieci i bez renderowania komponentów — milisekundy.
					include: ["tests/jednostkowe/**/*.test.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "integracyjne",
					// Kilka modułów razem: kod builda z atrapą R2 i astro:assets, komponenty .astro przez Container API.
					include: ["tests/integracyjne/**/*.test.ts"],
				},
			},
		],
	},
});
