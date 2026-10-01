import { getImage, inferRemoteSize } from "astro:assets";
import galeriaDane from "../data/galeria.json";

// Wspólne wczytywanie danych galerii — używane przez /galeria (siatka + filtry)
// i przez stronę główną (suwak przed/po + wybrane pary, Roadmapa pkt 4).
// Adres zdjęć budujemy tu raz, więc obie strony korzystają z tej samej logiki
// (miniatury, wersje do lightboxa, zabezpieczenie przed brakiem pliku "przed").

const adresZdjec = (import.meta.env.PUBLIC_R2_URL ?? "").replace(/\/+$/, "");

if (!adresZdjec) {
	// Lepiej przerwać budowanie z jasnym komunikatem niż wypuścić pustą stronę.
	throw new Error(
		"Brak zmiennej PUBLIC_R2_URL — ustaw adres bucketa R2 w pliku .env (lokalnie) oraz w ustawieniach Cloudflare Pages (produkcja). Zob. .env.example."
	);
}

interface ZdjecieZPliku {
	nazwaPliku: string;
	opis: string;
	kategorie: string[];
	szerokosc: number | null;
	wysokosc: number | null;
	klucz: string | null;
	kluczPrzed: string | null;
	/** Pokazywane w sekcji "wybrane" na stronie głównej (Roadmapa pkt 4). Ustawia `sync-images -- --wyroznij`. */
	wyroznione?: boolean;
	/** Ta jedna para (wymaga identycznego kadru "po"/"przed") trafia do suwaka na pierwszym ekranie strony głównej. */
	paraSuwaka?: boolean;
	exif: {
		iso: number | null;
		przyslona: number | null;
		ogniskowa: number | null;
		czasNaswietlania: number | null;
		dataWykonania: string | null;
	};
}

// Klucz w R2 (np. "zdjecia/DSC_1111.jpg") zamieniamy na pełny adres zdjęcia.
function adresZKlucza(klucz: string): string {
	return `${adresZdjec}/${klucz.split("/").map(encodeURIComponent).join("/")}`;
}

