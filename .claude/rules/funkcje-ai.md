---
paths:
  - "src/**"
---

# Funkcje oparte o AI (Fluent 2 RAI) — portfolio fotograficzne (balansbieli.pl)

Dawna sekcja 12 `AGENTS.md` („Tylko jeśli dodajesz do strony funkcję opartą o AI (zasady Fluent 2 RAI)”). Claude Code wczytuje ten plik sam, gdy czyta albo zmienia plik w `src/`, a OpenCode — na starcie każdej sesji (`instructions` w `opencode.json`). Zakazy z sekcji 2 i pułapki z sekcji 11 `AGENTS.md` obowiązują niezależnie od niego.

Dziś strona nie ma takich funkcji. Jeśli się pojawią, stosuj od razu, także w prototypie:
1. **Transparentność:** każde miejsce działania AI ma widoczne oznaczenie (badge, ikona, etykieta).
2. **Ton:** bez antropomorfizacji. Piszesz „Wygenerowano podsumowanie”, a nie „Cieszę się, że mogę pomóc”.
3. **Oczekiwania:** przy wejściu do funkcji krótko wyjaśnij, co robi, z jakich danych korzysta i jakie ma ograniczenia.
4. **Bez nadmiernego zaufania:** dodaj dopisek „może zawierać błędy, zweryfikuj” i pokaż źródła.
5. **Kontrola:** przyciski mówią konkretnie, co się stanie („Usuń plik X”). Akcje nieodwracalne wymagają potwierdzenia przed wykonaniem.
6. **Feedback:** daj możliwość zgłoszenia błędnego, nieprzydatnego albo stronniczego wyniku, a nie tylko kciuk w górę/w dół.
