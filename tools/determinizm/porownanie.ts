/* Porównanie skrótów stanu gry z różnych silników (czysta funkcja, bez node:* i DOM). Każdy silnik daje tablicę
   skrótów, po jednym na każdą pełną godzinę gry (przebieg.ts); silniki są zgodne, gdy tablice są takie same.
   `godzina` w wyniku to indeks skrótu: 0 to skrót po pierwszej pełnej godzinie gry, więc pierwsza zgodna godzina
   przed rozbieżnością ma indeks `godzina - 1`, a rozbieżność leży w kroku od `godzina * 800` do `(godzina + 1) * 800`. */

/** skrót, którego silnik nie podał (jego tablica jest krótsza niż u innych) */
export const BRAK_SKROTU = '(brak)';

export interface Porownanie {
  zgodne: boolean;
  /** pierwsza godzina, w której nie wszystkie silniki mają ten sam skrót, ze skrótem każdego silnika */
  pierwsza: { godzina: number; silniki: Record<string, string> } | null;
}

export function porownaj(wyniki: Record<string, string[]>): Porownanie {
  const nazwy = Object.keys(wyniki);
  const dlugosc = Math.max(0, ...nazwy.map((n) => wyniki[n].length));
  for (let g = 0; g < dlugosc; g++) {
    const silniki: Record<string, string> = {};
    for (const n of nazwy) silniki[n] = wyniki[n][g] ?? BRAK_SKROTU;
    if (new Set(Object.values(silniki)).size > 1) return { zgodne: false, pierwsza: { godzina: g, silniki } };
  }
  return { zgodne: true, pierwsza: null };
}
