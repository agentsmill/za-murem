import { describe, expect, it } from 'vitest';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock, mockBlockM2 } from './interior-mock.ts';

const w = mockBlockM2();
const size = w.size;
const h = w.interior;
const aptOf = (i: number) => h.rooms[h.room[i]]?.apt ?? -1;
const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const residents = (st: SimState) => st.pawns.filter((p) => p.kind === 'resident');

describe('M2: mieszkania i materiały w stanie gry', () => {
  it('stan mieszkań ze świata: zarząd, mieszkańcy, puste z powodem i rokiem; uszkodzenia; śmieci i zepsute meble', () => {
    const st = createSim(w, 3, { core: 4 });
    expect(st.apts).toEqual([
      { apt: 0, state: 'zarzad', ours: true, searched: [] },
      { apt: 1, state: 'mieszkancy', ours: false, searched: [] },
      { apt: 2, state: 'puste', why: 'splądrowanie', year: 2031, ours: false, searched: [] },
      { apt: 3, state: 'puste', why: 'zalanie', year: 2044, ours: false, searched: [] },
    ]);
    expect(st.damage.map((d) => [d.kind, d.apt, d.fixed])).toEqual([
      ['drzwi', 2, false],
      ['okno', 2, false],
      ['podloga', 3, false],
      ['rura', 3, false],
    ]);
    expect(st.things.filter((t) => t.kind === 'smieci').map((t) => t.n)).toEqual([4, 3]);
    expect(st.things.filter((t) => t.broken).map((t) => t.kind)).toEqual(['lozko', 'stol', 'wersalka']);
    // mieszkańcy tylko w mieszkaniu mieszkańców
    expect(residents(st).length).toBeGreaterThan(0);
    for (const p of residents(st)) {
      expect(p.apt).toBe(1);
      expect(aptOf(tileOf(p))).toBe(1);
    }
  });

  it('odczyt: materiały razem, mieszkania z uszkodzeniami i przeszukaniem', () => {
    const st = createSim(w, 3, { core: 4 });
    const s = snapshot(st, w);
    const heap = (k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
    expect(s.stock.mats).toEqual({
      drewno: 0,
      deski: heap('deski'),
      zlom: heap('zlom'),
      czesci: 0,
      jedzenie: heap('jedzenie'),
      leki: 0,
    });
    expect(s.apts.map((a) => [a.apt, a.state, a.ours, a.damaged, a.rooms, a.searched])).toEqual([
      [0, 'zarzad', true, 0, 4, 0],
      [1, 'mieszkancy', false, 0, 1, 0],
      [2, 'puste', false, 2, 2, 0],
      [3, 'puste', false, 2, 1, 0],
    ]);
    expect(s.builds).toEqual([]);
  });

  it('bez World.apts każde mieszkanie poza zarządem to mieszkańcy, jak w M1', () => {
    const old = mockBlock();
    const st = createSim(old, 3, { core: 2 });
    expect(st.apts).toEqual([
      { apt: 0, state: 'zarzad', ours: true, searched: [] },
      { apt: 1, state: 'mieszkancy', ours: false, searched: [] },
    ]);
    expect(st.damage).toEqual([]);
    expect(residents(st).length).toBeGreaterThan(0);
  });

  it('zapis sprzed M2 (bez mieszkań, uszkodzeń i planów) wczytuje się i dostaje stan ze świata', () => {
    const st = createSim(w, 3, { core: 2 }) as unknown as Record<string, unknown>;
    delete st.apts;
    delete st.damage;
    delete st.builds;
    const sim = new Sim(w, JSON.parse(JSON.stringify(st)) as SimState);
    expect(sim.st.apts).toHaveLength(4);
    expect(sim.st.damage).toHaveLength(4);
    expect(sim.st.builds).toEqual([]);
    for (let k = 0; k < 200; k++) sim.step();
  });
});

describe('M2: przeszukanie, rozbiórka, naprawa i zajęcie mieszkania', () => {
  const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
  const roomOfKind = (apt: number, kind: string) => h.rooms.find((r) => r.apt === apt && r.kind === kind)!.id;
  const inRoom = (st: SimState, room: number) =>
    st.things.filter(
      (t) => h.room[t.y * size + t.x] === room && ['deski', 'zlom', 'czesci', 'leki', 'jedzenie'].includes(t.kind),
    );
  const mat = (st: SimState, k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
  const run = (sim: Sim, ok: () => boolean, max = 6000) => {
    for (let k = 0; k < max && !ok(); k++) sim.step();
  };

  it('przeszukanie pokoju: czas według wielkości, łup w pokoju, raz na pomieszczenie, tak samo przy tym samym ziarnie', async () => {
    const { jobText } = await import('../../src/sim/orders.ts');
    const room = roomOfKind(2, 'pokoj');
    const once = () => {
      const st = createSim(w, 3, { core: 1 });
      const sim = new Sim(w, st);
      const [p] = core(st);
      sim.push({ t: 'search', ids: [p.id], room });
      const texts = new Set<string>();
      run(sim, () => {
        texts.add(jobText(st, w, p));
        return st.apts[2].searched.includes(room);
      });
      return { st, sim, p, texts };
    };
    const a = once();
    expect(a.st.apts[2].searched).toEqual([room]);
    expect(a.texts).toContain('Przeszukuje pokój.');
    const loot = inRoom(a.st, room).map((t) => [t.kind, t.n]);
    expect(loot.length).toBeGreaterThan(0);
    // ten sam łup przy tym samym ziarnie
    expect(inRoom(once().st, room).map((t) => [t.kind, t.n])).toEqual(loot);
    // drugi raz to samo pomieszczenie: nic się nie dzieje
    a.sim.push({ t: 'search', ids: [a.p.id], room });
    a.sim.step();
    expect(a.p.job?.t).not.toBe('search');
    // mieszkania mieszkańców i zarządu się nie przeszukuje
    a.sim.push({ t: 'search', ids: [a.p.id], room: roomOfKind(1, 'pokoj') });
    a.sim.step();
    expect(a.p.job?.t).not.toBe('search');
  });

  it('rozbiórka: śmieci, lodówka i zepsuty stół dają materiały z tabeli, rzecz znika', async () => {
    const { jobText } = await import('../../src/sim/orders.ts');
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const d0 = mat(st, 'deski');
    const z0 = mat(st, 'zlom');
    const c0 = mat(st, 'czesci');
    const trash = st.things.find((t) => t.kind === 'smieci' && t.n === 4)!;
    sim.push({ t: 'dismantle', ids: [p.id], thing: trash.id });
    const texts = new Set<string>();
    run(sim, () => {
      texts.add(jobText(st, w, p));
      return !st.things.includes(trash);
    });
    expect(texts).toContain('Rozbiera śmieci.');
    expect([mat(st, 'deski') - d0, mat(st, 'zlom') - z0]).toEqual([2, 2]);
    const fridge = st.things.find((t) => t.kind === 'lodowka' && aptOf(t.y * size + t.x) === 2)!;
    sim.push({ t: 'dismantle', ids: [p.id], thing: fridge.id });
    run(sim, () => !st.things.includes(fridge));
    expect([mat(st, 'zlom') - z0, mat(st, 'czesci') - c0]).toEqual([5, 1]);
    const table = st.things.find((t) => t.kind === 'stol' && t.broken)!;
    sim.push({ t: 'dismantle', ids: [p.id], thing: table.id });
    run(sim, () => !st.things.includes(table));
    expect(mat(st, 'deski') - d0).toBe(3);
    // meble zarządu i mieszkańców się nie rozbiera (meble zarządu można spalić)
    const homeBed = st.things.find((t) => t.kind === 'lozko' && aptOf(t.y * size + t.x) === 0)!;
    sim.push({ t: 'dismantle', ids: [p.id], thing: homeBed.id });
    sim.step();
    expect(p.job?.t).not.toBe('dismantle');
  });

  it('naprawa okna: zarząd przynosi deski, naprawia, deski schodzą; rura bez części czeka na materiał', async () => {
    const { jobText } = await import('../../src/sim/orders.ts');
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const d0 = mat(st, 'deski');
    const okno = st.damage.findIndex((d) => d.kind === 'okno');
    sim.push({ t: 'repair', ids: [p.id], damage: okno });
    const texts = new Set<string>();
    run(sim, () => {
      texts.add(jobText(st, w, p));
      return st.damage[okno].fixed;
    });
    expect(st.damage[okno].fixed).toBe(true);
    expect(mat(st, 'deski')).toBe(d0 - 2);
    expect(texts).toContain('Naprawia okno.');
    expect([...texts].some((t) => t.startsWith('Idzie po deski'))).toBe(true);
    // rura: złom jest, części nie ma, więc naprawa się nie zaczyna
    const rura = st.damage.findIndex((d) => d.kind === 'rura');
    sim.push({ t: 'repair', ids: [p.id], damage: rura });
    sim.step();
    expect(p.job?.t).not.toBe('repair');
    expect(st.damage[rura].fixed).toBe(false);
  });

  it('zajęcie mieszkania: staje się nasze, a po naprawie wszystkich uszkodzeń przybywa miejsc o łóżka', async () => {
    const { jobText } = await import('../../src/sim/orders.ts');
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const cap0 = st.cap;
    sim.push({ t: 'claim', ids: [p.id], apt: 3 });
    const texts = new Set<string>();
    run(sim, () => {
      texts.add(jobText(st, w, p));
      return st.apts[3].ours;
    });
    expect(st.apts[3].ours).toBe(true);
    expect(texts).toContain('Zajmuje mieszkanie.');
    expect(st.cap).toBe(cap0);
    // podłoga deskami, rura złomem i częścią (części z przeszukania pokoju albo z rozbiórki lodówki)
    const fridge = st.things.find((t) => t.kind === 'lodowka' && aptOf(t.y * size + t.x) === 2)!;
    sim.push({ t: 'dismantle', ids: [p.id], thing: fridge.id });
    run(sim, () => !st.things.includes(fridge));
    for (const kind of ['podloga', 'rura']) {
      const i = st.damage.findIndex((d) => d.kind === kind);
      sim.push({ t: 'repair', ids: [p.id], damage: i });
      run(sim, () => st.damage[i].fixed, 8000);
      expect(st.damage[i].fixed).toBe(true);
    }
    // w mieszkaniu 3 jedno całe łóżko (wersalka zepsuta)
    expect(st.cap).toBe(cap0 + 1);
    // zarządu i mieszkańców nie da się zająć
    sim.push({ t: 'claim', ids: [p.id], apt: 1 });
    sim.step();
    expect(p.job?.t).not.toBe('claim');
  });

  it('menu: przeszukać, rozebrać, naprawić i zająć mieszkanie tam, gdzie to ma sens', async () => {
    const { commandsAt } = await import('../../src/sim/orders.ts');
    const st = createSim(w, 3, { core: 2 });
    const ids = core(st).map((p) => p.id);
    const room = roomOfKind(2, 'kuchnia');
    const floor =
      st.things.length >= 0
        ? (() => {
            for (let i = 0; i < size * size; i++)
              if (
                h.room[i] === room &&
                !w.blocked[i] &&
                !st.things.some(
                  (t) =>
                    i % size >= t.x &&
                    i % size < t.x + t.w &&
                    Math.floor(i / size) >= t.y &&
                    Math.floor(i / size) < t.y + t.h,
                )
              )
                return i;
            return -1;
          })()
        : -1;
    const labels = commandsAt(st, w, ids, floor).map((m) => m.label);
    expect(labels).toContain('Przeszukać kuchnię');
    expect(labels).toContain('Zająć mieszkanie');
    const fridge = st.things.find((t) => t.kind === 'lodowka' && aptOf(t.y * size + t.x) === 2)!;
    expect(commandsAt(st, w, ids, fridge.y * size + fridge.x).find((m) => m.label === 'Rozebrać lodówkę')?.cmd).toEqual(
      {
        t: 'dismantle',
        ids,
        thing: fridge.id,
      },
    );
    const trash = st.things.find((t) => t.kind === 'smieci')!;
    expect(commandsAt(st, w, ids, trash.y * size + trash.x)[0].label).toBe('Rozebrać śmieci');
    const okno = st.damage.findIndex((d) => d.kind === 'okno');
    expect(commandsAt(st, w, ids, st.damage[okno].tile).find((m) => m.label === 'Naprawić okno')?.cmd).toEqual({
      t: 'repair',
      ids,
      damage: okno,
    });
    // mieszkanie mieszkańców: ani przeszukać, ani zająć
    const a1 = h.rooms.find((r) => r.apt === 1)!.id;
    let t1 = -1;
    for (let i = 0; i < size * size && t1 < 0; i++) if (h.room[i] === a1 && !w.blocked[i]) t1 = i;
    const l1 = commandsAt(st, w, ids, t1).map((m) => m.label);
    expect(l1.some((l) => l.startsWith('Przeszukać') || l === 'Zająć mieszkanie')).toBe(false);
  });
});

describe('M2: budowa', () => {
  const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
  const mat = (st: SimState, k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
  const run = (sim: Sim, ok: () => boolean, max = 8000) => {
    for (let k = 0; k < max && !ok(); k++) sim.step();
  };
  const hq = w.buildings[w.hq];
  /** wolne miejsce na budowlę w pomieszczeniu: pierwszy kafelek, przy którym canPlace się zgadza */
  const spotIn = async (st: SimState, kind: import('../../src/sim/budowle.ts').BuildKind, room: number) => {
    const { canPlace } = await import('../../src/sim/budowle.ts');
    for (let i = 0; i < size * size; i++)
      if (h.room[i] === room && canPlace(st, w, kind, i % size, Math.floor(i / size), 0).ok) return i;
    return -1;
  };
  const homeRoom = (kind: string) => h.rooms.find((r) => r.apt === 0 && r.kind === kind)!.id;

  it('canPlace: pokój i kuchnia w naszym mieszkaniu, podwórko, odcinek siatki; powody odmowy', async () => {
    const { canPlace } = await import('../../src/sim/budowle.ts');
    const st = createSim(w, 3, { core: 2 });
    const p = await spotIn(st, 'warsztat', homeRoom('pokoj'));
    expect(p).toBeGreaterThanOrEqual(0);
    // pokój w cudzym mieszkaniu
    const b = h.rooms.find((r) => r.apt === 2 && r.kind === 'pokoj')!.id;
    let bt = -1;
    for (let i = 0; i < size * size && bt < 0; i++)
      if (h.room[i] === b && !w.blocked[i] && !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size)))
        bt = i;
    expect(canPlace(st, w, 'lozka_pietrowe', bt % size, Math.floor(bt / size), 0)).toEqual({
      ok: false,
      why: 'Tylko w pokoju w naszym mieszkaniu.',
    });
    st.apts[2].ours = true;
    expect(await spotIn(st, 'lozka_pietrowe', b)).toBeGreaterThanOrEqual(0);
    // kuchnia społeczna tylko w kuchni, nie w pokoju
    expect(canPlace(st, w, 'kuchnia_spoleczna', p % size, Math.floor(p / size), 0).why).toBe(
      'Tylko w kuchni w naszym mieszkaniu.',
    );
    expect(await spotIn(st, 'kuchnia_spoleczna', homeRoom('kuchnia'))).toBeGreaterThanOrEqual(0);
    // na meblu nie
    const bed = st.things.find((t) => t.kind === 'lozko' && aptOf(t.y * size + t.x) === 0)!;
    expect(canPlace(st, w, 'lozka_pietrowe', bed.x, bed.y, 0)).toEqual({ ok: false, why: 'Tu coś stoi.' });
    // ogródek na podwórku, zasieki na odcinku siatki (także na dziurze), nie na bramie
    const yardOk = w.fence.yard.some((i) => canPlace(st, w, 'ogrodek', i % size, Math.floor(i / size), 0).ok);
    expect(yardOk).toBe(true);
    expect(canPlace(st, w, 'ogrodek', hq.x0 + 2, hq.y0 + 2, 0).ok).toBe(false);
    const fenceTile = w.fence.tiles.find((t) => !w.fence.hole.includes(t))!;
    expect(canPlace(st, w, 'zasieki', fenceTile % size, Math.floor(fenceTile / size), 0)).toEqual({ ok: true });
    const holeTile = w.fence.hole[0];
    expect(canPlace(st, w, 'zasieki', holeTile % size, Math.floor(holeTile / size), 0).ok).toBe(true);
    expect(canPlace(st, w, 'zasieki', w.fence.gate.x, w.fence.gate.y, 0)).toEqual({
      ok: false,
      why: 'Tylko na odcinku siatki.',
    });
    expect(canPlace(st, w, 'zasieki', w.fence.yard[0] % size, Math.floor(w.fence.yard[0] / size), 0).why).toBe(
      'Tylko na odcinku siatki.',
    );
  });

  it('plan warsztatu: zarząd przynosi deski i złom, buduje, gotowy warsztat to rzecz, materiały schodzą', async () => {
    const { jobText } = await import('../../src/sim/orders.ts');
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const at = await spotIn(st, 'warsztat', homeRoom('pokoj'));
    const d0 = mat(st, 'deski');
    const z0 = mat(st, 'zlom');
    sim.push({ t: 'build', ids: [p.id], kind: 'warsztat', x: at % size, y: Math.floor(at / size), rot: 0 });
    sim.step();
    expect(st.builds).toHaveLength(1);
    const id = st.builds[0].id;
    const texts = new Set<string>();
    run(sim, () => {
      texts.add(jobText(st, w, p));
      return !st.builds.length;
    });
    const t = st.things.find((q) => q.kind === 'warsztat')!;
    expect(t).toMatchObject({ id, x: at % size, y: Math.floor(at / size), w: 2, h: 1 });
    expect([mat(st, 'deski'), mat(st, 'zlom')]).toEqual([d0 - 4, z0 - 2]);
    expect(texts).toContain('Idzie po deski na warsztat.');
    expect(texts).toContain('Niesie deski na warsztat.');
    expect(texts).toContain('Buduje warsztat.');
    expect(snapshot(st, w).builds).toEqual([]);
  });

  it('plan bez wskazanej osoby: zarząd sam bierze się do budowy; odwołany plan oddaje doniesione materiały', async () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = Math.round((24 + 9 - 15) * 800);
    const sim = new Sim(w, st);
    const at = await spotIn(st, 'lozka_pietrowe', homeRoom('pokoj'));
    sim.push({ t: 'build', ids: [], kind: 'lozka_pietrowe', x: at % size, y: Math.floor(at / size), rot: 0 });
    run(sim, () => (st.builds[0]?.have.deski ?? 0) >= 1, 4000);
    expect(st.builds[0].have.deski).toBeGreaterThanOrEqual(1);
    const s = snapshot(st, w).builds[0];
    expect(s.kind).toBe('lozka_pietrowe');
    expect(s.missing.deski).toBeLessThan(4);
    const d =
      mat(st, 'deski') +
      st.builds[0].have.deski! +
      core(st).reduce((a, q) => a + (q.job?.what === 'deski' ? q.job.n : 0), 0);
    sim.push({ t: 'unbuild', ids: [], id: st.builds[0].id });
    sim.step();
    expect(st.builds).toEqual([]);
    expect(mat(st, 'deski')).toBe(d);
  });

  it('zapis i wczytanie w trakcie budowy daje ten sam dalszy przebieg', async () => {
    const st = createSim(w, 3, { core: 2 });
    const sim = new Sim(w, st);
    const at = await spotIn(st, 'warsztat', homeRoom('pokoj'));
    sim.push({ t: 'build', ids: [core(st)[0].id], kind: 'warsztat', x: at % size, y: Math.floor(at / size), rot: 0 });
    run(sim, () => (st.builds[0]?.have.deski ?? 0) >= 2, 4000);
    const copy = new Sim(w, JSON.parse(JSON.stringify(st)));
    for (let k = 0; k < 3000; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});

describe('M2: działanie budowli', () => {
  const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
  const atHour = (day: number, hh: number) => Math.round(((day - 1) * 24 + hh - 15) * 800);
  const homeRoom = (kind: string) => h.rooms.find((r) => r.apt === 0 && r.kind === kind)!.id;
  /** gotowa budowla postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
  const place = async (st: SimState, kind: import('../../src/sim/budowle.ts').BuildKind, tiles: number[]) => {
    const { canPlace, footprint } = await import('../../src/sim/budowle.ts');
    for (const i of tiles)
      if (canPlace(st, w, kind, i % size, Math.floor(i / size), 0).ok) {
        const f = footprint(kind, 0);
        const t = {
          id: st.nextThing++,
          kind,
          x: i % size,
          y: Math.floor(i / size),
          w: f.w,
          h: f.h,
          rot: 0,
          n: 0,
          fuel: 0,
          by: -1,
          owner: -1,
        };
        st.things.push(t);
        return t;
      }
    throw new Error(`nie ma miejsca na ${kind}`);
  };
  const roomTiles = (room: number) => {
    const out: number[] = [];
    for (let i = 0; i < size * size; i++) if (h.room[i] === room && !w.blocked[i]) out.push(i);
    return out;
  };

  it('łóżka piętrowe: dwa miejsca więcej dla mieszkańców i dwa miejsca do spania dla zarządu', async () => {
    const { capOf } = await import('../../src/sim/sim.ts');
    const st = createSim(w, 3, { core: 6 });
    const cap0 = capOf(st, w);
    const bunk = await place(st, 'lozka_pietrowe', roomTiles(homeRoom('pokoj')));
    expect(capOf(st, w)).toBe(cap0 + 2);
    st.tick = atHour(1, 21.5);
    const sim = new Sim(w, st);
    while (st.tick < atHour(2, 1)) sim.step();
    const inBunk = core(st).filter((p) => p.job?.t === 'sleep' && p.job.phase === 1 && p.job.target === bunk.id);
    expect(inBunk).toHaveLength(2);
  });

  it('zasieki na dziurze: dziura zamknięta dla szabrowników, siatka mocniejsza', async () => {
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const hole = st.fence!.holes[0];
    const t = hole.tiles[0];
    const dur0 = snapshot(st, w).fence.durability;
    sim.push({ t: 'build', ids: [core(st)[0].id], kind: 'zasieki', x: t % size, y: Math.floor(t / size), rot: 0 });
    for (let k = 0; k < 6000 && !st.things.some((q) => q.kind === 'zasieki'); k++) sim.step();
    expect(st.things.some((q) => q.kind === 'zasieki')).toBe(true);
    expect(sim.canWalk('szabrownik', t)).toBe(false);
    expect(snapshot(st, w).fence.holes.some((x) => x.id === hole.id)).toBe(false);
    expect(snapshot(st, w).fence.durability).toBeGreaterThan(dur0);
  });

  it('warsztat: łatanie o połowę szybsze', async () => {
    const patchTime = async (shop: boolean) => {
      const st = createSim(w, 3, { core: 1 });
      if (shop) await place(st, 'warsztat', roomTiles(homeRoom('pokoj')));
      const sim = new Sim(w, st);
      const [p] = core(st);
      const hole = st.fence!.holes[0];
      sim.push({ t: 'patch', ids: [p.id], hole: hole.id });
      let start = -1;
      for (let k = 0; k < 6000 && !hole.patch; k++) {
        sim.step();
        if (start < 0 && p.job?.t === 'patch' && p.job.phase === 2) start = st.tick;
      }
      return st.tick - start;
    };
    const normal = await patchTime(false);
    expect(await patchTime(true)).toBeLessThanOrEqual(Math.ceil(normal / 1.5) + 2);
  });

  it('ogródek: po trzech dniach daje jedzenie, jesienią mało', async () => {
    const st = createSim(w, 3, { core: 1 });
    const g = await place(st, 'ogrodek', w.fence.yard);
    const sim = new Sim(w, st);
    const nearFood = () =>
      st.things
        .filter((t) => t.kind === 'jedzenie' && Math.max(Math.abs(t.x - g.x), Math.abs(t.y - g.y)) <= 4)
        .reduce((a, t) => a + t.n, 0);
    while (st.tick < 3 * 24 * 800 - 400) sim.step();
    expect(nearFood()).toBe(0);
    while (st.tick < 3 * 24 * 800 + 400) sim.step();
    expect(nearFood()).toBe(2);
  });

  it('magazyn: szabrownicy (bez zarządu) nie biorą zapasów z pokoju z magazynem', async () => {
    const stolen = async (store: boolean) => {
      const st = createSim(w, 3, { core: 2 });
      const room = homeRoom('pokoj');
      if (store) await place(st, 'magazyn', roomTiles(room));
      const food = st.things.find((t) => t.kind === 'jedzenie')!;
      const free = roomTiles(room).find(
        (i) =>
          !st.things.some(
            (t) =>
              i % size >= t.x &&
              i % size < t.x + t.w &&
              Math.floor(i / size) >= t.y &&
              Math.floor(i / size) < t.y + t.h,
          ),
      )!;
      food.x = free % size;
      food.y = Math.floor(free / size);
      const n0 = food.n;
      st.tick = atHour(1, 22);
      const sim = new Sim(w, st);
      sim.push({ t: 'raid', ids: [], at: atHour(1, 23), post: `d${st.fence!.holes[0].id}` });
      while (st.tick < atHour(2, 2)) sim.step();
      expect(st.raid!.outcome).toBe('wtargnięcie');
      return n0 - st.things.filter((t) => t.kind === 'jedzenie').reduce((a, t) => a + t.n, 0);
    };
    expect(await stolen(false)).toBeGreaterThan(0);
    expect(await stolen(true)).toBe(0);
  });

  it('kuchnia społeczna: gotuje się raz dziennie i schodzi mniej jedzenia', async () => {
    const days = async (kitchen: boolean) => {
      const st = createSim(w, 3, { core: 4 });
      st.things.find((t) => t.kind === 'jedzenie')!.n = 40;
      if (kitchen) await place(st, 'kuchnia_spoleczna', roomTiles(homeRoom('kuchnia')));
      const sim = new Sim(w, st);
      let cooks = 0;
      let was = false;
      // posiłki liczone po zmianie lastMeal (ile kto zjadł, niezależnie od tego, jak najedzony był na końcu)
      let meals = 0;
      const last = new Map(core(st).map((p) => [p.id, p.lastMeal]));
      for (let d = 1; d <= 3; d++) {
        for (const i of h.sklad) {
          const pile = st.things.find((t) => t.kind === 'drewno' && t.y * size + t.x === i);
          if (pile) pile.n = 10;
          else
            st.things.push({
              id: st.nextThing++,
              kind: 'drewno',
              x: i % size,
              y: Math.floor(i / size),
              w: 1,
              h: 1,
              rot: 0,
              n: 10,
              fuel: 0,
              by: -1,
              owner: -1,
            });
        }
        while (st.tick < atHour(d + 1, 6)) {
          sim.step();
          const c = core(st).some((p) => p.job?.t === 'cook' && p.job.phase === 1);
          if (c && !was) cooks++;
          was = c;
          for (const p of core(st)) {
            if (last.get(p.id) !== p.lastMeal) meals++;
            last.set(p.id, p.lastMeal);
          }
        }
      }
      const left = st.things.filter((t) => t.kind === 'jedzenie' || t.kind === 'posilek').reduce((a, t) => a + t.n, 0);
      return { cooks, eaten: 40 - left, meals };
    };
    const base = await days(false);
    const k = await days(true);
    expect(k.cooks).toBeLessThan(base.cooks);
    // bez kuchni porcja na posiłek, z kuchnią 85% porcji (ułamki zbierają się w st.portion)
    expect(base.eaten).toBe(base.meals);
    expect(k.meals).toBeGreaterThan(10);
    expect(k.eaten).toBeLessThanOrEqual(Math.ceil(k.meals * 0.85));
  });
});
