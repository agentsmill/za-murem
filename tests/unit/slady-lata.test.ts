/* Karta „Ślady przy siatce” łata dziurę za tyle złomu, ile łata z menu (docs/superpowers/plans/2026-10-19-sciezka-celow.md,
   zadanie 14; usterka U13 w docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): trzy sztuki, nie dwie
   (`PATCH_COST` w src/sim/sim.ts, `PATCH_SCRAP` w src/gov/tresc.ts; zgodność liczb pilnuje tests/unit/zarzad.test.ts).
   Obie karty (`slady` w zwykłym trybie, `slady_z` w zombie), oba języki: podpis „(Złom 3)” / “(Scrap 3)”, wybór wyłączony
   przy zero, jednej i dwóch sztukach złomu, a włączony od trzech, wydatek dokładnie trzech sztuk złomu, jedna załatana dziura
   i wpis w kronice „złomem i drutem” (nie „deskami”: karta bierze złom). */

import { describe, expect, it } from 'vitest';
import { tx } from '../../src/core/jezyk.ts';
import { PATCH_SCRAP } from '../../src/gov/tresc.ts';
import type { GovInput } from '../../src/gov/typy.ts';
import { eventView } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import { Atrapa } from './gov-atrapa.ts';
import { polskieSlowa } from './po-angielsku.ts';

const KARTY = [
  { id: 'slady', mode: 'zwykly', drugi: 'Powiesić puszki z kamykami' },
  { id: 'slady_z', mode: 'zombie', drugi: 'Postawić tam kogoś z dzidą na noc' },
] as const;

/** zarząd z otwartą kartą (aktywną wprost, jak w wydarzenia-tryby.test.ts) i wejście z podaną liczbą sztuk złomu o godzinie */
function okno(id: (typeof KARTY)[number]['id'], mode: 'zwykly' | 'zombie', scrap: number, hour = 16, minute = 0) {
  const gov = newGov(3, mode);
  const atr = new Atrapa(3);
  atr.scrap = scrap;
  const i: GovInput = { ...atr.input(), day: 3, hour, minute };
  gov.ev.active = { id, d: { where: tx('przy garażach', 'by the garages') } };
  return { gov, i };
}

describe('„Ślady przy siatce” łatają za 3 złomu jak menu', () => {
  it('stała karty to trzy sztuki', () => {
    expect(PATCH_SCRAP).toBe(3);
  });

  for (const { id, mode, drugi } of KARTY) {
    describe(`${id} (tryb ${mode})`, () => {
      it('podpis łaty mówi o trzech sztukach złomu po polsku i po angielsku, przed nocą i po karcie nocy', () => {
        for (const [h, m] of [
          [15, 0],
          [19, 59],
        ]) {
          const { gov, i } = okno(id, mode, 10, h, m);
          expect(eventView(gov, i)!.choices[0].label, `${h}:${m}`).toEqual({
            pl: 'Załatać przed nocą (Złom 3)',
            en: 'Patch it up before dark (Scrap 3)',
          });
        }
        for (const [h, m] of [
          [20, 0],
          [21, 30],
        ]) {
          const { gov, i } = okno(id, mode, 10, h, m);
          expect(eventView(gov, i)!.choices[0].label, `${h}:${m}`).toEqual({
            pl: 'Załatać teraz (Złom 3)',
            en: 'Patch it up now (Scrap 3)',
          });
        }
      });

      it('podpis nie ma starego kosztu ani polskich słów po angielsku', () => {
        const { gov, i } = okno(id, mode, 10);
        const l = eventView(gov, i)!.choices[0].label;
        expect(l.pl).not.toMatch(/Złom 2/);
        expect(l.en).not.toMatch(/Scrap 2/);
        expect(polskieSlowa(l.en), l.en).toEqual([]);
      });

      it('wybór jest wyłączony przy 0, 1 i 2 sztukach złomu, a włączony od 3; drugi wybór zawsze', () => {
        for (const scrap of [0, 1, 2]) {
          const { gov, i } = okno(id, mode, scrap);
          const v = eventView(gov, i)!;
          expect(v.choices[0].ok, `złom ${scrap}`).toBe(false);
          expect(v.choices[1].ok, `złom ${scrap}`).toBe(true);
          expect(v.choices[1].label.pl).toBe(drugi);
        }
        for (const scrap of [3, 4, 10]) {
          const { gov, i } = okno(id, mode, scrap);
          expect(eventView(gov, i)!.choices[0].ok, `złom ${scrap}`).toBe(true);
        }
      });

      it('wybór bierze dokładnie 3 złomu, łata jedną dziurę i niczego innego nie rusza', () => {
        for (const scrap of [3, 4, 10]) {
          const { gov, i } = okno(id, mode, scrap);
          const fx = chooseEvent(gov, i, 0);
          expect(fx.stock, `złom ${scrap}`).toEqual({ wood: 0, supplies: 0, scrap: -3, parts: 0, meds: 0 });
          expect(fx.patch, `złom ${scrap}`).toBe(1);
          expect(gov.ev.active, `złom ${scrap}`).toBeNull();
        }
      });

      it('przy 2 sztukach złomu wybór nic nie robi: bez wydatku, bez łaty, bez wpisu o łacie', () => {
        const { gov, i } = okno(id, mode, 2);
        const fx = chooseEvent(gov, i, 0);
        expect(fx.stock.scrap).toBe(0);
        expect(fx.patch).toBe(0);
        expect(gov.ev.active?.id).toBe(id);
        expect(gov.log.filter((e) => /załatana|patched/.test(e.txt.pl + e.txt.en))).toEqual([]);
      });

      it('wpis w kronice mówi o złomie i drucie po polsku i po angielsku, bez desek', () => {
        const { gov, i } = okno(id, mode, 10);
        chooseEvent(gov, i, 0);
        const wpisy = gov.log.map((e) => e.txt);
        expect(wpisy).toContainEqual({
          pl: 'Dziura załatana złomem i drutem.',
          en: 'The hole is patched up with scrap and wire.',
        });
        // wpis o samym wyborze niesie podpis z kosztem
        expect(wpisy).toContainEqual({
          pl: 'Ślady przy siatce: Załatać przed nocą (Złom 3).',
          en: 'Tracks by the fence: Patch it up before dark (Scrap 3).',
        });
        for (const t of wpisy) {
          expect(t.pl, t.en).not.toMatch(/deskami/);
          expect(t.en, t.pl).not.toMatch(/planks/);
        }
      });

      it('drugi wybór nie bierze złomu i niczego nie łata', () => {
        const { gov, i } = okno(id, mode, 10);
        const fx = chooseEvent(gov, i, 1);
        expect(fx.stock.scrap).toBe(0);
        expect(fx.patch).toBe(0);
      });
    });
  }
});
