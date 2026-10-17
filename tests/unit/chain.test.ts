import { describe, expect, it } from 'vitest';
import { START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { homeMask, inHomeApt, type RoomKind } from '../../src/sim/house.ts';
import { commandFor, commandsAt, jobText } from '../../src/sim/orders.ts';
import {
  BURN_TICKS,
  COOK_TICKS,
  createSim,
  GAS_START,
  type JobKind,
  MEAL,
  type Pawn,
  Sim,
  type SimState,
  type Thing,
  woodFrom,
} from '../../src/sim/sim.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { type MockWorld, mockBlock, mockHouse, plainBlock, trunkTile } from './interior-mock.ts';

const block = mockBlock();
const house = mockHouse();

const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - START_MINUTES / 60) * TICKS_PER_HOUR);
const core = (sim: Sim) => sim.st.pawns.filter((p) => p.kind === 'core');
const tileOf = (sim: Sim, p: Pawn) => Math.floor(p.y) * sim.w.size + Math.floor(p.x);
const kozaOf = (st: SimState) => st.things.find((t) => t.kind === 'koza')!;
const roomKind = (w: MockWorld, i: number) => w.interior.rooms[w.interior.room[i]]?.kind;
const woodOn = (st: SimState, size: number, tiles: number[]) =>
  st.things.filter((t) => t.kind === 'drewno' && tiles.includes(t.y * size + t.x)).reduce((s, t) => s + t.n, 0);

