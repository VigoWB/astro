import { describe, expect, test } from "vitest";
import { linkiStopki, navLinks } from "../../src/data/nav";

// Linki w menu i stopce: adresy stron kończą się ukośnikiem (/galeria/, nie /galeria) —
// tak jak adresy, które buduje Astro i które są w sitemapie.
const wszystkie = [...navLinks, ...linkiStopki];

describe("nav.ts", () => {
	test.each(wszystkie)("$label ($href) zaczyna się i kończy ukośnikiem", ({ href }) => {
		expect(href).toMatch(/^\/([a-z0-9-]+\/)*$/);
	});

	test("żaden adres ani podpis się nie powtarza", () => {
		const adresy = wszystkie.map((link) => link.href);
		const podpisy = wszystkie.map((link) => link.label);
		expect(new Set(adresy).size).toBe(adresy.length);
		expect(new Set(podpisy).size).toBe(podpisy.length);
	});
});
