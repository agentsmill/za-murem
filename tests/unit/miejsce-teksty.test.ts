/* Słownik wspólnoty w tekstach zarządu poza wydarzeniami: uchwały, kronika zebrań, karta nocy z wyprawami,
   zapasowe nazwy dziur w siatce i zakończenia gry. W domu ulica i komitet ulicy, w bloku jak dotąd. */

import { describe, expect, it } from 'vitest';
import { placeOf, wordsOf } from '../../src/gov/miejsce.ts';
import { confirm, makeCard } from '../../src/gov/noc.ts';
import { KONIEC_DOM, TARGETS, targetName } from '../../src/gov/tresc.ts';
import type { GovInput } from '../../src/gov/typy.ts';
import { lawOptions } from '../../src/gov/uchwaly.ts';
import { emptyEffects, fenceOf } from '../../src/gov/wspolne.ts';
import { govUpdate, newGov, signLaw } from '../../src/gov/zarzad.ts';
import { Atrapa, TPH } from './gov-atrapa.ts';
import { demoWorld, FORBIDDEN_DOM } from './miejsce-pomoc.ts';

const dom = placeOf(demoWorld('zielonki').w);
/** wejście z atrapy o godzinie h pierwszego dnia (gra zaczyna się o 15:00) */
const at = (h: number, over: Partial<GovInput> = {}): GovInput => {
  const atr = new Atrapa(1);
  atr.tick = Math.round((h - 15) * TPH);
  return { ...atr.input(), ...over };
};
const lastLog = (st: ReturnType<typeof newGov>) => st.log[st.log.length - 1]?.txt;

describe('uchwały', () => {
  it('w domu: furtka, zebrania przy kozie, bez klatek i bloków', () => {
    const opts = lawOptions(newGov(1), at(19.5, { place: dom }));
    const names = opts.map((o) => o.name);
    expect(names).toEqual(
      expect.arrayContaining(['Warty przy furtce', 'Zebrania przy kozie', 'Furtka na kłódkę od 20:00']),
    );
    for (const o of opts) {
      expect(o.name).not.toMatch(FORBIDDEN_DOM);
      expect(o.desc).not.toMatch(FORBIDDEN_DOM);
    }
    expect(opts.find((o) => o.id === 'u_brama')?.desc).toContain('klucz ma tylko komitet');
    // brama na kłódkę wymaga wart: powód blokady też po nowemu
    expect(opts.find((o) => o.id === 'u_brama')?.why).toBe('Najpierw: Warty przy furtce');
  });

  it('w bloku jak dotąd', () => {
    const opts = lawOptions(newGov(1), at(19.5));
    expect(opts.find((o) => o.id === 'u_warty')?.name).toBe('Warty na klatkach');
    expect(opts.find((o) => o.id === 'u_brama')?.name).toBe('Brama na kłódkę od 20:00');
    expect(opts.find((o) => o.id === 'u_meble')?.desc).toBe(
      'Meble z pustych mieszkań idą do kozy bez pytania o zgodę. Palenie cudzych mebli boli połowę mniej, ale wkurzenie +2 od razu i +0,1 dziennie.',
    );
  });
});

describe('kronika zebrań', () => {
  it('w domu komitet ulicy', () => {
    const i = at(19.5, { place: dom });
    const a = newGov(1);
    govUpdate(a, i);
    expect(lastLog(a)).toBe('Zebranie komitetu przy kozie: pierwsza uchwała.');
    signLaw(a, i, null);
    expect(lastLog(a)).toBe('Komitet ulicy odłożył uchwałę na później.');
    const b = newGov(1);
    govUpdate(b, i);
    signLaw(b, i, 'u_warty');
    expect(lastLog(b)).toBe('Uchwała komitetu: Warty przy furtce.');
  });

  it('w bloku zarząd', () => {
    const i = at(19.5);
    const a = newGov(1);
    govUpdate(a, i);
    expect(lastLog(a)).toBe('Zebranie zarządu przy kozie: pierwsza uchwała.');
    signLaw(a, i, null);
    expect(lastLog(a)).toBe('Zarząd odłożył uchwałę na później.');
    const b = newGov(1);
    govUpdate(b, i);
    signLaw(b, i, 'u_warty');
    expect(lastLog(b)).toBe('Uchwała zarządu: Warty na klatkach.');
  });

  it('słownik ma krótki dopełniacz do kroniki', () => {
    expect(wordsOf(dom).zarzad.dk).toBe('komitetu');
  });
});

describe('karta nocy i wyprawy', () => {
  it('w domu wyprawy bez bloku, trzepaka i pawilonu', () => {
    const st = newGov(1);
    const { card } = makeCard(st, at(20, { place: dom }));
    const labels = card.people[0].options.filter((o) => o.key.startsWith('wyprawa:')).map((o) => o.label);
    expect(labels).toEqual(['Wyprawa blisko: opuszczony dom obok', 'Wyprawa daleko: sklep przy głównej drodze']);
    for (const l of labels) expect(l).not.toMatch(/blok|trzepak|pawilon/);
  });

  it('posterunek przy wejściu: w domu przy furtce, w bloku przy bramie', () => {
    const posts = (over: Partial<GovInput>) => makeCard(newGov(1), at(20, over)).card.posts.map((p) => p.name);
    expect(posts({ place: dom })).toContain('przy furtce');
    expect(posts({})).toContain('przy bramie');
    expect(wordsOf(dom).brama.pod).toBe('pod furtką');
  });

  it('garaże: w domu z garażami obok, bez garaży szopy w ogrodach', () => {
    const g = TARGETS.find((t) => t.id === 'garaze')!;
    expect(targetName(g, dom)).toBe('garaże obok');
    expect(targetName(g, { ...dom, garages: null })).toBe('szopy w ogrodach obok');
    expect(targetName(g, placeOf(demoWorld('przymorze').w))).toBe('garaże za trzepakiem');
  });

  it('w domu komitet nie zdążył się naradzić', () => {
    const st = newGov(1);
    const i = at(20, { place: dom });
    const { card, assign } = makeCard(st, i);
    st.night = {
      day: 1,
      card,
      assign,
      confirmed: false,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    const fx = emptyEffects();
    confirm(st, i, fx, true);
    expect(fx.log[0]).toMatch(/^Komitet ulicy nie zdążył się naradzić/);
  });
});

describe('siatka i zakończenia', () => {
  it('zapasowe nazwy dziur w domu bez bloku', () => {
    const fence = { holes: [{ id: 5, size: 0.5 }], durability: 0.5 };
    expect(fenceOf(at(16, { place: dom, fence })).holes[0].name).toBe('od strony domu obok');
    expect(fenceOf(at(16, { fence })).holes[0].name).toBe('od strony bloku obok');
  });

  it('zakończenia w domu: zebranie ulicy, puste ogrody, pusta ulica', () => {
    expect(KONIEC_DOM.odwolanie.title).toBe('Zebranie ulicy odwołało komitet');
    expect(KONIEC_DOM.exodus.title).toBe('Ulica opustoszała');
    expect(KONIEC_DOM.pustka.text).toContain('Ulica stoi pusta');
    for (const e of Object.values(KONIEC_DOM)) {
      expect(e.title).not.toMatch(FORBIDDEN_DOM);
      expect(e.text).not.toMatch(FORBIDDEN_DOM);
    }
  });
});
