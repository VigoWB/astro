// Link „Zapytaj o podobny retusz” w podglądzie zdjęcia: adres formularza z opisem zdjęcia
// i tekst, który strona kontaktu wpisuje do pola „Wiadomość”. Czyste funkcje, nic przy imporcie
// (testy: tests/jednostkowe/zapytanie.test.ts). Używają ich Galeria.astro (adres linku)
// i ContactForm.astro (tekst wiadomości).
//
// Parametr ?zdjecie= to tekst od obcej osoby: każdy może podać dowolny link. Dlatego wynik
// tekstZapytania() wolno wstawić do strony TYLKO przez textarea.value — nigdy przez innerHTML,
// insertAdjacentHTML, outerHTML, document.write, szablon HTML ani atrybut. Funkcje niczego tu
// nie „uciekają” (nie zamieniają < na &lt;) i nie muszą: ochroną jest sposób wstawienia.

// Najwięcej znaków opisu, które trafia do adresu i do wiadomości (dłuższy parametr jest ucinany).
export const MAKS_DLUGOSC_OPISU = 200;

// Opis w jednej linii, bez znaków sterujących, ucięty do MAKS_DLUGOSC_OPISU znaków.
// \s łapie też nowe linie i tabulatory, \p{Cc} pozostałe znaki sterujące (np. \u0000, \u007F),
// a \p{Cs} samotne połówki znaków (przy fladze u parę zastępczą, czyli np. emoji, regex widzi jako jeden znak),
// bo encodeURIComponent rzuca na nich błąd.
export function oczyscOpis(tekst: string | null | undefined): string {
	if (!tekst) return "";
	const wJednejLinii = tekst.replace(/[\s\p{Cc}\p{Cs}]+/gu, " ").trim();
	// Array.from liczy znaki Unicode, a nie jednostki UTF-16 — emoji i polskie znaki nie rozpadają się na pół.
	// Po cięciu na końcu może zostać spacja (cięcie wypadło tuż po niej), więc obcinamy brzegi jeszcze raz.
	return Array.from(wJednejLinii).slice(0, MAKS_DLUGOSC_OPISU).join("").trim();
}

// Adres strony kontaktu z opisem zdjęcia. Bez opisu: sam /kontakt/ (link zostaje, tylko bez parametru).
export function adresZapytania(opis: string): string {
	const czysty = oczyscOpis(opis);
	return czysty ? `/kontakt/?zdjecie=${encodeURIComponent(czysty)}` : "/kontakt/";
}

// Tekst do pola „Wiadomość” na podstawie parametru ?zdjecie= (null albo pusty parametr: nic nie wpisujemy).
// Dwie nowe linie na końcu: klient pisze dalej od nowego akapitu.
export function tekstZapytania(parametr: string | null): string {
	const opis = oczyscOpis(parametr);
	return opis ? `Interesuje mnie retusz podobny do: ${opis}\n\n` : "";
}
