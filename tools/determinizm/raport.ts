/* Wynik bramki determinizmu w kodzie wyjścia (czysta funkcja, bez node:* i DOM). Kontrakt z docs/superpowers/specs/
   2026-10-19-mmo-design.md, „Bramka etapu 0”: 0 przy zgodzie wszystkich silników docelowych, 1 przy rozbieżności,
   2 przy braku silnika docelowego. Rozbieżność jest ważniejsza niż brak: kod 2 nie może jej przykryć. */

export interface StanBramki {
  /** jakiś silnik rozjechał się z innym w którymś scenariuszu albo z samym sobą między przebiegami */
  rozbiezne: boolean;
  /** silniki docelowe, których nie dało się uruchomić (Firefox, WebKit, Node 24 bez pobrania) */
  brakujaceDocelowe: readonly string[];
}

export function kodWyjscia(s: StanBramki): 0 | 1 | 2 {
  if (s.rozbiezne) return 1;
  return s.brakujaceDocelowe.length ? 2 : 0;
}
