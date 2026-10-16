import { describe, expect, it } from 'vitest';
import * as D from '../../src/content/data.ts';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import { loadV03, plain } from './v03.ts';

const v = loadV03();
const G = v.G;

describe('treść z 0.3 przeniesiona bez zmian', () => {
  const names = [
    'RES',
    'RL',
    'DOM',
    'TECH_DOMS',
    'SEASONS',
    'SEASON_DAYS',
    'CLS',
    'RESIDENTIAL',
    'FAC',
    'ERAS',
    'TECH',
    'ITEMS',
    'PATHS',
    'LAW_CD',
    'LAW',
    'ENDINGS',
    'POICAT',
    'FOODSHOP',
    'BOOKS',
    'NAMES',
    'SURN',
    'PROFS',
    'TRAITS',
    'TRAIT_PAIRS',
    'ADS',
    'LORE',
  ] as const;
  for (const n of names) {
    it(n, () => {
      expect(plain((D as Record<string, unknown>)[n])).toEqual(plain(G[n]));
    });
  }

  it('liczby i teksty: tyle samo technologii, uchwał, zawodów, cech i ogłoszeń', () => {
    expect(Object.keys(D.TECH)).toHaveLength(24);
    expect(Object.keys(D.LAW)).toHaveLength(20);
    expect(D.PROFS).toHaveLength(22);
    expect(Object.keys(D.TRAITS)).toHaveLength(11);
    expect(Object.keys(D.ENDINGS)).toHaveLength(6);
  });

  it('costText działa jak w 0.3', () => {
    for (const c of [{ zlom: 4, opal: 2 }, {}, { czesci: 0, leki: 2 }, { prad: 1.5 }]) {
      expect(D.costText(c)).toBe(G.costText(c));
    }
  });

  it('generator ludzi daje te same osoby co makeSpec z 0.3', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const S = { specs: [{ first: 'Marek' }, { first: 'Halina' }], nextId: 7 };
      const opts = seed % 3 === 0 ? { f: true } : seed % 3 === 1 ? { prof: G.PROFS[seed % 22], home: 4 } : {};
      const old = G.Sim.makeSpec(S, mulberry(seed), JSON.parse(JSON.stringify(opts)));
      let id = 7;
      const now = makePerson(
        mulberry(seed),
        new Set(['Marek', 'Halina']),
        () => id++,
        opts as Parameters<typeof makePerson>[3],
      );
      expect(plain(now)).toEqual(plain(old));
    }
  });
});
