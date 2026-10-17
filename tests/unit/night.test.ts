import { describe, expect, it } from 'vitest';
import { commandFor, commandsAt, jobText } from '../../src/sim/orders.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock, mockHouse } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const gateTiles = () => {
  const g = w.fence.gate;
  const out: number[] = [];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) out.push(y * size + x);
  return out;
};

describe('siatka w symulacji', () => {
  it('stan ze świata: dziury ze startu, brama otwarta, wytrzymałość odcinków; odczyt dla zarządu', () => {
    const st = createSim(w, 3, { core: 2 });
    const f = st.fence!;
    expect(f).toBeTruthy();
    expect(
      f.holes
        .flatMap((h) => h.tiles)
        .slice()
        .sort((a, b) => a - b),
    ).toEqual(w.fence.hole);
    for (const h of f.holes) {
      expect(h.patch).toBe(0);
      expect(h.size).toBeGreaterThan(0);
      expect(h.size).toBeLessThanOrEqual(1);
    }
    expect(f.gateOpen).toBe(true);
    expect(f.hp).toHaveLength(w.fence.tiles.length);
    for (const [k, t] of w.fence.tiles.entries()) {
      if (w.fence.hole.includes(t)) expect(f.hp[k]).toBe(0);
      else expect(f.hp[k]).toBeGreaterThan(20);
    }
    const s = snapshot(st, w);
    expect(s.fence.holes.map((h) => h.id)).toEqual(f.holes.map((h) => h.id));
    expect(s.fence.durability).toBeGreaterThan(0.3);
    expect(s.fence.durability).toBeLessThan(0.85);
    expect(s.fence.gateOpen).toBe(true);
    expect(s.light).toEqual({ campfire: false, gateLamp: false });
  });

  it('zarząd i mieszkańcy nie przełażą dziurami, szabrownicy tak', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    for (const t of w.fence.hole) {
      expect(sim.canWalk('core', t)).toBe(false);
      expect(sim.canWalk('resident', t)).toBe(false);
      expect(sim.canWalk('stranger', t)).toBe(true);
    }
    for (const t of w.fence.tiles.filter((x) => !w.fence.hole.includes(x)))
      for (const k of ['core', 'resident', 'stranger'] as const) expect(sim.canWalk(k, t)).toBe(false);
  });

  it('zamknięta brama zatrzymuje mieszkańców i obcych, zarząd ma klucz', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    for (const t of gateTiles()) {
      expect(sim.canWalk('core', t)).toBe(true);
      expect(sim.canWalk('stranger', t)).toBe(true);
      // mieszkańcy nie wychodzą za siatkę nawet przy otwartej bramie
      expect(sim.canWalk('resident', t)).toBe(false);
    }
    sim.push({ t: 'gate', ids: [], open: false });
    sim.step();
    expect(sim.st.fence!.gateOpen).toBe(false);
    for (const t of gateTiles()) {
      expect(sim.canWalk('core', t)).toBe(true);
      expect(sim.canWalk('stranger', t)).toBe(false);
    }
    expect(snapshot(sim.st, w).fence.gateOpen).toBe(false);
  });

  it('zapis i wczytanie odtwarza dziury, łaty i bramę', () => {
    const st = createSim(w, 3, { core: 2 });
    const f = st.fence!;
    f.holes[0].patch = 70;
    f.gateOpen = false;
    const sim = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (const t of f.holes[0].tiles) expect(sim.canWalk('stranger', t)).toBe(false);
    for (const t of f.holes[1].tiles) expect(sim.canWalk('stranger', t)).toBe(true);
    for (const t of gateTiles()) expect(sim.canWalk('stranger', t)).toBe(false);
    // łata podnosi wytrzymałość siatki
    expect(snapshot(sim.st, w).fence.durability).toBeGreaterThan(
      snapshot(createSim(w, 3, { core: 2 }), w).fence.durability,
    );
    expect(snapshot(sim.st, w).fence.holes).toHaveLength(f.holes.length - 1);
  });
});

