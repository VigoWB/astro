#!/usr/bin/env node

// Build strony na DANYCH TESTOWYCH — dla testów Playwright (`npm test`), nie do wdrożenia.
//
// Czym różni się od `npm run build`:
// - zamiast src/data/galeria.json bierze tests/dane/galeria.json (stała lista zdjęć ułożona
//   pod testy: ponad 8 zdjęć, kategoria z jednym zdjęciem, zdjęcia z „przed” i bez, para do suwaka),
// - zamiast R2 pyta mały serwer na tym komputerze (atrapa R2), który oddaje szare zdjęcia JPG
//   w wymiarach z tego pliku — bez sieci i bez prawdziwych zdjęć,
// - Formspree i Turnstile dostają stałe wartości testowe, a statystyki Cloudflare są wyłączone —
//   testy nie zależą od pliku .env,
// - wynik trafia do dist-testy/, nie do dist/ — prawdziwy build zostaje nietknięty, a Cloudflare
//   Pages (wdraża dist/) takiej strony i tak by nie opublikował.
//
// Po co: na prawdziwych zdjęciach część testów się pomijała (np. „Załaduj więcej” wymaga ponad
// 8 zdjęć), a każde nowe zdjęcie albo `sync-images -- --wyroznij` zmieniało to, co testy widzą.
// Nowy przypadek do sprawdzenia = nowy wpis w tests/dane/galeria.json (ten plik wolno edytować ręcznie).

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { build } from "astro";

const KORZEN = fileURLToPath(new URL("..", import.meta.url));
const GALERIA_PRAWDZIWA = path.join(KORZEN, "src", "data", "galeria.json");
const GALERIA_TESTOWA = path.join(KORZEN, "tests", "dane", "galeria.json");
const KATALOG_WYJSCIOWY = "./dist-testy";
// Stały port: te same adresy zdjęć przy każdym buildzie, więc Astro bierze gotowe miniatury
// ze swojej pamięci (node_modules/.astro-testy) i kolejny build jest szybszy.
const PORT_ATRAPY_R2 = 4324;

