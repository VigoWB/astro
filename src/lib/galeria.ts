import { getImage, inferRemoteSize } from "astro:assets";
import galeriaDane from "../data/galeria.json";

// Wspólne wczytywanie danych galerii — używane przez /galeria (siatka + filtry)
// i przez stronę główną (suwak przed/po + wybrane pary).
// Adres zdjęć budujemy tu raz, więc obie strony korzystają z tej samej logiki
// (miniatury, wersje do lightboxa, zabezpieczenie przed brakiem pliku "przed").

const adresZdjec = (import.meta.env.PUBLIC_R2_URL ?? "").replace(/\/+$/, "");

if (!adresZdjec) {
	// Lepiej przerwać budowanie z jasnym komunikatem niż wypuścić pustą stronę.
	throw new Error(
		"Brak zmiennej PUBLIC_R2_URL — ustaw adres bucketa R2 w pliku .env (lokalnie) oraz w ustawieniach Cloudflare Pages (produkcja). Zob. .env.example."
	);
}

/** Dane z aparatu — ten sam kształt co pole "exif" w galeria.json (zapisuje je sync-images). */
export interface ExifZdjecia {
	iso: number | null;
	przyslona: number | null;
	ogniskowa: number | null;
	czasNaswietlania: number | null;
	dataWykonania: string | null;
	make: string | null;
	model: string | null;
	lensModel: string | null;
}

interface ZdjecieZPliku {
	nazwaPliku: string;
	opis: string;
	kategorie: string[];
	szerokosc: number | null;
	wysokosc: number | null;
	klucz: string | null;
	kluczPrzed: string | null;
	/** Pokazywane w sekcji "wybrane" na stronie głównej. Ustawia `sync-images -- --wyroznij`. */
	wyroznione?: boolean;
	/** Ta jedna para (wymaga identycznego kadru "po"/"przed") trafia do suwaka na pierwszym ekranie strony głównej. */
	paraSuwaka?: boolean;
	exif: ExifZdjecia;
}

// Klucz w R2 (np. "zdjecia/DSC_1111.jpg") zamieniamy na pełny adres zdjęcia.
function adresZKlucza(klucz: string): string {
	return `${adresZdjec}/${klucz.split("/").map(encodeURIComponent).join("/")}`;
}

// Ten sam klucz, tylko w folderze "znak/" zamiast "zdjecia/" — tam sync-images
// wgrywa wersję ze znakiem wodnym. Musi być zgodne z kluczZnak()
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
		// ale nie więcej, niż pozwala wysokość (ekran minus 10rem na podpis, licznik i EXIF —
		// to samo co max-h w Galeria.astro) i proporcje zdjęcia.
		sizes: `min(calc(100vw - 2rem), calc((100dvh - 10rem) * ${(szerokosc / wysokosc).toFixed(3)}))`,
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

// Adres pliku w R2 z jego wersją na końcu („…?v=<skrót ETag>”) albo null, gdy pliku nie ma (404).
//
// Po co wersja: nazwy plików w /_astro/ Astro liczy z adresu źródła, a nie z treści pliku.
// Po `sync-images -- --podmien` w R2 leży nowa treść pod tym samym kluczem — bez wersji
// w adresie nowe zdjęcie dostałoby starą nazwę, a pliki z /_astro/ przeglądarka trzyma
// przez rok (public/_headers), sw.js też. Nowa treść = nowy ETag = nowa nazwa pliku.
// R2 przy pobieraniu pliku pomija część adresu po „?”.
//
// Samo sprawdzenie idzie z jednorazowym dopiskiem (?sprawdz=…), żeby ominąć pamięć podręczną
// Cloudflare przed R2 — tuż po podmianie mogłaby jeszcze oddać stary ETag.
//
// Sprawdzamy PRZED getImage(), bo getImage() z astro:assets NIE rzuca błędu, który dałoby się
// złapać — prawdziwe pobranie dzieje się w późniejszej, osobnej fazie builda.
// null TYLKO przy 404 (pliku naprawdę nie ma). Inna odpowiedź (5xx, 403, 429) albo brak połączenia
// przerywa build — inaczej chwilowa awaria R2 po cichu wypuściłaby zdjęcia bez znaku wodnego.
async function adresZWersjaWR2(adres: string): Promise<string | null> {
	let odpowiedz: Response;
	try {
		odpowiedz = await fetch(`${adres}?sprawdz=${Date.now()}`, { method: "HEAD" });
	} catch (blad) {
		throw new Error(`galeria: R2 nie odpowiada (${adres}) — przerywam build, żeby nie wypuścić zdjęć bez znaku wodnego.`, { cause: blad });
	}
	if (odpowiedz.status === 404) return null;
	if (!odpowiedz.ok) {
		throw new Error(`galeria: R2 zwróciło ${odpowiedz.status} dla ${adres} — przerywam build, żeby nie wypuścić zdjęć bez znaku wodnego.`);
	}
	// ETag z R2 to skrót MD5 treści w cudzysłowie — zostawiamy same litery i cyfry.
	// Bez ETag-u wystarczy data ostatniej zmiany pliku.
	const etag = (odpowiedz.headers.get("etag") ?? "").replace(/[^0-9a-z]/gi, "").slice(0, 12);
	const zmiana = Date.parse(odpowiedz.headers.get("last-modified") ?? "");
	const wersja = etag || (Number.isNaN(zmiana) ? "" : String(zmiana / 1000));
	return wersja ? `${adres}?v=${wersja}` : adres;
}

