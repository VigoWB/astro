import { describe, expect, test } from "vitest";
import { formatujExif } from "../../src/lib/exif";

// Podpis z danych aparatu w lightboxie (src/lib/exif.ts), np. „ISO 100 • f/2.8 • 50mm • 1/200s”.

describe("formatujExif", () => {
	test.each([
		["undefined", undefined],
		["pusty obiekt", {}],
	])("%s → pusty tekst", (_nazwa, dane) => {
		expect(formatujExif(dane)).toBe("");
	});

	test("komplet danych", () => {
		expect(formatujExif({ iso: 100, przyslona: 2.8, ogniskowa: 50, czasNaswietlania: 0.005 })).toBe("ISO 100 • f/2.8 • 50mm • 1/200s");
	});

	test.each([
		[5.6000001, "f/5.6"],
		[4, "f/4"],
	])("przysłona %s → %s", (przyslona, oczekiwane) => {
		expect(formatujExif({ przyslona })).toBe(oczekiwane);
	});

	test("ogniskowa jest zaokrąglana do pełnych milimetrów", () => {
		expect(formatujExif({ ogniskowa: 35.4 })).toBe("35mm");
	});

	// Do 0,3 s ułamek (1/4s), od 0,3 s dziesiętnie (0.3s, 1.3s, 30s) — jak w aparacie i Lightroomie.
	test.each([
		[0.25, "1/4s"],
		[0.3, "0.3s"],
		[1.3, "1.3s"],
		[30, "30s"],
	])("czas naświetlania %s s → %s", (czasNaswietlania, oczekiwane) => {
		expect(formatujExif({ czasNaswietlania })).toBe(oczekiwane);
	});

	test("tylko część pól → bez pustych „•”", () => {
		expect(formatujExif({ iso: 400, ogniskowa: 85 })).toBe("ISO 400 • 85mm");
		expect(formatujExif({ iso: null, przyslona: 2, ogniskowa: null, czasNaswietlania: 0.01 })).toBe("f/2 • 1/100s");
	});
});
