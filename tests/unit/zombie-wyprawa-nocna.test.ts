/* Propozycja karty nocy a wyprawa w trybie zombie (docs/POSTEP.md, „Wolniejsze zmęczenie (D)”). Wyprawa daleka wymaga
   sił (canGo: 40), a po dniu na nogach dawnym tempem (−5 na godzinę) o 21:00 miał je co siódmy z zarządu, więc po
   pierwszej nocy propozycja posyłała kogoś rzadko (bez warty prawie nigdy). Wolniejsze zmęczenie (−3,5) zostawia ponad
   40 sił ponad połowie zarządu i zarząd co noc proponował wyprawę, która wraca o 5:00 w stado pod siatką: w pomiarze
   botem 0,47 zakażenia z wypraw na bieg bez warty (dawniej 0,09) i o 1,1 zgonu więcej. Po pierwszej nocy, gdy stado ma
   kilkanaście głów, w trybie zombie zarząd wyprawy nie proponuje (karta nadal ją oferuje, z ryzykiem przy opcji),
   a w zwykłym trybie i pierwszej nocy wszystko jak dotąd. */

import { describe, expect, it } from 'vitest';
import { makeCard } from '../../src/gov/noc.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { Atrapa, TPH } from './gov-atrapa.ts';

const HORDE = { near: 3, pressing: 1, killed: 0, breaches: 0, bites: 0, tonight: 14 };

/** karta o 20:00 danego dnia, wszyscy wypoczęci i zdrowi, jedzenia i drewna brak (propozycja szuka zapasów) */
function karta(tryb: 'zombie' | 'zwykly', dzien: number) {
  const atr = new Atrapa(5);
  atr.tick = ((dzien - 1) * 24 + 5) * TPH;
  atr.supplies = 0;
  atr.woodSklad = 0;
  atr.woodLoose = 0;
  for (const p of atr.people) Object.assign(p.needs, { rest: 90, health: 100 });
  const i = { ...atr.input(), ...(tryb === 'zombie' ? { horde: HORDE } : {}) };
  expect([i.day, i.hour]).toEqual([dzien, 20]);
  return makeCard(newGov(5, tryb), i);
}

const wyprawy = (assign: Record<string, string>) => Object.values(assign).filter((k) => k.startsWith('wyprawa:'));

describe('propozycja karty nocy: wyprawa', () => {
  it('tryb zombie, druga noc: brak jedzenia i drewna, wszyscy wypoczęci, a zarząd nikogo nie wysyła', () => {
    const { card, assign } = karta('zombie', 2);
    expect(wyprawy(assign)).toEqual([]);
    // karta wyprawę dalej oferuje, z ryzykiem: gracz może ją wybrać sam
    const daleka = card.people.flatMap((p) => p.options).filter((o) => o.key === 'wyprawa:daleko');
    expect(daleka.some((o) => o.ok && (o.risk ?? 0) > 0.3)).toBe(true);
  });

  it('tryb zombie, kolejne noce też bez wyprawy w propozycji', () => {
    for (const dzien of [3, 5]) expect(wyprawy(karta('zombie', dzien).assign), `noc ${dzien}`).toEqual([]);
  });

  it('tryb zombie, pierwsza noc: wyprawa blisko jak dotąd (stado ma osiem głów)', () => {
    expect(wyprawy(karta('zombie', 1).assign)).toEqual(['wyprawa:blisko']);
  });

  it('zwykły tryb, druga noc: wyprawa daleko jak dotąd', () => {
    expect(wyprawy(karta('zwykly', 2).assign)).toEqual(['wyprawa:daleko']);
  });
});
