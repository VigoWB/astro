import { describe, expect, test } from "vitest";
import { odmienZdjecia } from "../../src/lib/odmiana";

// Odmiana słowa „zdjęcie” w komunikatach galerii dla czytnika ekranu (src/lib/odmiana.ts).

describe("odmienZdjecia", () => {
	test.each([
		[0, "zdjęć"],
		[1, "zdjęcie"],
		[2, "zdjęcia"],
		[4, "zdjęcia"],
		[5, "zdjęć"],
		[11, "zdjęć"],
		[12, "zdjęć"],
		[14, "zdjęć"],
		[21, "zdjęć"],
		[22, "zdjęcia"],
		[25, "zdjęć"],
		[112, "zdjęć"],
		[122, "zdjęcia"],
	])("%i → %s", (liczba, oczekiwane) => {
		expect(odmienZdjecia(liczba)).toBe(oczekiwane);
	});
});
