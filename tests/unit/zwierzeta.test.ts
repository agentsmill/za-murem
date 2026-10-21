/* Pies i kot jako pionki (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Pies i kot”): zarząd z flagą
   `dog` albo `cat` wysyła `GovEffects.zwierze`, symulacja wystawia pionek rodzaju `pies` albo `kot` i jest właścicielem jego
   życia (`SimState.zwierzeta`). Pies przychodzi zza siatki bramą (także zamkniętą), za dnia kręci się po podwórku do 10 m od
   bramy, nocą leży przy niej, szczeka na wroga w 15 m (w trybie zombie z hałasem 12 m), ginie od szwendacza bez zwłok i
   wstawania; kot śpi przy kozie zarządu, nie ginie. Zwierząt nie liczy żaden odczyt ludzi. Świat to blok M2 z siatką i bramą
   (128 m), dla kota też dom z demo „zielonki”. Rdzeń wysyłam na wyprawę (`away`), gdy test ma zostać sam na sam z psem. */

import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import type { GovEffects, PlanGoscia } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { chooseEvent, govUpdate, loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { frontTile, houseOf, inHomeApt } from '../../src/sim/house.ts';
import { gateTiles } from '../../src/sim/perimeter.ts';
import { createSim, type Pawn, RISE_TICKS, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { PIES_HP, PIES_OBSZAR, SZCZEK_CD, SZCZEK_HALAS, SZCZEK_NAPIS } from '../../src/sim/zwierzeta.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { demoWorld } from './miejsce-pomoc.ts';

const w = mockBlockM2();
const size = w.size;
const yard = new Set(w.fence.yard);
const gate = gateTiles(w);
/** środek bramy w metrach */
const GX = gate.reduce((a, g) => a + (g % size) + 0.5, 0) / gate.length;
const GY = gate.reduce((a, g) => a + Math.floor(g / size) + 0.5, 0) / gate.length;
const FAR = tickAt(30, 10);

const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const kind = (st: SimState, k: string): Pawn[] => st.pawns.filter((p) => p.kind === k);
const pies = (st: SimState) => kind(st, 'pies')[0];
const kot = (st: SimState) => kind(st, 'kot')[0];
const odBramy = (p: { x: number; y: number }) => Math.sqrt((p.x - GX) ** 2 + (p.y - GY) ** 2);
const cheb = (a: number, b: number) =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));

/** gra o danej porze; świat bez obcych (nikt poza psem i kotem nie przychodzi), opcjonalnie tryb zombie albo obcy */
function gra(
  day: number,
  hour: number,
  opt: { zombie?: boolean; obcy?: boolean; seed?: number; world?: typeof w } = {},
): Sim {
  const world = opt.world ?? w;
  const st = createSim(world, opt.seed ?? 3, {
    core: 2,
    ...(opt.obcy ? { obcy: true } : {}),
    ...(opt.zombie ? { mode: 'zombie' as const } : {}),
  });
  const sim = new Sim(world, st);
  st.tick = tickAt(day, hour);
  if (st.obcy) {
    st.obcy.next = FAR;
    st.obcy.wnext = FAR;
    st.obcy.enext = FAR;
  }
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 30 * TICKS_PER_HOUR;
  if (opt.zombie) st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  return sim;
}

/** zarząd syci się, grzeje i wysypia, żeby nie szukał jedzenia ani łóżka; szwendacze z zegara trybu zombie znikają
    (poza wskazanymi) */
function przygotuj(st: SimState, zostaw: readonly Pawn[]): void {
  for (const p of st.pawns)
    if (p.kind === 'core' && !p.away && p.needs) {
      p.needs.food = 100;
      p.needs.warm = 100;
      p.needs.rest = 100;
    }
  if (st.mode === 'zombie') st.pawns = st.pawns.filter((p) => p.kind !== 'zombie' || zostaw.includes(p));
}

