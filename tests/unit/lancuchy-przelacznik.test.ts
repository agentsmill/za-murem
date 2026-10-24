/* Przełącznik łańcuchów kart (adres gry `?lancuchy=1`, `GovState.lancuchy`, `newGov(seed, mode, true)`): domyślnie łańcuchy i wątki
   sezonu są wyłączone i zarząd zachowuje się dokładnie jak z pustą listą łańcuchów (`podmienLancuchy([])`): żadnego wyboru wątków,
   żadnego losowania z ziarna, żadnego stanu `watki`; z przełącznikiem wątki są wybierane i kroki wypadają. Narrator, odstęp między
   kartami i czekanie gości w trybie zombie działają w obu ustawieniach. Flaga przechodzi zapis i wczytanie. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { podmienLancuchy } from '../../src/gov/watki.ts';
import { loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { at, run } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';

afterEach(() => podmienLancuchy(null));

/** liczba kroków łańcuchów, które wypadły (rozpoczęte), z `watki.krok` */
const krokow = (gov: ReturnType<typeof newGov>): number =>
  Object.values(gov.watki?.krok ?? {}).reduce((a, n) => a + n, 0);

describe('przełącznik łańcuchów: stan i zapis', () => {
  it('nowy zarząd domyślnie bez pola lancuchy, z przełącznikiem z polem; zapis je zachowuje', () => {
    expect('lancuchy' in newGov(1)).toBe(false);
    expect('lancuchy' in newGov(1, 'zombie')).toBe(false);
    expect(newGov(1, 'zwykly', true).lancuchy).toBe(true);
    expect(loadGov(saveGov(newGov(5, 'zombie', true))).lancuchy).toBe(true);
    expect(loadGov(saveGov(newGov(5, 'zombie'))).lancuchy).toBeUndefined();
  });
});

describe('przełącznik łańcuchów: atrapa, kilka dób', () => {
  it('bez przełącznika żaden łańcuch nie rusza w grze na kilka dób, a stan nie ma `watki`', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { gov } = run(seed, 'zawsze-warta', at(5, 0));
      expect(gov.watki, `ziarno ${seed}`).toBeUndefined();
      expect(krokow(gov)).toBe(0);
      expect(gov.lancuchy).toBeUndefined();
    }
  });

  it('bez przełącznika stan jest taki sam jak z pustą listą łańcuchów (z przełącznikiem), poza samą flagą', () => {
    for (const seed of [1, 3, 5]) {
      const bez = run(seed, 'zawsze-warta', at(4, 12)).gov;
      podmienLancuchy([]);
      const pusta = run(seed, 'zawsze-warta', at(4, 12), undefined, true).gov;
      podmienLancuchy(null);
      delete pusta.lancuchy;
      expect(JSON.stringify(bez), `ziarno ${seed}`).toBe(JSON.stringify(pusta));
    }
  });

  it('z przełącznikiem wątki sezonu są wybrane i kroki łańcuchów wypadają', () => {
    let wypadlo = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { gov } = run(seed, 'zawsze-warta', at(5, 0), undefined, true);
      expect(gov.lancuchy, `ziarno ${seed}`).toBe(true);
      expect(gov.watki?.wybrane.length, `ziarno ${seed}`).toBeGreaterThan(0);
      wypadlo += krokow(gov);
    }
    expect(wypadlo).toBeGreaterThan(0);
  });
});

describe('przełącznik łańcuchów: prawdziwa symulacja', () => {
  it('bez przełącznika gra z obcymi przez 5 dób nie rusza łańcucha, z przełącznikiem rusza', async () => {
    const demo = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    );
    let bez = 0;
    let z = 0;
    for (const seed of [11, 12, 13]) {
      const a = await swiatMieszkancow(demo, seed, 4);
      const r0 = playWithGov(a.world, seed, 'zawsze-warta', 5, 4, { mieszkancy: a.mieszkancy, obcy: true });
      expect(r0.gov.watki, `ziarno ${seed} bez`).toBeUndefined();
      bez += krokow(r0.gov);
      const b = await swiatMieszkancow(demo, seed, 4);
      const r1 = playWithGov(b.world, seed, 'zawsze-warta', 5, 4, {
        mieszkancy: b.mieszkancy,
        obcy: true,
        lancuchy: true,
      });
      expect(r1.gov.watki?.wybrane.length, `ziarno ${seed} z`).toBeGreaterThan(0);
      z += krokow(r1.gov);
    }
    expect(bez).toBe(0);
    expect(z).toBeGreaterThan(0);
  }, 120_000);
});