/** kładzie drewno na kafelku (stan to zwykły JSON, więc test może go ułożyć sam) */
function addWood(st: SimState, tile: number, size: number, n: number): Thing {
  const t: Thing = {
    id: st.nextThing++,
    kind: 'drewno',
    x: tile % size,
    y: Math.floor(tile / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(t);
  return t;
}

describe('łańcuch drewna: polecenie, drewno, skład, koza, ciepło', () => {
  for (const [name, w] of [
    ['blok', block],
    ['dom', house],
  ] as const) {
    it(`${name}: od polecenia „ścinaj suche drzewo” do ciepłej kuchni w około dwie minuty`, () => {
      const sim = new Sim(w, createSim(w, 11, { core: 4 }));
      const st = sim.st;
      const kz = kozaOf(st);
      const kitchen = w.interior.room[kz.y * w.size + kz.x];
      // start: 9°C w mieszkaniu, zimna koza, samouczek na pierwszym kroku, zarząd w kuchni albo na klatce
      for (const r of w.interior.rooms) if (r.apt === w.interior.home) expect(st.temps[r.id]).toBe(9);
      expect(kz.fuel).toBe(0);
      expect(st.tut.step).toBe(0);
      for (const p of core(sim)) expect(['kuchnia', 'klatka']).toContain(roomKind(w, tileOf(sim, p)));
      const marek = core(sim)[0];
      sim.push({ t: 'select', ids: [marek.id] });
      const cmd = commandFor(st, w, [marek.id], trunkTile(w, w.dryTree));
      expect(cmd).toEqual({ t: 'chop', ids: [marek.id], tree: w.dryTree });
      sim.push(cmd!);
      const texts = new Set<string>();
      for (let k = 0; k < 8000 && st.tut.step < TUT_STEPS.length; k++) {
        sim.step();
        texts.add(jobText(st, w, marek));
      }
      expect(st.tut.step).toBe(TUT_STEPS.length);
      expect(st.felled).toContain(w.dryTree);
      expect(kozaOf(st).fuel).toBeGreaterThan(0);
      expect(st.temps[kitchen]).toBeGreaterThanOrEqual(18);
      for (let k = 1; k < TUT_STEPS.length; k++) expect(st.tut.at[k]).toBeGreaterThanOrEqual(st.tut.at[k - 1]);
      const seconds = st.tut.at[TUT_STEPS.length - 1] / TICKS_PER_SECOND;
      expect(seconds).toBeGreaterThan(60);
      expect(seconds).toBeLessThan(150);
      expect(texts).toContain('Rąbie suche drzewo.');
      expect(texts).toContain('Niesie drewno do składu.');
    });
  }

  it('ścięte drzewo zwalnia kafelek, zostawia pień i drewno, a wczytanie odtwarza to samo', () => {
    const w = block;
    const sim = new Sim(w, createSim(w, 4, { core: 2 }));
    const [a] = core(sim);
    const k = w.dryTree;
    const trunk = trunkTile(w, k);
    expect(sim.blocked[trunk]).toBe(1);
    sim.push({ t: 'chop', ids: [a.id], tree: k });
    for (let n = 0; n < 4000 && !sim.st.felled.includes(k); n++) sim.step();
    expect(sim.st.felled).toEqual([k]);
    expect(sim.blocked[trunk]).toBe(0);
    expect(sim.st.things.some((t) => t.kind === 'pien' && t.y * w.size + t.x === trunk)).toBe(true);
    const wood = sim.st.things.filter((t) => t.kind === 'drewno').reduce((s, t) => s + t.n, 0);
    expect(wood).toBe(woodFrom(w.trees[k]));
    const loaded = new Sim(w, JSON.parse(JSON.stringify(sim.st)));
    expect([...loaded.blocked]).toEqual([...sim.blocked]);
    // świat zostaje nietknięty (ten sam świat służy wielu symulacjom)
    expect(w.blocked[trunk]).toBe(1);
  });

  it('z większego drzewa jest więcej drewna', () => {
    const t = { ...block.trees[0], kind: 0 as const };
    expect(woodFrom({ ...t, r: 3.5 })).toBeGreaterThan(woodFrom({ ...t, r: 2 }));
    expect(woodFrom({ ...t, r: 2 })).toBeGreaterThanOrEqual(2);
    expect(woodFrom({ ...t, kind: 2, r: 1.4 })).toBeLessThan(woodFrom({ ...t, r: 1.8 }));
  });

  it('koza zjada drewno: suche drzewo starcza na kilka godzin, opał kończy się pierwszego wieczoru', () => {
    for (const r of [2, 2.5, 3, 3.3]) {
      const hours = (woodFrom({ ...block.trees[0], kind: 0, r }) * BURN_TICKS) / TICKS_PER_HOUR;
      expect(hours).toBeGreaterThanOrEqual(3);
      expect(hours).toBeLessThanOrEqual(5.5);
    }
    const w = block;
    const sim = new Sim(w, createSim(w, 11, { core: 4 }));
    const st = sim.st;
    sim.push({ t: 'chop', ids: [core(sim)[0].id], tree: w.dryTree });
    let lit = false;
    let out = -1;
    for (let k = 0; k < TICKS_PER_DAY && out < 0; k++) {
      sim.step();
      if (kozaOf(st).fuel > 0) lit = true;
      else if (lit && !st.things.some((t) => t.kind === 'drewno') && core(sim).every((p) => p.carry === 0))
        out = st.tick;
    }
    // bez drewna koza gaśnie wieczorem pierwszego dnia: gracz musi zdecydować, skąd wziąć opał
    const hour = START_MINUTES / 60 + out / TICKS_PER_HOUR;
    expect(out).toBeGreaterThan(0);
    expect(hour).toBeGreaterThan(18);
    expect(hour).toBeLessThan(22.5);
  });
});

describe('zarząd sam', () => {
  const w = block;

  it('dokłada do kozy, gdy w składzie leży drewno', () => {
    const st = createSim(w, 3, { core: 4 });
    addWood(st, w.interior.sklad[0], w.size, 5);
    const sim = new Sim(w, st);
    // dokłada z kafelka przed kozą (kontrakt: jest wolny), czyli od strony przeciwnej do ściany z oknem
    const kz = kozaOf(st);
    const front = [
      (kz.y + 1) * w.size + kz.x,
      kz.y * w.size + kz.x - 1,
      (kz.y - 1) * w.size + kz.x,
      kz.y * w.size + kz.x + 1,
    ][kz.rot];
    const stands = new Set<number>();
    let k = 0;
    while (kozaOf(st).fuel === 0 && k++ < 600) {
      for (const p of core(sim)) if (p.job?.t === 'refuel' && p.job.phase === 1) stands.add(p.job.tile);
      sim.step();
    }
    expect(kozaOf(st).fuel).toBeGreaterThan(0);
    expect(k).toBeLessThan(300);
    expect([...stands]).toEqual([front]);
  });

  it('zanosi leżące drewno do składu', () => {
    const st = createSim(w, 3, { core: 4 });
    addWood(st, w.buildings[w.hq].entrances[0].out + 4 * w.size, w.size, 4);
    const sim = new Sim(w, st);
    // minuta realna: drewno już w składzie albo w kozie, ale jeszcze się nie wypaliło
    for (let k = 0; k < 1200; k++) sim.step();
    const sklad = w.interior.sklad;
    const outside = st.things.filter((t) => t.kind === 'drewno' && !sklad.includes(t.y * w.size + t.x));
    expect(outside).toHaveLength(0);
    expect(core(sim).every((p) => p.carry === 0)).toBe(true);
    expect(woodOn(st, w.size, sklad) > 0 || kozaOf(st).fuel > 0).toBe(true);
  });

  it('sam nie ścina drzew i nie pali mebli', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 4 }));
    for (let k = 0; k < 2 * TICKS_PER_DAY; k++) sim.step();
    expect(sim.st.felled).toEqual([]);
    expect(sim.st.burned).toEqual([]);
    for (const p of core(sim))
      for (const v of Object.values(p.needs!)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
  });

  it('głodny najpierw gotuje z zapasów na kuchence, potem je ciepły posiłek przy stole', () => {
    const st = createSim(w, 3, { core: 4 });
    const p0 = st.pawns[0];
    p0.needs!.food = 20;
    const food0 = st.things.find((t) => t.kind === 'jedzenie')!.n;
    expect(food0).toBeGreaterThanOrEqual(12);
    const stove = st.things.find((t) => t.kind === 'kuchenka')!;
    expect(stove.fuel).toBe(GAS_START);
    const sim = new Sim(w, st);
    const texts = new Set<string>();
    for (let k = 0; k < 3000 && p0.needs!.food < 50; k++) {
      sim.step();
      texts.add(jobText(st, w, p0));
    }
    expect(texts).toContain('Gotuje na kuchence.');
    expect(texts).toContain('Je przy stole.');
    expect(p0.needs!.food).toBeGreaterThan(50);
    // porcja dla każdego z zarządu, jedną już zjadł
    expect(st.things.find((t) => t.kind === 'jedzenie')!.n).toBe(food0 - 4);
    const pot = st.things.find((t) => t.kind === 'posilek')!;
    expect(pot.n).toBe(3);
    const table = st.things.find((t) => t.kind === 'stol')!;
    expect([pot.x, pot.y]).toEqual([table.x, table.y]);
    expect(stove.fuel).toBe(GAS_START - COOK_TICKS);
    expect(p0.moods.map((m) => m.why)).toContain('Ciepły posiłek');
  });

  it('po kolacji nikt nie gotuje od razu drugi raz (ci, co jedzą, za chwilę będą najedzeni)', () => {
    const st = createSim(w, 3, { core: 4 });
    st.tick = atHour(1, 19.5);
    for (const p of st.pawns) p.needs!.food = 30;
    const table = st.things.find((t) => t.kind === 'stol')!;
    const pot = { ...addWood(st, table.y * w.size + table.x, w.size, 4), kind: 'posilek' };
    st.things[st.things.length - 1] = pot;
    const sim = new Sim(w, st);
    let cooked = false;
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) {
      sim.step();
      if (core(sim).some((p) => p.job?.t === 'cook')) cooked = true;
    }
    expect(core(sim).every((p) => p.needs!.food > 50)).toBe(true);
    expect(cooked).toBe(false);
  });

  it('bez gazu gotuje się na palącej się kozie', () => {
    const st = createSim(w, 3, { core: 4 });
    st.things.find((t) => t.kind === 'kuchenka')!.fuel = 0;
    kozaOf(st).fuel = 4 * BURN_TICKS;
    st.pawns[0].needs!.food = 40;
    const sim = new Sim(w, st);
    const texts = new Set<string>();
    for (let k = 0; k < 2000 && !st.things.some((t) => t.kind === 'posilek'); k++) {
      sim.step();
      for (const p of core(sim)) texts.add(jobText(st, w, p));
    }
    expect(texts).toContain('Gotuje na kozie.');
    expect(st.things.find((t) => t.kind === 'posilek')?.n).toBe(4);
  });

  it('bez gazu i bez ognia głodny je zimną konserwę: mniej najedzenia i gorszy nastrój', () => {
    const st = createSim(w, 3, { core: 4 });
    st.things.find((t) => t.kind === 'kuchenka')!.fuel = 0;
    const p0 = st.pawns[0];
    p0.needs!.food = 20;
    const food0 = st.things.find((t) => t.kind === 'jedzenie')!.n;
    const sim = new Sim(w, st);
    for (let k = 0; k < 2000 && p0.needs!.food <= 20; k++) sim.step();
    expect(p0.needs!.food).toBeGreaterThan(40);
    expect(p0.needs!.food).toBeLessThan(20 + MEAL);
    expect(st.things.find((t) => t.kind === 'jedzenie')!.n).toBe(food0 - 1);
    expect(st.things.some((t) => t.kind === 'posilek')).toBe(false);
    expect(p0.moods.map((m) => `${m.why} ${m.d}`)).toContain('Zimne z puszki -3');
  });

  it('śpi w łóżku w nocy i wstaje rano', () => {
    const st = createSim(w, 3, { core: 4 });
    st.tick = atHour(1, 22.5);
    const sim = new Sim(w, st);
    for (let k = 0; k < TICKS_PER_HOUR; k++) sim.step();
    const sleepers = core(sim).filter((p) => p.job?.t === 'sleep' && p.job.phase === 1);
    expect(sleepers).toHaveLength(4);
    expect(new Set(sleepers.map((p) => tileOf(sim, p))).size).toBe(4);
    for (const p of sleepers) {
      expect(jobText(st, w, p)).toBe('Śpi.');
      const r = w.interior.room[tileOf(sim, p)];
      expect(w.interior.rooms[r].apt).toBe(w.interior.home);
    }
    while (st.tick < atHour(2, 7.5)) sim.step();
    expect(core(sim).filter((p) => p.job?.t === 'sleep')).toHaveLength(0);
  });

  it('grzeje się przy kozie, gdy jest mu zimno, a polecenie gracza ma pierwszeństwo', () => {
    const st = createSim(w, 3, { core: 4 });
    const kz = kozaOf(st);
    kz.fuel = 4 * BURN_TICKS;
    for (const p of st.pawns) if (p.needs) p.needs.warm = 20;
    const sim = new Sim(w, st);
    for (let k = 0; k < 400; k++) sim.step();
    for (const p of core(sim)) {
      expect(Math.hypot(p.x - (kz.x + 0.5), p.y - (kz.y + 0.5))).toBeLessThan(3);
      expect(jobText(st, w, p)).toBe('Grzeje się przy kozie.');
    }
    const p0 = core(sim)[0];
    const to = w.buildings[w.hq].entrances[0].out + 6 * w.size;
    sim.push({ t: 'move', ids: [p0.id], to });
    for (let k = 0; k < 300; k++) sim.step();
    expect(Math.hypot(p0.x - ((to % w.size) + 0.5), p0.y - (Math.floor(to / w.size) + 0.5))).toBeLessThan(2);
    // po dojściu zostaje tam, gdzie go wysłano, zamiast od razu wracać do kozy
    for (let k = 0; k < 600; k++) sim.step();
    expect(Math.hypot(p0.x - ((to % w.size) + 0.5), p0.y - (Math.floor(to / w.size) + 0.5))).toBeLessThan(2);
  });
});