// --- Atrapa R2: szare zdjęcia o wymiarach z danych testowych ---
// "po" jasne (jak białe tło produktu), "przed" ciemniejsze, wersja ze znakiem wodnym (znak/…)
// z ciemnym kwadratem w prawym dolnym rogu. Wersja "przed" ma te same wymiary co "po".
const dane = JSON.parse(readFileSync(GALERIA_TESTOWA, "utf8"));
const pliki = new Map();
dane.forEach((zdjecie, numer) => {
	const odcien = 10 * (numer % 4);
	const wymiary = { szerokosc: zdjecie.szerokosc, wysokosc: zdjecie.wysokosc };
	pliki.set(zdjecie.klucz, { ...wymiary, jasnosc: 215 + odcien, znak: false });
	pliki.set(zdjecie.klucz.replace(/^zdjecia\//, "znak/"), { ...wymiary, jasnosc: 215 + odcien, znak: true });
	if (zdjecie.kluczPrzed) {
		pliki.set(zdjecie.kluczPrzed, { ...wymiary, jasnosc: 140 + odcien, znak: false });
		pliki.set(zdjecie.kluczPrzed.replace(/^zdjecia\//, "znak/"), { ...wymiary, jasnosc: 140 + odcien, znak: true });
	}
});

const gotowe = new Map();
function zdjecieJpg(klucz) {
	if (!gotowe.has(klucz)) {
		const { szerokosc, wysokosc, jasnosc, znak } = pliki.get(klucz);
		const tlo = { r: jasnosc, g: jasnosc, b: jasnosc };
		let obraz = sharp({ create: { width: szerokosc, height: wysokosc, channels: 3, background: tlo } });
		if (znak) {
			const bok = Math.round(Math.min(szerokosc, wysokosc) * 0.22);
			const margines = Math.round(Math.min(szerokosc, wysokosc) * 0.03);
			obraz = obraz.composite([
				{
					input: { create: { width: bok, height: bok, channels: 3, background: { r: 60, g: 60, b: 60 } } },
					left: szerokosc - bok - margines,
					top: wysokosc - bok - margines,
				},
			]);
		}
		gotowe.set(
			klucz,
			obraz
				.jpeg({ quality: 80 })
				.toBuffer()
				.then((tresc) => ({ tresc, etag: `"${createHash("md5").update(tresc).digest("hex")}"` }))
		);
	}
	return gotowe.get(klucz);
}

// Odpowiada jak R2: GET i HEAD, ETag (skrót MD5 treści — z niego galeria.ts robi wersję „?v=”),
// 404 dla nieznanego klucza. Dopiski po „?” (?v=…, ?sprawdz=…) pomija, tak jak R2.
const atrapaR2 = createServer(async (zapytanie, odpowiedz) => {
	const klucz = decodeURIComponent(new URL(zapytanie.url, "http://atrapa").pathname.slice(1));
	if (!pliki.has(klucz)) {
		console.error(`atrapa R2: nie ma pliku ${klucz} — nie wynika z tests/dane/galeria.json (404).`);
		odpowiedz.writeHead(404).end();
		return;
	}
	try {
		const { tresc, etag } = await zdjecieJpg(klucz);
		odpowiedz.writeHead(200, {
			"Content-Type": "image/jpeg",
			"Content-Length": tresc.length,
			ETag: etag,
			"Last-Modified": "Thu, 01 Oct 2026 00:00:00 GMT",
		});
		odpowiedz.end(zapytanie.method === "HEAD" ? undefined : tresc);
	} catch (blad) {
		console.error(`atrapa R2: nie udało się zrobić zdjęcia ${klucz}:`, blad);
		odpowiedz.writeHead(500).end();
	}
});

// --- Podmiana galeria.json na dane testowe (wtyczka Vite, tylko w tym buildzie) ---
// Kod strony importuje src/data/galeria.json (src/lib/galeria.ts, src/data/kategorie.ts) —
// tutaj każdy taki import dostaje tests/dane/galeria.json. Kod strony o tym nie wie.
let podmienione = 0;
const daneTestoweZamiastGalerii = {
	name: "dane-testowe-zamiast-galerii",
	enforce: "pre",
	async resolveId(zrodlo, importer, opcje) {
		if (!zrodlo.endsWith("galeria.json")) return null;
		const wynik = await this.resolve(zrodlo, importer, { ...opcje, skipSelf: true });
		if (!wynik || path.relative(GALERIA_PRAWDZIWA, wynik.id.split("?")[0]) !== "") return null;
		podmienione++;
		return GALERIA_TESTOWA;
	},
};

// --- Build ---
// Zmienne z process.env mają pierwszeństwo przed plikiem .env, więc prawdziwe wartości z .env
// do tego buildu nie trafiają.
process.env.PUBLIC_R2_URL = `http://127.0.0.1:${PORT_ATRAPY_R2}`;
process.env.PUBLIC_FORMSPREE_ID = "formularz-testowy";
process.env.PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"; // klucz testowy Cloudflare: widżet zawsze przechodzi
process.env.PUBLIC_CF_BEACON_TOKEN = "";

await new Promise((gotowy, blad) => {
	atrapaR2.once("error", (e) =>
		blad(
			e.code === "EADDRINUSE"
				? new Error(`Port ${PORT_ATRAPY_R2} (atrapa R2 dla buildu testowego) jest zajęty — zamknij program, który go używa, albo poprzedni build testowy.`)
				: e
		)
	);
	atrapaR2.listen(PORT_ATRAPY_R2, "127.0.0.1", gotowy);
});
console.log(`Build na danych testowych (${dane.length} zdjęć z tests/dane/galeria.json, atrapa R2 na porcie ${PORT_ATRAPY_R2}) → dist-testy/`);

// Czy gotowa strona ma podpięty arkusz CSS (patrz uwaga przy cacheDir niżej).
function stronaMaStyle() {
	return readFileSync(path.join(KORZEN, KATALOG_WYJSCIOWY, "index.html"), "utf8").includes('rel="stylesheet"');
}

// Ponowne uruchomienie skryptu (patrz niżej) ma tę zmienną ustawioną, żeby nie powtarzać w nieskończoność.
const TO_PONOWNY_BUILD = process.env.BUILD_TESTOWY_PONOWNIE === "1";

try {
	await build({
		root: KORZEN,
		outDir: KATALOG_WYJSCIOWY,
		// Własny cache tego buildu (zamiast node_modules/.astro, którego używają `check`, `build` i `dev`).
		// Astro trzyma tam cache optymalizatora Vite, a build z API, który trafi na cache zapisany przy
		// innej konfiguracji (np. po `npm run check` albo `npm run build` — a tu dochodzi wtyczka)
		// albo dopiero ten cache tworzy, wychodzi bez arkusza CSS w HTML: strona bez stylów i kilkadziesiąt
		// fałszywych błędów testów. Własny folder usuwa pierwszy przypadek, a ponowne uruchomienie
		// skryptu (niżej) — drugi.
		cacheDir: "./node_modules/.astro-testy",
		// Bez tego `build()` z API działa w trybie deweloperskim i też nie dopina arkuszy CSS do HTML.
		// `astro build` z terminala ustawia ten tryb sam.
		mode: "production",
		vite: { plugins: [daneTestoweZamiastGalerii] },
	});
} finally {
	// Czekamy, aż port atrapy R2 się zwolni — ponowne uruchomienie skryptu (niżej) zajmie go znowu.
	await new Promise((zamkniete) => {
		atrapaR2.close(zamkniete);
		atrapaR2.closeAllConnections();
	});
}

// Zabezpieczenie: bez podmiany strona powstałaby z prawdziwych danych, a testy by tego nie zauważyły.
if (podmienione === 0) {
	console.error("BŁĄD: build nie użył tests/dane/galeria.json — import galeria.json nie został podmieniony (wtyczka w scripts/build-testowy.mjs).");
	process.exit(1);
}

// Drugie zabezpieczenie: strona bez arkusza stylów (patrz uwaga przy cacheDir) przeszłaby build,
// a testy wysypałyby się dziesiątkami niezwiązanych błędów. Pierwszy build na świeżym cache
// (np. nowy checkout w CI) tak właśnie wychodzi, a drugi, w NOWYM procesie, już jest poprawny
// (ponowny build w tym samym procesie nie pomaga — sam zmienia cache). Dlatego raz uruchamiamy się jeszcze raz.
if (!stronaMaStyle()) {
	if (TO_PONOWNY_BUILD) {
		console.error("BŁĄD: strona testowa wyszła bez arkusza stylów nawet po ponownym buildzie (dist-testy/index.html nie ma <link rel=\"stylesheet\">). Usuń folder node_modules/.astro-testy i uruchom `npm run build:testy` jeszcze raz.");
		process.exit(1);
	}
	console.log("Pierwszy build wyszedł bez arkusza stylów (Astro dopiero tworzył cache) — buduję jeszcze raz, w nowym procesie.");
	const wynik = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
		stdio: "inherit",
		env: { ...process.env, BUILD_TESTOWY_PONOWNIE: "1" },
	});
	process.exit(wynik.status ?? 1);
}
