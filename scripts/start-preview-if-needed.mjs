#!/usr/bin/env node

// Uruchamia serwer podglądu (astro preview) na porcie 4322, jeśli jeszcze nie
// działa, i kończy czekanie dopiero gdy port faktycznie odpowiada. Używane przez
// Playwright (webServer.command w playwright.config.ts) — w przeciwieństwie
// do bashowego odpowiednika działa tak samo na Windows, Linux i macOS
// (Playwright uruchamia ten skrypt przez `node`, więc końcówki linii CRLF
// zapisane przez git na Windowsie nie mają tu znaczenia).
//
// Po wystartowaniu serwera ten skrypt NIE kończy się sam — czeka bezczynnie, aż
// Playwright zatrzyma go po testach (razem z całym drzewem procesów, więc i z
// serwerem podglądu). Powód: jeśli proces z webServer.command zakończy się przed
// końcem testów — nawet kodem 0, nawet po potwierdzonej gotowości — Playwright
// zgłasza błąd "exited early" (tak działa jego wewnętrzny Promise.race, sprawdzone
// w node_modules/playwright/lib/runner).
//
// Uwaga: `astro preview` w Astro 7 sam przechodzi w tło i od razu kończy polecenie,
// gdy dostanie flagę --background albo gdy wykryje, że uruchamia go agent AI
// (np. OpenCode). Taki serwer zostaje po testach w tle — zatrzymasz go poleceniem
// `npx astro preview stop`. W zwykłym terminalu działa normalnie, jako proces
// potomny tego skryptu.

import { spawn, spawnSync } from "node:child_process";

const PORT = 4322;
const URL = `http://localhost:${PORT}/`;
const MAKS_PROB = 30;

async function czyGotowy() {
	try {
		// Limit czasu: program, który przyjmie połączenie i nie odpowie, nie zawiesi skryptu.
		const odpowiedz = await fetch(URL, { signal: AbortSignal.timeout(2000) });
		return odpowiedz.status >= 200 && odpowiedz.status < 400;
	} catch {
		return false;
	}
}

// Zatrzymuje uruchomione `npm run preview` razem z procesami potomnymi (powłoka → npm → astro).
// Samo kill() zamknęłoby tylko powłokę, a serwer podglądu zostałby jako sierota (na Windowsie
// do zamknięcia ręcznie w Menedżerze zadań). Playwright sprząta procesy tylko wtedy, gdy ten
// skrypt jeszcze działa — po wcześniejszym zakończeniu z błędem musimy posprzątać sami.
function zatrzymaj(proces) {
	if (proces.exitCode !== null || proces.signalCode !== null) return;
	if (process.platform === "win32") {
		// /T = razem z procesami potomnymi
		spawnSync("taskkill", ["/pid", String(proces.pid), "/T", "/F"], { stdio: "ignore" });
		return;
	}
	// Linux/macOS: drzewo potomków odczytujemy z listy procesów (ps) i zatrzymujemy całe.
	const lista = spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).stdout ?? "";
	const dzieci = new Map();
	for (const linia of lista.trim().split("\n")) {
		const [pid, rodzic] = linia.trim().split(/\s+/).map(Number);
		dzieci.set(rodzic, [...(dzieci.get(rodzic) ?? []), pid]);
	}
	const drzewo = [proces.pid];
	for (let i = 0; i < drzewo.length; i++) {
		drzewo.push(...(dzieci.get(drzewo[i]) ?? []));
	}
	for (const pid of drzewo) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// proces już się zakończył
		}
	}
}

async function main() {
	if (!(await czyGotowy())) {
		console.log(`Uruchamiam serwer podglądu na ${URL}...`);
		// Polecenie jako jeden napis (a nie "npm" + lista argumentów): Node 24 przy
		// `shell: true` z osobną listą argumentów wypisuje ostrzeżenie DEP0190.
		const podglad = spawn("npm run preview", {
			stdio: "inherit",
			shell: true,
		});

		// `npm run preview` zakończone błędem (np. Astro: "Another astro preview server is
		// already running") — nie ma na co czekać. Kod 0 jest w porządku: tak kończy się
		// polecenie, gdy Astro przenosi serwer w tło.
		let kodBledu = null;
		podglad.on("exit", (kod) => {
			if (kod) kodBledu = kod;
		});

		let gotowy = false;
		for (let i = 0; i < MAKS_PROB && kodBledu === null; i++) {
			await new Promise((zakoncz) => setTimeout(zakoncz, 1000));
			gotowy = await czyGotowy();
			if (gotowy) break;
		}
		if (!gotowy) {
			console.error(
				kodBledu !== null
					? `BŁĄD: "npm run preview" zakończyło się błędem (kod ${kodBledu}) — szczegóły wyżej.`
					: `BŁĄD: serwer podglądu nie odpowiedział na ${URL} po ${MAKS_PROB} próbach (czy port ${PORT} nie jest zajęty przez inny program?).`
			);
			zatrzymaj(podglad);
			process.exit(1);
		}
	}

	console.log(`Serwer podglądu gotowy na ${URL}.`);
	// Zostajemy aktywni — patrz komentarz na górze pliku. Sama obietnica, która
	// nigdy się nie kończy, nie trzyma Node'a przy życiu (pusta pętla zdarzeń =
	// koniec procesu), dlatego trzyma go zegar, który tyka w nieskończoność.
	setInterval(() => {}, 60 * 60 * 1000);
}

main();
