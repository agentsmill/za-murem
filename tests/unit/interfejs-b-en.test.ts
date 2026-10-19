/* Interfejs B po angielsku (zadanie 7 planu docs/superpowers/plans/2026-10-18-angielski.md): karta osoby i grupy,
   edytor imienia, etykieta zapisu, menu pod prawym przyciskiem, opisy prac i komunikaty wczytywania adresu. Rysuje
   je z ustawJezyk('en') na atrapach polskich testów (karta.test.ts, interfejs-zombie.test.ts, chain.test.ts,
   budowa.test.ts, night.test.ts, zombie.test.ts, walka.test.ts, imiona-zmiana.test.ts, world.test.ts) i sprawdza, że
   nie ma polskich słów poza imionami, nazwami miejsc i tekstami ze stanu, które zostają po polsku (historia i rodzina
   z generatora, zawód spoza słownika). Menu przechodzi po każdym kafelku atrap w obu językach: te same polecenia,
   a każdy polski napis ma jeden angielski. Polskie wersje sprawdzają tamte testy bez zmian. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { zawodEn } from '../../src/content/data.en.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { odmien, PRZYPADKI } from '../../src/mieszkancy/odmiana.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { AMMO_EN, AMMO_NAMES, WEAPONS, WEAPONS_EN } from '../../src/sim/bron.ts';
import { BUILDS, type BuildKind } from '../../src/sim/budowle.ts';
import { INSUL } from '../../src/sim/house.ts';
import { lokatorzyGry } from '../../src/sim/lokatorzy.ts';
import { MAT_ACC, MATS, REPAIR } from '../../src/sim/mieszkania.ts';
import { BUILD_EN, FURNITURE_EN, MAT_EN, REPAIR_EN, ROOM_EN, THING_EN } from '../../src/sim/nazwy.en.ts';
import { NEED_LABELS, NEED_LABELS_EN } from '../../src/sim/needs.ts';
import { commandsAt, jobText, type MenuItem, THING_ACC } from '../../src/sim/orders.ts';
import {
  BURNABLE,
  createSim,
  FURNITURE_ACC,
  infect,
  type JobKind,
  type Pawn,
  Sim,
  type SimState,
  type Thing,
} from '../../src/sim/sim.ts';
import { type SimPerson, snapshot } from '../../src/sim/snapshot.ts';
import {
  edytorImienia,
  przedPolem,
  wyprowadzka,
  wyprowadzkaTx,
  type ZmianaImienia,
  zmianaZPol,
} from '../../src/ui/imiona.ts';
import { type CardOpts, FIKCJA_EN, groupCard, personCard, storyHtml } from '../../src/ui/karta.ts';
import { esc } from '../../src/ui/tekst.ts';
import { type Save, saveLabel } from '../../src/ui/zapis.ts';
import { applyApts, settleApts } from '../../src/world/apts.ts';
import { nazwaBudynkuEn } from '../../src/world/classify.en.ts';
import type { Geo } from '../../src/world/geo.ts';
import { loadAddress, loadDemo } from '../../src/world/load.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { mockBlock, mockBlockM2, mockHouse } from './interior-mock.ts';
import { POLSKIE, polskieSlowa } from './po-angielsku.ts';

afterEach(() => {
  ustawJezyk('pl');
  vi.unstubAllGlobals();
});

/** to samo w obu językach: najpierw po polsku, potem po angielsku (język wraca do polskiego) */
function obaJezyki<T>(f: () => T): { pl: T; en: T } {
  ustawJezyk('pl');
  const pl = f();
  ustawJezyk('en');
  const en = f();
  ustawJezyk('pl');
  return { pl, en };
}

/** dozwolone napisy w surowej i uciekanej postaci (HTML karty ucieka tekst ze stanu) */
const dozwolone = (...s: (string | undefined)[]): string[] => s.flatMap((x) => (x ? [x, esc(x)] : []));

const osoba = (extra: Partial<SimPerson> = {}): SimPerson => ({
  pawn: 3,
  osoba: 4,
  id: 's5',
  name: 'Anna Kowalska',
  first: 'Anna',
  f: true,
  age: 52,
  prof: 'Pielęgniarka',
  skills: { med: 2, cieplo: 1 },
  traits: ['lubiany', 'klotliwy'],
  needs: { food: 70, warm: 20, rest: 40, health: 100, safe: 60, mood: 65 },
  moods: [
    { why: 'Ciepły posiłek', d: 4, until: 50 },
    { why: 'Spalili moje łóżko', d: -18, until: 900 },
    { why: 'Śmierć: Józef', d: -10, until: 900 },
  ],
  job: null,
  sam: false,
  praca: { prio: [1, 3, 3, 3, 3, 3, 3, 3, 0], stale: null, zaSiatke: false },
  doing: 'Stoi.',
  asleep: false,
  inside: false,
  tile: 0,
  carry: 0,
  away: false,
  post: null,
  weapon: null,
  ammo: null,
  bite: null,
  maimed: false,
  ...extra,
});
const RODZINA = 'mąż Marek (54), córka Agnieszka (23), syn Jaś (11)';
const HISTORIA = 'Przyjechała na osiedle z mężem w latach dziewięćdziesiątych. Zna wszystkich z klatki.';
const generowana = (extra: Partial<SimPerson> = {}): SimPerson =>
  osoba({ ref: 'o17', rodzina: RODZINA, story: HISTORIA, ...extra });
