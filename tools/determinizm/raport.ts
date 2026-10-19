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

/** Miejsca w kodzie ze stosu V8 (Error.stack w Node): „plik:linia:kolumna” albo „plik:linia:kolumna (funkcja)”, ścieżki
    względem korzenia repozytorium, bez ramek samego narzędzia (tools/determinizm/) i bez ramek spoza plików (Array.every).
    Node usuwa typy z plików .ts, zostawiając spacje, więc numery linii zgadzają się ze źródłem. Stos innego silnika
    (Safari, Firefox mają inny format) daje pustą listę. */
export function miejscaZeStosu(stos: string, korzen: string, ile = 3): string[] {
  const przedrostek = `${korzen.replace(/\/+$/, '')}/`;
  const wynik: string[] = [];
  for (const linia of stos.split('\n')) {
    const m = linia.match(/^\s*at (?:(.+?) \()?file:\/\/(.+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const [, funkcja, sciezka, wiersz, kolumna] = m;
    const wzgledna = sciezka.startsWith(przedrostek) ? sciezka.slice(przedrostek.length) : sciezka;
    if (wzgledna.startsWith('tools/determinizm/')) continue;
    wynik.push(`${wzgledna}:${wiersz}:${kolumna}${funkcja ? ` (${funkcja})` : ''}`);
    if (wynik.length >= ile) break;
  }
  return wynik;
}