describe('mieszkańcy zamiast tłumu', () => {
  const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
  const residents = (sim: Sim) => sim.st.pawns.filter((p) => p.kind === 'resident');
  const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
  const yard = new Set(w.fence.yard);
  const roomOf = (i: number) => w.interior.room[i];
  const inHq = (i: number) => roomOf(i) >= 0 || w.interior.doors.includes(i);

  it('3–8 osób w pozostałych mieszkaniach siedziby połączonych z podwórkiem; w domu jednorodzinnym nikt', () => {
    const st = createSim(w, 3, { core: 4 });
    const rs = st.pawns.filter((p) => p.kind === 'resident');
    expect(rs.length).toBeGreaterThanOrEqual(3);
    expect(rs.length).toBeLessThanOrEqual(8);
    for (const p of rs) {
      expect(p.apt).toBeGreaterThanOrEqual(0);
      expect(p.apt).not.toBe(w.interior.home);
      expect(w.interior.rooms[roomOf(tileOf(p))].apt).toBe(p.apt);
      expect(p.person).toBe(-1);
    }
    expect(snapshot(st, w).residents).toBe(rs.length);
    const house = mockHouse();
    expect(createSim(house, 3, { core: 4 }).pawns.some((p) => p.kind === 'resident')).toBe(false);
  });

  it('plan dnia: rano w domu, za dnia praca na podwórku, wieczorem i nocą w środku', () => {
    const sim = new Sim(w, createSim(w, 3, { core: 2 }));
    let yardDay = 0;
    let samplesDay = 0;
    while (sim.st.tick < atHour(2, 17)) {
      sim.step();
      if (sim.st.tick % 100) continue;
      const h = 15 + sim.st.tick / 800;
      const hour = h % 24;
      for (const p of residents(sim)) {
        const i = tileOf(p);
        if (hour >= 23 || hour < 5) {
          // nocą w swoim mieszkaniu, śpią
          expect(w.interior.rooms[roomOf(i)]?.apt).toBe(p.apt);
          expect(p.job?.t).toBe('sleep');
        }
        if (hour >= 10 && hour < 16 && h > 24) {
          samplesDay++;
          if (yard.has(i)) yardDay++;
        }
      }
    }
    expect(yardDay / samplesDay).toBeGreaterThan(0.5);
  });

  it('nie wychodzą za siatkę, nie przełażą dziurami i nie wchodzą do mieszkania zarządu', () => {
    const sim = new Sim(w, createSim(w, 5, { core: 2 }));
    const holes = new Set(w.fence.hole);
    for (let k = 0; k < 2 * 24 * 800; k++) {
      sim.step();
      if (k % 20) continue;
      for (const p of residents(sim)) {
        const i = tileOf(p);
        expect(yard.has(i) || inHq(i)).toBe(true);
        expect(holes.has(i)).toBe(false);
        const r = roomOf(i);
        if (r >= 0) expect(w.interior.rooms[r].apt).not.toBe(w.interior.home);
      }
    }
  });
});