describe('bezpieczeństwo w symulacji', () => {
  const w = block;
  const avgSafe = (sim: Sim) => core(sim).reduce((a, p) => a + p.needs!.safe, 0) / core(sim).length;

  it('nocą przy palącej się kozie spokojniej niż w ciemnym mieszkaniu', () => {
    const run = (fire: boolean) => {
      const st = createSim(w, 3, { core: 4 });
      st.tick = atHour(1, 20.5);
      if (fire) kozaOf(st).fuel = 4 * BURN_TICKS;
      const sim = new Sim(w, st);
      for (let k = 0; k < TICKS_PER_HOUR; k++) sim.step();
      return avgSafe(sim);
    };
    expect(run(true)).toBeGreaterThan(run(false) + 10);
  });

  it('wysłany sam na dwór po zmroku zaczyna się bać', () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 20);
    const sim = new Sim(w, st);
    const [p] = core(sim);
    sim.push({ t: 'move', ids: [p.id], to: w.buildings[w.hq].entrances[0].out + 10 * w.size + 20 });
    while (st.tick < atHour(1, 21.9)) sim.step();
    expect(w.interior.room[tileOf(sim, p)]).toBe(-1);
    expect(p.needs!.safe).toBeLessThan(35);
    expect(core(sim)[1].needs!.safe).toBeGreaterThan(p.needs!.safe + 15);
  });
});

