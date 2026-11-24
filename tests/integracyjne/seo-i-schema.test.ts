import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, test } from "vitest";
import Schema from "../../src/components/Schema.astro";
import SEO from "../../src/components/SEO.astro";

// Komponenty z <head> renderowane w izolacji (Container API Astro), z adresem strony jak na produkcji.

async function wyrenderuj(komponent: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>, adres: string) {
	const kontener = await AstroContainer.create({ astroConfig: { site: "https://balansbieli.pl" } });
	return kontener.renderToString(komponent, { props, request: new Request(adres) });
}

function daneJsonLd(html: string): Record<string, unknown>[] {
	return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

describe("SEO.astro", () => {
	test("noindex tylko na stronie-szkicu (bezIndeksowania)", async () => {
		const szkic = await wyrenderuj(SEO, { title: "T", description: "O", bezIndeksowania: true }, "https://balansbieli.pl/oferta/");
		const zwykla = await wyrenderuj(SEO, { title: "T", description: "O" }, "https://balansbieli.pl/galeria/");
		expect(szkic).toMatch(/<meta name="robots" content="noindex"/);
		expect(zwykla).not.toContain("noindex");
	});

	test("adres kanoniczny i obrazek Open Graph to pełne adresy w domenie strony", async () => {
		const html = await wyrenderuj(SEO, { title: "T", description: "O" }, "https://balansbieli.pl/galeria/");
		expect(html).toContain('<link rel="canonical" href="https://balansbieli.pl/galeria/"');
		expect(html).toContain('content="https://balansbieli.pl/og-default.jpg"');
	});
});

describe("Schema.astro", () => {
	test("zdjęcia w ImageGallery mają autora i stronę licencji, ale bez pola license (decyzja 30.09)", async () => {
		const html = await wyrenderuj(
			Schema,
			{ zdjecia: [{ po: { src: "/_astro/zegarek.webp", width: 1920, height: 1280 }, opis: "Złoty zegarek" }] },
			"https://balansbieli.pl/galeria/"
		);
		const galeria = daneJsonLd(html).find((dane) => dane["@type"] === "ImageGallery") as { image: Record<string, unknown>[] };
		expect(galeria).toBeDefined();
		const [obraz] = galeria.image;
		expect(obraz).toMatchObject({
			"@type": "ImageObject",
			contentUrl: "https://balansbieli.pl/_astro/zegarek.webp",
			name: "Złoty zegarek",
			acquireLicensePage: "https://balansbieli.pl/kontakt/",
		});
		expect(obraz).toHaveProperty("creditText");
		expect(obraz).not.toHaveProperty("license");
	});

	test("tekst z \"</script>\" w opisie zdjęcia nie zamyka znacznika, a po JSON.parse zostaje bez zmian", async () => {
		const grozny = "</script><script>alert(1)</script>";
		const html = await wyrenderuj(
			Schema,
			{ zdjecia: [{ po: { src: "/_astro/zegarek.webp", width: 1920, height: 1280 }, opis: grozny }] },
			"https://balansbieli.pl/galeria/"
		);
		const otwarcia = html.match(/<script type="application\/ld\+json">/g) ?? [];
		const zamkniecia = html.match(/<\/script/gi) ?? [];
		// Każdy znacznik ma dokładnie jedno zamknięcie — to, które napisał komponent, a nie dane.
		expect(otwarcia).toHaveLength(4);
		expect(zamkniecia).toHaveLength(otwarcia.length);
		expect(html).not.toContain("<script>alert(1)");
		const galeria = daneJsonLd(html).find((dane) => dane["@type"] === "ImageGallery") as { image: Record<string, unknown>[] };
		expect(galeria.image[0].name).toBe(grozny);
	});

	test("bez zdjęć nie ma ImageGallery, a Person, firma i WebSite są zawsze", async () => {
		const html = await wyrenderuj(Schema, {}, "https://balansbieli.pl/");
		const typy = daneJsonLd(html).map((dane) => dane["@type"]);
		expect(typy).toEqual(["Person", "ProfessionalService", "WebSite"]);
	});
});