function run(sim: Sim, ok: () => boolean, max = 30000, zostaw: readonly Pawn[] = []): number {
  let k = 0;
  for (; k < max && !ok(); k++) {
    przygotuj(sim.st, zostaw);
    sim.step();
  }
  return k;
}

const wyslij = (sim: Sim, f: Partial<GovEffects>, world = w) => applyGov(sim.st, world, { ...emptyEffects(), ...f });
/** rdzeń na wyprawie: nikt z zarządu nie bije szwendacza i nie czuwa */
const rdzenPoza = (st: SimState) => {
  for (const p of st.pawns) if (p.kind === 'core') p.away = true;
};

/** dowolny kafelek ulicy (poza podwórkiem i budynkami) w odległości min–max m od punktu */
function ulicaWOdleglosci(x: number, y: number, min: number, max: number): number {
  for (let i = 0; i < size * size; i++) {
    if (w.blocked[i] || yard.has(i) || w.bid[i] >= 0) continue;
    const d = Math.sqrt(((i % size) + 0.5 - x) ** 2 + (Math.floor(i / size) + 0.5 - y) ** 2);
    if (d >= min && d <= max) return i;
  }
  throw new Error('brak kafelka ulicy w tej odległości');
}

describe('pies: wejście, dzień i noc', () => {
  it('przygarnięty pies przychodzi zza siatki i zostaje na podwórku przy bramie', () => {
    const sim = gra(2, 8);
    wyslij(sim, { zwierze: ['pies'] });
    // polecenie czeka na krok, jak każde
    expect(kind(sim.st, 'pies')).toHaveLength(0);
    sim.step();
    const p = pies(sim.st);
    expect(p, 'pionek psa po pierwszym kroku').toBeDefined();
    expect(yard.has(tileOf(p)), 'zaczyna za siatką').toBe(false);
    expect(sim.st.zwierzeta).toEqual({ pies: 'zyje' });
    // nie ma osoby, potrzeb ani miejsca w mieszkaniu
    expect(p.person).toBe(-1);
    expect(p.needs).toBeNull();
    expect(p.hp).toBe(PIES_HP);
    // wchodzi na podwórko bramą i potem tylko się tam kręci, najwyżej 10 m od środka bramy
    run(sim, () => yard.has(tileOf(p)), 3000);
    expect(yard.has(tileOf(p)), 'doszedł na podwórko').toBe(true);
    let najdalej = 0;
    const byl = new Set<number>();
    for (let k = 0; k < 6000; k++) {
      przygotuj(sim.st, []);
      sim.step();
      if (k % 20 !== 0) continue;
      expect(yard.has(tileOf(p)), `krok ${k}: na podwórku`).toBe(true);
      najdalej = Math.max(najdalej, odBramy(p));
      byl.add(tileOf(p));
    }
    expect(najdalej).toBeLessThanOrEqual(PIES_OBSZAR + 0.75);
    expect(byl.size, 'kręci się, nie stoi w miejscu').toBeGreaterThan(3);
  });

  it('brama na kłódkę go nie zatrzymuje, a reszta siatki tak', () => {
    const sim = gra(2, 8);
    sim.push({ t: 'gate', ids: [], open: false });
    sim.step();
    expect(sim.st.fence?.gateOpen).toBe(false);
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    expect(yard.has(tileOf(p))).toBe(false);
    run(sim, () => yard.has(tileOf(p)), 3000);
    expect(yard.has(tileOf(p)), 'przeszedł pod zamkniętą bramą').toBe(true);
    // droga psa wiedzie tylko przez kafelki bramy: nigdy przez siatkę
    const siatka = new Set(w.fence.tiles);
    for (let k = 0; k < 4000; k++) {
      sim.step();
      expect(siatka.has(tileOf(p)), `krok ${k}: nie w siatce`).toBe(false);
    }
  });

  it('nocą pies leży przy bramie od środka i nie rusza się do rana', () => {
    const sim = gra(2, 23);
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    run(sim, () => p.job?.what === 'lezy', 4000);
    expect(p.job?.what).toBe('lezy');
    expect(yard.has(tileOf(p)), 'leży na podwórku').toBe(true);
    expect(Math.min(...gate.map((g) => cheb(g, tileOf(p)))), 'przy bramie').toBeLessThanOrEqual(2);
    const gdzie = tileOf(p);
    run(sim, () => false, 4 * TICKS_PER_HOUR);
    expect(tileOf(p)).toBe(gdzie);
    expect(p.job?.what).toBe('lezy');
    // rano wstaje i zaczyna się kręcić
    run(sim, () => sim.st.tick >= tickAt(3, 8), 12 * TICKS_PER_HOUR);
    run(sim, () => p.job?.what !== 'lezy', 800);
    expect(p.job?.what).not.toBe('lezy');
  });
});

