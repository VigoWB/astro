/// <reference types="astro/client" />

interface ImportMetaEnv {
	/** ID formularza z Formspree (https://formspree.io/forms) — bez pełnego URL-a, sam identyfikator. */
	readonly PUBLIC_FORMSPREE_ID: string;
	/** Publiczny adres bucketa R2 ze zdjęciami, bez ukośnika na końcu (np. https://pub-xxxx.r2.dev). Po założeniu własnej subdomeny wystarczy podmienić tę zmienną. */
	readonly PUBLIC_R2_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
