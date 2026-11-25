import { describe, expect, test, vi } from "vitest";
import type { Zdjecie } from "../../src/lib/galeria";
import { proporcjeZgodne, wybierzBohatera, wybierzWyroznione } from "../../src/lib/stronaGlowna";

// Wybór zdjęć na stronę główną (src/lib/stronaGlowna.ts): para do suwaka na pierwszym ekranie
// i sekcja „Wybrane prace”. Dane podstawiamy w teście, bez galeria.json i bez astro:assets.
// Ostrzeżenia idą przez console.warn (restoreMocks w vitest.config.ts przywraca go po każdym teście).

type Wymiary = { szerokosc: number; wysokosc: number };

interface Opcje {
	nazwa?: string;
	/** Wymiary „po” (oryginał z R2). */
	po?: Wymiary;
	/** Wymiary „przed” z lightboxa; bez tego zdjęcie nie ma wersji „przed”. */
	przed?: Wymiary;
	opis?: string;
	kategoria?: string[];
	wyroznione?: boolean;
	paraSuwaka?: boolean;
}

function wersja(nazwa: string, { szerokosc, wysokosc }: Wymiary) {
	return {
		src: `/_astro/${nazwa}.webp`,
		srcset: `/_astro/${nazwa}.webp ${szerokosc}w`,
		sizes: "100vw",
		szerokosc,
		wysokosc,
	};
}

function zdjecie({
	nazwa = "zdjecie",
	po = { szerokosc: 1500, wysokosc: 1000 },
	przed,
	opis = "",
	kategoria = [],
	wyroznione = false,
	paraSuwaka = false,
}: Opcje = {}): Zdjecie {
	return {
		po: { src: `https://r2.test/zdjecia/${nazwa}.jpg`, width: po.szerokosc, height: po.wysokosc },
		lightbox: {
			po: wersja(`${nazwa}-po`, po),
			...(przed ? { przed: wersja(`${nazwa}-przed`, przed) } : {}),
		},
		opis,
		kategoria,
		wyroznione,
		paraSuwaka,
		exif: { iso: null, przyslona: null, ogniskowa: null, czasNaswietlania: null, dataWykonania: null, make: null, model: null, lensModel: null },
	};
}

// Lista zdjęć o nazwach z0, z1, … — wygodna do sprawdzania kolejności.
function lista(ile: number, opcje: (indeks: number) => Opcje = () => ({})): Zdjecie[] {
	return Array.from({ length: ile }, (_, i) => zdjecie({ nazwa: `z${i}`, ...opcje(i) }));
}

const nazwy = (zdjecia: Zdjecie[]) => zdjecia.map((z) => z.po.src.split("/").pop()?.replace(/\.jpg$/, ""));

function podgladOstrzezen() {
	return vi.spyOn(console, "warn").mockImplementation(() => {});
}

describe("proporcjeZgodne", () => {
	test("brak „przed” → false", () => {
		expect(proporcjeZgodne(zdjecie())).toBe(false);
	});

	test("identyczne proporcje → true", () => {
		const para = zdjecie({ po: { szerokosc: 1500, wysokosc: 1000 }, przed: { szerokosc: 3000, wysokosc: 2000 } });
		expect(proporcjeZgodne(para)).toBe(true);
	});

	// Granicę 2% sprawdzamy 1,9% i 2,1%, nie dokładnie 2,0%: przy liczbach zmiennoprzecinkowych
	// 1 − 0,98 daje 0,020000000000000018, więc wynik dla 2,0% zależałby od zaokrąglenia, a nie od logiki.
	test.each([
		["„przed” szersze o 1,9%", 1019],
		["„przed” węższe o 1,9%", 981],
	])("%s → true", (_opis, szerokoscPrzed) => {
		const para = zdjecie({ po: { szerokosc: 1000, wysokosc: 1000 }, przed: { szerokosc: szerokoscPrzed, wysokosc: 1000 } });
		expect(proporcjeZgodne(para)).toBe(true);
	});

	test.each([
		["„przed” szersze o 2,1%", 1021],
		["„przed” węższe o 2,1%", 979],
	])("%s → false", (_opis, szerokoscPrzed) => {
		const para = zdjecie({ po: { szerokosc: 1000, wysokosc: 1000 }, przed: { szerokosc: szerokoscPrzed, wysokosc: 1000 } });
		expect(proporcjeZgodne(para)).toBe(false);
	});
});