describe('pies: szczekanie', () => {
  /** pies na podwórku (dzień, tryb zwykły albo zombie), szwendacz dalej za siatką */
  function zSzwendaczem(zombie: boolean, daleko = 11) {
    const sim = gra(2, 12, { zombie });
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    run(sim, () => yard.has(tileOf(p)), 3000);
    const tile = ulicaWOdleglosci(p.x, p.y, daleko - 1, daleko);
    const z = spawnZombie(sim.st, w, tile, 0);
    return { sim, p, z };
  }

  it('szwendacz w 15 m: pies szczeka, w trybie zombie st.noise dostaje hałas 12 m', () => {
    const { sim, p, z } = zSzwendaczem(true);
    expect(sim.st.szczek).toBeUndefined();
    expect(sim.st.noise!.some((n) => n.r === SZCZEK_HALAS)).toBe(false);
    run(sim, () => !!sim.st.szczek, 200, [z]);
    expect(sim.st.szczek, 'pies zaszczekał w ciągu 10 s').toBeDefined();
    const halas = sim.st.noise!.filter((n) => n.r === SZCZEK_HALAS);
    expect(halas).toHaveLength(1);
    // hałas jest tam, gdzie pies
    expect(Math.abs(halas[0].x - p.x)).toBeLessThan(0.02);
    expect(Math.abs(halas[0].y - p.y)).toBeLessThan(0.02);
    expect(sim.st.szczek!.tick).toBe(sim.st.tick - 1);
  });

  it('w trybie zwykłym szczeka bez hałasu, a między szczeknięciami jest przerwa', () => {
    const { sim, z } = zSzwendaczem(false);
    const szczeki: number[] = [];
    let ostatni = -1;
    for (let k = 0; k < 40 * TICKS_PER_SECOND; k++) {
      przygotuj(sim.st, [z]);
      sim.step();
      const t = sim.st.szczek?.tick;
      if (t !== undefined && t !== ostatni) {
        szczeki.push(t);
        ostatni = t;
      }
      expect(
        sim.st.noise!.some((n) => n.r === SZCZEK_HALAS),
        'bez hałasu w trybie zwykłym',
      ).toBe(false);
    }
    expect(szczeki.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < szczeki.length; k++) expect(szczeki[k] - szczeki[k - 1]).toBeGreaterThanOrEqual(SZCZEK_CD);
    expect(SZCZEK_NAPIS).toBeLessThan(SZCZEK_CD);
  });

  it('w trybie zombie hałas nie dochodzi co krok: najwyżej jeden na przerwę', () => {
    const { sim, z } = zSzwendaczem(true);
    const dlugo = 30 * TICKS_PER_SECOND;
    let wpisy = 0;
    let poprzedni = -1;
    for (let k = 0; k < dlugo; k++) {
      przygotuj(sim.st, [z]);
      sim.step();
      for (const n of sim.st.noise!)
        if (n.r === SZCZEK_HALAS && n.until !== poprzedni) {
          wpisy++;
          poprzedni = n.until;
        }
    }
    expect(wpisy).toBeGreaterThanOrEqual(2);
    expect(wpisy).toBeLessThanOrEqual(Math.ceil(dlugo / SZCZEK_CD) + 1);
  });

  it('wróg dalej niż 15 m go nie rusza', () => {
    const { sim, z } = zSzwendaczem(false, 24);
    run(sim, () => false, 10 * TICKS_PER_SECOND, [z]);
    // szwendacz mógł podejść, ale 24 m w 10 s nie zrobi
    expect(sim.st.szczek).toBeUndefined();
  });

  it('gość pod bramą nie jest wrogiem: pies nie szczeka', () => {
    const sim = gra(2, 12, { obcy: true });
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    run(sim, () => yard.has(tileOf(p)), 3000);
    const plan: PlanGoscia = {
      id: 'g1',
      osoby: [{ ...makePerson(mulberry(5), new Set(), () => 901), id: 'g1p0' }],
      looks: [4],
      strona: 'n',
    };
    wyslij(sim, { gosc: plan });
    run(sim, () => sim.st.goscie?.[0]?.faza === 'brama', 8000);
    expect(sim.st.goscie?.[0]?.faza).toBe('brama');
    run(sim, () => false, 20 * TICKS_PER_SECOND);
    expect(odBramy(p)).toBeLessThan(15);
    expect(sim.st.szczek).toBeUndefined();
  });
});

