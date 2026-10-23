/* Angielskie wydarzenia z 0.3 (src/gov/warianty.en.ts). Każde wydarzenie z OLD_EVENTS na 40 ziarnach w siedmiu
   miejscach (blok wśród bloków z mieszkańcami i bez, blok wśród domów, samotny blok, dom wśród domów, dom wśród bloków,
   samotny dom), z garażami i bez, z każdym najwyższym budynkiem, z ogniskiem i bez, przy różnych wolnych miejscach
   i nazwach siedziby: tytuł, tekst i napisy wyborów po angielsku (bez polskich słów poza imionami i nazwami miejsc),
   tyle napisów, ile wyborów w grze, każdy wpis do kroniki z każdego dostępnego wyboru ma angielską wersję, a angielskie
   funkcje nie losują i nie zmieniają stanu zarządu. Do tego słowa miejsca jak w polskim teście
   (wydarzenia-miejsce.test.ts) i tabele dla każdej pozycji polskich list z danych wydarzeń. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKS } from '../../src/content/data.ts';
import { BLOK, placeOf } from '../../src/gov/miejsce.ts';
import type { GovInput, GovPlace } from '../../src/gov/typy.ts';
import { EVENTS_EN } from '../../src/gov/warianty.en.ts';
import { OLD_EVENTS } from '../../src/gov/warianty.ts';
import { BOOKS_EN, FROM_EN, TOWER_EN } from '../../src/gov/warianty-dane.en.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';

/** wpis do kroniki: dziś polski napis, po zmianie zarządu na Tx obiekt z polską stroną */
const pl = (t: unknown): string => (typeof t === 'string' ? t : (t as { pl: string }).pl);

const zielonki = placeOf(demoWorld('zielonki').w);
const def = (id: string) => M1_EVENTS.find((e) => e.id === id)!;
const SEEDS = 40;
const TOWERS: GovPlace['tower'][] = ['wiezowiec', 'blok', 'szkola', 'kosciol', 'hala', 'market', null];
/** nazwy miejsc z danych wydarzeń, które po angielsku zostają polskie */
const MIEJSCA = ['Wilanów'];

/** [nazwa, miejsce, mieszkańcy siedziby] */
const PLACES: readonly (readonly [string, GovPlace, number])[] = [
  ['blok wśród bloków z mieszkańcami', BLOK, 4],
  ['blok wśród bloków bez mieszkańców', BLOK, 0],
  ['blok wśród domów', { ...BLOK, near: 'domy', blocks: 0, houses: 8 }, 3],
  ['samotny blok', { ...BLOK, near: 'nikt', blocks: 0, houses: 0 }, 2],
  ['dom wśród domów', zielonki, 0],
  ['dom wśród bloków', { ...zielonki, near: 'bloki', blocks: 6, houses: 0 }, 0],
  ['samotny dom', { ...zielonki, near: 'nikt', blocks: 0, houses: 0 }, 0],
];

/** zarząd i wejście (dzień 3, dużo zapasów); z ziarnem zmieniają się garaże, najwyższy budynek, sklep, ognisko, wolne
    miejsca, nazwa siedziby, godzina, pora roku, zaufanie, sąd koleżeński i książki w świetlicy */
