/* Przełącznik łańcuchów kart (`GovState.lancuchy`, `newGov(seed, mode, true)`; gra w przeglądarce włącza go domyślnie, `?lancuchy=0`
   wyłącza, src/main.ts): bez flagi łańcuchy i wątki sezonu nie istnieją i zarząd zachowuje się dokładnie jak z pustą listą łańcuchów
   (`podmienLancuchy([])`): żadnego wyboru wątków, żadnego losowania z ziarna, żadnego stanu `watki`, a `h.watek` i `bezPowtorek` nic
   nie zmieniają w puli kart i gości, nawet gdy `watki.wybrane` ktoś wpisał ręcznie; z flagą wątki są wybierane i kroki wypadają.
   Narrator, odstęp między kartami i płoszenie gości w trybie zombie na zasięg ugryzienia działają w obu ustawieniach. Flaga przechodzi
   zapis i wczytanie. Gdzie indziej: zapis w środku łańcucha (po haku, z krokiem z gościem w drodze) odtwarza ten sam przebieg
   (watki-tresc-gra.test.ts), a tempo pierwszych minut gry jest sprawdzone dla obu ustawień (zarzad.test.ts na atrapie,
   gosc-zarzad.test.ts na prawdziwej symulacji: włączone to konfiguracja, w której gra wychodzi, wyłączone to stan sprzed łańcuchów). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lancuchyZAdresu, podmienLancuchy } from '../../src/gov/watki.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { Atrapa, at, run } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';

afterEach(() => podmienLancuchy(null));

/** liczba kroków łańcuchów, które wypadły (rozpoczęte), z `watki.krok` */
const krokow = (gov: ReturnType<typeof newGov>): number =>
  Object.values(gov.watki?.krok ?? {}).reduce((a, n) => a + n, 0);

describe('przełącznik łańcuchów: adres gry', () => {
  it('nowa gra ma łańcuchy bez parametru i z `?lancuchy=1`, wyłącza je tylko `?lancuchy=0`', () => {
    const adres = (q: string) => lancuchyZAdresu(new URLSearchParams(q));
    expect(adres('')).toBe(true);
    expect(adres('?demo=przymorze')).toBe(true);
    expect(adres('?lancuchy=1')).toBe(true);
    expect(adres('?lancuchy=0')).toBe(false);
    expect(adres('?demo=przymorze&lancuchy=0&speed=0')).toBe(false);
    // gra z adresu z łańcuchami ma pole w stanie i w zapisie; gra z `?lancuchy=0` nie ma go wcale (jak stary zapis)
    expect(newGov(1, 'zwykly', adres('')).lancuchy).toBe(true);
    expect(loadGov(saveGov(newGov(1, 'zwykly', adres('')))).lancuchy).toBe(true);
    expect('lancuchy' in newGov(1, 'zwykly', adres('?lancuchy=0'))).toBe(false);
  });
});

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

describe('przełącznik łańcuchów: karty z puli ustępują łańcuchom tylko przy włączonych łańcuchach', () => {
  /** `h.watek` i waga kart „Światło w oknie” (sygnal) i „Pies przy siatce” (pies) w zarządzie z trzema ręcznie wpisanymi wątkami */
  const waga = (lancuchy: boolean, wybrane: string[]) => {
    const gov = newGov(3, 'zwykly', lancuchy);
    gov.watki = { wybrane, haki: {}, krok: {} };
    const h = makeHost(gov, new Atrapa(3).input(), emptyEffects());
    const w = (id: string) => M1_EVENTS.find((e) => e.id === id)!.w(h);
    return { swiatlo: h.watek('swiatlo'), dach: h.watek('dach'), sygnal: w('sygnal'), pies: w('pies') };
  };

  it('bez flagi wpis w `watki` niczego nie zmienia: watek() fałszywe, karty sygnal i pies mają swoją wagę', () => {
    expect(waga(false, ['swiatlo', 'szczekanie', 'dach'])).toEqual({
      swiatlo: false,
      dach: false,
      sygnal: 0.8,
      pies: 0.7,
    });
    expect(waga(false, [])).toEqual({ swiatlo: false, dach: false, sygnal: 0.8, pies: 0.7 });
  });

  it('z flagą wybrany wątek odbiera wagę swojej karcie z puli: światło i dach zdejmują sygnal, szczekanie zdejmuje psa', () => {
    expect(waga(true, ['swiatlo', 'szczekanie'])).toEqual({ swiatlo: true, dach: false, sygnal: 0, pies: 0 });
    expect(waga(true, ['dach'])).toEqual({ swiatlo: false, dach: true, sygnal: 0, pies: 0.7 });
    expect(waga(true, ['list'])).toEqual({ swiatlo: false, dach: false, sygnal: 0.8, pies: 0.7 });
  });
});