describe('pies: ginie od szwendacza', () => {
  /** zombie na podwórku obok psa, rdzeń poza mapą (nikt nie przeszkadza) */
  function zabity() {
    const sim = gra(2, 12, { zombie: true });
    rdzenPoza(sim.st);
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    run(sim, () => yard.has(tileOf(p)), 3000);
    const blisko = w.fence.yard.find(
      (i) => !w.blocked[i] && w.bid[i] < 0 && cheb(i, tileOf(p)) >= 2 && cheb(i, tileOf(p)) <= 3,
    )!;
    expect(blisko).toBeDefined();
    const z = spawnZombie(sim.st, w, blisko, 0);
    run(sim, () => !pies(sim.st), 6000, [z]);
    return { sim, z };
  }

  it('pies zabity przez szwendacza nie wstaje i nie ma go w GovInput.dead', () => {
    const { sim, z } = zabity();
    const st = sim.st;
    expect(pies(st), 'pies zginął').toBeUndefined();
    expect(st.zwierzeta?.pies).toBe('zginal');
    // żadnych zwłok, wpisu zmarłych ani żałoby osiedla
    expect(st.things.filter((t) => t.kind === 'zwloki')).toHaveLength(0);
    expect(st.dead ?? []).toHaveLength(0);
    expect(st.tally?.deaths ?? 0).toBe(0);
    expect(st.tally?.killed ?? 0).toBe(0);
    for (const p of st.pawns) expect(p.moods.some((m) => m.why.startsWith('Śmierć'))).toBe(false);
    const i = govInput(st, w, 1000);
    expect(i.dead).toEqual([]);
    expect(i.zwierzeta).toEqual({ pies: 'zginal' });
    // po czasie, w którym zmarły wstałby, szwendaczy nie przybyło
    run(sim, () => false, RISE_TICKS + 4 * TICKS_PER_SECOND, [z]);
    expect(kind(st, 'zombie')).toEqual([z]);
    expect(pies(st)).toBeUndefined();
    // i nie wstaje drugi raz: nikt go nie wystawi ponownie, nawet gdy zarząd poprosi
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    expect(pies(st)).toBeUndefined();
  });

  it('zarząd gasi flagę dog, dopisuje wpis do kroniki i lekko obniża nastrój wszystkich', () => {
    const { sim } = zabity();
    const gov = newGov(7, 'zombie');
    gov.flags.dog = true;
    const i = govInput(sim.st, w, 1000);
    const fx = govUpdate(gov, i);
    expect(gov.flags.dog).toBe(false);
    expect(fx.zwierze ?? []).toEqual([]);
    const wpis = gov.log.find((l) => l.txt.pl.includes('Abonament'));
    expect(wpis, 'wpis w kronice').toBeDefined();
    expect(wpis!.txt.pl).toMatch(/nie żyje/);
    expect(wpis!.txt.en).toMatch(/Subscription/);
    expect(wpis!.txt.en).not.toMatch(/Abonament/);
    const nastroje = fx.moods.filter((m) => m.why === 'Abonament nie żyje');
    expect(nastroje.map((m) => m.id).sort()).toEqual(i.people.map((p) => p.id).sort());
    for (const m of nastroje) {
      expect(m.d).toBe(-3);
      expect(m.hours).toBe(24);
    }
    // raz: drugi krok nic nie dopisuje
    const dlugosc = gov.log.length;
    const fx2 = govUpdate(gov, i);
    expect(gov.log.filter((l) => l.txt.pl.includes('Abonament'))).toHaveLength(1);
    expect(gov.log.length).toBe(dlugosc);
    expect(fx2.moods.filter((m) => m.why === 'Abonament nie żyje')).toHaveLength(0);
    // pogrzeb i żałoba po ludziach nie liczą psa
    expect(gov.deadN ?? 0).toBe(0);
  });
});