const IMIONA = ['Anna Kowalska', 'Anna', 'Józef'];

describe('karta osoby po angielsku', () => {
  it('zarząd: zawód, wiek, umiejętności, cechy z opisem, potrzeby, nastroje, broń i przycisk zmiany', () => {
    // opis pracy jak z odczytu po angielsku (obaJezyki wraca do polskiego, więc przed przełączeniem)
    const p = osoba({ doing: jobTextEn('Stoi i czeka na polecenie.') });
    ustawJezyk('en');
    const html = personCard(p, 0, 'Tonight: asleep.');
    expect(polskieSlowa(html, IMIONA)).toEqual([]);
    expect(html).toContain('<p class="sub">Nurse, 52</p>');
    expect(html).toContain('Medicine 2');
    expect(html).toContain('Heating 1');
    expect(html).toContain('title="Trust +0.3 a day.">Well-liked</span>');
    expect(html).toContain('>Quarrelsome</span>');
    for (const n of ['Fed', 'Warmth', 'Energy', 'Health', 'Safety', 'Mood']) expect(html).toContain(`>${n}</span>`);
    expect(html).toContain('<span>They burned my bed</span>');
    expect(html).toContain('<span>Józef died</span>');
    expect(html).toContain('<span>Hot meal</span>');
    expect(html).toContain('title="1 h left"');
    expect(html).toContain('Weapon: <b>bare hands</b>');
    expect(html).toContain('data-card="arm">Swap</button>');
    expect(html).toContain('Standing by for orders.');
    // tej osoby nie ma w generatorze: bez napisu o fikcji i bez zmiany imienia
    expect(html).not.toContain('fikcja');
  });

  it('osoba z generatora: rodzina, historia i fikcja; historia i rodzina zostają w języku stanu', () => {
    ustawJezyk('en');
    const cases: [boolean, CardOpts][] = [
      [false, {}],
      [true, { lokator: true }],
      [false, { imie: false }],
    ];
    for (const [open, opts] of cases) {
      const html = personCard(generowana(), 0, undefined, open, opts);
      expect(polskieSlowa(html, [...IMIONA, ...dozwolone(RODZINA, HISTORIA)])).toEqual([]);
      expect(html).toContain('<p class="sub gen">Nurse, 52</p>');
      expect(html).toContain('<span class="rodzina-k">Family:</span>');
      expect(html).toContain(`<p class="fikcja">${FIKCJA_EN}</p>`);
      expect(html).toContain(open ? 'title="Show less"' : 'title="Whole story"');
      expect(html.includes('data-card="imie"')).toBe(opts.imie !== false);
    }
    expect(personCard(generowana(), 0)).toMatch(/data-card="imie" title="[^"]+">Rename<\/button>/);
  });

  it('angielskie teksty osoby z generatora z opts.en zamiast polskich ze stanu', () => {
    ustawJezyk('en');
    const en = { prof: 'retired nurse', story: 'Came to the estate in the nineties.', rodzina: 'husband Marek (54)' };
    const html = personCard(generowana(), 0, undefined, true, { en });
    expect(polskieSlowa(html, IMIONA)).toEqual([]);
    expect(html).toContain('<p class="sub gen">retired nurse, 52</p>');
    expect(html).toContain('husband Marek (54)');
    expect(html).toContain('Came to the estate in the nineties.');
    // po polsku opts.en nic nie zmienia
    ustawJezyk('pl');
    expect(personCard(generowana(), 0, undefined, true, { en })).toBe(personCard(generowana(), 0, undefined, true));
  });

  it('tryb zombie: rewolwer z amunicją, ugryzienie, amputacja, kikut i gołe ręce', () => {
    const w = mockBlock();
    const sim = new Sim(w, createSim(w, 3, { core: 2, mode: 'zombie' }));
    const [p, q] = sim.st.pawns.filter((x) => x.kind === 'core');
    const card = () => personCard(snapshot(sim.st, w).people.find((x) => x.pawn === p.id)!, sim.st.tick);
    const names = sim.st.people.flatMap((o) => [o.name, o.first]);
    ustawJezyk('en');
    expect(card()).toContain('Weapon: <b>revolver</b> (12 rounds)');
    infect(sim.st, p, true);
    const bitten = card();
    expect(polskieSlowa(bitten, names)).toEqual([]);
    expect(bitten).toMatch(/Bitten on the arm 0 min ago\. The fever will kill (her|him) in 18 h\./);
    expect(bitten).toContain('data-card="amputate"');
    expect(bitten).toContain('>Amputate</button>');
    for (let k = 0; k < 1700; k++) sim.step();
    if (sim.st.pawns.includes(p)) expect(card()).toMatch(/Bitten on the arm 2 h 0\d min ago\./);
    const other = snapshot(sim.st, w).people.find((x) => x.pawn === q.id)!;
    const maimed = personCard({ ...other, maimed: true }, sim.st.tick);
    expect(maimed).toContain('title="After an amputation: worse aim">stump</span>');
    expect(personCard({ ...other, weapon: null }, sim.st.tick)).toContain('bare hands');
    expect(personCard({ ...other, weapon: 'strzelba', ammo: 1 }, sim.st.tick)).toContain('(1 buckshot shell)');
    expect(personCard({ ...other, weapon: 'kusza', ammo: 7 }, sim.st.tick)).toContain('crossbow</b> (7 bolts)');
    // karta mieszkańca: ugryzienie bez przycisku
    const lok = personCard(
      { ...other, bite: { at: 0, limb: false, left: 800, amputate: true } },
      100,
      undefined,
      false,
      {
        lokator: true,
      },
    );
    expect(lok).toContain('Bitten 7 min ago. The fever will kill');
    expect(lok).not.toContain('data-card="amputate"');
    expect(polskieSlowa(maimed + lok, names)).toEqual([]);
  });

  it('grupa i historia', () => {
    ustawJezyk('en');
    expect(groupCard(['Anna', 'Jan'], false)).toBe(
      '<h2>Selected: 2</h2><p class="sub">Anna, Jan</p><p class="doing">Right-click a spot to give everyone an order.</p>',
    );
    expect(groupCard(['Anna'], true)).toContain('Tap a spot to give everyone an order.');
    expect(storyHtml('Story.', false)).toContain('title="Whole story"');
    expect(storyHtml('Story.', true)).toContain('title="Show less"');
  });

  it('każda broń, amunicja i pasek potrzeb mają angielską nazwę bez polskich liter', () => {
    for (const k of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]) {
      expect(WEAPONS_EN[k]?.name, k).toBeTruthy();
      expect(`${WEAPONS_EN[k].name} ${WEAPONS_EN[k].the}`).not.toMatch(POLSKIE);
    }
    for (const k of Object.keys(AMMO_NAMES) as (keyof typeof AMMO_NAMES)[])
      expect(Object.values(AMMO_EN[k]).join(' ')).not.toMatch(POLSKIE);
    for (const k of Object.keys(NEED_LABELS) as (keyof typeof NEED_LABELS)[])
      expect(NEED_LABELS_EN[k], k).toMatch(/^[A-Z][a-z]+$/);
  });
});