describe('prace na noc i podwórko', () => {
  const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
  const core = (sim: Sim) => sim.st.pawns.filter((p) => p.kind === 'core');
  const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
  const yard = new Set(w.fence.yard);
  const near = (a: number, b: number, d: number) =>
    Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size))) <= d;

  it('warta przy bramie: stoi z lampą od strony podwórka, nie śpi do rana, światło dla zarządu', () => {
    const st = createSim(w, 3, { core: 3 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const [g] = core(sim);
    sim.push({ t: 'guard', ids: [g.id], post: 'brama' });
    while (st.tick < atHour(2, 2)) sim.step();
    expect(g.job?.t).toBe('guard');
    expect(g.job?.phase).toBe(1);
    expect(yard.has(tileOf(g))).toBe(true);
    expect(gateTiles().some((t) => near(t, tileOf(g), 1))).toBe(true);
    expect(jobText(st, w, g)).toBe('Trzyma wartę przy bramie.');
    const s = snapshot(st, w);
    expect(s.light.gateLamp).toBe(true);
    expect(s.people.find((p) => p.pawn === g.id)?.asleep).toBe(false);
    // pozostali śpią, ale czują się bezpieczniej, bo ktoś trzyma wartę
    expect(core(sim)[1].job?.t).toBe('sleep');
    while (st.tick < atHour(2, 6.5)) sim.step();
    expect(g.job?.t).not.toBe('guard');
  });

  it('łatanie dziury: deski albo złom ze sterty, potem dziura zamknięta dla wszystkich', () => {
    const st = createSim(w, 3, { core: 2 });
    const mat = () => st.things.filter((t) => t.kind === 'deski' || t.kind === 'zlom').reduce((a, t) => a + t.n, 0);
    const before = mat();
    const hole = st.fence!.holes[0];
    const sim = new Sim(w, st);
    const [p] = core(sim);
    sim.push({ t: 'patch', ids: [p.id], hole: hole.id });
    const texts = new Set<string>();
    for (let k = 0; k < 4000 && !hole.patch; k++) {
      sim.step();
      texts.add(jobText(st, w, p));
    }
    expect(hole.patch).toBeGreaterThan(0);
    expect(mat()).toBe(before - 3);
    expect(texts).toContain('Łata dziurę w siatce.');
    for (const t of hole.tiles) expect(sim.canWalk('stranger', t)).toBe(false);
    expect(snapshot(st, w).fence.holes.some((h) => h.id === hole.id)).toBe(false);
  });

  it('ognisko na podwórku: z dwóch sztuk drewna, świeci i grzeje na dworze, można dokładać', () => {
    const st = createSim(w, 3, { core: 1 });
    const y5 = w.fence.yard[5];
    st.things.push({
      id: st.nextThing++,
      kind: 'drewno',
      x: y5 % size,
      y: Math.floor(y5 / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 5,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    const free = (i: number) =>
      !w.blocked[i] && !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size));
    const spot = w.fence.yard.find((i, k) => k > 20 && free(i))!;
    st.tick = atHour(1, 19);
    const sim = new Sim(w, st);
    const [a] = core(sim);
    sim.push({ t: 'campfire', ids: [a.id], at: spot });
    const texts = new Set<string>();
    for (let k = 0; k < 2000 && !st.things.some((t) => t.kind === 'ognisko'); k++) {
      sim.step();
      texts.add(jobText(st, w, a));
    }
    expect(texts).toContain('Rozpala ognisko.');
    const fire = st.things.find((t) => t.kind === 'ognisko')!;
    expect(fire).toBeTruthy();
    expect([fire.x, fire.y]).toEqual([spot % size, Math.floor(spot / size)]);
    expect(fire.fuel).toBeGreaterThan(0);
    expect(st.things.filter((t) => t.kind === 'drewno').reduce((x, t) => x + t.n, 0) + a.carry).toBe(3);
    expect(snapshot(st, w).light.campfire).toBe(true);
    // na ognisko się nie wchodzi
    expect(sim.canWalk('core', spot)).toBe(false);
    // dokładanie do ogniska z menu
    const menu = commandsAt(st, w, [a.id], spot);
    expect(menu[0].label).toBe('Dołożyć do ogniska');
    const fuel0 = fire.fuel;
    sim.push(menu[0].cmd);
    for (let k = 0; k < 1500 && fire.fuel <= fuel0; k++) sim.step();
    expect(fire.fuel).toBeGreaterThan(fuel0);
    // przy ognisku na dworze ciepło rośnie mimo nocy, a w jego świetle nie jest ciemno
    a.needs!.warm = 20;
    a.x = fire.x + 1.5;
    a.y = fire.y + 0.5;
    a.path = [];
    a.pi = 0;
    a.job = {
      t: 'go',
      target: -1,
      tile: tileOf(a),
      phase: 1,
      from: -1,
      t0: st.tick,
      until: st.tick + 2000,
      order: true,
      n: 0,
      what: '',
    };
    for (let k = 0; k < 400; k++) sim.step();
    expect(a.needs!.warm).toBeGreaterThan(30);
  });

  it('warta przy dziurze: stoi na podwórku tuż przy niej, bez lampy przy bramie', () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const [g] = core(sim);
    const hole = st.fence!.holes[0];
    sim.push({ t: 'guard', ids: [g.id], post: `d${hole.id}` });
    for (let k = 0; k < 2000; k++) sim.step();
    expect(g.job?.t).toBe('guard');
    expect(g.job?.phase).toBe(1);
    expect(yard.has(tileOf(g))).toBe(true);
    expect(hole.tiles.some((t) => near(t, tileOf(g), 1))).toBe(true);
    expect(jobText(st, w, g)).toBe('Trzyma wartę przy dziurze.');
    expect(snapshot(st, w).light.gateLamp).toBe(false);
    // nieznany posterunek: nic się nie dzieje
    const [, b] = core(sim);
    const before = JSON.stringify(b.job);
    sim.push({ t: 'guard', ids: [b.id], post: 'd99' });
    sim.step();
    expect(JSON.stringify(b.job)).toBe(before);
  });

  it('przerwane łatanie: deski zostają na stercie obok, nic nie ginie', () => {
    const st = createSim(w, 3, { core: 1 });
    const mat = () => st.things.filter((t) => t.kind === 'deski' || t.kind === 'zlom').reduce((a, t) => a + t.n, 0);
    const before = mat();
    const sim = new Sim(w, st);
    const [p] = core(sim);
    sim.push({ t: 'patch', ids: [p.id], hole: st.fence!.holes[0].id });
    for (let k = 0; k < 3000 && p.job?.phase !== 1; k++) sim.step();
    expect(p.job?.t).toBe('patch');
    expect(p.job?.n).toBe(3);
    expect(mat()).toBe(before - 3);
    expect(jobText(st, w, p)).toBe('Niesie materiał do dziury.');
    sim.push({ t: 'move', ids: [p.id], to: w.buildings[w.hq].entrances[0].out });
    sim.step();
    expect(mat()).toBe(before);
    expect(st.fence!.holes[0].patch).toBe(0);
  });

  it('wyprawa: wychodzi bramą, znika za mapą, potrzeby stoją, wraca pod drzwi siedziby', () => {
    const st = createSim(w, 3, { core: 2 });
    const sim = new Sim(w, st);
    const [p] = core(sim);
    const gate = gateTiles();
    sim.push({ t: 'away', ids: [p.id] });
    let out = false;
    for (let k = 0; k < 3000 && !p.away; k++) {
      sim.step();
      if (gate.includes(tileOf(p))) out = true;
    }
    expect(p.away).toBe(true);
    expect(out).toBe(true);
    expect(yard.has(tileOf(p))).toBe(false);
    expect(jobText(st, w, p)).toBe('Na wyprawie.');
    const sp = snapshot(st, w).people.find((q) => q.pawn === p.id)!;
    expect(sp.away).toBe(true);
    expect(sp.inside).toBe(false);
    // poza mapą nikt go nie widzi, polecenia go nie ruszają, potrzeby stoją
    const needs = { ...p.needs! };
    const at = [p.x, p.y];
    sim.push({ t: 'move', ids: [p.id], to: w.fence.yard[0] });
    for (let k = 0; k < 2000; k++) sim.step();
    expect(p.away).toBe(true);
    expect([p.x, p.y]).toEqual(at);
    expect(p.needs).toEqual(needs);
    sim.push({ t: 'back', ids: [p.id] });
    sim.step();
    expect(p.away).toBe(false);
    let back = false;
    for (let k = 0; k < 3000 && p.job?.t === 'go'; k++) {
      sim.step();
      if (gate.includes(tileOf(p))) back = true;
    }
    expect(back).toBe(true);
    expect(near(tileOf(p), w.buildings[w.hq].entrances[0].out, 1)).toBe(true);
  });

  it('menu: dziura (łata, gdy jest materiał, i warta), brama (warta, kłódka), ognisko tylko z menu', () => {
    const st = createSim(w, 3, { core: 2 });
    const ids = core(new Sim(w, st)).map((p) => p.id);
    const hole = st.fence!.holes[0];
    const m = commandsAt(st, w, ids, hole.tiles[0]);
    expect(m[0]).toEqual({ cmd: { t: 'patch', ids, hole: hole.id }, label: 'Załatać dziurę', quick: true });
    expect(m.map((x) => x.label)).toContain('Pilnować tutaj');
    expect(m.find((x) => x.label === 'Pilnować tutaj')!.cmd).toEqual({ t: 'guard', ids, post: `d${hole.id}` });
    const g = commandsAt(st, w, ids, gateTiles()[0]);
    expect(g.find((x) => x.label === 'Pilnować bramy')?.cmd).toEqual({ t: 'guard', ids, post: 'brama' });
    expect(g.find((x) => x.label === 'Zamknąć bramę')?.cmd).toEqual({ t: 'gate', ids, open: false });
    // kliknięcie w bramę to nadal „idź tu”
    expect(commandFor(st, w, ids, gateTiles()[0])?.t).toBe('move');
    const free = w.fence.yard.find(
      (i, k) => k > 10 && !w.blocked[i] && !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size)),
    )!;
    expect(commandsAt(st, w, ids, free).map((x) => x.label)).not.toContain('Rozpalić ognisko tutaj');
    st.things.push({
      id: st.nextThing++,
      kind: 'drewno',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rot: 0,
      n: 2,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    const f = commandsAt(st, w, ids, free).find((x) => x.label === 'Rozpalić ognisko tutaj');
    expect(f).toEqual({ cmd: { t: 'campfire', ids, at: free }, label: 'Rozpalić ognisko tutaj', quick: false });
    // bez desek i złomu nie ma czym łatać
    st.things = st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'zlom');
    expect(commandsAt(st, w, ids, hole.tiles[0]).map((x) => x.label)).not.toContain('Załatać dziurę');
    st.fence!.gateOpen = false;
    expect(commandsAt(st, w, ids, gateTiles()[0]).map((x) => x.label)).toContain('Otworzyć bramę');
  });

  it('uchwała o bramie: zamknięta od 20:00 do rana', () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(1, 19.5);
    const sim = new Sim(w, st);
    sim.setLaws({ gateClosed: true, burnMood: 1, workStart: 8 });
    while (st.tick < atHour(1, 20.1)) sim.step();
    expect(st.fence!.gateOpen).toBe(false);
    while (st.tick < atHour(2, 6.1)) sim.step();
    expect(st.fence!.gateOpen).toBe(true);
  });
});