function stan(place: GovPlace, residents: number, seed: number) {
  const gov = newGov(seed);
  gov.trust = seed % 2 ? 30 : 60;
  if (seed % 2) gov.laws.signed.u_sad = true;
  const atr = new Atrapa(seed);
  // przy dwóch książkach z dziedziny karton idzie na opał bez wpisu do kroniki; książki są w symulacji, więc na półce
  // atrapy, skąd trafiają do GovInput.books (i do wiedzy w GovInput.know)
  if (seed % 7 === 3) atr.books = { bud: 2, cieplo: 2, elek: 2, med: 2, uprawa: 2, it: 2 };
  atr.supplies = 30;
  atr.woodSklad = 10;
  atr.scrap = 12;
  atr.parts = 5;
  atr.meds = 5;
  const i: GovInput = {
    ...atr.input(),
    day: 3,
    hour: 9 + (seed % 14),
    minute: 0,
    screen: 1000,
    kozaLit: true,
    season: seed % 4,
    outdoor: 0,
    place: {
      ...place,
      garages: seed % 3 ? place.garages : null,
      tower: TOWERS[seed % TOWERS.length],
      shop: seed % 4 ? 80 : null,
    },
    residents,
    cap: residents + [0, 1, 3, 15][seed % 4],
    light: { campfire: seed % 5 === 0, gateLamp: false },
    hqName: seed % 6 === 0 ? undefined : seed % 2 ? 'Atrapia 7' : 'Obrońców Wybrzeża 4',
  };
  // bez danych o miejscach zarząd zakłada cztery wolne
  if (seed % 9 === 0) delete i.cap;
  return { gov, i };
}

/** imiona i nazwiska osób, nazwa siedziby i nazwy miejsc: zostają po polsku */
function dozwolone(i: GovInput, d: unknown): string[] {
  const out = [...MIEJSCA, i.hqName ?? ''];
  for (const p of i.people) out.push(p.name, p.first);
  const x = (d ?? {}) as { p?: unknown; spec?: unknown };
  for (const p of [x.p, x.spec])
    if (p && typeof p === 'object') out.push((p as { name: string }).name, (p as { first: string }).first);
  return out;
}