describe('kot', () => {
  const wDom = demoWorld('zielonki').w;
  const swiaty = [
    ['blok', w],
    ['dom', wDom],
  ] as const;

  for (const [nazwa, swiat] of swiaty) {
    it(`kot śpi przy kozie zarządu (${nazwa}) i za dnia chodzi po mieszkaniu zarządu`, () => {
      const h = houseOf(swiat)!;
      const sim = gra(2, 23, { world: swiat });
      const koza = sim.st.things.find((t) => t.kind === 'koza' && inHomeApt(h, t.y * swiat.size + t.x))!;
      expect(koza, 'koza w mieszkaniu zarządu').toBeDefined();
      const przed = frontTile(koza, swiat.size);
      wyslij(sim, { zwierze: ['kot'] }, swiat);
      sim.step();
      const k = kot(sim.st);
      expect(k, 'pionek kota').toBeDefined();
      expect(sim.st.zwierzeta).toEqual({ kot: 'zyje' });
      expect(k.person).toBe(-1);
      expect(k.needs).toBeNull();
      const tile = (p: Pawn) => Math.floor(p.y) * swiat.size + Math.floor(p.x);
      // wystawiony od razu przy kozie, we wnętrzu mieszkania zarządu
      expect(inHomeApt(h, tile(k))).toBe(true);
      expect(tile(k)).toBe(przed);
      run(sim, () => k.job?.what === 'lezy', 4000);
      expect(k.job?.what).toBe('lezy');
      expect(tile(k)).toBe(przed);
      // do rana leży tam, gdzie leżał
      run(sim, () => sim.st.tick >= tickAt(3, 5), 12 * TICKS_PER_HOUR);
      expect(tile(k)).toBe(przed);
      // za dnia chodzi, ale tylko po mieszkaniu zarządu
      run(sim, () => sim.st.tick >= tickAt(3, 8), 12 * TICKS_PER_HOUR);
      const byl = new Set<number>();
      for (let n = 0; n < 8000; n++) {
        przygotuj(sim.st, []);
        sim.step();
        if (n % 20 === 0) {
          // po mieszkaniu zarządu i jego drzwiach (kafelek drzwi należy do ściany, nie do pomieszczenia)
          expect(inHomeApt(h, tile(k)) || h.doors.includes(tile(k)), `krok ${n}: w mieszkaniu zarządu`).toBe(true);
          byl.add(tile(k));
        }
      }
      expect(byl.size, 'chodzi po mieszkaniu').toBeGreaterThan(2);
    });
  }

  it('szwendacz go nie ściga i kot nie ginie', () => {
    const sim = gra(2, 12, { zombie: true });
    rdzenPoza(sim.st);
    wyslij(sim, { zwierze: ['kot'] });
    sim.step();
    const k = kot(sim.st);
    // szwendacz tuż przy kocie, w mieszkaniu zarządu (wszedł do środka): z bliska widzi każdą ofiarę
    const z = spawnZombie(sim.st, w, tileOf(k), 0);
    run(sim, () => false, 40 * TICKS_PER_SECOND, [z]);
    expect(kot(sim.st)).toBeDefined();
    expect(sim.st.zwierzeta?.kot).toBe('zyje');
    expect(k.hp).toBeUndefined();
  });
});