// Ten sam klucz, tylko w folderze "znak/" zamiast "zdjecia/" — tam sync-images
// wgrywa wersję ze znakiem wodnym (Roadmapa pkt 2). Musi być zgodne z kluczZnak()
// w scripts/sync-images.mjs. Miniatury (Karta.astro) zostają na czystym oryginale,
// znak dostają tylko wersje do lightboksa i duże porównanie "przed/po" na stronie głównej.
function kluczZnak(klucz: string): string {
	return klucz.replace(/^zdjecia\//, "znak/");
}

// --- Zdjęcia do lightboxa ---
// Oryginały w R2 ważą nawet kilka MB. Do powiększenia robimy przy buildzie
// mniejsze wersje w formacie webp — trafiają do /_astro/ na naszej domenie,
// więc oryginały z R2 nie są nigdzie podlinkowane na stronie.
// Dwa rozmiary (dłuższy bok w pikselach): przeglądarka sama wybierze
// mniejszy na telefon i większy na duży ekran. Zdjęć nie powiększamy.
const DLUZSZY_BOK_LIGHTBOXA = [1280, 1920];

export interface WersjaLightboxa {
	src: string;
	srcset: string;
	sizes: string;
	szerokosc: number;
	wysokosc: number;
}

async function wersjaDoLightboxa(adres: string, szerokosc: number, wysokosc: number): Promise<WersjaLightboxa> {
	const dluzszyBok = Math.max(szerokosc, wysokosc);
	const szerokosci = [
		...new Set(DLUZSZY_BOK_LIGHTBOXA.map((bok) => Math.round(szerokosc * Math.min(1, bok / dluzszyBok)))),
	];
	const najwieksza = szerokosci[szerokosci.length - 1];
	const wysokoscNajwiekszej = Math.round((najwieksza * wysokosc) / szerokosc);

	const obraz = await getImage({
		src: adres,
		width: najwieksza,
		height: wysokoscNajwiekszej,
		widths: szerokosci,
		format: "webp",
	});

	return {
		src: obraz.src,
		srcset: obraz.srcSet.attribute,
		// Jak szeroko zdjęcie wyświetla się w lightboxie: szerokość ekranu minus margines,
		// ale nie więcej, niż pozwala wysokość (80% ekranu) i proporcje zdjęcia.
		sizes: `min(calc(100vw - 2rem), calc(80vh * ${(szerokosc / wysokosc).toFixed(3)}))`,
		szerokosc: najwieksza,
		wysokosc: wysokoscNajwiekszej,
	};
}

// Wymiarów pliku "przed" nie ma w galeria.json, więc odczytujemy je z R2.
// Przy okazji build sam wykryje brakujący plik "przed" i przerwie się z jasnym komunikatem.
async function wersjaPrzed(adres: string, nazwaPliku: string): Promise<WersjaLightboxa> {
	let wymiary: { width: number; height: number };
	try {
		wymiary = await inferRemoteSize(adres);
	} catch (blad) {
		throw new Error(
			`galeria: nie mogę pobrać wersji "przed" dla ${nazwaPliku} (${adres}). Sprawdź, czy ten plik jest w R2 (npm run sync-images) i czy R2 odpowiada pod adresem z PUBLIC_R2_URL.`,
			{ cause: blad }
		);
	}
	return wersjaDoLightboxa(adres, wymiary.width, wymiary.height);
}

export interface Zdjecie {
	/** Oryginał z R2 — z niego <Image> w Karta.astro robi miniaturę przy buildzie. */
	po: { src: string; width: number; height: number };
	lightbox: {
		po: WersjaLightboxa;
		przed?: WersjaLightboxa;
	};
	opis: string;
	kategoria: string[];
	wyroznione: boolean;
	paraSuwaka: boolean;
	exif?: {
		iso?: number | null;
		przyslona?: number | null;
		ogniskowa?: number | null;
		czasNaswietlania?: number | null;
		dataWykonania?: string | null;
	};
}

let obietnicaZdjec: Promise<Zdjecie[]> | null = null;

// Wynik liczony jest tylko raz na build (obie strony, które go potrzebują,
// dostają tę samą, już policzoną listę zamiast liczyć ją dwa razy).
export function wczytajZdjecia(): Promise<Zdjecie[]> {
	if (!obietnicaZdjec) {
		obietnicaZdjec = zbudujListeZdjec();
	}
	return obietnicaZdjec;
}

async function zbudujListeZdjec(): Promise<Zdjecie[]> {
	const kompletne = (galeriaDane as ZdjecieZPliku[]).filter((z) => {
		const ok = Boolean(z.klucz && z.szerokosc && z.wysokosc);
		if (!ok) {
			console.warn(`galeria: pomijam ${z.nazwaPliku} — brakuje adresu w R2 albo wymiarów (uruchom npm run sync-images).`);
		}
		return ok;
	});

	return Promise.all(
		kompletne.map(async (z) => {
			const adresPo = adresZKlucza(z.klucz!);
			return {
				po: { src: adresPo, width: z.szerokosc!, height: z.wysokosc! },
				lightbox: {
					po: await wersjaDoLightboxa(adresZKlucza(kluczZnak(z.klucz!)), z.szerokosc!, z.wysokosc!),
					przed: z.kluczPrzed
						? await wersjaPrzed(adresZKlucza(kluczZnak(z.kluczPrzed)), z.nazwaPliku)
						: undefined,
				},
				opis: z.opis,
				kategoria: z.kategorie,
				wyroznione: z.wyroznione ?? false,
				paraSuwaka: z.paraSuwaka ?? false,
				exif: z.exif,
			};
		})
	);
}

// Dane dla Google (Schema.org ImageGallery): duża wersja z lightboxa zamiast oryginału z R2.
export function zdjeciaDlaGoogle(zdjecia: Zdjecie[]) {
	return zdjecia.map((z) => ({
		po: { src: z.lightbox.po.src, width: z.lightbox.po.szerokosc, height: z.lightbox.po.wysokosc },
		opis: z.opis,
	}));
}