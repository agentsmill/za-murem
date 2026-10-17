/* Wydarzenia według miejsca: nakładki zarządu na wydarzenia z 0.3 (treść 0.3 bajt w bajt w src/content) i przyjęcia
   według wolnych miejsc. W domu jednorodzinnym bez klatek, pięter, bloków i spółdzielni; w bloku treść z 0.3 z dwiema
   poprawkami (drewno zamiast opału, koza zamiast ogniska, którego jeszcze nie ma). */

import { describe, expect, it } from 'vitest';
import { eventDef } from '../../src/content/events.ts';
import { BLOK, placeOf } from '../../src/gov/miejsce.ts';
import type { GovInput, GovPlace } from '../../src/gov/typy.ts';
import { admitWeight, osobyNaPodlodze } from '../../src/gov/warianty.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld, FORBIDDEN_DOM } from './miejsce-pomoc.ts';

const zielonki = placeOf(demoWorld('zielonki').w);
const def = (id: string) => M1_EVENTS.find((e) => e.id === id)!;

/** zarząd, wejście (dzień 3, 10:00, dużo zapasów) i host do jednego wydarzenia */
function setup(over: Partial<GovInput> = {}, seed = 1, trust = 50) {
  const gov = newGov(seed);
  gov.trust = trust;
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.woodSklad = 6;
  atr.scrap = 5;
  const i: GovInput = { ...atr.input(), day: 3, hour: 10, minute: 0, screen: 1000, kozaLit: true, ...over };
  const fx = emptyEffects();
  return { gov, i, fx, h: makeHost(gov, i, fx) };
}

/** wybór k w wydarzeniu o danych d, przez zarząd jak w grze; skutki i kronika */
function pick(id: string, d: unknown, k: number, over: Partial<GovInput> = {}, seed = 1) {
  const { gov, i } = setup(over, seed);
  gov.ev.active = { id, d };
  const fx = chooseEvent(gov, i, k);
  return { gov, fx, lines: [...fx.log, ...gov.later.map((l) => l.line)] };
}

const labels = (id: string, d: unknown, over: Partial<GovInput> = {}) =>
  def(id)
    .choices(setup(over).h, d)
    .map((c) => c.label);

describe('w domu żadne wydarzenie nie mówi o bloku', () => {
  const places: GovPlace[] = [zielonki, { ...zielonki, shop: 70 }];
  it.each(places.map((p, k) => [k, p] as const))('miejsce %i', (_k, place) => {
    let seen = 0;
    for (let seed = 1; seed <= 6; seed++)
      for (const hour of [10, 16, 20, 23])
        for (const trust of [50, 30])
          for (const e of M1_EVENTS) {
            const over = { hour, place, residents: 0, cap: 0, light: { campfire: false, gateLamp: false } };
            const { h } = setup(over, seed, trust);
            if (e.w(h) <= 0) continue;
            const d = e.make(h);
            if (d === null) continue;
            seen++;
            const texts = [e.title(h, d), e.text(h, d)];
            e.choices(h, d).forEach((c, k) => {
              texts.push(c.label);
              if (c.ok) texts.push(...pick(e.id, d, k, over, seed).lines);
            });
            for (const t of texts) expect(t, e.id).not.toMatch(FORBIDDEN_DOM);
          }
    expect(seen).toBeGreaterThan(80);
  });
});

describe('w bloku treść 0.3 z poprawkami', () => {
  it('lodówka, dron, auto i influencerka: tekst identyczny z 0.3', () => {
    const { h } = setup();
    for (const id of ['lodowka', 'dron', 'auto', 'influencer']) {
      const d = def(id).make(h);
      expect(def(id).text(h, d), id).toBe(eventDef(id)!.text(h, d));
    }
  });

  it('handlarz stoi pod bramą, w domu pod furtką', () => {
    const { h } = setup();
    expect(def('handlarz').text(h, def('handlarz').make(h))).toMatch(/^Pod bramą stoi facet z wózkiem/);
    const dom = setup({ place: zielonki }).h;
    expect(def('handlarz').text(dom, def('handlarz').make(dom))).toMatch(/^Pod furtką stoi facet z wózkiem/);
  });

  it('nigdzie nie ma „Opał”: drewno w napisach, tekstach i kronice', () => {
    for (const place of [BLOK, zielonki])
      for (let seed = 1; seed <= 10; seed++)
        for (const id of ['handlarz', 'krypto', 'ksiazki', 'automat']) {
          const over = { place: { ...place, shop: 100 } };
          const { h } = setup(over, seed);
          const d = def(id).make(h);
          const texts = [
            def(id).text(h, d),
            ...def(id)
              .choices(h, d)
              .map((c) => c.label),
          ];
          def(id)
            .choices(h, d)
            .forEach((c, k) => {
              if (c.ok) texts.push(...pick(id, d, k, over, seed).lines);
            });
          for (const t of texts) expect(t, id).not.toMatch(/Opał/);
        }
    expect(def('krypto').text(setup().h, {})).toContain('Drewno 5');
  });

  it('koza zamiast ogniska, którego jeszcze nie ma', () => {
    const cold = { light: { campfire: false, gateLamp: false } };
    const { h } = setup({ ...cold, residents: 4 });
    const d = def('fachowiec').make(h);
    expect(def('fachowiec').text(h, d)).toContain('przy kozie');
    const warm = setup({ light: { campfire: true, gateLamp: false }, residents: 4 }).h;
    expect(def('fachowiec').text(warm, d)).toContain('przy ognisku');
    expect(labels('czynsz', {}, cold)).toContain('Spalić list w kozie');
  });
});