// Siatka bezpieczeństwa na czas wdrażania znaku wodnego: zdjęcia
// dodane przed tą zmianą nie mają jeszcze wersji w "znak/", dopóki ktoś nie uruchomi
// dla nich `sync-images -- --podmien`. Zamiast wywalać cały build (jak przy prawdziwym
// braku pliku), pokazujemy czysty oryginał i ostrzegamy w logu — tak samo, jak build
// radzi sobie dziś z brakiem "wyroznione"/"paraSuwaka" (patrz index.astro).
async function wersjaDoLightboxaZFallbackiem(
	adresZnak: string,
	adresCzysty: string,
	szerokosc: number,
	wysokosc: number,
	nazwaPliku: string
): Promise<WersjaLightboxa> {
	const znak = await adresZWersjaWR2(adresZnak);
	if (znak) {
		return wersjaDoLightboxa(znak, szerokosc, wysokosc);
	}
	console.warn(
		`galeria: brak wersji ze znakiem wodnym dla ${nazwaPliku} (${adresZnak}) — pokazuję bez znaku. Uzupełnij: npm run sync-images -- --podmien ${nazwaPliku}.`
	);
	return wersjaDoLightboxa(adresCzysty, szerokosc, wysokosc);
}

async function wersjaPrzedZFallbackiem(adresZnak: string, adresCzysty: string, nazwaPliku: string): Promise<WersjaLightboxa> {
	const znak = await adresZWersjaWR2(adresZnak);
	if (znak) {
		return wersjaPrzed(znak, nazwaPliku);
	}
	console.warn(
		`galeria: brak wersji "przed" ze znakiem wodnym dla ${nazwaPliku} (${adresZnak}) — próbuję bez znaku. Uzupełnij: npm run sync-images -- --podmien ${nazwaPliku}.`
	);
	// Jeśli i czystej wersji nie ma, to już prawdziwy brak pliku "przed" — wersjaPrzed()
	// rzuci swój zwykły, jasny komunikat.
	return wersjaPrzed((await adresZWersjaWR2(adresCzysty)) ?? adresCzysty, nazwaPliku);
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
	exif: ExifZdjecia;
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
			// Czysty oryginał "po": z niego miniatura (Karta.astro) i zapasowa wersja do lightboxa.
			// Gdyby go nie było (404), zostaje adres bez wersji — build i tak przerwie się na miniaturze.
			const adresPo = adresZKlucza(z.klucz!);
			const adresPoZWersja = (await adresZWersjaWR2(adresPo)) ?? adresPo;
			return {
				po: { src: adresPoZWersja, width: z.szerokosc!, height: z.wysokosc! },
				lightbox: {
					po: await wersjaDoLightboxaZFallbackiem(
						adresZKlucza(kluczZnak(z.klucz!)),
						adresPoZWersja,
						z.szerokosc!,
						z.wysokosc!,
						z.nazwaPliku
					),
					przed: z.kluczPrzed
						? await wersjaPrzedZFallbackiem(
								adresZKlucza(kluczZnak(z.kluczPrzed)),
								adresZKlucza(z.kluczPrzed),
								z.nazwaPliku
						  )
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