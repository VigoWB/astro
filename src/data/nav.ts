export const navLinks = [
	{ href: "/", label: "Strona główna" },
	{ href: "/galeria/", label: "Galeria" },
	{ href: "/o-mnie/", label: "O mnie" },
	{ href: "/kontakt/", label: "Kontakt" },
] as const;

// Linki tylko w stopce (za linkami z menu) — nie ma ich w nagłówku, żeby menu zostało krótkie.
export const linkiStopki = [{ href: "/faq/", label: "Najczęstsze pytania" }] as const;