describe('zarząd a zwierzęta: flagi, stary zapis, idempotencja', () => {
  it('stary zapis z flagą dog bez pionka psa dostaje psa po wczytaniu', () => {
    const sim = gra(2, 10);
    const gov = newGov(1);
    gov.flags.dog = true;
    // zapis zarządu z flagą, symulacja nie ma wpisu o psie
    const wczytany = loadGov(saveGov(gov));
    expect(sim.st.zwierzeta).toBeUndefined();
    expect(govInput(sim.st, w, 0).zwierzeta).toBeUndefined();
    const fx = govUpdate(wczytany, govInput(sim.st, w, 0));
    expect(fx.zwierze).toEqual(['pies']);
    applyGov(sim.st, w, fx);
    sim.step();
    expect(kind(sim.st, 'pies')).toHaveLength(1);
    // kolejne kroki zarządu nie proszą o drugiego
    const fx2 = govUpdate(wczytany, govInput(sim.st, w, 20));
    expect(fx2.zwierze ?? []).toEqual([]);
    // a gdyby poprosił, symulacja pomija drugiego
    wyslij(sim, { zwierze: ['pies', 'pies'] });
    sim.step();
    expect(kind(sim.st, 'pies')).toHaveLength(1);
  });

  it('flaga cat wystawia kota, bez niej kot się nie pojawia', () => {
    const sim = gra(2, 10);
    const gov = newGov(1);
    expect(govUpdate(gov, govInput(sim.st, w, 0)).zwierze ?? []).toEqual([]);
    gov.flags.cat = true;
    const fx = govUpdate(gov, govInput(sim.st, w, 0));
    expect(fx.zwierze).toEqual(['kot']);
    applyGov(sim.st, w, fx);
    sim.step();
    expect(kind(sim.st, 'kot')).toHaveLength(1);
    expect(govUpdate(gov, govInput(sim.st, w, 20)).zwierze ?? []).toEqual([]);
  });

  it('karta „Pies przy siatce” ustawia flagę dog i zarząd prosi o psa, a „Przegonić” nie', () => {
    for (const [wybor, ma] of [
      [0, true],
      [1, false],
    ] as const) {
      const sim = gra(2, 10);
      const gov = newGov(2);
      const input = { ...govInput(sim.st, w, 5000), day: 2, hour: 20, minute: 0 };
      input.stock = { ...input.stock, supplies: 5 };
      gov.ev.active = { id: 'pies', d: {} };
      chooseEvent(gov, input, wybor);
      expect(gov.flags.dog).toBe(ma);
      const fx = govUpdate(gov, input);
      expect(fx.zwierze ?? []).toEqual(ma ? ['pies'] : []);
    }
  });

  it('karta „Kot w piwnicy”: tylko „Uwolnić i przygarnąć” daje kota, „łapie myszy” zostaje bez pionka', () => {
    for (const [wybor, ma] of [
      [0, true],
      [1, false],
    ] as const) {
      const sim = gra(2, 10);
      const gov = newGov(2);
      const input = { ...govInput(sim.st, w, 5000), day: 2, hour: 23, minute: 0 };
      gov.ev.active = { id: 'kot', d: {} };
      chooseEvent(gov, input, wybor);
      expect(gov.flags.cat === true).toBe(ma);
      const fx = govUpdate(gov, input);
      expect(fx.zwierze ?? []).toEqual(ma ? ['kot'] : []);
    }
  });

  it('stary zapis zarządu bez pola cat wczytuje się jako fałsz i nic nie dokłada do stanu', () => {
    const gov = newGov(3);
    const json = saveGov(gov);
    expect(JSON.parse(json).flags).toEqual({ dog: false, flashlight: false, torch: false });
    const wczytany = loadGov(json);
    expect(wczytany.flags.cat).toBeUndefined();
    expect(saveGov(wczytany)).toBe(json);
  });

  it('zapis i wczytanie symulacji z psem w środku nie zmieniają przebiegu', () => {
    const a = gra(2, 21);
    wyslij(a, { zwierze: ['pies', 'kot'] });
    run(a, () => false, 700);
    const b = new Sim(w, JSON.parse(JSON.stringify(a.st)) as SimState);
    expect(b.hash()).toBe(a.hash());
    for (let k = 0; k < 6000; k++) {
      przygotuj(a.st, []);
      przygotuj(b.st, []);
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
    expect(pies(a.st)).toBeDefined();
  });
});

describe('zwierzęta nie są ludźmi', () => {
  it('ani pies, ani kot nie wchodzą do mieszkańców, ludności, zmarłych ani statystyk', () => {
    const bez = gra(2, 12, { zombie: true, seed: 11 });
    const z = gra(2, 12, { zombie: true, seed: 11 });
    wyslij(z, { zwierze: ['pies', 'kot'] });
    for (let k = 0; k < 400; k++) {
      przygotuj(bez.st, []);
      przygotuj(z.st, []);
      bez.step();
      z.step();
    }
    expect(pies(z.st)).toBeDefined();
    expect(kot(z.st)).toBeDefined();
    const a = snapshot(bez.st, w);
    const b = snapshot(z.st, w);
    expect(b.residents).toBe(a.residents);
    expect(b.people.length).toBe(a.people.length);
    expect(b.lokatorzy.length).toBe(a.lokatorzy.length);
    expect(b.strangers).toBe(a.strangers);
    expect(b.zombies).toEqual(a.zombies);
    const ia = govInput(bez.st, w, 100);
    const ib = govInput(z.st, w, 100);
    expect(ib.people.length).toBe(ia.people.length);
    expect(ib.residents).toBe(ia.residents);
    expect(ib.ludnosc).toBe(ia.ludnosc);
    expect(ib.lokatorzy ?? []).toEqual(ia.lokatorzy ?? []);
    expect(ib.dead).toEqual(ia.dead);
    expect(ib.horde).toEqual(ia.horde);
    // ludzie z odczytu to dokładnie rdzeń z osobą
    expect(ib.people.map((p) => p.id)).toEqual(
      z.st.pawns.filter((p) => p.kind === 'core').map((p) => z.st.people[p.person].id),
    );
    // zwierzę nie ma osoby ani potrzeb
    for (const p of [pies(z.st), kot(z.st)]) {
      expect(p.person).toBe(-1);
      expect(p.needs).toBeNull();
      expect(p.job?.t).toBe('zwierze');
      expect(p.job?.tile).toBe(-1);
    }
  });

  it('nie biorą poleceń: „idź tu” nie zmienia ich pracy, a liczba ludzi się nie zmienia', () => {
    const z = gra(2, 9, { seed: 5 });
    const ludzi = z.st.pawns.length;
    wyslij(z, { zwierze: ['pies', 'kot'] });
    for (let k = 0; k < 3000; k++) {
      przygotuj(z.st, []);
      z.step();
    }
    expect(z.st.pawns.length).toBe(ludzi + 2);
    expect(z.st.pawns.filter((p) => p.kind === 'core' || p.kind === 'resident')).toHaveLength(ludzi);
    const polecenie = { t: 'move' as const, ids: [pies(z.st).id, kot(z.st).id], to: tileOf(z.st.pawns[0]) };
    const xp = pies(z.st).x;
    const yp = pies(z.st).y;
    z.push(polecenie);
    z.step();
    // polecenie nie zmieniło pracy zwierząt na „idź tu”
    expect(pies(z.st).job?.t).toBe('zwierze');
    expect(kot(z.st).job?.t).toBe('zwierze');
    expect(Math.abs(pies(z.st).x - xp) + Math.abs(pies(z.st).y - yp)).toBeLessThan(1);
  });
});