/** opis pracy po angielsku dla polskiego opisu prostej sytuacji (karta z ręcznie złożoną osobą) */
function jobTextEn(pl: string): string {
  const w = mockBlock();
  const st = createSim(w, 3, { core: 1 });
  const p = st.pawns[0];
  p.job = null;
  p.path = [];
  p.pi = 0;
  const { pl: a, en } = obaJezyki(() => jobText(st, w, p));
  expect(a).toBe(pl);
  return en;
}

describe('karta na prawdziwych osobach z generatora (Przymorze, Lanciego) po angielsku', () => {
  const PUBLIC = path.resolve(import.meta.dirname, '../../public');
  const plikowy = (async (adr: string) => {
    const plik = path.join(PUBLIC, adr);
    if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
    return new Response(fs.readFileSync(plik));
  }) as unknown as typeof fetch;
  const osoby: { kto: SimPerson; lokator: boolean; tick: number }[] = [];
  let odm: DaneMieszkancow['odmiana'];

  beforeAll(async () => {
    for (const nazwa of ['przymorze', 'lanciego']) {
      const surowe = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${nazwa}.json`), 'utf8')) as {
        geo: Geo;
        addr: string;
        street: string;
      };
      const dane = await wczytajDaneMieszkancow(surowe.geo.c[0], surowe.geo.c[1], plikowy);
      if (!dane) throw new Error(`brak danych mieszkańców dla ${nazwa}`);
      odm = dane.odmiana;
      const geo = oznaczGeo(surowe.geo, budynkiZCzlonkami(surowe.geo, dane.gmina, dane.kraj));
      const seed = Number.parseInt(hashString(surowe.addr), 16) || 2051;
      const world = buildWorld(geo, { seed, street: surowe.street });
      const wynik = lokatorzyGry(world, geo, dane, { core: 4 });
      if (!wynik) throw new Error(`lokatorzyGry dało null dla ${nazwa}`);
      applyApts(world, settleApts(world, wynik.stany));
      const sim = new Sim(world, createSim(world, seed, { core: 4, mieszkancy: wynik }));
      ustawJezyk('en');
      const snap = snapshot(sim.st, world);
      ustawJezyk('pl');
      for (const kto of snap.people) osoby.push({ kto, lokator: false, tick: sim.st.tick });
      for (const kto of snap.lokatorzy) osoby.push({ kto, lokator: true, tick: sim.st.tick });
    }
  });

  it('karty zarządu i mieszkańców bez polskich słów poza imionami i tekstami ze stanu', () => {
    expect(osoby.some((o) => o.lokator)).toBe(true);
    ustawJezyk('en');
    for (const { kto, lokator, tick } of osoby) {
      const html = personCard(kto, tick, undefined, true, { lokator });
      const prof = zawodEn(kto.prof) === kto.prof ? kto.prof : undefined;
      expect(polskieSlowa(html, dozwolone(kto.name, kto.first, kto.story, kto.rodzina, prof)), kto.name).toEqual([]);
      expect(html, kto.name).toContain(FIKCJA_EN);
      expect(html, kto.name).toContain(`, ${kto.age}</p>`);
    }
    // opis pracy przyszedł z odczytu już po angielsku: mieszkaniec stoi, zarząd czeka na polecenie
    expect(osoby.some((o) => o.lokator && o.kto.doing === 'Standing around.')).toBe(true);
    expect(osoby.some((o) => !o.lokator && o.kto.doing === 'Standing by for orders.')).toBe(true);
  });

  it('edytor imienia: angielskie podpisy, polskie formy z jednym zdaniem o polskiej wersji', () => {
    ustawJezyk('en');
    for (const [imie, f] of [
      ['Halina', true],
      ['Marcin', false],
      ['Xyz', true],
    ] as const) {
      const formy = odmien(imie, f ? 'K' : 'M', odm.tabela, odm.koncowki).formy;
      for (const zapisana of [undefined, { imie, formy, f }]) {
        const html = edytorImienia({ ref: 'o1', first: imie, f }, odm, zapisana);
        expect(polskieSlowa(html, [imie, ...Object.values(formy)]), imie).toEqual([]);
        expect(html).toContain('<h2>Rename</h2>');
        expect(html).toContain('The Polish forms below are for the Polish version');
        expect(html).toContain('data-card="imie-zapisz">Save</button>');
        expect(html).toContain('data-card="imie-anuluj">Cancel</button>');
        expect(html.includes('>Restore</button>')).toBe(!!zapisana);
        expect(html).toContain(FIKCJA_EN);
        expect(html).toContain('title="Genitive: of whom?"><span class="imie-k">gen.</span>');
      }
    }
    expect(edytorImienia({ ref: 'o1', first: 'Xyz', f: true }, odm)).toMatch(
      /<p class="imie-uwaga">The forms in yellow are guesses\. Check them\.<\/p>/,
    );
    expect(PRZYPADKI.map((c) => przedPolem(c, true))).toEqual([
      'name',
      'gen.',
      'dat.',
      'acc.',
      'inst.',
      'loc.',
      'voc.',
    ]);
  });
});

describe('sprawdzanie imienia i wyprowadzka po angielsku', () => {
  const BOZ: Record<string, string> = Object.fromEntries(
    PRZYPADKI.map((c, i) => [c, ['Bożenka', 'Bożenki', 'Bożence', 'Bożenkę', 'Bożenką', 'Bożence', 'Bożenko'][i]]),
  );

  it('błędy w polach: angielskie komunikaty z nazwą formy, te same pola co po polsku', () => {
    const cases: [Record<string, string>, string][] = [
      [{ ...BOZ, mian: '' }, 'Type in a name.'],
      [{ ...BOZ, mian: 'A'.repeat(25) }, 'The name can be at most 24 characters long.'],
      [{ ...BOZ, mian: 'Hal1na' }, 'The name can only contain letters, spaces, hyphens and apostrophes.'],
      [{ ...BOZ, dop: '' }, 'Fill in the genitive form.'],
      [
        { ...BOZ, narz: '<b>Bożenką</b>' },
        'The instrumental form can only contain letters, spaces, hyphens and apostrophes.',
      ],
      [{ ...BOZ, wol: 'B'.repeat(31) }, 'The vocative form can be at most 30 characters long.'],
    ];
    for (const [pola, msg] of cases) {
      const { pl, en } = obaJezyki(() => zmianaZPol(pola, true));
      expect(en).toEqual({ blad: msg, pole: (pl as { pole: string }).pole });
      expect(polskieSlowa(msg)).toEqual([]);
    }
    // dobre imię daje tę samą zmianę w obu językach
    const dobre = obaJezyki(() => zmianaZPol(BOZ, true, 'Halina'));
    expect(dobre.en).toEqual(dobre.pl);
  });

  it('wyprowadzka do kroniki w obu językach', () => {
    const z: ZmianaImienia = { imie: 'Halina', formy: BOZ as unknown as ZmianaImienia['formy'], f: true };
    expect(wyprowadzkaTx(z)).toEqual({ pl: 'Halina wyprowadziła się.', en: 'Halina moved out.' });
    expect(wyprowadzkaTx({ ...z, imie: 'Marek', f: false }).en).toBe('Marek moved out.');
    ustawJezyk('en');
    // komunikat po polsku zostaje polski (kronika trzyma obie wersje)
    expect(wyprowadzka(z)).toBe('Halina wyprowadziła się.');
  });
});

describe('etykieta zapisu i nazwa budynku po angielsku', () => {
  it('saveLabel', () => {
    const w = mockBlock();
    for (const mode of ['zwykly', 'zombie'] as const) {
      const st = createSim(w, 3, { core: 2, mode });
      const save = { v: 1, at: 1, data: { name: 'Atrapia' }, seed: 3, sim: st, gov: newGov(3, mode), screen: 0 };
      const { pl, en } = obaJezyki(() => saveLabel(save as unknown as Save));
      expect(en).toBe(pl.replace('dzień', 'day'));
      expect(en).toBe(mode === 'zombie' ? 'Atrapia (zombie), day 1, 15:00' : 'Atrapia, day 1, 15:00');
    }
  });

  it('nazwa budynku z typu po angielsku, nazwy własne i adresy bez zmian', () => {
    expect(nazwaBudynkuEn('Blok nr 12')).toBe('Block 12');
    expect(nazwaBudynkuEn('Blok 3')).toBe('Block 3');
    expect(nazwaBudynkuEn('Garaże 2')).toBe('Garages 2');
    expect(nazwaBudynkuEn('Kościół nr 1a')).toBe('Church 1a');
    expect(nazwaBudynkuEn('Budynek 7')).toBe('Building 7');
    for (const n of ['Wołoska 12', 'Pawilon Handlowy', 'Dom Kultury 3', 'Szkoła Podstawowa nr 5', 'Blok'])
      expect(nazwaBudynkuEn(n)).toBe(n);
    // siedziby atrap bez ulicy: nazwa z typu i numeru
    for (const w of [mockBlock(), mockHouse()]) {
      const name = w.buildings[w.hq].name;
      expect(polskieSlowa(nazwaBudynkuEn(name)), name).toEqual([]);
    }
  });
});

/* ---------------------------------------------------------------- menu pod prawym przyciskiem */

const tileOf = (w: World, p: { x: number; y: number }) => Math.floor(p.y) * w.size + Math.floor(p.x);

/** rzecz na kafelku podwórka (stan to zwykły JSON, więc test może ją położyć sam, jak chain.test.ts) */
function put(st: SimState, w: World, tile: number, kind: string, n: number, fuel = 0): Thing {
  const t: Thing = {
    id: st.nextThing++,
    kind,
    x: tile % w.size,
    y: Math.floor(tile / w.size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel,
    by: -1,
    owner: -1,
  };
  st.things.push(t);
  return t;
}

/** wolne kafelki podwórka (bez rzeczy i bez blokady), od najbliższego drzwiom siedziby */
function freeYard(st: SimState, w: World): number[] {
  const used = new Set<number>();
  for (const t of st.things)
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) used.add(y * w.size + x);
  return (w.fence?.yard ?? []).filter((i) => !w.blocked[i] && !used.has(i));
}

interface Zebrane {
  /** polski napis → angielskie napisy */
  pary: Map<string, Set<string>>;
  /** angielski napis → polskie napisy */
  odwrotnie: Map<string, Set<string>>;
  rodzaje: Set<string>;
}

/** wszystkie kafelki świata: polecenia w obu językach muszą być te same, napisy zbieramy parami */
function zbierzMenu(st: SimState, w: World, z: Zebrane, ids?: number[]): void {
  const core = ids ?? st.pawns.filter((p) => p.kind === 'core').map((p) => p.id);
  for (let tile = 0; tile < w.size * w.size; tile++) {
    const { pl, en } = obaJezyki(() => commandsAt(st, w, core, tile));
    const bez = (m: MenuItem[]) => m.map(({ label: _, ...r }) => r);
    expect(bez(en), `kafelek ${tile}`).toEqual(bez(pl));
    pl.forEach((m, k) => {
      const e = en[k].label;
      z.rodzaje.add(m.cmd.t);
      if (!z.pary.has(m.label)) z.pary.set(m.label, new Set());
      z.pary.get(m.label)!.add(e);
      if (!z.odwrotnie.has(e)) z.odwrotnie.set(e, new Set());
      z.odwrotnie.get(e)!.add(m.label);
    });
  }
}

/** tick godziny h pierwszego dnia (gra zaczyna się o 15:00, 800 ticków na godzinę) */
const hour = (h: number) => Math.round((h - 15) * 800);

/** szabrownik na podwórku po napadzie bez warty o 23:00 (jak breakIn w walka.test.ts) */
function zNapadem(w: World, st: SimState, sim: Sim): void {
  const hole = st.fence!.holes[0];
  sim.push({ t: 'raid', ids: [], at: hour(23), post: `d${hole.id}` });
  const yard = new Set(w.fence!.yard);
  while (st.tick < hour(25) && !st.pawns.some((p) => p.kind === 'szabrownik' && yard.has(tileOf(w, p)))) sim.step();
}

describe('menu pod prawym przyciskiem po angielsku', () => {
  const z: Zebrane = { pary: new Map(), odwrotnie: new Map(), rodzaje: new Set() };

  beforeAll(() => {
    // zwykły tryb: drewno, ognisko, uszkodzona siatka, szabrownik na podwórku, brama otwarta i zamknięta
    {
      const w = mockBlock();
      const st = createSim(w, 3, { core: 4 });
      st.tick = hour(22);
      const sim = new Sim(w, st);
      const free = freeYard(st, w);
      put(st, w, free[10], 'drewno', 5);
      put(st, w, free[20], 'ognisko', 0, 100);
      put(st, w, free[30], 'deski', 6);
      put(st, w, free[40], 'zlom', 6);
      sim.damageFence(w.fence!.tiles[Math.floor(w.fence!.tiles.length / 3)], 60);
      zNapadem(w, st, sim);
      expect(st.pawns.some((p) => p.kind === 'szabrownik')).toBe(true);
      zbierzMenu(st, w, z);
      st.fence!.gateOpen = !st.fence!.gateOpen;
      zbierzMenu(st, w, z);
    }
    // tryb zombie: szwendacze pod siatką, zwłoki, które wstaną, warta przy siatce
    {
      const w = mockBlock();
      const st = createSim(w, 3, { core: 4, mode: 'zombie' });
      const sim = new Sim(w, st);
      const free = freeYard(st, w);
      put(st, w, free[12], 'zwloki', 1, 500);
      sim.spawnAtFence(6, w.buildings[w.hq].entrances[0].out);
      sim.damageFence(w.fence!.tiles[Math.floor(w.fence!.tiles.length / 2)], 50);
      zbierzMenu(st, w, z);
    }
    // dom bez klatki
    {
      const w = mockHouse();
      const st = createSim(w, 7, { core: 2 });
      put(st, w, freeYard(st, w)[5], 'drewno', 3);
      zbierzMenu(st, w, z);
    }
    // M2: puste mieszkania do przeszukania i zajęcia, naprawy z materiałów, potem rozbiórka po przeszukaniu
    {
      const w = mockBlockM2();
      const st = createSim(w, 3, { core: 2 });
      const free = freeYard(st, w);
      put(st, w, free[8], 'deski', 10);
      put(st, w, free[9], 'zlom', 10);
      put(st, w, free[11], 'czesci', 10);
      zbierzMenu(st, w, z);
      for (const a of st.apts)
        if (a.state === 'puste') a.searched = w.interior.rooms.filter((r) => r.apt === a.apt).map((r) => r.id);
      zbierzMenu(st, w, z);
    }
  }, 120_000);

  it('każdy polski napis ma dokładnie jeden angielski i na odwrót, bez polskich słów', () => {
    expect(z.pary.size).toBeGreaterThan(30);
    for (const [pl, en] of z.pary) {
      expect([...en], pl).toHaveLength(1);
      const e = [...en][0];
      expect(e, pl).not.toBe(pl);
      expect(polskieSlowa(e), `${pl} → ${e}`).toEqual([]);
      expect(e[0], e).toBe(e[0].toUpperCase());
    }
    for (const [en, pl] of z.odwrotnie) expect([...pl], en).toHaveLength(1);
  });

  it('obejmuje polecenia i napisy z polskich testów menu', () => {
    for (const t of [
      'attack',
      'finish',
      'haul',
      'refuel',
      'guard',
      'patch',
      'brace',
      'craft',
      'gate',
      'chop',
      'cook',
      'burn',
      'dismantle',
      'repair',
      'search',
      'claim',
      'campfire',
      'move',
    ])
      expect(z.rodzaje, t).toContain(t);
    for (const pl of [
      'Atakuj szabrownika',
      'Atakuj szwendacza',
      'Dobić',
      'Zanieść do składu',
      'Dołożyć do kozy',
      'Dołożyć do ogniska',
      'Czuwać przy kozie',
      'Załatać dziurę',
      'Pilnować tutaj',
      'Wzmocnić siatkę',
      'Pilnować przy siatce',
      'Zrobić dzidę',
      'Pilnować bramy',
      'Zamknąć bramę',
      'Otworzyć bramę',
      'Ściąć drzewo',
      'Gotować',
      'Spalić łóżko',
      'Spalić meblościankę',
      'Rozebrać śmieci',
      'Rozebrać lodówkę',
      'Naprawić okno',
      'Przeszukać kuchnię',
      'Zająć mieszkanie',
      'Rozpalić ognisko tutaj',
      'Idź tu',
    ])
      expect(z.pary.has(pl), pl).toBe(true);
    const en = (pl: string) => [...z.pary.get(pl)!][0];
    expect(en('Ściąć drzewo')).toBe('Chop down the tree');
    expect(en('Dołożyć do kozy')).toBe('Feed the stove');
    expect(en('Idź tu')).toBe('Go here');
    expect(en('Spalić meblościankę')).toBe('Burn the wall unit');
    expect(en('Rozebrać śmieci')).toBe('Clear the rubbish');
    expect(en('Rozebrać lodówkę')).toBe('Take apart the fridge');
  });

  it('angielskie tablice nazw mają wszystkie klucze polskich, bez polskich liter', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(FURNITURE_EN)).toEqual(keys(FURNITURE_ACC));
    expect(keys(BURNABLE).every((k) => FURNITURE_EN[k])).toBe(true);
    expect(keys(THING_EN)).toEqual(keys(THING_ACC));
    expect(keys(ROOM_EN)).toEqual(keys(INSUL));
    expect(keys(BUILD_EN)).toEqual(keys(BUILDS));
    expect(keys(MAT_EN)).toEqual(keys(MAT_ACC));
    expect(MATS.every((m) => MAT_EN[m])).toBe(true);
    expect(keys(REPAIR_EN)).toEqual(keys(REPAIR));
    for (const t of [FURNITURE_EN, THING_EN, ROOM_EN, BUILD_EN, MAT_EN, REPAIR_EN])
      for (const v of Object.values(t)) expect(v).not.toMatch(POLSKIE);
  });
});

/* ---------------------------------------------------------------- opisy prac */

const JOBS: JobKind[] = [
  'go',
  'chop',
  'haul',
  'refuel',
  'warm',
  'eat',
  'sleep',
  'burn',
  'cook',
  'stay',
  'guard',
  'patch',
  'campfire',
  'build',
  'search',
  'dismantle',
  'repair',
  'claim',
  'arrive',
  'leave',
  'raid',
  'fight',
  'zombie',
  'finish',
  'amputate',
  'craft',
  'brace',
];

describe('opisy prac (jobText) po angielsku', () => {
  it('każda praca w każdej fazie, z każdym rodzajem celu, ma angielski opis bez polskich słów', () => {
    const w = mockBlockM2();
    const st = createSim(w, 3, { core: 2 });
    const free = freeYard(st, w);
    put(st, w, free[3], 'ognisko', 0, 100);
    // po jednej rzeczy każdego rodzaju i plan każdej budowli jako cele
    const targets = new Set<number>([-3, -2, -1, 0, 1, 2, 3, 4, 5, 99_999, w.dryTree]);
    const kinds = new Set<string>();
    for (const t of st.things)
      if (!kinds.has(t.kind)) {
        kinds.add(t.kind);
        targets.add(t.id);
      }
    (Object.keys(BUILDS) as BuildKind[]).forEach((kind, k) => {
      const id = st.nextThing++;
      st.builds.push({ id, kind, x: free[20 + k] % w.size, y: 0, rot: 0, need: {}, have: {}, work: 0, by: -1 });
      targets.add(id);
    });
    for (let r = 0; r < w.interior.rooms.length; r++) targets.add(r);
    const p: Pawn = st.pawns.find((q) => q.kind === 'core')!;
    const seen = new Map<string, string>();
    // materiał (what) liczy się tylko przy naprawie i budowie, liczba (n) tylko przy jedzeniu
    const MATY = ['', 'deski', 'zlom', 'czesci', 'drewno', 'jedzenie', 'leki', 'piesci'];
    for (const t of JOBS)
      for (let phase = 0; phase <= 5; phase++)
        for (const target of targets)
          for (const what of t === 'repair' || t === 'build' ? MATY : [''])
            for (const n of t === 'eat' ? [0, 1] : [0]) {
              p.job = { t, target, tile: 0, phase, from: -1, t0: 0, until: 0, order: false, n, what };
              const { pl, en } = obaJezyki(() => jobText(st, w, p));
              seen.set(pl, en);
              expect(en, `${t}/${phase}/${target}/${what}: ${pl}`).not.toBe(pl);
              expect(polskieSlowa(en), `${t}/${phase}: ${pl} → ${en}`).toEqual([]);
            }
    // bez pracy: idzie, czeka na polecenie (zarząd), stoi (mieszkaniec)
    p.job = null;
    for (const [kind, path] of [
      ['core', [1, 2]],
      ['core', []],
      ['resident', []],
    ] as const) {
      const q = { ...p, kind, path: [...path], pi: 0 } as Pawn;
      const { pl, en } = obaJezyki(() => jobText(st, w, q));
      seen.set(pl, en);
      expect(polskieSlowa(en)).toEqual([]);
    }
    expect(seen.size).toBeGreaterThan(90);
    expect(seen.get('Rąbie suche drzewo.')).toBe('Chopping down the dead tree.');
    expect(seen.get('Stoi i czeka na polecenie.')).toBe('Standing by for orders.');
    expect(seen.get('Rozbiera lodówkę.')).toBe('Taking apart the fridge.');
    expect(seen.get('Idzie rozebrać śmieci.')).toBe('Going to clear the rubbish.');
    // tekst, który bot i polskie testy widzą w Node, zostaje polski
    p.path = [];
    p.pi = 0;
    expect(jobText(st, w, p)).toBe('Stoi i czeka na polecenie.');
  });

  it('prawdziwy przebieg: opisy po angielsku bez polskich słów, a przebieg ten sam co bez nich', () => {
    const w = mockBlock();
    const run = (en: boolean) => {
      const st = createSim(w, 11, { core: 4, mode: 'zombie' });
      const sim = new Sim(w, st);
      const core = st.pawns.filter((p) => p.kind === 'core');
      sim.push({ t: 'chop', ids: [core[0].id], tree: w.dryTree });
      sim.push({ t: 'guard', ids: [core[1].id], post: 'siatka' });
      sim.spawnAtFence(4, w.buildings[w.hq].entrances[0].out);
      const texts = new Set<string>();
      for (let k = 0; k < 6000; k++) {
        sim.step();
        if (!en || k % 50) continue;
        ustawJezyk('en');
        for (const p of st.pawns) texts.add(jobText(st, w, p));
        commandsAt(
          st,
          w,
          core.map((p) => p.id),
          core[0] ? tileOf(w, core[0]) : 0,
        );
        snapshot(st, w);
        ustawJezyk('pl');
      }
      return { hash: sim.hash(), texts };
    };
    const en = run(true);
    expect(en.hash).toBe(run(false).hash);
    for (const t of en.texts) expect(polskieSlowa(t), t).toEqual([]);
    expect(en.texts.size).toBeGreaterThan(5);
  });
});

/* ---------------------------------------------------------------- wczytywanie adresu */

describe('komunikaty wczytywania adresu po angielsku', () => {
  const MIEJSCE = ['Wołoska', 'Mokotów', 'Warszawa', 'Polska'];
  const nominatim = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const ADRES = [
    {
      lat: '52.19',
      lon: '21.0',
      display_name: 'Wołoska 12, Mokotów, Warszawa, Polska',
      address: { road: 'Wołoska', suburb: 'Mokotów', city: 'Warszawa' },
    },
  ];

  it('status po kolei: adres, mapa, kafelki, zapasowe serwery; błąd zapasu przychodzi z serwera', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('nominatim')) return nominatim(ADRES);
      if (url.endsWith('/planet')) return nominatim({ tiles: ['https://kafelki.test/{z}/{x}/{y}.pbf'] });
      return new Response('', { status: url.includes('kafelki.test') ? 500 : 503 });
    });
    ustawJezyk('en');
    const status: string[] = [];
    await expect(loadAddress('Wołoska 12', (s) => status.push(s))).rejects.toThrow('HTTP 503');
    expect(status[0]).toBe('Looking up the address…');
    expect(status[1]).toBe('Found: Wołoska 12, Mokotów, Warszawa. Downloading the map…');
    expect(status[2]).toMatch(/^Found: Wołoska 12, Mokotów, Warszawa\. Downloading \d+ map tiles?…$/);
    expect(status[3]).toMatch(/The tile server isn’t answering, asking Overpass instead\./);
    expect(status.slice(4)).toEqual(Array(3).fill('The map server isn’t answering, trying a backup…'));
    for (const s of status) expect(polskieSlowa(s, MIEJSCE), s).toEqual([]);
  });

  it('błędy wyszukiwarki, przykładu i pustej mapy', async () => {
    ustawJezyk('en');
    vi.stubGlobal('fetch', async () => nominatim([]));
    await expect(loadAddress('Nigdzie 1', () => {})).rejects.toThrow(
      'Couldn’t find that address. Try adding the town, e.g. “Wołoska 12, Warszawa”.',
    );
    vi.stubGlobal('fetch', async () => nominatim({}, 503));
    await expect(loadAddress('Wołoska 12', () => {})).rejects.toThrow('The address search answered with error 503.');
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(loadDemo('xyz')).rejects.toThrow('No such example: xyz.');
    // z polskim językiem te same błędy po polsku
    ustawJezyk('pl');
    await expect(loadDemo('xyz')).rejects.toThrow('Nie ma takiego przykładu: xyz');
    ustawJezyk('en');
    const g: Geo = {
      c: [0, 0],
      b: [],
      r: [
        {
          l: [
            [-60, 0],
            [60, 0],
          ],
          h: 'residential',
        },
      ],
      a: [],
      w: [],
      poi: [],
    };
    let msg = '';
    try {
      buildWorld(g, { seed: 1, size: 128 });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe(
      'There isn’t a single building on the map here. Try an address closer to houses or blocks of flats.',
    );
  });
});
