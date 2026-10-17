import { describe, expect, it } from 'vitest';
import { START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { homeMask } from '../../src/sim/house.ts';
import { commandFor, commandsAt, jobText } from '../../src/sim/orders.ts';
import { BURN_TICKS, createSim, type Pawn, Sim, type SimState, type Thing, woodFrom } from '../../src/sim/sim.ts';
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

  it('sam nie ścina drzew', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 4 }));
    for (let k = 0; k < 2 * TICKS_PER_DAY; k++) sim.step();
    expect(sim.st.felled).toEqual([]);
    for (const p of core(sim))
      for (const v of Object.values(p.needs!)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
  });

  it('je przy stole, gdy jest głodny', () => {
    const st = createSim(w, 3, { core: 4 });
    const p0 = st.pawns[0];
    p0.needs!.food = 20;
    const food0 = st.things.find((t) => t.kind === 'jedzenie')!.n;
    expect(food0).toBeGreaterThanOrEqual(12);
    const sim = new Sim(w, st);
    const texts = new Set<string>();
    for (let k = 0; k < 3000 && p0.needs!.food < 50; k++) {
      sim.step();
      texts.add(jobText(st, w, p0));
    }
    expect(p0.needs!.food).toBeGreaterThan(50);
    expect(st.things.find((t) => t.kind === 'jedzenie')!.n).toBe(food0 - 1);
    expect(texts).toContain('Je przy stole.');
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