describe('polecenia', () => {
  const w = block;

  it('kliknięcie wybiera polecenie: drzewo ścina, drewno zanosi, koza dokłada, reszta to ruch', () => {
    const st = createSim(w, 3, { core: 2, crowd: 2 });
    const sim = new Sim(w, st);
    const ids = core(sim).map((p) => p.id);
    const trunk = trunkTile(w, w.dryTree);
    expect(commandFor(st, w, ids, trunk)).toEqual({ t: 'chop', ids, tree: w.dryTree });
    // korona: kafelek metr od pnia też ścina to drzewo
    expect(commandFor(st, w, ids, trunk - w.size)).toEqual({ t: 'chop', ids, tree: w.dryTree });
    const kz = kozaOf(st);
    const kzTile = kz.y * w.size + kz.x;
    // nie ma drewna: do kozy nie ma czego dołożyć, więc to zwykły ruch
    expect(commandFor(st, w, ids, kzTile)).toEqual({ t: 'move', ids, to: kzTile });
    const pile = addWood(st, w.buildings[w.hq].entrances[0].out + 3 * w.size, w.size, 3);
    expect(commandFor(st, w, ids, pile.y * w.size + pile.x)).toEqual({ t: 'haul', ids, thing: pile.id });
    expect(commandFor(st, w, ids, kzTile)).toEqual({ t: 'refuel', ids, thing: kz.id });
    const floor = w.buildings[w.hq].entrances[0].out + 8 * w.size + 5;
    expect(commandFor(st, w, ids, floor)).toEqual({ t: 'move', ids, to: floor });
    // menu kontekstowe: domyślne polecenie pierwsze, „Idź tu” zawsze na końcu
    expect(commandsAt(st, w, ids, trunk).map((m) => m.label)).toEqual(['Ściąć drzewo', 'Idź tu']);
    expect(commandsAt(st, w, ids, kzTile).map((m) => m.label)).toEqual(['Dołożyć do kozy', 'Idź tu']);
  });

  it('„Gotować” na kuchence, gdy są zapasy i gaz', () => {
    const st = createSim(w, 3, { core: 2 });
    const ids = st.pawns.filter((p) => p.kind === 'core').map((p) => p.id);
    const stove = st.things.find((t) => t.kind === 'kuchenka')!;
    const tile = stove.y * w.size + stove.x;
    expect(commandsAt(st, w, ids, tile).map((m) => m.label)).toEqual(['Gotować', 'Idź tu']);
    expect(commandFor(st, w, ids, tile)).toEqual({ t: 'cook', ids });
    const sim = new Sim(w, st);
    sim.push({ t: 'cook', ids: [ids[0]] });
    sim.step();
    expect(st.pawns[0].job?.t).toBe('cook');
    // bez gazu i przy zimnej kozie gotować się nie da
    stove.fuel = 0;
    expect(commandsAt(st, w, ids, tile).map((m) => m.label)).toEqual(['Idź tu']);
  });

  it('„dołóż do kozy” przy pustym składzie: drewno spod drzewa trafia prosto do kozy', () => {
    const st = createSim(w, 3, { core: 1 });
    const pile = addWood(st, w.buildings[w.hq].entrances[0].out + 3 * w.size, w.size, 3);
    const sim = new Sim(w, st);
    const [p] = core(sim);
    sim.push({ t: 'refuel', ids: [p.id], thing: kozaOf(st).id });
    sim.step();
    expect(p.job?.t).toBe('refuel');
    expect(jobText(st, w, p)).toBe('Idzie po drewno do kozy.');
    for (let k = 0; k < 1200 && kozaOf(st).fuel === 0; k++) sim.step();
    expect(kozaOf(st).fuel).toBeGreaterThan(2 * BURN_TICKS);
    expect(st.things.find((t) => t.id === pile.id)).toBeUndefined();
  });

  it('polecenie w trakcie noszenia: drewno zostaje na ziemi, nic nie ginie', () => {
    const st = createSim(w, 3, { core: 1 });
    // bez kozy nikt nic nie spali, więc drewna musi być cały czas tyle samo
    st.things = st.things.filter((t) => t.kind !== 'koza');
    addWood(st, w.buildings[w.hq].entrances[0].out + 6 * w.size, w.size, 5);
    const sim = new Sim(w, st);
    const [p] = core(sim);
    const total = () => st.things.filter((t) => t.kind === 'drewno').reduce((s, t) => s + t.n, 0) + p.carry;
    for (let k = 0; k < 2000 && p.carry === 0; k++) sim.step();
    expect(p.carry).toBe(5);
    expect(jobText(st, w, p)).toBe('Niesie drewno do składu.');
    sim.push({ t: 'move', ids: [p.id], to: w.buildings[w.hq].entrances[0].out + 9 * w.size });
    sim.step();
    expect(p.carry).toBe(0);
    expect(total()).toBe(5);
    // po godzinie czekania na miejscu sam zanosi upuszczone drewno do składu
    for (let k = 0; k < 1500; k++) sim.step();
    expect(total()).toBe(5);
    expect(woodOn(st, w.size, w.interior.sklad)).toBe(5);
  });

  it('polecenia przyjmuje tylko zarząd, tłum to tło', () => {
    const st = createSim(w, 3, { core: 2, crowd: 2 });
    const sim = new Sim(w, st);
    const crowd = st.pawns.filter((p) => p.kind === 'crowd');
    const [c0] = core(sim);
    const floor = w.buildings[w.hq].entrances[0].out + 8 * w.size + 5;
    expect(
      commandFor(
        st,
        w,
        crowd.map((p) => p.id),
        floor,
      ),
    ).toBeNull();
    expect(commandFor(st, w, [crowd[0].id, c0.id], floor)).toEqual({ t: 'move', ids: [c0.id], to: floor });
    crowd[0].wait = 1e9;
    sim.push({ t: 'move', ids: [crowd[0].id], to: floor });
    sim.step();
    expect(crowd[0].path).toHaveLength(0);
  });

  it('kilka osób na jedno drzewo: jedna ścina, reszta idzie obok i potem nosi drewno', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 3 }));
    const ids = core(sim).map((p) => p.id);
    sim.push({ t: 'chop', ids, tree: w.dryTree });
    sim.step();
    const [a, b, c] = core(sim);
    expect(a.job?.t).toBe('chop');
    expect([b.job?.t, c.job?.t]).toEqual(['go', 'go']);
    const t = w.trees[w.dryTree];
    for (const p of [b, c]) {
      const end = p.path[p.path.length - 1];
      expect(Math.hypot((end % w.size) + 0.5 - t.x, Math.floor(end / w.size) + 0.5 - t.y)).toBeLessThan(5);
    }
    // po ścięciu pomocnicy od razu biorą się do noszenia, zamiast stać godzinę tam, gdzie doszli:
    // po dwóch sekundach każdy stos ktoś już niesie albo po niego idzie
    while (!sim.st.felled.includes(w.dryTree)) sim.step();
    for (let k = 0; k < 2 * TICKS_PER_SECOND; k++) sim.step();
    expect(sim.st.things.filter((t) => t.kind === 'drewno' && t.by < 0)).toEqual([]);
    expect([b, c].some((p) => p.job?.t === 'haul')).toBe(true);
  });
});