/** tekst po angielsku: niepusty, bez polskich słów i z angielską typografią (’ “ ”, bez pauz) */
function poAngielsku(t: string, ok: readonly string[], what: string): void {
  expect(t, what).toBeTruthy();
  expect(polskieSlowa(t, ok), `${what}: ${t}`).toEqual([]);
  expect(t, `${what}: ${t}`).not.toMatch(/['"„—]| – | {2}| [.,]|undefined|NaN/);
}

/** wpisy do kroniki, które przebieg musi pokazać: warianty miejsca i losowe gałęzie */
const WARIANTY: Record<string, RegExp[]> = {
  handlarz: [/^Wymiana: .*Drewno/],
  lodowka: [/^Lodówka otwarta/],
  dron: [/spadł za garażami/, /spadł za płotem/, /spadł w ogrodzie sąsiadów/, /maskotką osiedla/, /maskotką ulicy/],
  krypto: [/^Tokeny/],
  ksiazki: [/w świetlicy/, /na półce przy kozie/],
  aktywisci: [/^Aktywiści/],
  uchodzcy: [/^Przyjęliście 1 osobę /, /^Przyjęliście \d+ \S+ [^.]+\.$/, /spać na podłodze/],
  klotnia: [/obraził się/, /obraziła się/, /do innego osiedla/, /na inną ulicę/],
  pozar: [
    /Spłonął zapas opału/,
    /Spłonęło drewno/,
    /^Klatka w budynku siedziby/,
    /^Klatka w budynku Atrapia/,
    /^Ogień/,
  ],
  kradziez: [/^Sąd koleżeński/],
  wesele: [/^Wesele/],
  odejscie: [/odszedł/, /odeszła/, /z osiedla\.$/, /z ulicy\.$/],
};

describe('każde wydarzenie z 0.3 po angielsku', () => {
  it('wpis dla każdego wydarzenia z OLD_EVENTS i tylko dla nich', () => {
    expect(Object.keys(EVENTS_EN).sort()).toEqual(OLD_EVENTS.map((o) => o.id).sort());
  });

  it.each(OLD_EVENTS.map((o) => o.id))('%s: tytuł, tekst, napisy i kronika we wszystkich miejscach', (id) => {
    const e = def(id);
    const en = EVENTS_EN[id];
    let seen = 0;
    const lines = new Set<string>();
    for (const [name, place, residents] of PLACES)
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { gov, i } = stan(place, residents, seed);
        const made = e.make(makeHost(gov, i, emptyEffects()));
        if (made === null) continue;
        // dane jak w zapisie gry: ActiveEvent.d to JSON
        const d = JSON.parse(JSON.stringify(made));
        seen++;
        const where = `${id}, ${name}, ziarno ${seed}`;
        const ok = dozwolone(i, d);
        const h = makeHost(gov, i, emptyEffects());
        const choices = e.choices(h, d);
        const before = JSON.stringify(gov);
        const labels = en.labels(
          h,
          d,
          choices.map((c) => c.label.pl),
        );
        poAngielsku(en.title(h, d), ok, `${where}: tytuł`);
        poAngielsku(en.text(h, d), ok, `${where}: tekst`);
        expect(labels.length, where).toBe(choices.length);
        labels.forEach((l, k) => {
          poAngielsku(l, ok, `${where}: wybór ${k}`);
        });
        expect(JSON.stringify(gov), `${where}: angielskie napisy ruszyły stan zarządu`).toBe(before);
        // każdy dostępny wybór na świeżej kopii stanu, z gospodarzem wydarzenia jak w grze; wpis „Tytuł: wybór.”
        // gra pisze sama, tu tylko wpisy z run()
        choices.forEach((c, k) => {
          if (!c.ok) return;
          const st = structuredClone(gov);
          const hk = makeHost(st, i, emptyEffects(), e);
          const run = e.choices(hk, d)[k];
          const n0 = st.log.length;
          run.run();
          for (const entry of st.log.slice(n0)) {
            const line = pl(entry.txt);
            lines.add(line);
            const after = JSON.stringify(st);
            const txt = en.log?.(line, hk, d, k) ?? null;
            expect(txt, `${where}, wybór ${k}: ${line}`).not.toBeNull();
            poAngielsku(txt ?? '', ok, `${where}, wybór ${k}: ${line}`);
            expect(JSON.stringify(st), `${where}: tłumacz kroniki ruszył stan`).toBe(after);
          }
        });
      }
    expect(seen, id).toBe(PLACES.length * SEEDS);
    for (const re of WARIANTY[id] ?? [])
      expect(
        [...lines].some((l) => re.test(l)),
        `${id}: ${re}`,
      ).toBe(true);
  });
});

describe('słowa miejsca jak w polskich wariantach', () => {
  /** w domu jednorodzinnym bez klatek, pięter, bloków, spółdzielni, pawilonu, szlabanu, świetlicy, czynszu i mieszkań */
  const FORBIDDEN_DOM_EN =
    /stairwell|third floor|storey|co-op|pavilion|barrier|common room|service charge|block|\bflats?\b/i;
  /** słowa, które zakładają sąsiadów przy płocie albo w budynku obok */
  const SASIEDZI_EN = /neighbour|over the fence|next door|houses nearby|opposite/i;

  /** wszystkie teksty wydarzenia, które w tym miejscu przychodzi: tytuł, tekst, napisy i wpisy z dostępnych wyborów */
  function texts(id: string, over: Partial<GovInput>, seed: number, trust: number): string[] | null {
    const gov = newGov(seed);
    gov.trust = trust;
    const atr = new Atrapa(seed);
    atr.supplies = 30;
    atr.woodSklad = 6;
    atr.scrap = 5;
    const i: GovInput = { ...atr.input(), day: 3, hour: 10, minute: 0, screen: 1000, kozaLit: true, ...over };
    const e = def(id);
    const h = makeHost(gov, i, emptyEffects());
    if (e.w(h) <= 0) return null;
    const d = e.make(h);
    if (d === null) return null;
    const en = EVENTS_EN[id];
    const choices = e.choices(h, d);
    const out = [
      en.title(h, d),
      en.text(h, d),
      ...en.labels(
        h,
        d,
        choices.map((c) => c.label.pl),
      ),
    ];
    choices.forEach((c, k) => {
      if (!c.ok) return;
      const st = structuredClone(gov);
      const hk = makeHost(st, i, emptyEffects(), e);
      const n0 = st.log.length;
      e.choices(hk, d)[k].run();
      for (const entry of st.log.slice(n0)) out.push(en.log?.(pl(entry.txt), hk, d, k) ?? '');
    });
    return out;
  }

  it.each([
    ['dom wśród domów', zielonki],
    ['dom wśród domów przy sklepie', { ...zielonki, shop: 70 }],
  ] as const)('%s: żadne wydarzenie nie mówi o bloku', (_n, place) => {
    let seen = 0;
    for (let seed = 1; seed <= 6; seed++)
      for (const hour of [10, 16, 20, 23])
        for (const trust of [50, 30])
          for (const o of OLD_EVENTS) {
            const over = {
              hour,
              place,
              residents: seed % 2 ? 0 : 3,
              cap: 0,
              light: { campfire: false, gateLamp: false },
            };
            const t = texts(o.id, over, seed, trust);
            if (!t) continue;
            seen++;
            for (const x of t) expect(x, o.id).not.toMatch(FORBIDDEN_DOM_EN);
          }
    expect(seen).toBeGreaterThan(60);
  });

  it.each([
    ['samotny dom', { ...zielonki, near: 'nikt', houses: 0, blocks: 0 }],
    ['samotny blok', { ...BLOK, near: 'nikt', houses: 0, blocks: 0 }],
  ] as const)('%s: żadne wydarzenie nie mówi o sąsiadach', (_n, place) => {
    let seen = 0;
    for (let seed = 1; seed <= 6; seed++)
      for (const hour of [10, 16, 20, 23])
        for (const o of OLD_EVENTS) {
          const over = { hour, place: place as GovPlace, residents: 0, cap: 0, season: 0 };
          const t = texts(o.id, over, seed, 30);
          if (!t) continue;
          seen++;
          for (const x of t) expect(x, o.id).not.toMatch(SASIEDZI_EN);
        }
    expect(seen).toBeGreaterThan(30);
  });
});

describe('przykłady', () => {
  /** zarząd, wejście (dzień 3, 10:00) i host jak w wydarzenia-miejsce.test.ts */
  function setup(over: Partial<GovInput> = {}, seed = 1) {
    const gov = newGov(seed);
    const atr = new Atrapa(seed);
    atr.supplies = 30;
    const i: GovInput = { ...atr.input(), day: 3, hour: 10, minute: 0, screen: 1000, kozaLit: true, ...over };
    return { gov, i, h: makeHost(gov, i, emptyEffects()) };
  }
  const labels = (id: string, d: unknown, over: Partial<GovInput> = {}) => {
    const { h } = setup(over);
    return EVENTS_EN[id].labels(
      h,
      d,
      def(id)
        .choices(h, d)
        .map((c) => c.label.pl),
    );
  };

  it('ludzie pod bramą: wolne miejsca w tekście, przyciski z liczbą na podłodze, wpis z liczbą', () => {
    const group = { n: 7, from: 'z bloku, w którym pękł pion', spec: null };
    const three = { cap: 8, residents: 5 };
    expect(labels('uchodzcy', group, three)).toEqual([
      'Take in as many as fit (3)',
      'Give them food for the road (Food 3)',
      'Take everyone in (4 people on the floor)',
      'Send them away',
    ]);
    expect(EVENTS_EN.uchodzcy.text(setup(three).h, group)).toBe(
      'At the gate, 7 people are asking to be let in. They’ve come from a block where the main pipe burst. Free beds in the block: 3.',
    );
    const log = (line: string) => EVENTS_EN.uchodzcy.log?.(line, setup().h, group, 0);
    expect(log('Przyjęliście 1 osobę z Wilanowa.')).toBe('You took in 1 person from Wilanów.');
    expect(log('Przyjęliście 7 osób z bloku, w którym pękł pion. 4 osoby będą spać na podłodze.')).toBe(
      'You took in 7 people from a block where the main pipe burst. 4 of them will sleep on the floor.',
    );
  });

  it('rodzina pod furtką: słownie, bez wolnych łóżek, fachowiec z zawodem', () => {
    const { h } = setup({ place: zielonki, cap: 0, residents: 0 });
    const spec = { ...h.makePerson(), name: 'Ewa Kowalska', f: true, prof: 'Lekarka rodzinna' };
    expect(EVENTS_EN.uchodzcy.title(h, {})).toBe('A family at the garden gate');
    expect(EVENTS_EN.uchodzcy.text(h, { n: 3, from: 'z miasta, gdzie pękł wodociąg', spec })).toBe(
      'A family of three is standing at the garden gate. They’ve come from a town where the water main burst and are asking to be let in. There are no free beds in the house, so they would sleep on the kitchen floor. Among them: Ewa Kowalska, GP.',
    );
  });

  it('ktoś się na czymś zna: zawód małą literą, skróty bez zmiany, zaimki z płci', () => {
    const blok = setup({ residents: 4 }).h;
    const p = { ...blok.makePerson(), name: 'Halina Nowak', f: true, prof: 'Doradczyni ds. ESG' };
    expect(EVENTS_EN.fachowiec.text(blok, { p, b: 'Atrapia 7' })).toBe(
      'Halina Nowak from Atrapia 7 let it slip by the stove that she used to be an ESG consultant. She kept quiet until now in case someone put her to work.',
    );
    const m = { ...p, name: 'Marek Nowak', f: false, prof: 'Hydraulik' };
    const fire = setup({ light: { campfire: true, gateLamp: false } }).h;
    expect(EVENTS_EN.fachowiec.text(fire, { p: m, b: 'siedziby' })).toBe(
      'Marek Nowak from the board’s block let it slip by the campfire that he used to be a plumber. He kept quiet until now in case someone put him to work.',
    );
    expect(EVENTS_EN.fachowiec.labels(fire, { p: m }, ['a', 'b'])).toEqual(['Put him to work', 'Let him rest']);
    const dom = setup({ place: zielonki, residents: 0 }).h;
    expect(EVENTS_EN.fachowiec.text(dom, { p: m, b: 'Atrapia 7' })).toMatch(
      /^Marek Nowak from over the fence let it slip/,
    );
  });

  it('handlarz: koszty po angielsku, drewno to Wood', () => {
    const { h } = setup({ place: zielonki });
    const d = {
      o: [
        { give: { zlom: 8 }, take: { opal: 4 } },
        { give: { jedzenie: 8 }, take: { czesci: 2, zlom: 2 } },
      ],
    };
    expect(EVENTS_EN.handlarz.text(h, d)).toMatch(/at the garden gate\./);
    expect(labels('handlarz', d)).toEqual(['Get Scrap 8 for Wood 4', 'Get Food 8 for Parts 2, Scrap 2', 'No deal']);
    expect(EVENTS_EN.handlarz.log?.('Wymiana: Jedzenie 8 za Części 2, Złom 2.', h, d, 1)).toBe(
      'Trade: Food 8 for Parts 2, Scrap 2.',
    );
    expect(EVENTS_EN.handlarz.log?.('Wymiana: Złom 8 za Drewno 4.', h, d, 0)).toBe('Trade: Scrap 8 for Wood 4.');
  });

  it('ktoś was obserwuje: z najwyższego budynku w okolicy, na wasz blok albo dom', () => {
    for (const [t, from] of Object.entries(TOWER_EN)) {
      const { h } = setup({ hour: 14, place: { ...BLOK, tower: t as GovPlace['tower'] } });
      expect(EVENTS_EN.obserwacja.text(h, {})).toBe(
        `${from}, someone is watching your block through binoculars. They’ve been at it since morning.`,
      );
    }
    const dom = setup({ hour: 14, place: { ...zielonki, tower: null } }).h;
    expect(EVENTS_EN.obserwacja.text(dom, {})).toMatch(/^From the bushes at the end of the street, .* your house /);
    const blok = setup({ hour: 14, place: { ...BLOK, tower: null } }).h;
    expect(EVENTS_EN.obserwacja.text(blok, {})).toMatch(/^From the roof of the shopping centre, .* your block /);
  });

  it('czynsz w domu to rata kredytu, list w kozie albo w ognisku', () => {
    const dom = setup({ place: zielonki, light: { campfire: true, gateLamp: false } }).h;
    expect(EVENTS_EN.czynsz.title(dom, {})).toBe('Mortgage instalment for 2047');
    expect(EVENTS_EN.czynsz.labels(dom, {}, ['a', 'b'])).toEqual([
      'Announce the committee collects no dues',
      'Burn the letter on the campfire',
    ]);
    const blok = setup({ light: { campfire: false, gateLamp: false } }).h;
    expect(EVENTS_EN.czynsz.labels(blok, {}, ['a', 'b'])).toEqual([
      'Write it off for everyone',
      'Burn the letter in the stove',
    ]);
  });

  it('wpisy do kroniki: zwroty miejsca, nieznany wpis to null', () => {
    const { h } = setup();
    expect(EVENTS_EN.dron.log?.('Dron zostaje maskotką ulicy.', h, {}, 1)).toBe(
      'The drone stays. It’s the street’s mascot now.',
    );
    expect(
      EVENTS_EN.ksiazki.log?.('Nowa książka na półce przy kozie: „Ogród na balkonie” (Uprawa +1).', h, {}, 0),
    ).toBe('New book on the shelf by the stove: “The Balcony Garden” (Farming +1).');
    expect(EVENTS_EN.klotnia.log?.('Ewa Nowak obraziła się i wyprowadziła na inną ulicę.', h, {}, 1)).toBe(
      'Ewa Nowak took offence and moved to another street.',
    );
    expect(EVENTS_EN.pozar.log?.('Klatka w budynku siedziby spłonęła. Mniej miejsc do mieszkania.', h, {}, 1)).toBe(
      'The stairwell in the board’s block burned out. Fewer places to live.',
    );
    expect(EVENTS_EN.dron.log?.('Coś zupełnie innego.', h, {}, 0)).toBeNull();
  });

  it('napisy wyborów nie do pary z grą: zostają polskie, żeby nie trafić do cudzego wyboru', () => {
    const { h } = setup();
    expect(EVENTS_EN.dzieci.labels(h, {}, ['Jeden', 'Dwa'])).toEqual(['Jeden', 'Dwa']);
  });
});

describe('tabele dla polskich list z danych wydarzeń', () => {
  const src = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, '../../src', f), 'utf8');

  it('skąd przychodzą ludzie pod bramę: każda pozycja list z warianty.ts i events.ts', () => {
    const lists = [
      ...[...src('gov/warianty.ts').matchAll(/const FROM_(?:BLOK|DOM) = \[([\s\S]*?)\];/g)].map((m) => m[1]),
      /from: pick\(\s*\[([\s\S]*?)\]/.exec(src('content/events.ts'))?.[1] ?? '',
    ];
    const items = lists.flatMap((l) => [...l.matchAll(/'([^']+)'/g)].map((m) => m[1]));
    expect(items.length).toBe(16);
    for (const p of items) {
      expect(FROM_EN[p], p).toBeTruthy();
      expect(polskieSlowa(FROM_EN[p], MIEJSCA), p).toEqual([]);
      expect(FROM_EN[p], p).toMatch(/^from /);
    }
  });

  it('tytuły książek z kartonu', () => {
    for (const t of Object.values(BOOKS).flat()) {
      expect(BOOKS_EN[t], t).toBeTruthy();
      expect(polskieSlowa(BOOKS_EN[t]), t).toEqual([]);
    }
  });
});