describe('warunki miejsca', () => {
  it('automat tylko przy sklepie, kradzież tylko z mieszkańcami, wesela nie ma', () => {
    expect(def('automat').w(setup({ place: { ...BLOK, shop: null } }).h)).toBe(0);
    expect(def('automat').w(setup({ place: BLOK }).h)).toBeGreaterThan(0);
    expect(def('kradziez').w(setup({ residents: 0 }).h)).toBe(0);
    expect(def('kradziez').w(setup({ residents: 4 }).h)).toBeGreaterThan(0);
    expect(def('wesele').w(setup({}, 1, 80).h)).toBe(0);
  });

  it('obserwacja z najwyższego budynku w okolicy, na wasz dom', () => {
    const { h } = setup({ hour: 14, place: zielonki });
    const t = def('obserwacja').text(h, {});
    expect(t).toMatch(/^Z dachu hali /);
    expect(t).toContain('na wasz dom');
    expect(def('obserwacja').text(setup({ hour: 14, place: { ...BLOK, tower: 'kosciol' } }).h, {})).toMatch(
      /^Z wieży kościoła .*na wasz blok/,
    );
  });

  it('dzieci ze złomem z sąsiednich domów, gdy sąsiedzi to domy', () => {
    expect(def('dzieci').text(setup({ place: zielonki }).h, {})).toContain('z sąsiednich domów');
    expect(def('dzieci').text(setup().h, {})).toBe(eventDef('dzieci')!.text(setup().h, {}));
  });
});

describe('przyjęcia według wolnych miejsc', () => {
  const group = { n: 7, from: 'z bloku, w którym pękł pion', spec: null };
  const three = { cap: 8, residents: 5 };

  it('ludzie pod bramą w bloku: wolne miejsca w tekście, przyciski z liczbą na podłodze', () => {
    expect(labels('uchodzcy', group, three)).toEqual([
      'Przyjąć tylu, ilu się zmieści (3)',
      'Dać Jedzenie 3 na drogę',
      'Przyjąć wszystkich (4 osoby będą spać na podłodze)',
      'Odprawić',
    ]);
    const { h } = setup(three);
    expect(def('uchodzcy').text(h, group)).toContain('Wolnych miejsc w bloku: 3');
    expect(pick('uchodzcy', group, 0, three).fx.residents).toBe(3);
  });

  it('fachowiec w grupie dołącza do zarządu i nie liczy się drugi raz', () => {
    const spec = setup(three).h.makePerson();
    const { fx } = pick('uchodzcy', { ...group, spec }, 0, three);
    expect(fx.join.length).toBe(1);
    expect(fx.residents).toBe(2);
  });

  it('przyjąć wszystkich bez miejsc: ludzie na podłodze, wkurzenie +2', () => {
    const full = { cap: 5, residents: 5 };
    const ls = labels('uchodzcy', group, full);
    expect(ls).toEqual(['Dać Jedzenie 3 na drogę', 'Przyjąć wszystkich (7 osób będzie spać na podłodze)', 'Odprawić']);
    const { gov, fx } = pick('uchodzcy', group, 1, full);
    expect(fx.residents).toBe(7);
    expect(gov.anger).toBe(22);
    expect(gov.trust).toBe(51);
  });

  it('waga spada przy ciasnocie', () => {
    const w = (free: number) => def('uchodzcy').w(setup({ cap: 5 + free, residents: 5 }).h);
    expect(w(5)).toBeGreaterThan(0);
    expect(w(2)).toBeCloseTo(w(5) * 0.5);
    expect(w(0)).toBeCloseTo(w(5) * 0.15);
  });

  it('w domu rodzina 2–4 osób spod furtki, bez wolnych łóżek', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { h } = setup({ place: zielonki, cap: 0, residents: 0 }, seed);
      const d = def('uchodzcy').make(h) as { n: number };
      expect(d.n).toBeGreaterThanOrEqual(2);
      expect(d.n).toBeLessThanOrEqual(4);
      expect(def('uchodzcy').text(h, d)).toContain('W domu nie ma wolnych łóżek');
    }
  });

  it('aktywiści grzeją się i odchodzą, bez dokwaterowania', () => {
    const k = labels('aktywisci', {}).indexOf('Zaprosić do ciepła');
    const { gov, fx } = pick('aktywisci', {}, k);
    expect(fx.residents).toBe(0);
    expect(gov.trust).toBe(51);
  });

  it('influencerka i fachowiec nie liczą się podwójnie', () => {
    const inf = def('influencer').make(setup().h);
    const a = pick('influencer', inf, 0).fx;
    expect(a.join.length).toBe(1);
    expect(a.residents).toBe(0);
    const blok = { residents: 4 };
    const f = def('fachowiec').make(setup(blok).h);
    const b = pick('fachowiec', f, 0, blok).fx;
    expect(b.join.length).toBe(1);
    expect(b.residents).toBe(-1);
    const dom = { place: zielonki, residents: 0 };
    const c = pick('fachowiec', def('fachowiec').make(setup(dom).h), 0, dom).fx;
    expect(c.join.length).toBe(1);
    expect(c.residents).toBe(0);
  });

  it('ktoś odchodzi z rdzenia i nie zabiera ze sobą jeszcze jednego mieszkańca', () => {
    const low = { residents: 4 };
    const d = def('odejscie').make(setup(low, 1, 30).h) as { p: string };
    const { fx, lines } = pick('odejscie', d, 1, low);
    expect(fx.leave).toEqual([d.p]);
    expect(fx.residents).toBe(0);
    expect(lines.some((l) => l.includes('z osiedla'))).toBe(true);
  });

  it('osoby na podłodze po polsku', () => {
    expect([1, 2, 5, 12, 22].map(osobyNaPodlodze)).toEqual([
      '1 osoba będzie',
      '2 osoby będą',
      '5 osób będzie',
      '12 osób będzie',
      '22 osoby będą',
    ]);
    expect([0, 1, 3, 4, 9].map(admitWeight)).toEqual([0.15, 0.5, 0.5, 1, 1]);
  });
});