describe('samouczek i świat bez wnętrza', () => {
  it('bez wnętrza symulacja działa jak dawniej: bez rzeczy, samouczka i zmian potrzeb', () => {
    const w = plainBlock();
    const sim = new Sim(w, createSim(w, 3, { core: 4, crowd: 4 }));
    const before = JSON.stringify(core(sim).map((p) => p.needs));
    for (let k = 0; k < 2000; k++) sim.step();
    expect(sim.st.tut.step).toBe(-1);
    expect(sim.st.things).toEqual([]);
    expect(sim.st.temps).toEqual([]);
    expect(JSON.stringify(core(sim).map((p) => p.needs))).toBe(before);
    for (const p of core(sim)) {
      expect(p.path).toHaveLength(0);
      expect(p.job).toBeNull();
      expect(jobText(sim.st, w, p)).toBe('Stoi i czeka na polecenie.');
    }
  });
});

describe('determinizm i zapis z pracami w toku', () => {
  const w = block;
  function chain(seed: number, ticks: number): Sim {
    const sim = new Sim(w, createSim(w, seed, { core: 4, crowd: 8 }));
    const [m, n] = core(sim);
    sim.push({ t: 'select', ids: [m.id] });
    sim.push({ t: 'chop', ids: [m.id], tree: w.dryTree });
    for (let k = 0; k < ticks; k++) {
      if (k === 1500) sim.push({ t: 'move', ids: [n.id], to: w.buildings[w.hq].entrances[0].out + 5 * w.size });
      sim.step();
    }
    return sim;
  }

  it('ta sama seria poleceń daje ten sam stan, inne ziarno inny', () => {
    const a = chain(21, 6000);
    expect(chain(21, 6000).hash()).toBe(a.hash());
    expect(chain(22, 6000).hash()).not.toBe(a.hash());
    expect(a.st.felled).toEqual([w.dryTree]);
  });

  for (const when of ['rąbania', 'noszenia drewna'] as const)
    it(`zapis i wczytanie w trakcie ${when} daje ten sam skrót`, () => {
      const a = new Sim(w, createSim(w, 21, { core: 4, crowd: 8 }));
      const [m] = core(a);
      a.push({ t: 'chop', ids: [m.id], tree: w.dryTree });
      const busy = () =>
        when === 'rąbania' ? m.job?.t === 'chop' && m.job.phase === 1 : core(a).some((p) => p.carry > 0);
      for (let k = 0; k < 5000 && !busy(); k++) a.step();
      for (let k = 0; k < 37; k++) a.step();
      expect(busy()).toBe(true);
      const b = new Sim(w, JSON.parse(JSON.stringify(a.st)));
      for (let k = 0; k < 3000; k++) {
        a.step();
        b.step();
      }
      expect(b.hash()).toBe(a.hash());
    });

  const out = w.buildings[w.hq].entrances[0].out;
  const cases: [string, JobKind, (st: SimState) => void, (sim: Sim) => void][] = [
    ['dokładania do kozy', 'refuel', (st) => addWood(st, w.interior.sklad[0], w.size, 5), () => {}],
    [
      'jedzenia',
      'eat',
      (st) => {
        st.pawns[0].needs!.food = 20;
        const table = st.things.find((t) => t.kind === 'stol')!;
        st.things.push({ ...addWood(st, table.y * w.size + table.x, w.size, 3), kind: 'posilek' });
        st.things.splice(st.things.length - 2, 1);
      },
      () => {},
    ],
    [
      'snu',
      'sleep',
      (st) => {
        st.tick = atHour(1, 22.5);
      },
      () => {},
    ],
    [
      'grzania się',
      'warm',
      (st) => {
        kozaOf(st).fuel = 4 * BURN_TICKS;
        for (const p of st.pawns) if (p.needs) p.needs.warm = 20;
      },
      () => {},
    ],
    ['czekania po poleceniu', 'go', () => {}, (sim) => sim.push({ t: 'move', ids: [1], to: out + 4 * w.size })],
    [
      'rozbierania mebla',
      'burn',
      () => {},
      (sim) => sim.push({ t: 'burn', ids: [1], thing: sim.st.things.find((t) => t.kind === 'mebloscianka')!.id }),
    ],
    [
      'gotowania',
      'cook',
      (st) => {
        st.pawns[0].needs!.food = 40;
      },
      () => {},
    ],
  ];
  for (const [name, kind, setup, order] of cases)
    it(`zapis i wczytanie w trakcie ${name} daje ten sam skrót`, () => {
      const st = createSim(w, 21, { core: 4, crowd: 6 });
      setup(st);
      const a = new Sim(w, st);
      order(a);
      const busy = () => core(a).some((p) => p.job?.t === kind && p.job.phase === 1);
      for (let k = 0; k < 6000 && !busy(); k++) a.step();
      // w środku pracy; niesienie drewna do kozy trwa ledwie kilka ticków
      for (let k = 0; k < (kind === 'refuel' ? 2 : 17); k++) a.step();
      expect(busy()).toBe(true);
      const b = new Sim(w, JSON.parse(JSON.stringify(a.st)));
      for (let k = 0; k < 2000; k++) {
        a.step();
        b.step();
      }
      expect(b.hash()).toBe(a.hash());
    });

  it('polecenie czekające w kolejce przetrwa zapis', () => {
    const a = new Sim(w, createSim(w, 2, { core: 2 }));
    const [m] = core(a);
    a.push({ t: 'chop', ids: [m.id], tree: w.dryTree });
    const b = new Sim(w, JSON.parse(JSON.stringify(a.st)));
    b.step();
    expect(b.st.pawns[0].job?.t).toBe('chop');
  });

  it('stan to zwykły JSON, także z pracami w toku', () => {
    const sim = chain(5, 2500);
    expect(JSON.parse(JSON.stringify(sim.st))).toStrictEqual(sim.st);
  });

  it('od razu po wczytaniu wiadomo, które pomieszczenia grzeje koza (okna nocą)', () => {
    const st = createSim(w, 2, { core: 2 });
    const kz = kozaOf(st);
    kz.fuel = 2 * BURN_TICKS;
    st.tick = 7;
    const sim = new Sim(w, JSON.parse(JSON.stringify(st)));
    const kitchen = w.interior.room[kz.y * w.size + kz.x];
    expect(sim.boost[kitchen]).toBeGreaterThan(3);
    // do sąsiadów przez przedpokój, klatkę i ich drzwi dochodzi najwyżej ósma część
    const other = w.interior.rooms.find((r) => r.apt !== w.interior.home && r.kind === 'pokoj')!;
    expect(sim.boost[other.id]).toBeLessThanOrEqual(sim.boost[kitchen] / 8 + 1e-9);
  });
});

