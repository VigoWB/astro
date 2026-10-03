import galeriaDane from "./galeria.json";

// Lista kategorii do paska filtrów na /galeria. Liczona przy buildzie z galeria.json —
// unikalne wartości pola "kategorie", posortowane po polsku, z "Wszystkie" na początku.
// Nowa kategoria w galeria.json (przez sync-images) pojawia się tu sama, bez zmian w kodzie.
interface ZdjecieKategorie {
	klucz?: string | null;
	szerokosc?: number | null;
	wysokosc?: number | null;
	kategorie?: string[];
}

const WSZYSTKIE = "Wszystkie";

const unikalne = new Set<string>();
for (const zdjecie of galeriaDane as ZdjecieKategorie[]) {
	// Te same zdjęcia, które /galeria faktycznie pokazuje (patrz zbudujListeZdjec w
	// src/lib/galeria.ts) — inaczej powstałby przycisk kategorii bez żadnego zdjęcia.
	if (!zdjecie.klucz || !zdjecie.szerokosc || !zdjecie.wysokosc) continue;
	for (const kategoria of zdjecie.kategorie ?? []) {
		// "Wszystkie" dokłada kod niżej (i Galeria.astro traktuje tę nazwę specjalnie),
		// a pusta nazwa dałaby pusty przycisk. Reszty nie ruszamy (np. nie przycinamy
		// spacji) — nazwa przycisku musi zgadzać się 1:1 z kategorią przy zdjęciu.
		if (kategoria === WSZYSTKIE || kategoria.trim() === "") continue;
		unikalne.add(kategoria);
	}
}

export const kategorie = [
	WSZYSTKIE,
	...Array.from(unikalne).sort((a, b) => a.localeCompare(b, "pl")),
] as const;