describe('nowe wydarzenia M1 według sąsiadów i wydarzenia ulicy domów', () => {
  const street = ['kury', 'kosiarka', 'szopa', 'plot', 'panele'];

  it('ulica domów: tylko w domu i od drugiego dnia, kury przy dziurze, spór o płot przy domach obok', () => {
    for (const id of street) {
      expect(def(id).w(setup({ place: BLOK }).h), id).toBe(0);
      expect(def(id).w(setup({ place: zielonki, day: 1 }).h), id).toBe(0);
      expect(def(id).w(setup({ place: zielonki }).h), id).toBeGreaterThan(0);
    }
    expect(def('kury').w(setup({ place: zielonki, fence: { holes: [], durability: 0.5 } }).h)).toBe(0);
    expect(def('plot').w(setup({ place: { ...zielonki, near: 'bloki' } }).h)).toBe(0);
  });

  it('jabłka jesienią, kartka na przychodni tam, gdzie jest przychodnia', () => {
    expect(def('jablka').w(setup({ season: 0 }).h)).toBeGreaterThan(0);
    expect(def('jablka').w(setup({ season: 1 }).h)).toBe(0);
    expect(def('przychodnia').w(setup({ place: zielonki }).h)).toBeGreaterThan(0);
    expect(def('przychodnia').w(setup({ place: { ...zielonki, clinic: null } }).h)).toBe(0);
  });

  it('przymrozek tylko przy mrozie', () => {
    expect(def('przymrozek').w(setup({ outdoor: 8 }).h)).toBe(0);
    expect(def('przymrozek').w(setup({ outdoor: 0 }).h)).toBeGreaterThan(0);
  });

  it('krzyk i światło w oknie według sąsiadów', () => {
    const { h } = setup({ place: zielonki });
    expect(def('krzyk').title(h, {})).toBe('Krzyk z domu obok');
    expect(def('sygnal').text(h, {})).toContain('W domu naprzeciwko');
    const blok = setup().h;
    expect(def('krzyk').title(blok, {})).toBe('Krzyk z bloku obok');
  });

  it('skutki: deski z szopy, łata po kurach, części z falownika', () => {
    const dom = { place: zielonki };
    const k = (id: string, label: string) => labels(id, {}, dom).findIndex((l) => l.startsWith(label));
    expect(pick('szopa', {}, k('szopa', 'Zabrać deski'), dom).fx.stock.wood).toBe(3);
    expect(pick('kury', {}, k('kury', 'Załatać dziurę'), dom).fx.patch).toBe(1);
    expect(pick('panele', {}, k('panele', 'Rozkręcić falownik'), dom).fx.stock.parts).toBe(2);
  });
});