describe("wybierzBohatera", () => {
	const zgodnePrzed = { szerokosc: 3000, wysokosc: 2000 };

	test("pusta lista → null, bez ostrzeżeń", () => {
		const ostrzezenia = podgladOstrzezen();

		expect(wybierzBohatera([])).toBeNull();
		expect(ostrzezenia).not.toHaveBeenCalled();
	});

	test("para z paraSuwaka i zgodnymi proporcjami → ta para, tryb suwaka, bez ostrzeżeń", () => {
		const ostrzezenia = podgladOstrzezen();
		const para = zdjecie({ nazwa: "para", przed: zgodnePrzed, paraSuwaka: true });

		const wynik = wybierzBohatera([zdjecie({ nazwa: "inne" }), para]);

		expect(wynik).toEqual({ zdjecie: para, trybSuwaka: true });
		expect(wynik?.zdjecie).toBe(para);
		expect(ostrzezenia).not.toHaveBeenCalled();
	});

	test("dwie pary z paraSuwaka → pierwsza z listy i ostrzeżenie o „2 zdjęć”", () => {
		const ostrzezenia = podgladOstrzezen();
		const pierwsza = zdjecie({ nazwa: "pierwsza", przed: zgodnePrzed, paraSuwaka: true });
		const druga = zdjecie({ nazwa: "druga", przed: zgodnePrzed, paraSuwaka: true });

		const wynik = wybierzBohatera([pierwsza, druga]);

		expect(wynik?.zdjecie).toBe(pierwsza);
		expect(wynik?.trybSuwaka).toBe(true);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		expect(ostrzezenia.mock.calls[0][0]).toContain("2 zdjęć");
	});

	test("para z innymi proporcjami → bez suwaka i ostrzeżenie o „inne proporcje”", () => {
		const ostrzezenia = podgladOstrzezen();
		const para = zdjecie({ przed: { szerokosc: 2000, wysokosc: 2000 }, paraSuwaka: true });

		const wynik = wybierzBohatera([para]);

		expect(wynik).toEqual({ zdjecie: para, trybSuwaka: false });
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		expect(ostrzezenia.mock.calls[0][0]).toContain("inne proporcje");
	});

	test('para bez „przed” → bez suwaka, ostrzeżenie o braku wersji "przed" i bez „inne proporcje”', () => {
		const ostrzezenia = podgladOstrzezen();
		const para = zdjecie({ paraSuwaka: true });

		const wynik = wybierzBohatera([para]);

		expect(wynik).toEqual({ zdjecie: para, trybSuwaka: false });
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		const komunikat = ostrzezenia.mock.calls[0][0];
		expect(komunikat).toContain('nie ma wersji "przed"');
		expect(komunikat).not.toContain("inne proporcje");
	});

	test("para bez „przed”: komunikat podaje opis zdjęcia, a bez opisu jego adres", () => {
		const ostrzezenia = podgladOstrzezen();

		wybierzBohatera([zdjecie({ opis: "Złoty zegarek", paraSuwaka: true })]);
		wybierzBohatera([zdjecie({ nazwa: "bez-opisu", paraSuwaka: true })]);

		expect(ostrzezenia.mock.calls[0][0]).toBe(
			'index: zdjęcie oznaczone jako "paraSuwaka" (Złoty zegarek) nie ma wersji "przed" — na pierwszym ekranie jest samo zdjęcie, bez suwaka i bez przełącznika. Dodaj plik "przed" do tej pary (npm run sync-images) albo oznacz inną parę (npm run sync-images -- --wyroznij).'
		);
		expect(ostrzezenia.mock.calls[1][0]).toContain("(https://r2.test/zdjecia/bez-opisu.jpg)");
	});

	// Brak paraSuwaka: zastępczo najpierw wyróżnione z „przed”, potem dowolne z „przed”,
	// potem pierwsze wyróżnione, na końcu pierwsze z listy. Zawsze bez suwaka.
	test("brak paraSuwaka: wyróżnione bez „przed” stoi przed wyróżnionym z „przed” → wybrane wyróżnione z „przed”", () => {
		const ostrzezenia = podgladOstrzezen();
		const bezPrzed = zdjecie({ nazwa: "bez-przed", wyroznione: true });
		const zPrzed = zdjecie({ nazwa: "z-przed", przed: zgodnePrzed, wyroznione: true });

		const wynik = wybierzBohatera([bezPrzed, zPrzed]);

		expect(wynik).toEqual({ zdjecie: zPrzed, trybSuwaka: false });
		expect(wynik?.zdjecie).toBe(zPrzed);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		const komunikat = ostrzezenia.mock.calls[0][0];
		expect(komunikat).toContain('z przełącznikiem "Pokaż przed"');
		expect(komunikat).not.toContain('bez wersji "przed"');
	});

	test("brak paraSuwaka: wyróżnione z „przed” wygrywa z niewyróżnionym z „przed”, choć stoi dalej na liście", () => {
		podgladOstrzezen();
		const zwykleZPrzed = zdjecie({ nazwa: "zwykle-z-przed", przed: zgodnePrzed });
		const wyrozniona = zdjecie({ nazwa: "wyrozniona", przed: zgodnePrzed, wyroznione: true });

		const wynik = wybierzBohatera([zwykleZPrzed, wyrozniona]);

		expect(wynik?.zdjecie).toBe(wyrozniona);
		expect(wynik?.trybSuwaka).toBe(false);
	});

	test("brak paraSuwaka: żadne wyróżnione nie ma „przed”, ale niewyróżnione ma → wybrane niewyróżnione z „przed”", () => {
		const ostrzezenia = podgladOstrzezen();
		const wyrozniona = zdjecie({ nazwa: "wyrozniona", wyroznione: true });
		const zPrzed = zdjecie({ nazwa: "z-przed", przed: zgodnePrzed });

		const wynik = wybierzBohatera([wyrozniona, zPrzed]);

		expect(wynik).toEqual({ zdjecie: zPrzed, trybSuwaka: false });
		expect(wynik?.zdjecie).toBe(zPrzed);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		const komunikat = ostrzezenia.mock.calls[0][0];
		expect(komunikat).toContain('z przełącznikiem "Pokaż przed"');
		expect(komunikat).not.toContain('bez wersji "przed"');
	});

	test("brak paraSuwaka: nikt nie ma „przed”, są wyróżnione → pierwsze wyróżnione, ostrzeżenie bez obietnicy przełącznika", () => {
		const ostrzezenia = podgladOstrzezen();
		const wyrozniona = zdjecie({ nazwa: "wyrozniona", wyroznione: true });

		const wynik = wybierzBohatera([zdjecie({ nazwa: "zwykle" }), wyrozniona, zdjecie({ nazwa: "druga", wyroznione: true })]);

		expect(wynik).toEqual({ zdjecie: wyrozniona, trybSuwaka: false });
		expect(wynik?.zdjecie).toBe(wyrozniona);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		const komunikat = ostrzezenia.mock.calls[0][0];
		expect(komunikat).toContain('pokazano zastępcze zdjęcie bez wersji "przed" (bez suwaka i bez przełącznika)');
		expect(komunikat).not.toContain("przełącznikiem");
	});

	test("brak paraSuwaka: nikt nie ma „przed” ani wyróżnienia → pierwsze zdjęcie z listy", () => {
		const ostrzezenia = podgladOstrzezen();
		const zdjecia = lista(3);

		const wynik = wybierzBohatera(zdjecia);

		expect(wynik).toEqual({ zdjecie: zdjecia[0], trybSuwaka: false });
		expect(wynik?.zdjecie).toBe(zdjecia[0]);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		expect(ostrzezenia.mock.calls[0][0]).toContain('bez wersji "przed"');
	});

	test("paraSuwaka bez „przed” zostaje bohaterem, choć inne wyróżnione zdjęcie ma „przed”", () => {
		const ostrzezenia = podgladOstrzezen();
		const para = zdjecie({ nazwa: "para", paraSuwaka: true });
		const inne = zdjecie({ nazwa: "inne", przed: zgodnePrzed, wyroznione: true });

		const wynik = wybierzBohatera([inne, para]);

		expect(wynik).toEqual({ zdjecie: para, trybSuwaka: false });
		expect(wynik?.zdjecie).toBe(para);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		expect(ostrzezenia.mock.calls[0][0]).toContain('nie ma wersji "przed"');
	});
});

