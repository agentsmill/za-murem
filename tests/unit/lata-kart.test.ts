/* Karty, które łatają dziurę za złom, biorą go tyle, ile łata z menu (docs/superpowers/plans/2026-10-19-sciezka-celow.md,
   zadanie 14; usterka U13 w docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): trzy sztuki, nie dwie (`PATCH_COST`
   w src/sim/sim.ts, `PATCH_SCRAP` w src/gov/tresc.ts; zgodność liczb pilnuje tests/unit/zarzad.test.ts). Cztery karty z jednego
   wyboru `lataDziury` (tresc.ts): „Ślady przy siatce” (`slady` w zwykłym trybie, `slady_z` w zombie), „Kury sąsiadów” (`kury`,
   ulica.ts, dom) i krok 2 łańcucha „Szczekanie” (`szczekanie_2`, watki-tresc.ts, oba tryby). Na każdej, w obu językach: podpis
   z „(Złom 3)” / “(Scrap 3)”, wybór wyłączony przy zero, jednej i dwóch sztukach złomu, a włączony od trzech, wydatek dokładnie
   trzech sztuk, jedna załatana dziura i wpis w kronice; wpisy „Ślad” i „Szczekania” mówią „złomem i drutem” (nie „deskami”: karta
   bierze złom), a krok łańcucha zostawia hak `szczekanie.slady` i łata tylko wtedy, gdy jest dziura. */

import { describe, expect, it } from 'vitest';
import { type Tx, tx } from '../../src/core/jezyk.ts';
import { placeOf } from '../../src/gov/miejsce.ts';
import { PATCH_SCRAP } from '../../src/gov/tresc.ts';
import type { GovInput, GovPlace } from '../../src/gov/typy.ts';
import { eventView } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';

type Tryb = 'zwykly' | 'zombie';

interface Karta {
  id: string;
  /** tryby, w których karta może się otworzyć */
  tryby: readonly Tryb[];
  /** dane otwartej karty */
  d: unknown;
  /** karta ulicy domów: wejście z miejscem „dom” (Zielonki) */
  dom?: boolean;
  /** numer wyboru, który łata dziurę */
  lata: number;
  /** podpis łaty przed 20:00 */
  podpis: Tx;
  /** podpis łaty od 20:00, gdy inny (tylko „Ślady przy siatce”) */
  podpisPoNocy?: Tx;
  /** wpis w kronice po łacie */
  wpis: Tx;
  /** podpisy pozostałych wyborów (po polsku), w kolejności z karty */
  inne: readonly string[];
}

const KARTY: readonly Karta[] = [
  {
    id: 'slady',
    tryby: ['zwykly'],
    d: { where: tx('przy garażach', 'by the garages') },
    lata: 0,
    podpis: tx('Załatać przed nocą (Złom 3)', 'Patch it up before dark (Scrap 3)'),
    podpisPoNocy: tx('Załatać teraz (Złom 3)', 'Patch it up now (Scrap 3)'),
    wpis: tx('Dziura załatana złomem i drutem.', 'The hole is patched up with scrap and wire.'),
    inne: ['Powiesić puszki z kamykami', 'Udawać, że nic nie widać'],
  },
  {
    id: 'slady_z',
    tryby: ['zombie'],
    d: { where: tx('przy garażach', 'by the garages') },
    lata: 0,
    podpis: tx('Załatać przed nocą (Złom 3)', 'Patch it up before dark (Scrap 3)'),
    podpisPoNocy: tx('Załatać teraz (Złom 3)', 'Patch it up now (Scrap 3)'),
    wpis: tx('Dziura załatana złomem i drutem.', 'The hole is patched up with scrap and wire.'),
    inne: ['Postawić tam kogoś z dzidą na noc'],
  },
  {
    id: 'kury',
    tryby: ['zwykly'],
    d: {},
    dom: true,
    lata: 2,
    podpis: tx('Załatać dziurę (Złom 3)', 'Patch the hole (Scrap 3)'),
    wpis: tx(
      'Dziura załatana. Kury muszą szukać innej drogi.',
      'Hole patched. The hens will have to find another way.',
    ),
    inne: ['Odnieść kury i jajko', 'Zatrzymać jajko'],
  },
  {
    id: 'szczekanie_2',
    tryby: ['zwykly', 'zombie'],
    d: { jak: 'nic' },
    lata: 1,
    podpis: tx('Załatać dziurę (Złom 3)', 'Patch the hole (Scrap 3)'),
    wpis: tx(
      'Dziura załatana złomem i drutem. Cokolwiek tu chodzi, musi wejść inną drogą.',
      'The hole is patched with scrap and wire. Whatever has been coming through will need another way in.',
    ),
    inne: ['Podłożyć resztki pod siatką (Jedzenie 1)', 'Nie ruszać'],
  },
];

