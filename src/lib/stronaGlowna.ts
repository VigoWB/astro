// Wybór zdjęć na stronę główną: para do suwaka na pierwszym ekranie i sekcja "Wybrane prace".
// Wywołuje to index.astro przy buildzie. Sam moduł nic nie robi przy imporcie.
// Typ Zdjecie tylko jako typ: zwykły import z galeria.ts wczytałby astro:assets i galeria.json,
// a testy jednostkowe (tests/jednostkowe/stronaGlowna.test.ts) mają działać bez nich.
import type { Zdjecie } from "./galeria.ts";

// --- Para do suwaka ---
// Suwak wymaga identycznego kadru "przed" i "po". Dopóki Wiktor takiej pary nie oznaczy
// (npm run sync-images -- --wyroznij), strona i tak działa: pokazuje zastępcze
// zdjęcie ze zwykłym przełącznikiem "Pokaż przed", zamiast przerywać build.
export const TOLERANCJA_PROPORCJI = 0.02;

export function proporcjeZgodne(zdjecie: Zdjecie): boolean {
	if (!zdjecie.lightbox.przed) return false;
	const proporcjaPo = zdjecie.po.width / zdjecie.po.height;
	const proporcjaPrzed = zdjecie.lightbox.przed.szerokosc / zdjecie.lightbox.przed.wysokosc;
	return Math.abs(proporcjaPo - proporcjaPrzed) / proporcjaPo <= TOLERANCJA_PROPORCJI;
}

export function wybierzBohatera(lista: Zdjecie[]): { zdjecie: Zdjecie; trybSuwaka: boolean } | null {
	if (lista.length === 0) return null;

	const oznaczone = lista.filter((z) => z.paraSuwaka);
	if (oznaczone.length > 1) {
		console.warn(
			`index: ${oznaczone.length} zdjęć oznaczonych jako "paraSuwaka" w galeria.json — użyto pierwszego (npm run sync-images -- --wyroznij, żeby zostawić tylko jedno).`
		);
	}

	const kandydat = oznaczone[0];
	if (!kandydat) {
		// Zastępcze zdjęcie: najpierw takie z wersją "przed" (jest co porównać), wśród nich wyróżnione
		// przed zwykłymi. Dopiero gdy żadne nie ma "przed": pierwsze wyróżnione, na końcu pierwsze z listy.
		const zastepcze =
			lista.find((z) => z.wyroznione && z.lightbox.przed) ??
			lista.find((z) => z.lightbox.przed) ??
			lista.find((z) => z.wyroznione) ??
			lista[0];
		// Przełącznik "Pokaż przed" pojawia się tylko, gdy zastępcze zdjęcie ma wersję "przed".
		const coPokazano = zastepcze.lightbox.przed
			? 'pokazano zastępcze zdjęcie z przełącznikiem "Pokaż przed" zamiast suwaka'
			: 'pokazano zastępcze zdjęcie bez wersji "przed" (bez suwaka i bez przełącznika)';
		console.warn(
			`index: brak zdjęcia oznaczonego jako "paraSuwaka" w galeria.json — na pierwszym ekranie ${coPokazano} (npm run sync-images -- --wyroznij, żeby je ustawić).`
		);
		return { zdjecie: zastepcze, trybSuwaka: false };
	}

	// Brak "przed" sprawdzamy przed proporcjami: bez "przed" nie ma czego porównywać,
	// więc komunikat o "innych proporcjach" byłby nieprawdziwy.
	if (!kandydat.lightbox.przed) {
		console.warn(
			`index: zdjęcie oznaczone jako "paraSuwaka" (${kandydat.opis || kandydat.po.src}) nie ma wersji "przed" — na pierwszym ekranie jest samo zdjęcie, bez suwaka i bez przełącznika. Dodaj plik "przed" do tej pary (npm run sync-images) albo oznacz inną parę (npm run sync-images -- --wyroznij).`
		);
		return { zdjecie: kandydat, trybSuwaka: false };
	}

	if (!proporcjeZgodne(kandydat)) {
		console.warn(
			`index: zdjęcie oznaczone jako "paraSuwaka" (${kandydat.opis || kandydat.po.src}) ma inne proporcje "przed" i "po" — pokazano przełącznik zamiast suwaka. Przygotuj parę w identycznym kadrze.`
		);
		return { zdjecie: kandydat, trybSuwaka: false };
	}

	return { zdjecie: kandydat, trybSuwaka: true };
}

// --- Wybrane prace niżej na stronie ---
export const LIMIT_WYROZNIONYCH = 6;

export function wybierzWyroznione(lista: Zdjecie[], pominiete?: Zdjecie): Zdjecie[] {
	let wynik = lista.filter((z) => z.wyroznione && z !== pominiete);
	if (wynik.length === 0) {
		console.warn(
			'index: żadne zdjęcie nie ma ustawionego "wyroznione" w galeria.json — tymczasowo pokazano pierwsze zdjęcia z galerii (npm run sync-images -- --wyroznij, żeby wybrać właściwe).'
		);
		wynik = lista.filter((z) => z !== pominiete);
	}
	return wynik.slice(0, LIMIT_WYROZNIONYCH);
}
