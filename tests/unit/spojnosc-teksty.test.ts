/* Teksty i logika po przeglądzie spójności przed wydaniem (raport: scratchpad spojnosc/gra-raport.md, punkty M1–M18): koniec
   gry w kronice mówi tytułem zakończenia w obu językach (M1), temperatury poniżej zera mają prawdziwy minus (M2), skąd bierze
   się materiał brzmi po polsku jak zdanie (M3), karty gości mają zgodne zaimki i liczbę osób (M5, M6), kradzież mówi o porcjach
   (M7), cudzysłowy w nazwach z OSM są polskie (M8), postać z łańcucha nie dzieli pełnego imienia z gościem (M17), kobieta
   „już tu bywała” (M18), „Ślady przy siatce” nie proponują łatania „przed nocą” po karcie nocy (M11), karta miejsca na
   mapie miasta ma jedną linię stanu (M13). Zdania zarządu są w stanie w obu językach, więc testy czytają `.pl` i `.en`. */

import { describe, expect, it } from 'vitest';
import { placeOf } from '../../src/gov/miejsce.ts';
import { makeCard } from '../../src/gov/noc.ts';
import type { GovInput } from '../../src/gov/typy.ts';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { reportSheet } from '../../src/ui/okna.ts';
import { Atrapa, at, run } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';

describe('M1: koniec gry w kronice mówi tytułem zakończenia, nie identyfikatorem', () => {
  /** wejście, przy którym `checkOver` kończy grę z danego powodu */
  function koniec(powod: 'odwolanie' | 'exodus' | 'pustka', place?: GovInput['place']) {
    const gov = newGov(3);
    const atr = new Atrapa(3);
    if (powod === 'odwolanie') gov.anger = 100;
    if (powod === 'exodus') gov.trust = 0;
    if (powod === 'pustka') atr.people = [];
    govUpdate(gov, { ...atr.input(), ...(place ? { place } : {}) });
    expect(gov.over).toBe(powod);
    return gov.log.at(-1)!.txt;
  }

  it('w bloku: po polsku i po angielsku tytuł z małej litery', () => {
    expect(koniec('odwolanie')).toEqual({
      pl: 'Koniec gry: walne odwołało zarząd.',
      en: 'Game over: the general meeting recalled the board.',
    });
    expect(koniec('exodus')).toEqual({
      pl: 'Koniec gry: osiedle opustoszało.',
      en: 'Game over: the estate emptied out.',
    });
    expect(koniec('pustka')).toEqual({ pl: 'Koniec gry: nikt nie przeżył.', en: 'Game over: nobody survived.' });
  });

  it('w domu (Zielonki): tytuły zakończeń domu w obu językach', () => {
    const dom = placeOf(demoWorld('zielonki').w);
    expect(koniec('odwolanie', dom)).toEqual({
      pl: 'Koniec gry: zebranie ulicy odwołało komitet.',
      en: 'Game over: the street meeting recalled the committee.',
    });
    expect(koniec('exodus', dom)).toEqual({
      pl: 'Koniec gry: ulica opustoszała.',
      en: 'Game over: the street emptied out.',
    });
    expect(koniec('pustka', dom).pl).toBe('Koniec gry: nikt nie przeżył.');
  });

  it('żaden powód nie zostaje surowym identyfikatorem (bez „odwolanie”, „exodus”, „pustka”)', () => {
    for (const powod of ['odwolanie', 'exodus', 'pustka'] as const)
      expect(koniec(powod).pl, powod).not.toMatch(/odwolanie|exodus|pustka/);
  });
});

describe('M2: temperatury poniżej zera z prawdziwym minusem', () => {
  /** Atrapa z mrozem w kuchni: ogień gaśnie, więc rano w kuchni jest zimno poniżej zera */
  class Mroz extends Atrapa {
    override input(): GovInput {
      return { ...super.input(), kitchen: this.fire > 0 ? 18 : -1.4, outdoor: -7 };
    }
  }

  it('rano w kuchni: raport (zdanie i kafelek) pisze „−1°C”, nigdy „-1°C”, po polsku i po angielsku', () => {
    const { gov } = run(5, 'zawsze-warta', at(3, 7), { gov: newGov(5), atr: new Mroz(5) });
    const raport = gov.reports.at(-1)!;
    const kuchnia = raport.lines.find((l) => l.pl.includes('Rano w kuchni'));
    expect(kuchnia?.pl).toMatch(/Rano w kuchni zimno, −1°C\./);
    expect(kuchnia?.en).toMatch(/The kitchen is cold this morning, −1°C\./);
    // kafelek „Kuchnia rano” w oknie raportu
    expect(reportSheet(raport).body).toContain('−1°C');
    for (const t of [kuchnia!.pl, kuchnia!.en, reportSheet(raport).body]) expect(t).not.toMatch(/(^|[\s>])-\d+°C/);
  });

  it('rada na karcie nocy o zimnej kuchni: „−2°C”', () => {
    const atr = new Mroz(5);
    atr.woodSklad = 12;
    const i: GovInput = { ...atr.input(), day: 2, hour: 20, minute: 0, kitchen: -2.4, kozaLit: false };
    const { card } = makeCard(newGov(5), i);
    expect(card.advice.pl).toContain('w kuchni −2°C.');
    expect(card.advice.en).toContain('the kitchen is at −2°C.');
    expect(card.advice.pl + card.advice.en).not.toMatch(/-\d+°C/);
  });

  it('zero i ułamek pod zerem nie dają „−0”: kuchnia −0,4°C to „0°C”', () => {
    const atr = new Mroz(5);
    atr.woodSklad = 12;
    const i: GovInput = { ...atr.input(), day: 2, hour: 20, minute: 0, kitchen: -0.4, kozaLit: false };
    const { card } = makeCard(newGov(5), i);
    expect(card.advice.pl).toContain('w kuchni 0°C.');
    expect(card.advice.pl).not.toContain('−0');
  });
});