describe('tłum', () => {
  it('wnętrze bez mieszkania zarządu (home −1) nie zamyka tłumowi klatki', () => {
    const mask = homeMask({ ...block.interior, home: -1 }, block.size);
    expect(mask.includes(1)).toBe(false);
    expect(homeMask(block.interior, block.size).includes(1)).toBe(true);
  });

  it('tłum nie wchodzi do mieszkania zarządu', () => {
    const w = block;
    const sim = new Sim(w, createSim(w, 8, { core: 4, crowd: 30 }));
    const it = w.interior;
    let inside = 0;
    let indoors = 0;
    for (let k = 0; k < TICKS_PER_DAY / 2; k++) {
      sim.step();
      if (k % 10) continue;
      for (const p of sim.st.pawns) {
        if (p.kind !== 'crowd') continue;
        const r = it.room[tileOf(sim, p)];
        if (r < 0) continue;
        indoors++;
        if (it.rooms[r].apt === it.home) inside++;
      }
    }
    expect(inside).toBe(0);
    // tłum chodzi po klatce i do obcego mieszkania, więc test naprawdę coś sprawdza
    expect(indoors).toBeGreaterThan(0);
  });
});

describe('poprawki z przeglądu kodu', () => {
  const w = block;
  const out = w.buildings[w.hq].entrances[0].out;
  const covers = (t: Thing, x: number, y: number) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
  const LOOSE = ['drewno', 'jedzenie', 'posilek', 'pien'];
  const variant = (patch: Partial<MockWorld['interior']>, extra: Partial<MockWorld> = {}) =>
    ({ ...w, ...extra, interior: { ...w.interior, ...patch } }) as MockWorld;

  it('dwa osobne polecenia ścięcia tego samego drzewa: jedno ścięcie i tyle drewna, ile z drzewa', () => {
    const st = createSim(w, 4, { core: 2 });
    st.things = st.things.filter((t) => t.kind !== 'koza');
    const sim = new Sim(w, st);
    const [a, b] = core(sim);
    sim.push({ t: 'chop', ids: [a.id], tree: w.dryTree });
    for (let k = 0; k < 200; k++) sim.step();
    expect(a.job?.t).toBe('chop');
    // drugi nie zaczyna osobnego rąbania, tylko idzie pomóc
    sim.push({ t: 'chop', ids: [b.id], tree: w.dryTree });
    sim.step();
    expect(b.job?.t).toBe('go');
    // ponowne polecenie temu samemu drwalowi nie zaczyna rąbania od początku
    while (a.job?.phase !== 1) sim.step();
    const until = a.job!.until;
    sim.push({ t: 'chop', ids: [a.id], tree: w.dryTree });
    sim.step();
    expect(a.job?.t).toBe('chop');
    expect(a.job?.until).toBe(until);
    while (!st.felled.includes(w.dryTree)) sim.step();
    for (let k = 0; k < 2000; k++) sim.step();
    expect(st.felled).toEqual([w.dryTree]);
    expect(st.things.filter((t) => t.kind === 'pien')).toHaveLength(1);
    const wood = st.things.filter((t) => t.kind === 'drewno').reduce((x, t) => x + t.n, 0) + a.carry + b.carry;
    expect(wood).toBe(woodFrom(w.trees[w.dryTree]));
  });

  it('stuknięcie w koronę dalej od pnia to ruch, ścięcie zostaje w menu', () => {
    const st = createSim(w, 3, { core: 1 });
    const ids = [st.pawns[0].id];
    const trunk = trunkTile(w, w.dryTree);
    const far = trunk - 2 * w.size;
    expect(commandFor(st, w, ids, far)?.t).toBe('move');
    expect(commandsAt(st, w, ids, far).map((m) => m.label)).toEqual(['Ściąć drzewo', 'Idź tu']);
    // pień i kafelki tuż obok: ścięcie od razu
    expect(commandFor(st, w, ids, trunk + 1)?.t).toBe('chop');
    expect(commandFor(st, w, ids, trunk)?.t).toBe('chop');
  });

  it('w drzwiach temperatura sąsiedniego pomieszczenia, a nie pogoda', () => {
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    expect(sim.outdoor()).not.toBe(9);
    for (const d of w.interior.doors) {
      const near = [d - 1, d + 1, d - w.size, d + w.size]
        .map((i) => w.interior.room[i])
        .filter((r) => r >= 0)
        .map((r) => st.temps[r]);
      expect(near).toContain(sim.tempAt(d));
    }
  });

  it('bez kozy albo bez składu samouczek jest wyłączony', () => {
    expect(createSim(w, 3, { core: 1 }).tut.step).toBe(0);
    const noKoza = variant({ furniture: w.interior.furniture.filter((f) => f.kind !== 'koza') });
    expect(createSim(noKoza, 3, { core: 1 }).tut.step).toBe(-1);
    expect(createSim(variant({ sklad: [] }), 3, { core: 1 }).tut.step).toBe(-1);
  });

  it('zarząd pilnuje kozy we własnym mieszkaniu, nawet gdy na liście mebli pierwsza jest obca', () => {
    const q = w.interior.rooms.find((r) => r.apt !== w.interior.home && r.kind === 'pokoj')!;
    let qi = -1;
    for (let i = w.size * w.size - 1; i >= 0; i--) if (w.interior.room[i] === q.id && !w.blocked[i]) qi = i;
    const other = { kind: 'koza', x: qi % w.size, y: Math.floor(qi / w.size), w: 1, h: 1, rot: 0 };
    const w2 = variant({ furniture: [other, ...w.interior.furniture] });
    const st = createSim(w2, 3, { core: 4 });
    const kozy = st.things.filter((t) => t.kind === 'koza');
    const mine = kozy.find((t) => inHomeApt(w2.interior, t.y * w.size + t.x))!;
    const theirs = kozy.find((t) => t !== mine)!;
    addWood(st, w.interior.sklad[0], w.size, 4);
    const sim = new Sim(w2, st);
    for (const p of core(sim)) expect(w.interior.rooms[w.interior.room[tileOf(sim, p)]].apt).not.toBe(q.apt);
    for (let k = 0; k < 600 && mine.fuel === 0; k++) sim.step();
    expect(mine.fuel).toBeGreaterThan(0);
    expect(theirs.fuel).toBe(0);
  });

  it('dużo osób w zarządzie: każdy startuje gdzie indziej, w mieszkaniu zarządu albo na jego klatce', () => {
    // obce mieszkanie udaje drugą klatkę, z którą mieszkanie zarządu nie ma drzwi
    const rooms = w.interior.rooms.map((r) =>
      r.apt !== w.interior.home && r.kind === 'pokoj' ? { ...r, kind: 'klatka' as RoomKind, apt: -1 } : r,
    );
    const w2 = variant({ rooms });
    const sim = new Sim(w2, createSim(w2, 3, { core: 12 }));
    const tiles = core(sim).map((p) => tileOf(sim, p));
    expect(new Set(tiles).size).toBe(12);
    const home = w.interior.rooms.find((r) => r.kind === 'klatka')!.id;
    for (const i of tiles) {
      const r = w2.interior.room[i];
      expect(r === home || w2.interior.rooms[r].apt === w2.interior.home).toBe(true);
    }
  });

  it('bez łóżek i bez pokoju śpi na podłodze gdziekolwiek w mieszkaniu zarządu', () => {
    const rooms = w.interior.rooms.map((r) =>
      r.kind === 'pokoj' && r.apt === w.interior.home ? { ...r, kind: 'sala' as RoomKind } : r,
    );
    const w2 = variant({ rooms });
    const st = createSim(w2, 3, { core: 2 });
    st.things = st.things.filter((t) => t.kind !== 'lozko' && t.kind !== 'wersalka');
    st.tick = atHour(1, 22.5);
    const sim = new Sim(w2, st);
    for (let k = 0; k < TICKS_PER_HOUR; k++) sim.step();
    for (const p of core(sim)) {
      expect(p.job?.t).toBe('sleep');
      expect(p.job?.phase).toBe(1);
      expect(inHomeApt(w2.interior, tileOf(sim, p))).toBe(true);
      expect(jobText(st, w2, p)).toBe('Śpi na podłodze.');
    }
  });

  it('stos, do którego nie da się dojść, nie zasłania osiągalnego', () => {
    const pocket = out + 6 * w.size + 3;
    const blocked = w.blocked.slice();
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) if (dx || dy) blocked[pocket + dy * w.size + dx] = 1;
    const w2 = variant({}, { blocked });
    const st = createSim(w2, 3, { core: 1 });
    st.things = st.things.filter((t) => t.kind !== 'koza');
    addWood(st, pocket, w.size, 3);
    addWood(st, out + 9 * w.size, w.size, 2);
    const sim = new Sim(w2, st);
    for (let k = 0; k < 1500; k++) sim.step();
    expect(woodOn(st, w.size, w.interior.sklad)).toBe(2);
  });

  it('upuszczone drewno nie ląduje na meblach', () => {
    const st = createSim(w, 3, { core: 1 });
    st.things = st.things.filter((t) => t.kind !== 'koza');
    const p = st.pawns[0];
    const bed = st.things.find((t) => t.kind === 'lozko')!;
    p.x = bed.x + 0.5;
    p.y = bed.y + 0.5;
    p.carry = 3;
    const sim = new Sim(w, st);
    sim.push({ t: 'move', ids: [p.id], to: out + 3 * w.size });
    sim.step();
    const pile = st.things.find((t) => t.kind === 'drewno')!;
    expect(pile.n).toBe(3);
    expect(st.things.some((t) => !LOOSE.includes(t.kind) && covers(t, pile.x, pile.y))).toBe(false);
  });

  it('„zanieś do składu” z pełnymi rękami: odkłada swoje i najpierw niesie kliknięty stos', () => {
    const st = createSim(w, 3, { core: 1 });
    st.things = st.things.filter((t) => t.kind !== 'koza');
    const p = st.pawns[0];
    p.carry = 6;
    const pile = addWood(st, out + 4 * w.size, w.size, 3);
    const sim = new Sim(w, st);
    sim.push({ t: 'haul', ids: [p.id], thing: pile.id });
    let firstDelivery = -1;
    for (let k = 0; k < 3000; k++) {
      sim.step();
      if (firstDelivery < 0 && woodOn(st, w.size, w.interior.sklad) > 0)
        firstDelivery = st.things.some((t) => t.id === pile.id) ? 0 : 1;
    }
    expect(firstDelivery).toBe(1);
    expect(woodOn(st, w.size, w.interior.sklad)).toBe(9);
  });
});

