/* Wyprawa z pustymi rękami: bez nastroju „Wróciłem z łupem” i bez premii do zaufania (łup jest tekstem w obu
   językach, więc warunek patrzy na jego polską połowę, a nie na sam obiekt, który zawsze jest prawdą). */

import { describe, expect, it } from 'vitest';
import { TARGETS } from '../../src/gov/tresc.ts';
import type { GovEffects, GovState } from '../../src/gov/typy.ts';
import { confirmNight, govUpdate, newGov, pending, setNight, signLaw } from '../../src/gov/zarzad.ts';
import { Atrapa, at, TPH, TPS } from './gov-atrapa.ts';
import { pl } from './po-angielsku.ts';

/** przebieg bez odpowiadania na nic, aż pojawi się decyzja danego rodzaju; wszystkie skutki idą do moods */
function until(gov: GovState, atr: Atrapa, kind: string, seen: GovEffects['moods'], limit = at(3, 0)) {
  while ((atr.day - 1) * 1440 + atr.hour * 60 + atr.minute < limit) {
    atr.tick++;
    if (atr.tick % TPH === 0) atr.hourly(1);
    if (atr.tick % TPS !== 0) continue;
    const fx = govUpdate(gov, atr.input());
    seen.push(...fx.moods);
    atr.apply(fx);
    const p = pending(gov, atr.input());
    if (p?.k === kind) return p;
  }
  return null;
}

describe('wyprawa z pustymi rękami', () => {
  it('wraca bez łupu: wpis „z pustymi rękami”, bez nastroju z łupu', () => {
    const t = TARGETS.find((x) => x.id === 'mieszkania')!;
    const loot = t.loot;
    t.loot = {};
    try {
      const gov = newGov(2);
      const atr = new Atrapa(2);
      const moods: GovEffects['moods'] = [];
      until(gov, atr, 'uchwala', moods);
      atr.apply(signLaw(gov, atr.input(), null));
      const p = until(gov, atr, 'karta', moods);
      if (p?.k !== 'karta') throw new Error('brak karty');
      const [a, b] = p.card.people;
      for (const cp of p.card.people) setNight(gov, cp.id, 'sen');
      setNight(gov, a.id, 'warta:d1');
      expect(setNight(gov, b.id, 'wyprawa:blisko')).toBe(true);
      atr.apply(confirmNight(gov, atr.input()));
      moods.length = 0;
      expect(until(gov, atr, 'raport', moods)?.k).toBe('raport');
      const lines = gov.reports[0].lines;
      expect(lines.map(pl).some((l) => l.includes('z pustymi rękami'))).toBe(true);
      expect(lines.map((l) => l.en).some((l) => l.includes('empty-handed'))).toBe(true);
      expect(moods.filter((m) => /z łupem/.test(m.why))).toEqual([]);
    } finally {
      t.loot = loot;
    }
  });
});
