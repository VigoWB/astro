/**
 * Odmiana słowa „zdjęcie” przez liczebnik: 1 zdjęcie, 2–4 zdjęcia, 5–21 zdjęć, 22–24 zdjęcia…
 * Liczby 12–14 (a więc też 112–114) są wyjątkiem i mają „zdjęć”, tak samo jak zero.
 * Liczba ma być całkowita i nieujemna (ile zdjęć widać albo pasuje do filtra).
 */
export function odmienZdjecia(liczba: number): string {
	if (liczba === 1) return "zdjęcie";
	const ostatniaCyfra = liczba % 10;
	const ostatnieDwieCyfry = liczba % 100;
	const wyjatekNascie = ostatnieDwieCyfry >= 12 && ostatnieDwieCyfry <= 14;
	if (ostatniaCyfra >= 2 && ostatniaCyfra <= 4 && !wyjatekNascie) return "zdjęcia";
	return "zdjęć";
}