describe('palenie mebli', () => {
  const w = block;
  const tileOfThing = (t: Thing) => t.y * w.size + t.x;
  const moodsOf = (p: Pawn) => p.moods.map((m) => `${m.why} ${m.d}`);

  it('w menu z potwierdzeniem, ale nigdy jako polecenie domyślne; metalu i kozy się nie pali', () => {
    const st = createSim(w, 3, { core: 1 });
    const ids = [st.pawns[0].id];
    const bed = st.things.find((t) => t.kind === 'lozko')!;
    const menu = commandsAt(st, w, ids, tileOfThing(bed));
    expect(menu.map((m) => m.label)).toEqual(['Spalić łóżko', 'Idź tu']);
    expect(menu[0]).toMatchObject({ cmd: { t: 'burn', ids, thing: bed.id }, quick: false, confirm: true });
    expect(commandFor(st, w, ids, tileOfThing(bed))?.t).toBe('move');
    for (const kind of ['koza', 'kuchenka', 'lodowka', 'wanna']) {
      const t = st.things.find((q) => q.kind === kind)!;
      expect(commandsAt(st, w, ids, tileOfThing(t)).some((m) => m.cmd.t === 'burn')).toBe(false);
    }
    const shelf = st.things.find((t) => t.kind === 'mebloscianka')!;
    expect(commandsAt(st, w, ids, tileOfThing(shelf))[0].label).toBe('Spalić meblościankę');
  });

  it('łóżka w mieszkaniu zarządu mają właścicieli i każdy śpi w swoim', () => {
    const st = createSim(w, 3, { core: 4 });
    const own = st.pawns.filter((p) => p.kind === 'core').map((p) => st.things.find((t) => t.owner === p.id));
    expect(own.every((t) => t && (t.kind === 'lozko' || t.kind === 'wersalka'))).toBe(true);
    st.tick = atHour(1, 22.5);
    const sim = new Sim(w, st);
    for (let k = 0; k < TICKS_PER_HOUR; k++) sim.step();
    core(sim).forEach((p, k) => {
      expect(p.job?.t).toBe('sleep');
      expect(p.job?.target).toBe(own[k]!.id);
    });
  });

  it('spalony mebel znika ze stanu, daje opał od razu do kozy, a nastrój spada, najbardziej właścicielowi', () => {
    const st = createSim(w, 3, { core: 4 });
    const [a, b] = st.pawns;
    const bed = st.things.find((t) => t.owner === b.id)!;
    const sim = new Sim(w, st);
    sim.push({ t: 'burn', ids: [a.id], thing: bed.id });
    sim.step();
    expect(jobText(st, w, a)).toBe('Idzie rozbić łóżko na opał.');
    let seen = false;
    for (let k = 0; k < 1500 && kozaOf(st).fuel === 0; k++) {
      sim.step();
      if (jobText(st, w, a) === 'Rozbiera łóżko na opał.') seen = true;
    }
    expect(seen).toBe(true);
    expect(st.things.some((t) => t.id === bed.id)).toBe(false);
    expect(kozaOf(st).fuel).toBeGreaterThan(2 * BURN_TICKS);
    expect(st.burned).toEqual([{ tick: expect.any(Number), kind: 'lozko', apt: w.interior.home, by: a.id }]);
    for (const p of core(sim)) expect(moodsOf(p)).toContain('Palimy meble -6');
    expect(moodsOf(b)).toContain('Spalili moje łóżko -18');
    expect(moodsOf(a)).not.toContain('Spalili moje łóżko -18');
    // nastrój właściciela po kroku potrzeb jest wyraźnie niżej niż przed spaleniem
    for (let k = 0; k < 40; k++) sim.step();
    expect(b.needs!.mood).toBeLessThan(a.needs!.mood);
  });

  it('meble z cudzego mieszkania kosztują wszystkich więcej', () => {
    const st = createSim(w, 3, { core: 2 });
    const theirs = st.things.find((t) => t.kind === 'lozko' && !inHomeApt(w.interior, tileOfThing(t)))!;
    const sim = new Sim(w, st);
    sim.push({ t: 'burn', ids: [st.pawns[0].id], thing: theirs.id });
    for (let k = 0; k < 2000 && st.things.includes(theirs); k++) sim.step();
    expect(st.things.includes(theirs)).toBe(false);
    for (const p of core(sim)) expect(moodsOf(p)).toContain('Rozbieramy cudze mieszkanie -10');
    expect(st.burned[0]).toMatchObject({ kind: 'lozko', apt: 1 });
  });

  it('chwilowe nastroje wygasają', () => {
    const st = createSim(w, 3, { core: 2 });
    const shelf = st.things.find((t) => t.kind === 'mebloscianka')!;
    const sim = new Sim(w, st);
    sim.push({ t: 'burn', ids: [st.pawns[0].id], thing: shelf.id });
    for (let k = 0; k < 2000 && st.things.includes(shelf); k++) sim.step();
    expect(core(sim)[1].moods.length).toBeGreaterThan(0);
    for (let k = 0; k < 13 * TICKS_PER_HOUR; k++) sim.step();
    expect(core(sim)[1].moods).toEqual([]);
  });
});
