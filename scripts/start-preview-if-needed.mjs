#!/usr/bin/env node

// Uruchamia serwer podglądu (astro preview) na porcie 4322, jeśli jeszcze nie
// działa, i kończy się dopiero gdy port faktycznie odpowiada. Używane przez
// Playwright (webServer.command w playwright.config.ts) — w przeciwieństwie
// do bashowego odpowiednika działa tak samo na Windows, Linux i macOS
// (Playwright uruchamia ten skrypt przez `node`, więc końcówki linii CRLF
// zapisane przez git na Windowsie nie mają tu znaczenia).
//
// `astro preview` samo w sobie odpala się jako proces w tle i od razu kończy
// polecenie z poziomu terminala (nawet bez flagi --background) — a Playwright
// sam, równolegle, sprawdza czy adres odpowiada; jeśli TEN proces (ten, który
// Playwright uruchomił jako webServer.command) zdąży się zakończyć zanim
// Playwright zdąży to zauważyć — nawet kodem 0, nawet po potwierdzonej
// gotowości — Playwright i tak zgłasza błąd "exited early" (tak działa jego
// wewnętrzny Promise.race, sprawdzone w node_modules/playwright/lib/runner).
// Dlatego ten skrypt, po wystartowaniu serwera, NIE kończy się sam — czeka
// bezczynnie, aż Playwright go zatrzyma po zakończeniu testów.

import { spawn } from "node:child_process";

const PORT = 4322;
const URL = `http://localhost:${PORT}/`;
const MAKS_PROB = 30;

async function czyGotowy() {
	try {
		const odpowiedz = await fetch(URL);
		return odpowiedz.status >= 200 && odpowiedz.status < 400;
	} catch {
		return false;
	}
}

async function main() {
	if (!(await czyGotowy())) {
		console.log(`Uruchamiam serwer podglądu na ${URL}...`);
		// Polecenie jako jeden napis (a nie "npm" + lista argumentów): Node 24 przy
		// `shell: true` z osobną listą argumentów wypisuje ostrzeżenie DEP0190.
		spawn("npm run preview", {
			stdio: "inherit",
			shell: true,
		});

		let gotowy = false;
		for (let i = 0; i < MAKS_PROB; i++) {
			await new Promise((zakoncz) => setTimeout(zakoncz, 1000));
			if (await czyGotowy()) {
				gotowy = true;
				break;
			}
		}
		if (!gotowy) {
			console.error(`BŁĄD: serwer podglądu nie wystartował w ${MAKS_PROB} sekund.`);
			process.exit(1);
		}
	}

	console.log(`Serwer podglądu gotowy na ${URL}.`);
	// Zostajemy aktywni — patrz komentarz na górze pliku.
	await new Promise(() => {});
}

main();