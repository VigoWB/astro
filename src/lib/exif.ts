// Podpis z danych aparatu do lightboxa. Używa go Karta.astro; typ tylko jako typ,
// żeby moduł dało się testować bez astro:assets i galeria.json (tests/jednostkowe/exif.test.ts).
import type { ExifZdjecia } from "./galeria.ts";

// Krótki podpis z danych aparatu, np. "ISO 100 • f/2.8 • 50mm • 1/200s".
// Składamy go już podczas budowania strony — lightbox dostaje gotowy tekst.
export function formatujExif(dane: Partial<ExifZdjecia> | undefined): string {
	if (!dane) return "";
	const czesci: string[] = [];
	if (dane.iso) czesci.push(`ISO ${dane.iso}`);
	if (dane.przyslona) czesci.push(`f/${Number(dane.przyslona.toFixed(1))}`);
	if (dane.ogniskowa) czesci.push(`${Math.round(dane.ogniskowa)}mm`);
	if (dane.czasNaswietlania) {
		const t = dane.czasNaswietlania;
		// Od 0,3 s dziesiętnie (0.4s, 0.8s, 1.3s), jak w aparacie i Lightroomie.
		czesci.push(t < 0.3 ? `1/${Math.round(1 / t)}s` : `${Number(t.toFixed(1))}s`);
	}
	return czesci.join(" • ");
}
