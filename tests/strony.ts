// Wspólna lista stron serwisu. Plik celowo nie ma żadnych importów: czyta go i Vitest
// (tests/jednostkowe/strony.test.ts), i Playwright (przez tests/pomocnicze.ts) — a pomocnicze.ts
// ciągnie @playwright/test, którego Vitest nie może wczytać.

export const STRONA_OFFLINE = '/offline.html';
export const STRONA_404 = '/ta-strona-na-pewno-nie-istnieje';

/**
 * Wszystkie strony serwisu — jedna lista dla testów dostępności (a11y.spec.ts), CSP (csp.spec.ts),
 * oferty, sitemapy (sitemapa.spec.ts) i zgodności list w public/sw.js oraz lighthouserc.json
 * (tests/jednostkowe/strony.test.ts).
 * Nowa podstrona = dopisz ją tutaj, a potem do `url` w lighthouserc.json i do listy w public/sw.js —
 * jeśli któregoś z tych miejsc zabraknie, tests/jednostkowe/strony.test.ts i tests/sitemapa.spec.ts
 * pokażą na czerwono, czego brakuje. Szkic ukryty przed Google (STRONY_POZA_SITEMAPA w astro.config.mjs)
 * zostaje na tej liście, ale nie trafia do sw.js, lighthouserc.json ani sitemapy.
 */
export const STRONY = [
	'/',
	'/galeria/',
	'/o-mnie/',
	'/kontakt/',
	'/faq/',
	'/oferta/', // szkic, ukryty — patrz tests/oferta.spec.ts
	'/polityka-prywatnosci/',
	STRONA_OFFLINE,
	STRONA_404, // strona 404
];
