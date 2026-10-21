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
import { polskieSlowa } from './po-angielsku.ts';

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
  opt: { zombie?: boolean; obcy?: boolean; seed?: number; world?: typeof w; ogniska?: readonly number[] } = {},
): Sim {
  const world = opt.world ?? w;
  const st = createSim(world, opt.seed ?? 3, {
    core: 2,
    ...(opt.obcy ? { obcy: true } : {}),
    ...(opt.zombie ? { mode: 'zombie' as const } : {}),
  });
  // ogniska stoją przed startem symulacji, więc od pierwszego kroku blokują przejście
  for (const tile of opt.ogniska ?? [])
    st.things.push({
      id: st.nextThing++,
      kind: 'ognisko',
      x: tile % world.size,
      y: Math.floor(tile / world.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 100 * TICKS_PER_HOUR,
      by: -1,
      owner: -1,
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
  // zostają tylko wskazani szwendacze, po numerze (kopia stanu po zapisie ma inne obiekty o tych samych numerach)
  if (st.mode === 'zombie') st.pawns = st.pawns.filter((p) => p.kind !== 'zombie' || zostaw.some((z) => z.id === p.id));
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

describe('pies: legowisko zablokowane', () => {
  it('ognisko na legowisku: pies i tak kładzie się nocą przy bramie, na najbliższym wolnym kafelku', () => {
    const a = gra(2, 23);
    wyslij(a, { zwierze: ['pies'] });
    a.step();
    run(a, () => pies(a.st).job?.what === 'lezy', 4000);
    const legowisko = tileOf(pies(a.st));
    expect(pies(a.st).job?.what).toBe('lezy');
    // ta sama gra, ale z ogniskiem dokładnie na legowisku (blokuje kafelek od pierwszego kroku)
    const b = gra(2, 23, { ogniska: [legowisko] });
    wyslij(b, { zwierze: ['pies'] });
    b.step();
    const p = pies(b.st);
    run(b, () => p.job?.what === 'lezy', 6000);
    expect(p.job?.what, 'pies kładzie się mimo zajętego legowiska').toBe('lezy');
    expect(tileOf(p)).not.toBe(legowisko);
    expect(yard.has(tileOf(p))).toBe(true);
    expect(Math.min(...gate.map((g) => cheb(g, tileOf(p)))), 'przy bramie').toBeLessThanOrEqual(4);
    // i leży do rana
    const gdzie = tileOf(p);
    run(b, () => false, 3 * TICKS_PER_HOUR);
    expect(tileOf(p)).toBe(gdzie);
    expect(p.job?.what).toBe('lezy');
  });
});

describe('pies: szczekanie', () => {
  /** pies na podwórku (dzień, tryb zwykły albo zombie), szwendacz dalej za siatką */
  function zSzwendaczem(zombie: boolean, daleko = 11, godzina = 12) {
    const sim = gra(2, godzina, { zombie });
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    // nocą pies najpierw kładzie się na legowisku, więc szwendacz staje dopiero, gdy pies się nie rusza
    if (godzina >= 22 || godzina < 6) run(sim, () => p.job?.what === 'lezy', 4000);
    else run(sim, () => yard.has(tileOf(p)), 3000);
    const tile = ulicaWOdleglosci(p.x, p.y, daleko - 1, daleko);
    const z = spawnZombie(sim.st, w, tile, 0);
    return { sim, p, z };
  }

  /** hałasy psa (st.noise o promieniu SZCZEK_HALAS) wpisane w jednym kroku: tick, w którym się pojawiły */
  function halasyPsa(st: SimState, widziane: Set<number>, ticki: number[]): void {
    for (const n of st.noise!)
      if (n.r === SZCZEK_HALAS && !widziane.has(n.until)) {
        widziane.add(n.until);
        ticki.push(st.tick);
      }
  }

  /** szwendacz stoi w miejscu (nie podchodzi, nie ucieka): wróg jest w zasięgu psa, dopóki test tego chce */
  const przypnij = (z: Pawn, tile: number) => {
    z.x = (tile % size) + 0.5;
    z.y = Math.floor(tile / size) + 0.5;
    z.path = [];
    z.pi = 0;
  };

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

  it('szwendacze stale w zasięgu: hałas tylko przy nowym alarmie i nie częściej niż co godzinę gry, napis co 5 s', () => {
    const { sim, z } = zSzwendaczem(true, 11, 22);
    const miejsce = tileOf(z);
    const widziane = new Set<number>();
    const halasy: number[] = [];
    const szczeki: number[] = [];
    let ostatni = -1;
    let start = -1;
    for (let k = 0; k < 600 + 2 * TICKS_PER_HOUR && !(start >= 0 && sim.st.tick >= start + 2 * TICKS_PER_HOUR); k++) {
      przygotuj(sim.st, [z]);
      przypnij(z, miejsce);
      sim.step();
      halasyPsa(sim.st, widziane, halasy);
      if (start < 0 && halasy.length) start = halasy[0];
      const t = sim.st.szczek?.tick;
      if (t !== undefined && t !== ostatni) {
        szczeki.push(t);
        ostatni = t;
      }
    }
    // dwie godziny gry od pierwszego hałasu (bez ticku, w którym zaczyna się trzecia godzina): pierwszy alarm i jedno
    // przypomnienie po godzinie, nic poza tym; hałasy co najmniej godzinę od siebie
    const wOknie = halasy.filter((t) => t < start + 2 * TICKS_PER_HOUR);
    expect(wOknie, `hałasy w tickach ${halasy.join(', ')}`).toHaveLength(2);
    expect(wOknie[1] - wOknie[0]).toBeGreaterThanOrEqual(TICKS_PER_HOUR);
    expect(wOknie[1] - wOknie[0]).toBeLessThan(TICKS_PER_HOUR + 2 * SZCZEK_CD);
    for (let k = 1; k < halasy.length; k++) expect(halasy[k] - halasy[k - 1]).toBeGreaterThanOrEqual(TICKS_PER_HOUR);
    // napis „Hau!” zostaje co SZCZEK_CD (dwie godziny gry to 1600 ticków, czyli około 16 szczeknięć)
    expect(szczeki.length).toBeGreaterThanOrEqual(15);
    for (let k = 1; k < szczeki.length; k++) expect(szczeki[k] - szczeki[k - 1]).toBeGreaterThanOrEqual(SZCZEK_CD);
  });

  it('wróg odchodzi i przychodzi nowy: nowy alarm, nowy hałas od razu, bez czekania godziny', () => {
    const { sim, p, z } = zSzwendaczem(true, 11, 22);
    const blisko = tileOf(z);
    const daleko = ulicaWOdleglosci(p.x, p.y, 34, 40);
    const widziane = new Set<number>();
    const halasy: number[] = [];
    const krok = (miejsce: number, n: number) => {
      for (let k = 0; k < n; k++) {
        przygotuj(sim.st, [z]);
        przypnij(z, miejsce);
        sim.step();
        halasyPsa(sim.st, widziane, halasy);
      }
    };
    krok(blisko, 8 * TICKS_PER_SECOND);
    expect(halasy).toHaveLength(1);
    // wróg w zasięgu dalej: nic nowego
    krok(blisko, 12 * TICKS_PER_SECOND);
    expect(halasy).toHaveLength(1);
    // odszedł (nikogo w 15 m przez 10 s), potem wraca: nowy alarm
    krok(daleko, 10 * TICKS_PER_SECOND);
    expect(halasy).toHaveLength(1);
    const powrot = sim.st.tick;
    krok(blisko, 8 * TICKS_PER_SECOND);
    expect(halasy, `hałasy w tickach ${halasy.join(', ')}`).toHaveLength(2);
    // nowy hałas zaraz po powrocie wroga (w pierwszym sprawdzeniu), a nie dopiero po godzinie od poprzedniego
    expect(halasy[1] - powrot).toBeLessThanOrEqual(2 * TICKS_PER_SECOND);
    expect(halasy[1] - halasy[0]).toBeLessThan(TICKS_PER_HOUR);
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
    // ugryzienia psa nie wchodzą do liczników ludzi (statystyki trybu zombie liczą tylko ludzi)
    expect(st.tally?.bites ?? 0).toBe(0);
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
    // angielska wersja wpisu bez polskich słów (poza imieniem psa po polsku w polskiej wersji)
    expect(polskieSlowa(wpis!.txt.en), wpis!.txt.en).toEqual([]);
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
      // kot leży tuż obok kozy, nie na kafelku przed nią (tam klęczy zarząd i zasłoniłby go)
      const przyKozie = (t: number) =>
        Math.abs((t % swiat.size) - koza.x - (koza.w - 1) / 2) <= (koza.w + 1) / 2 + 0.01 &&
        Math.abs(Math.floor(t / swiat.size) - koza.y - (koza.h - 1) / 2) <= (koza.h + 1) / 2 + 0.01;
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
      expect(przyKozie(tile(k))).toBe(true);
      expect(tile(k)).not.toBe(przed);
      const legowisko = tile(k);
      run(sim, () => k.job?.what === 'lezy', 4000);
      expect(k.job?.what).toBe('lezy');
      expect(tile(k)).toBe(legowisko);
      // do rana leży tam, gdzie leżał
      run(sim, () => sim.st.tick >= tickAt(3, 5), 12 * TICKS_PER_HOUR);
      expect(tile(k)).toBe(legowisko);
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

  it('zapis i wczytanie w środku przerwy między szczeknięciami nie zmieniają przebiegu (hałas, napis, alarm)', () => {
    const sim = gra(2, 12, { zombie: true });
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    run(sim, () => yard.has(tileOf(p)), 3000);
    const z = spawnZombie(sim.st, w, ulicaWOdleglosci(p.x, p.y, 10, 11), 0);
    run(sim, () => !!sim.st.szczek, 400, [z]);
    expect(sim.st.szczek).toBeDefined();
    // 30 ticków po szczeknięciu: przerwa trwa, hałas jeszcze słychać
    run(sim, () => false, 30, [z]);
    expect(sim.st.tick - sim.st.szczek!.tick).toBeLessThan(SZCZEK_CD);
    const b = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    expect(b.hash()).toBe(sim.hash());
    expect(b.st.szczek).toEqual(sim.st.szczek);
    for (let k = 0; k < 2500; k++) {
      przygotuj(sim.st, [z]);
      przygotuj(b.st, [z]);
      sim.step();
      b.step();
    }
    expect(b.hash()).toBe(sim.hash());
    expect(b.st.szczek).toEqual(sim.st.szczek);
    expect(b.st.noise).toEqual(sim.st.noise);
  });

  it('zapis i wczytanie po śmierci psa: pies nie wraca, flaga dog zostaje zgaszona', () => {
    const sim = gra(2, 12, { zombie: true });
    rdzenPoza(sim.st);
    wyslij(sim, { zwierze: ['pies'] });
    sim.step();
    const p = pies(sim.st);
    run(sim, () => yard.has(tileOf(p)), 3000);
    const blisko = w.fence.yard.find(
      (i) => !w.blocked[i] && w.bid[i] < 0 && cheb(i, tileOf(p)) >= 2 && cheb(i, tileOf(p)) <= 3,
    )!;
    const z = spawnZombie(sim.st, w, blisko, 0);
    run(sim, () => !pies(sim.st), 6000, [z]);
    expect(sim.st.zwierzeta?.pies).toBe('zginal');
    // zarząd widzi śmierć, gasi flagę i zapisuje stan
    const gov = newGov(7, 'zombie');
    gov.flags.dog = true;
    govUpdate(gov, govInput(sim.st, w, 1000));
    expect(gov.flags.dog).toBe(false);
    const wpisow = gov.log.filter((l) => l.txt.pl.includes('Abonament')).length;
    expect(wpisow).toBe(1);
    // wczytanie obu zapisów
    const b = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    const wczytany = loadGov(saveGov(gov));
    expect(b.st.zwierzeta).toEqual({ pies: 'zginal' });
    expect(wczytany.flags.dog).toBe(false);
    // ani zarząd nie prosi o psa, ani symulacja go nie wystawia, nawet po dłuższej grze
    for (let k = 0; k < 3; k++) {
      const fx = govUpdate(wczytany, govInput(b.st, w, 1000 + k));
      expect(fx.zwierze ?? []).toEqual([]);
      applyGov(b.st, w, fx);
      for (let n = 0; n < 40; n++) {
        przygotuj(b.st, [z]);
        b.step();
      }
    }
    wyslij(b, { zwierze: ['pies'] });
    b.step();
    expect(pies(b.st)).toBeUndefined();
    expect(wczytany.flags.dog).toBe(false);
    expect(wczytany.log.filter((l) => l.txt.pl.includes('Abonament'))).toHaveLength(wpisow);
  });
});

describe('zwierzęta nie są ludźmi', () => {
  it('ani pies, ani kot nie wchodzą do mieszkańców, ludności, zmarłych ani statystyk', () => {
    const z = gra(2, 12, { zombie: true, seed: 11 });
    wyslij(z, { zwierze: ['pies', 'kot'] });
    for (let k = 0; k < 400; k++) {
      przygotuj(z.st, []);
      z.step();
    }
    const st = z.st;
    expect(pies(st)).toBeDefined();
    expect(kot(st)).toBeDefined();
    const rdzen = st.pawns.filter((p) => p.kind === 'core');
    const mieszkancy = st.pawns.filter((p) => p.kind === 'resident');
    const snap = snapshot(st, w);
    // odczyt ludzi to dokładnie rdzeń i mieszkańcy, żadne zwierzę
    expect(snap.people.map((p) => p.pawn)).toEqual(rdzen.map((p) => p.id));
    expect(snap.residents).toBe(mieszkancy.length);
    for (const l of snap.lokatorzy)
      expect(['resident', 'sasiad']).toContain(st.pawns.find((p) => p.id === l.pawn)?.kind);
    expect(snap.strangers).toBe(st.pawns.filter((p) => p.kind === 'szabrownik').length);
    expect(snap.zombies.all).toBe(st.pawns.filter((p) => p.kind === 'zombie').length);
    const i = govInput(st, w, 100);
    expect(i.people.map((p) => p.id)).toEqual(rdzen.map((p) => st.people[p.person].id));
    expect(i.residents).toBe(mieszkancy.length);
    expect(i.ludnosc).toBe(rdzen.length + mieszkancy.length);
    for (const l of i.lokatorzy ?? []) expect(st.pawns.find((p) => p.id === l.pawn)?.kind).toBe('resident');
    expect(i.dead).toEqual([]);
    expect(st.dead ?? []).toEqual([]);
    // zwierzę nie ma osoby ani potrzeb
    for (const p of [pies(st), kot(st)]) {
      expect(p.person).toBe(-1);
      expect(p.needs).toBeNull();
      expect(p.job?.t).toBe('zwierze');
      expect(p.job?.tile).toBe(-1);
    }
  });

  it('towarzystwo w potrzebach (company) nie liczy zwierząt: pies i kot na kafelku człowieka nic nie zmieniają', () => {
    const z = gra(2, 12, { seed: 11 });
    wyslij(z, { zwierze: ['pies', 'kot'] });
    for (let k = 0; k < 200; k++) {
      przygotuj(z.st, []);
      z.step();
    }
    const ktos = z.st.pawns.find((p) => p.kind === 'core' && !p.away)!;
    const needCtx = (z as unknown as { needCtx(p: Pawn, tout: number): { company: number } }).needCtx.bind(z);
    const zwierzeta = [pies(z.st), kot(z.st)];
    // daleko od wszystkich
    for (const q of zwierzeta) {
      q.x = 1.5;
      q.y = 1.5;
    }
    const bez = needCtx(ktos, 10).company;
    // na kafelku człowieka
    for (const q of zwierzeta) {
      q.x = ktos.x;
      q.y = ktos.y;
    }
    expect(needCtx(ktos, 10).company).toBe(bez);
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