describe('szabrownicy', () => {
  const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
  const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
  const yard = new Set(w.fence.yard);
  const sklad = w.interior.sklad;
  const strangers = (sim: Sim) => sim.st.pawns.filter((p) => p.kind === 'stranger');
  const pile = (st: ReturnType<typeof createSim>, i: number, n: number) =>
    st.things.push({
      id: st.nextThing++,
      kind: 'drewno',
      x: i % size,
      y: Math.floor(i / size),
      w: 1,
      h: 1,
      rot: 0,
      n,
      fuel: 0,
      by: -1,
      owner: -1,
    });
  const wood = (st: ReturnType<typeof createSim>, where: 'loose' | 'sklad') =>
    st.things
      .filter((t) => t.kind === 'drewno' && sklad.includes(t.y * size + t.x) === (where === 'sklad'))
      .reduce((a, t) => a + t.n, 0);
  const food = (st: ReturnType<typeof createSim>) =>
    st.things.filter((t) => t.kind === 'jedzenie').reduce((a, t) => a + t.n, 0);
  /** noc z napadem o 23:00 na pierwszą dziurę; drewno luzem na podwórku i w składzie */
  const night = (guard: boolean) => {
    const st = createSim(w, 3, { core: 2 });
    const looseAt = w.fence.yard.find(
      (i, k) => k > 30 && !w.blocked[i] && !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size)),
    )!;
    // więcej drewna, niż uniosą w workach: widać, co biorą najpierw
    pile(st, looseAt, 5);
    pile(st, sklad[0], 10);
    pile(st, sklad[1], 10);
    st.tick = atHour(1, 22);
    const sim = new Sim(w, st);
    const hole = st.fence!.holes[0];
    if (guard) sim.push({ t: 'guard', ids: [st.pawns[0].id], post: `d${hole.id}` });
    sim.push({ t: 'raid', ids: [], at: atHour(1, 23), post: `d${hole.id}` });
    return { st, sim, hole };
  };

  it('bez warty: podchodzą z zewnątrz do dziury, wchodzą nią, kradną drewno luzem, potem skład, i odchodzą', () => {
    const { st, sim, hole } = night(false);
    const loose0 = wood(st, 'loose');
    const sklad0 = wood(st, 'sklad');
    const food0 = food(st);
    // pojawiają się pół godziny przed napadem daleko za siatką
    while (!strangers(sim).length && st.tick < atHour(1, 23)) sim.step();
    expect(st.tick).toBe(atHour(1, 22.5) + 1);
    const s0 = strangers(sim);
    expect(s0.length).toBeGreaterThanOrEqual(1);
    expect(s0.length).toBeLessThanOrEqual(3);
    for (const p of s0) {
      expect(yard.has(tileOf(p))).toBe(false);
      expect(
        Math.min(...hole.tiles.map((t) => Math.hypot((t % size) - p.x, Math.floor(t / size) - p.y))),
      ).toBeGreaterThan(8);
    }
    expect(snapshot(st, w).strangers).toBe(s0.length);
    // przed północą czekają za siatką pod dziurą, nikt nie wszedł
    while (st.tick < atHour(1, 22.95)) sim.step();
    for (const p of strangers(sim)) {
      expect(yard.has(tileOf(p))).toBe(false);
      expect(p.job?.phase).toBe(1);
      expect(jobText(st, w, p)).toBe('Czai się za siatką.');
      expect(
        Math.min(...hole.tiles.map((t) => Math.hypot((t % size) + 0.5 - p.x, Math.floor(t / size) + 0.5 - p.y))),
      ).toBeLessThan(4);
    }
    let inHole = false;
    let inYard = false;
    while (st.tick < atHour(2, 2)) {
      sim.step();
      for (const p of strangers(sim)) {
        if (hole.tiles.includes(tileOf(p))) inHole = true;
        if (yard.has(tileOf(p))) inYard = true;
      }
    }
    expect(inHole).toBe(true);
    expect(inYard).toBe(true);
    expect(strangers(sim)).toHaveLength(0);
    const r = st.raid!;
    expect(r.outcome).toBe('wtargnięcie');
    expect(r.took.wood).toBeGreaterThan(0);
    // najpierw drewno luzem, potem skład, potem jedzenie
    expect(wood(st, 'loose')).toBe(0);
    expect(wood(st, 'sklad')).toBeGreaterThan(0);
    expect(food(st)).toBe(food0);
    expect(r.took.wood).toBe(r.n * 8);
    expect(loose0 + sklad0 - wood(st, 'loose') - wood(st, 'sklad')).toBe(r.took.wood);
    expect(food0 - food(st)).toBe(r.took.supplies);
  });

  it('bezpieczeństwo mieszkańców po kradzieży spada', () => {
    const calm = (() => {
      const st = createSim(w, 3, { core: 2 });
      st.tick = atHour(1, 22);
      const sim = new Sim(w, st);
      while (st.tick < atHour(2, 2)) sim.step();
      return st.pawns.filter((p) => p.kind === 'resident').map((p) => p.needs!.safe);
    })();
    const { st, sim } = night(false);
    while (st.tick < atHour(2, 2)) sim.step();
    const hit = st.pawns.filter((p) => p.kind === 'resident').map((p) => p.needs!.safe);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(hit)).toBeLessThan(avg(calm) - 10);
  });

  it('warta z lampą przy dziurze płoszy ich: odchodzą bez łupu i nie wchodzą na podwórko', () => {
    const { st, sim } = night(true);
    const loose0 = wood(st, 'loose');
    const sklad0 = wood(st, 'sklad');
    let seen = 0;
    let inYard = false;
    while (st.tick < atHour(2, 2)) {
      sim.step();
      seen = Math.max(seen, strangers(sim).length);
      for (const p of strangers(sim)) if (yard.has(tileOf(p))) inYard = true;
    }
    expect(seen).toBeGreaterThan(0);
    expect(inYard).toBe(false);
    expect(strangers(sim)).toHaveLength(0);
    expect(st.raid!.outcome).toBe('odparty');
    expect(wood(st, 'loose')).toBe(loose0);
    expect(wood(st, 'sklad')).toBe(sklad0);
  });

  it('zapis i wczytanie w trakcie napadu, warty i ogniska daje ten sam dalszy przebieg', () => {
    const { st, sim } = night(false);
    const spot = w.fence.yard.find(
      (i, k) => k > 40 && !w.blocked[i] && !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size)),
    )!;
    sim.push({ t: 'campfire', ids: [st.pawns[1].id], at: spot });
    sim.push({ t: 'guard', ids: [st.pawns[0].id], post: 'brama' });
    while (st.tick < atHour(1, 23.1)) sim.step();
    expect(strangers(sim).length).toBeGreaterThan(0);
    const copy = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (let k = 0; k < 3000; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
    // i drugi raz od zera: ten sam wynik
    const again = night(false);
    again.sim.push({ t: 'campfire', ids: [again.st.pawns[1].id], at: spot });
    again.sim.push({ t: 'guard', ids: [again.st.pawns[0].id], post: 'brama' });
    while (again.st.tick < sim.st.tick) again.sim.step();
    expect(again.sim.hash()).toBe(sim.hash());
  });
});
