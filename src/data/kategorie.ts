import galeriaDane from "./galeria.json";

// Lista kategorii do paska filtrów na /galeria. Liczona przy buildzie z galeria.json
// (Roadmapa pkt 5) — unikalne wartości pola "kategorie", posortowane po polsku,
// z "Wszystkie" na początku. Nowa kategoria w galeria.json (przez sync-images)
// pojawia się tu sama, bez zmian w kodzie.
interface ZdjecieKategorie {
	kategorie?: string[];
}

const unikalne = new Set<string>();
for (const zdjecie of galeriaDane as ZdjecieKategorie[]) {
	for (const kategoria of zdjecie.kategorie ?? []) {
		unikalne.add(kategoria);
	}
}

export const kategorie = [
	"Wszystkie",
	...Array.from(unikalne).sort((a, b) => a.localeCompare(b, "pl")),
] as const;