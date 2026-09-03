/// <reference types="astro/client" />

interface ImportMetaEnv {
	/** ID formularza z Formspree (https://formspree.io/forms) — bez pełnego URL-a, sam identyfikator. */
	readonly PUBLIC_FORMSPREE_ID: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}