describe("wybierzWyroznione", () => {
	test("8 wyróżnionych → dokładnie 6, pierwsze sześć w kolejności z listy", () => {
		const ostrzezenia = podgladOstrzezen();
		const zdjecia = lista(8, () => ({ wyroznione: true }));

		const wynik = wybierzWyroznione(zdjecia);

		expect(nazwy(wynik)).toEqual(["z0", "z1", "z2", "z3", "z4", "z5"]);
		expect(ostrzezenia).not.toHaveBeenCalled();
	});

	test("pominięte (bohater) jest wyróżnione → nie ma go w wyniku, a wynik dalej ma 6 zdjęć", () => {
		const zdjecia = lista(8, () => ({ wyroznione: true }));

		const wynik = wybierzWyroznione(zdjecia, zdjecia[0]);

		expect(wynik).not.toContain(zdjecia[0]);
		expect(nazwy(wynik)).toEqual(["z1", "z2", "z3", "z4", "z5", "z6"]);
	});

	test("bez pominiętego (undefined) → zwraca wyróżnione, bez ostrzeżeń", () => {
		const ostrzezenia = podgladOstrzezen();
		const zdjecia = lista(5, (i) => ({ wyroznione: i % 2 === 0 }));

		const wynik = wybierzWyroznione(zdjecia, undefined);

		expect(nazwy(wynik)).toEqual(["z0", "z2", "z4"]);
		expect(ostrzezenia).not.toHaveBeenCalled();
	});

	test("brak wyróżnionych → zastępczo zdjęcia z listy bez pominiętego, maks. 6, z ostrzeżeniem", () => {
		const ostrzezenia = podgladOstrzezen();
		const zdjecia = lista(8);

		const wynik = wybierzWyroznione(zdjecia, zdjecia[1]);

		expect(wynik).not.toContain(zdjecia[1]);
		expect(nazwy(wynik)).toEqual(["z0", "z2", "z3", "z4", "z5", "z6"]);
		expect(ostrzezenia).toHaveBeenCalledTimes(1);
		expect(ostrzezenia.mock.calls[0][0]).toContain('żadne zdjęcie nie ma ustawionego "wyroznione"');
	});

	test("razem z wybierzBohatera: bohater wybrany zastępczo spośród wyróżnionych nie trafia do „Wybranych prac”", () => {
		podgladOstrzezen();
		// Brak paraSuwaka, więc bohaterem zostaje pierwsze wyróżnione zdjęcie z „przed” (z1).
		const zdjecia = lista(4, (i) => ({ wyroznione: i >= 1, przed: i >= 1 ? { szerokosc: 3000, wysokosc: 2000 } : undefined }));

		const bohater = wybierzBohatera(zdjecia);
		const wynik = wybierzWyroznione(zdjecia, bohater?.zdjecie);

		expect(bohater?.zdjecie).toBe(zdjecia[1]);
		expect(wynik).not.toContain(bohater?.zdjecie);
		expect(nazwy(wynik)).toEqual(["z2", "z3"]);
	});
});