const dom: GovPlace = placeOf(demoWorld('zielonki').w);

/** zarząd z otwartą kartą (aktywną wprost, jak w wydarzenia-tryby.test.ts) i wejście z podaną liczbą sztuk złomu o godzinie */
function okno(k: Karta, tryb: Tryb, scrap: number, hour = 16, minute = 0, dziury = true) {
  const gov = newGov(3, tryb);
  const atr = new Atrapa(3);
  atr.scrap = scrap;
  if (!dziury) atr.fence = { ...atr.fence, holes: [] };
  const i: GovInput = { ...atr.input(), day: 3, hour, minute, ...(k.dom ? { place: dom } : {}) };
  gov.ev.active = { id: k.id, d: k.d };
  return { gov, i };
}

describe('karty łatające dziurę za złom: 3 sztuki jak w menu', () => {
  it('stała kart to trzy sztuki', () => {
    expect(PATCH_SCRAP).toBe(3);
  });

  for (const k of KARTY)
    for (const tryb of k.tryby) {
      describe(`${k.id} (tryb ${tryb})`, () => {
        it('podpis łaty mówi o trzech sztukach złomu po polsku i po angielsku, przed nocą i po karcie nocy', () => {
          for (const [h, m] of [
            [15, 0],
            [19, 59],
          ]) {
            const { gov, i } = okno(k, tryb, 10, h, m);
            expect(eventView(gov, i)!.choices[k.lata].label, `${h}:${m}`).toEqual(k.podpis);
          }
          for (const [h, m] of [
            [20, 0],
            [21, 30],
          ]) {
            const { gov, i } = okno(k, tryb, 10, h, m);
            expect(eventView(gov, i)!.choices[k.lata].label, `${h}:${m}`).toEqual(k.podpisPoNocy ?? k.podpis);
          }
        });

        it('podpis nie ma starego kosztu ani polskich słów po angielsku', () => {
          const { gov, i } = okno(k, tryb, 10);
          const l = eventView(gov, i)!.choices[k.lata].label;
          expect(l.pl).not.toMatch(/Złom 2/);
          expect(l.en).not.toMatch(/Scrap 2/);
          expect(polskieSlowa(l.en), l.en).toEqual([]);
        });

        it('wybór jest wyłączony przy 0, 1 i 2 sztukach złomu, a włączony od 3; pozostałe wybory zawsze', () => {
          for (const scrap of [0, 1, 2]) {
            const { gov, i } = okno(k, tryb, scrap);
            const v = eventView(gov, i)!;
            expect(v.choices[k.lata].ok, `złom ${scrap}`).toBe(false);
            expect(
              v.choices.filter((_, n) => n !== k.lata).map((c) => c.label.pl),
              `złom ${scrap}`,
            ).toEqual(k.inne);
            for (const [n, c] of v.choices.entries())
              if (n !== k.lata) expect(c.ok, `złom ${scrap} wybór ${n}`).toBe(true);
          }
          for (const scrap of [3, 4, 10]) {
            const { gov, i } = okno(k, tryb, scrap);
            expect(eventView(gov, i)!.choices[k.lata].ok, `złom ${scrap}`).toBe(true);
          }
        });

        it('wybór bierze dokładnie 3 złomu, łata jedną dziurę i niczego innego nie rusza', () => {
          for (const scrap of [3, 4, 10]) {
            const { gov, i } = okno(k, tryb, scrap);
            const fx = chooseEvent(gov, i, k.lata);
            expect(fx.stock, `złom ${scrap}`).toEqual({ wood: 0, supplies: 0, scrap: -3, parts: 0, meds: 0 });
            expect(fx.patch, `złom ${scrap}`).toBe(1);
            expect(gov.ev.active, `złom ${scrap}`).toBeNull();
          }
        });

        it('przy 2 sztukach złomu wybór nic nie robi: bez wydatku, bez łaty, bez wpisu o łacie', () => {
          const { gov, i } = okno(k, tryb, 2);
          const fx = chooseEvent(gov, i, k.lata);
          expect(fx.stock.scrap).toBe(0);
          expect(fx.patch).toBe(0);
          expect(gov.ev.active?.id).toBe(k.id);
          expect(gov.log.filter((e) => /załatana|patched/.test(e.txt.pl + e.txt.en))).toEqual([]);
          expect(gov.watki?.haki['szczekanie.slady']).toBeUndefined();
        });

        it('wpis w kronice i podpis wyboru z kosztem, po polsku i po angielsku, bez desek', () => {
          const { gov, i } = okno(k, tryb, 10);
          const podpis = eventView(gov, i)!;
          chooseEvent(gov, i, k.lata);
          const wpisy = gov.log.map((e) => e.txt);
          expect(wpisy).toContainEqual(k.wpis);
          // wpis o samym wyborze niesie tytuł karty i podpis łaty z kosztem
          expect(wpisy).toContainEqual({
            pl: `${podpis.title.pl}: ${k.podpis.pl}.`,
            en: `${podpis.title.en}: ${k.podpis.en}.`,
          });
          for (const t of wpisy) {
            expect(t.pl, t.en).not.toMatch(/deskami/);
            expect(t.en, t.pl).not.toMatch(/planks/);
          }
        });

        it('pozostałe wybory nie biorą złomu i niczego nie łatają', () => {
          const { gov, i } = okno(k, tryb, 10);
          const ile = eventView(gov, i)!.choices.length;
          for (let n = 0; n < ile; n++) {
            if (n === k.lata) continue;
            const w = okno(k, tryb, 10);
            const fx = chooseEvent(w.gov, w.i, n);
            expect(fx.stock.scrap, `wybór ${n}`).toBe(0);
            expect(fx.patch, `wybór ${n}`).toBe(0);
            expect(w.gov.watki?.haki['szczekanie.slady']?.d, `wybór ${n}`).not.toEqual({ jak: 'lata' });
          }
        });
      });
    }

  it('krok 2 „Szczekania”: łata zostawia hak, który zwalnia krok 3, i działa tylko przy dziurze w siatce', () => {
    const k = KARTY.find((x) => x.id === 'szczekanie_2')!;
    for (const tryb of k.tryby) {
      const { gov, i } = okno(k, tryb, 10);
      chooseEvent(gov, i, k.lata);
      expect(gov.watki?.haki['szczekanie.slady']?.d, tryb).toEqual({ jak: 'lata' });
      // bez dziury nie ma czego łatać, choćby złomu było dużo
      const bez = okno(k, tryb, 10, 16, 0, false);
      expect(eventView(bez.gov, bez.i)!.choices[k.lata].ok, tryb).toBe(false);
      const fx = chooseEvent(bez.gov, bez.i, k.lata);
      expect(fx.stock.scrap, tryb).toBe(0);
      expect(fx.patch, tryb).toBe(0);
    }
  });
});
