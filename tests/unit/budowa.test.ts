import { describe, expect, it } from 'vitest';
import { BUILDS, type BuildKind, buildTiles } from '../../src/sim/budowle.ts';
import { REPAIR, searchTicks } from '../../src/sim/mieszkania.ts';
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
  /** jakby wszystkie pomieszczenia pustych mieszkań były już przeszukane (rozbiórka dopiero po przeszukaniu) */
  const searchAll = (st: SimState) => {
    for (const a of st.apts)
      if (a.state === 'puste') a.searched = h.rooms.filter((r) => r.apt === a.apt).map((r) => r.id);
  };
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
      let t1 = -1;
      run(sim, () => {
        texts.add(jobText(st, w, p));
        if (t1 < 0 && p.job?.t === 'search' && p.job.phase === 1) t1 = st.tick;
        return st.apts[2].searched.includes(room);
      });
      // czas przeszukania według wielkości pomieszczenia (kafelki, po których da się chodzić)
      const area = (sim as unknown as { roomTiles: number[][] }).roomTiles[room].length;
      return { st, sim, p, texts, took: st.tick - t1, area };
    };
    const a = once();
    expect(a.st.apts[2].searched).toEqual([room]);
    expect(Math.abs(a.took - searchTicks(a.area))).toBeLessThanOrEqual(2);
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
    searchAll(st);
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

  it('kurs po materiał zbiera po drodze kilka małych stert tego samego (łup leży po sztuce, dwie)', async () => {
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    // deski tylko w trzech stertach po sztuce obok siebie w pokoju mieszkania 2, drzwi (3 deski) do naprawy
    for (const t of st.things.filter((q) => q.kind === 'deski')) t.n = 0;
    st.things = st.things.filter((q) => q.n > 0 || q.kind !== 'deski');
    const room = roomOfKind(2, 'pokoj');
    const free: number[] = [];
    for (let i = 0; i < size * size && free.length < 3; i++)
      if (
        h.room[i] === room &&
        !w.blocked[i] &&
        !st.things.some((t) => t.x === i % size && t.y === Math.floor(i / size))
      )
        free.push(i);
    for (const i of free)
      st.things.push({
        id: st.nextThing++,
        kind: 'deski',
        x: i % size,
        y: Math.floor(i / size),
        w: 1,
        h: 1,
        rot: 0,
        n: 1,
        fuel: 0,
        by: -1,
        owner: -1,
      });
    const k = st.damage.findIndex((d) => d.kind === 'drzwi');
    sim.push({ t: 'repair', ids: [p.id], damage: k });
    let carries = 0;
    let was = false;
    run(sim, () => {
      const c = p.job?.t === 'repair' && p.job.phase === 1;
      if (c && !was) carries++;
      was = c;
      return st.damage[k].fixed;
    });
    expect(st.damage[k].fixed).toBe(true);
    expect(carries).toBe(1);
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
    searchAll(st);
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

  it('w pustym mieszkaniu rozbiera się dopiero po przeszukaniu pomieszczenia (menu podpowiada przeszukanie)', async () => {
    const { commandsAt } = await import('../../src/sim/orders.ts');
    const { dismantlable } = await import('../../src/sim/sim.ts');
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const trash = st.things.find((t) => t.kind === 'smieci' && t.n === 4)!;
    const at = trash.y * size + trash.x;
    const room = h.room[at];
    expect(dismantlable(st, w, trash)).toBe(false);
    const labels = commandsAt(st, w, [p.id], at).map((m) => m.label);
    expect(labels).not.toContain('Rozebrać śmieci');
    expect(labels.some((l) => l.startsWith('Przeszukać'))).toBe(true);
    sim.push({ t: 'dismantle', ids: [p.id], thing: trash.id });
    sim.step();
    expect(p.job?.t).not.toBe('dismantle');
    st.apts[2].searched.push(room);
    expect(dismantlable(st, w, trash)).toBe(true);
    expect(commandsAt(st, w, [p.id], at)[0].label).toBe('Rozebrać śmieci');
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
    searchAll(st);
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
  /** materiały na budowę: luźne stosy (po 10) na wolnej posadzce mieszkania zarządu poza pomieszczeniem budowy */
  const stockUp = (st: SimState, cost: Partial<Record<string, number>>, avoid: number) => {
    const free: number[] = [];
    for (let i = 0; i < size * size; i++)
      if (
        aptOf(i) === 0 &&
        h.room[i] !== avoid &&
        !w.blocked[i] &&
        !h.sklad.includes(i) &&
        !st.things.some(
          (t) =>
            i % size >= t.x && i % size < t.x + t.w && Math.floor(i / size) >= t.y && Math.floor(i / size) < t.y + t.h,
        )
      )
        free.push(i);
    for (const [kind, all] of Object.entries(cost))
      for (let n = all ?? 0; n > 0; n -= 10) {
        const i = free.shift()!;
        st.things.push({
          id: st.nextThing++,
          kind,
          x: i % size,
          y: Math.floor(i / size),
          w: 1,
          h: 1,
          rot: 0,
          n: Math.min(10, n),
          fuel: 0,
          by: -1,
          owner: -1,
        });
      }
  };

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
    const cost = BUILDS.warsztat.cost;
    stockUp(st, cost, homeRoom('pokoj'));
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
    expect([mat(st, 'deski'), mat(st, 'zlom')]).toEqual([d0 - cost.deski!, z0 - cost.zlom!]);
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
    stockUp(st, BUILDS.lozka_pietrowe.cost, homeRoom('pokoj'));
    sim.push({ t: 'build', ids: [], kind: 'lozka_pietrowe', x: at % size, y: Math.floor(at / size), rot: 0 });
    run(sim, () => (st.builds[0]?.have.deski ?? 0) >= 1, 4000);
    expect(st.builds[0].have.deski).toBeGreaterThanOrEqual(1);
    const s = snapshot(st, w).builds[0];
    expect(s.kind).toBe('lozka_pietrowe');
    expect(s.missing.deski).toBeLessThan(BUILDS.lozka_pietrowe.cost.deski!);
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
    stockUp(st, BUILDS.warsztat.cost, homeRoom('pokoj'));
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
    // złomu tyle, ile kosztują zasieki (sterta na podwórku)
    st.things.find((q) => q.kind === 'zlom')!.n = BUILDS.zasieki.cost.zlom!;
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

describe('M2: poprawki z przeglądu', () => {
  const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
  const mat = (st: SimState, k: string) => st.things.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
  const run = (sim: Sim, ok: () => boolean, max = 12000) => {
    for (let k = 0; k < max && !ok(); k++) sim.step();
  };
  const atHour = (day: number, hh: number) => Math.round(((day - 1) * 24 + hh - 15) * 800);
  const roomOf = (apt: number, kind: string) => h.rooms.find((r) => r.apt === apt && r.kind === kind)!.id;
  const covered = (st: SimState, i: number) =>
    st.things.some(
      (t) => i % size >= t.x && i % size < t.x + t.w && Math.floor(i / size) >= t.y && Math.floor(i / size) < t.y + t.h,
    );
  const freeIn = (st: SimState, room: number) => {
    const out: number[] = [];
    for (let i = 0; i < size * size; i++)
      if (h.room[i] === room && !w.blocked[i] && !h.sklad.includes(i) && !covered(st, i)) out.push(i);
    return out;
  };
  const pile = (st: SimState, kind: string, i: number, n: number) =>
    st.things.push({
      id: st.nextThing++,
      kind,
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
  /** materiały luzem w mieszkaniu zarządu poza pomieszczeniem `avoid` (po 10 w stercie) */
  const stockUp = (st: SimState, cost: Partial<Record<string, number>>, avoid: number) => {
    const free = h.rooms.filter((r) => r.apt === 0 && r.id !== avoid).flatMap((r) => freeIn(st, r.id));
    for (const [kind, all] of Object.entries(cost))
      for (let n = all ?? 0; n > 0; n -= 10) pile(st, kind, free.shift()!, Math.min(10, n));
  };
  const spotFor = async (st: SimState, kind: BuildKind, room: number) => {
    const { canPlace } = await import('../../src/sim/budowle.ts');
    for (let i = 0; i < size * size; i++)
      if (h.room[i] === room && canPlace(st, w, kind, i % size, Math.floor(i / size), 0).ok) return i;
    return -1;
  };

  it('naprawa z materiałem już przy uszkodzeniu trwa pełny czas od dojścia', () => {
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const k = st.damage.findIndex((d) => d.kind === 'okno');
    st.damage[k].have = { deski: 2 };
    sim.push({ t: 'repair', ids: [p.id], damage: k });
    let start = -1;
    run(sim, () => {
      if (start < 0 && p.job?.t === 'repair' && p.pi >= p.path.length) start = st.tick;
      return st.damage[k].fixed;
    });
    expect(st.damage[k].fixed).toBe(true);
    expect(st.tick - start).toBeGreaterThanOrEqual(REPAIR.okno.work - 1);
  });

  it('zarząd płaci lekami i częściami także z rzeczy na mapie, a przybytek kładzie jako rzeczy', async () => {
    const { applyGov } = await import('../../src/sim/gov.ts');
    const { emptyEffects } = await import('../../src/gov/wspolne.ts');
    const st = createSim(w, 3, { core: 1 });
    pile(st, 'leki', freeIn(st, roomOf(0, 'pokoj'))[0], 3);
    const c0 = mat(st, 'czesci');
    const fx = emptyEffects();
    fx.stock.meds = -3;
    fx.stock.parts = 5;
    applyGov(st, w, fx);
    expect([mat(st, 'leki'), st.store.meds]).toEqual([0, 0]);
    expect([mat(st, 'czesci'), st.store.parts]).toEqual([c0 + 5, 0]);
  });

  it('osoba, która odchodzi w trakcie budowy, zwalnia plan i zostawia niesiony materiał', async () => {
    const { removeCore } = await import('../../src/sim/sim.ts');
    const st = createSim(w, 3, { core: 2 });
    const sim = new Sim(w, st);
    const room = roomOf(0, 'pokoj');
    const at = await spotFor(st, 'lozka_pietrowe', room);
    stockUp(st, BUILDS.lozka_pietrowe.cost, room);
    const [p] = core(st);
    sim.push({ t: 'build', ids: [p.id], kind: 'lozka_pietrowe', x: at % size, y: Math.floor(at / size), rot: 0 });
    run(sim, () => p.job?.t === 'build' && p.job.phase === 1 && p.job.n > 0);
    const b = st.builds[0];
    const total = mat(st, 'deski') + (b.have.deski ?? 0) + p.job!.n;
    expect(removeCore(st, st.people[p.person].id, w)).toBe(true);
    expect(b.by).toBe(-1);
    expect(mat(st, 'deski') + (b.have.deski ?? 0)).toBe(total);
  });

  it('zapis sprzed M2 w świecie ze stanami mieszkań: mieszkańcy zostają u siebie, ognisko w toku to campfire, kopie idą tak samo', () => {
    const old = mockBlock();
    const save = JSON.parse(JSON.stringify(createSim(old, 3, { core: 2 }))) as SimState;
    const raw = save as unknown as Record<string, unknown>;
    delete raw.apts;
    delete raw.damage;
    delete raw.builds;
    const resApt = save.pawns.find((p) => p.kind === 'resident')!.apt;
    const c = save.pawns.find((p) => p.kind === 'core')!;
    const tile = Math.floor(c.y) * old.size + Math.floor(c.x);
    // w M1 praca ogniska nazywała się 'build'
    c.job = { t: 'build', target: tile, tile, phase: 0, from: -1, t0: 0, until: 0, order: true, n: 0, what: '' };
    const bid = old.interior.building;
    const now = {
      ...old,
      apts: [
        { bid, apt: 0, state: 'zarzad' },
        { bid, apt: resApt, state: 'puste', why: 'wyjazd', year: 2030 },
      ],
    } as unknown as typeof old;
    const a = new Sim(now, JSON.parse(JSON.stringify(save)));
    const g = a.st.apts.find((x) => x.apt === resApt)!;
    expect([g.state, g.why, g.year]).toEqual(['mieszkancy', undefined, undefined]);
    expect(a.st.pawns.find((p) => p.id === c.id)!.job?.t).toBe('campfire');
    const b = new Sim(now, JSON.parse(JSON.stringify(save)));
    for (let k = 0; k < 2000; k++) {
      a.step();
      b.step();
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('dwa plany na jeden zapas: zarząd kończy jeden, zamiast rozkładać materiał na oba', async () => {
    const st = createSim(w, 3, { core: 2 });
    st.tick = atHour(2, 9);
    st.things = st.things.filter((t) => t.kind !== 'deski');
    st.apts[2].ours = true;
    const sim = new Sim(w, st);
    const a = await spotFor(st, 'lozka_pietrowe', roomOf(0, 'pokoj'));
    const b = await spotFor(st, 'lozka_pietrowe', roomOf(2, 'pokoj'));
    expect(Math.min(a, b)).toBeGreaterThanOrEqual(0);
    for (const i of [a, b])
      sim.push({ t: 'build', ids: [], kind: 'lozka_pietrowe', x: i % size, y: Math.floor(i / size), rot: 0 });
    sim.step();
    expect(st.builds).toHaveLength(2);
    stockUp(st, { deski: BUILDS.lozka_pietrowe.cost.deski }, roomOf(0, 'pokoj'));
    run(sim, () => st.things.some((t) => t.kind === 'lozka_pietrowe'), 16000);
    expect(st.things.filter((t) => t.kind === 'lozka_pietrowe')).toHaveLength(1);
    expect(st.builds).toHaveLength(1);
    expect(st.builds[0].have.deski ?? 0).toBe(0);
  });

  it('plan bez kompletu materiałów nie zabiera osoby z warty', async () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(1, 21);
    const sim = new Sim(w, st);
    const [p] = core(st);
    sim.push({ t: 'guard', ids: [p.id], post: 'brama' });
    run(sim, () => p.job?.t === 'guard' && p.job.phase === 1, 4000);
    expect(p.job?.t).toBe('guard');
    // kuchnia społeczna: złom jest, części nie ma
    const at = await spotFor(st, 'kuchnia_spoleczna', roomOf(0, 'kuchnia'));
    sim.push({ t: 'build', ids: [p.id], kind: 'kuchnia_spoleczna', x: at % size, y: Math.floor(at / size), rot: 0 });
    sim.step();
    expect(st.builds).toHaveLength(1);
    expect(p.job?.t).toBe('guard');
  });

  it('rozbiórka zasieków przywraca łatę albo siatkę sprzed nich', async () => {
    const { canPlace } = await import('../../src/sim/budowle.ts');
    const st = createSim(w, 3, { core: 1 });
    const hole = st.fence!.holes[0];
    hole.patch = 70;
    const k = w.fence.tiles.findIndex(
      (i) => !w.fence.hole.includes(i) && canPlace(st, w, 'zasieki', i % size, Math.floor(i / size), 0).ok,
    );
    st.fence!.hp[k] = 63;
    const sim = new Sim(w, st);
    const [p] = core(st);
    for (const t of [hole.tiles[0], w.fence.tiles[k]]) {
      st.things.find((q) => q.kind === 'zlom')!.n = BUILDS.zasieki.cost.zlom!;
      sim.push({ t: 'build', ids: [p.id], kind: 'zasieki', x: t % size, y: Math.floor(t / size), rot: 0 });
      run(sim, () => st.things.some((q) => q.kind === 'zasieki'));
      const z = st.things.find((q) => q.kind === 'zasieki')!;
      sim.push({ t: 'unbuild', ids: [], id: z.id });
      sim.step();
    }
    expect(hole.patch).toBe(70);
    expect(st.fence!.hp[k]).toBe(63);
  });

  it('łóżka piętrowe w zajętym pustym mieszkaniu liczą się raz i dopiero po naprawie', async () => {
    const { capOf } = await import('../../src/sim/sim.ts');
    const st = createSim(w, 3, { core: 1 });
    const cap0 = capOf(st, w);
    st.apts[3].ours = true;
    const at = await spotFor(st, 'lozka_pietrowe', roomOf(3, 'pokoj'));
    st.things.push({
      id: st.nextThing++,
      kind: 'lozka_pietrowe',
      x: at % size,
      y: Math.floor(at / size),
      w: 1,
      h: 2,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    // nienaprawione: nikt tam nie zamieszka
    expect(capOf(st, w)).toBe(cap0);
    for (const d of st.damage) if (d.apt === 3) d.fixed = true;
    // jedno całe łóżko (wersalka zepsuta) i dwa miejsca w piętrowych
    expect(capOf(st, w)).toBe(cap0 + 1 + 2);
  });

  it('zapis i wczytanie w trakcie przeszukania, rozbiórki, naprawy i zajęcia daje ten sam dalszy przebieg', () => {
    const jobs: [string, (st: SimState, id: number) => Parameters<Sim['push']>[0]][] = [
      ['search', (_st, id) => ({ t: 'search', ids: [id], room: roomOf(2, 'pokoj') })],
      ['dismantle', (st, id) => ({ t: 'dismantle', ids: [id], thing: st.things.find((t) => t.kind === 'smieci')!.id })],
      ['repair', (st, id) => ({ t: 'repair', ids: [id], damage: st.damage.findIndex((d) => d.kind === 'okno') })],
      ['claim', (_st, id) => ({ t: 'claim', ids: [id], apt: 3 })],
    ];
    for (const [kind, cmd] of jobs) {
      const st = createSim(w, 3, { core: 1 });
      for (const a of st.apts)
        if (a.state === 'puste')
          a.searched = kind === 'search' ? [] : h.rooms.filter((r) => r.apt === a.apt).map((r) => r.id);
      const sim = new Sim(w, st);
      const [p] = core(st);
      sim.push(cmd(st, p.id));
      run(sim, () => p.job?.t === kind && p.job.phase >= 1, 6000);
      expect(p.job?.t).toBe(kind);
      const copy = new Sim(w, JSON.parse(JSON.stringify(st)));
      for (let k = 0; k < 1500; k++) {
        sim.step();
        copy.step();
      }
      expect(copy.hash()).toBe(sim.hash());
    }
  });

  it('budowę, do której zarząd wziął się sam, przerywa noc; plan czeka do rana z doniesionym materiałem', async () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(1, 21.5);
    const sim = new Sim(w, st);
    const room = roomOf(0, 'pokoj');
    const at = await spotFor(st, 'warsztat', room);
    stockUp(st, BUILDS.warsztat.cost, room);
    sim.push({ t: 'build', ids: [], kind: 'warsztat', x: at % size, y: Math.floor(at / size), rot: 0 });
    let started = false;
    while (st.tick < atHour(1, 22.5)) {
      sim.step();
      if (core(st)[0].job?.t === 'build') started = true;
    }
    expect(started).toBe(true);
    expect(core(st)[0].job?.t).not.toBe('build');
    expect(st.builds).toHaveLength(1);
    expect(st.builds[0].by).toBe(-1);
  });

  it('odwołany plan oddaje materiał obok obrysu, a na planie nie rozpali się ogniska', async () => {
    const { canPlace } = await import('../../src/sim/budowle.ts');
    const { campfireSpotOk } = await import('../../src/sim/sim.ts');
    const st = createSim(w, 3, { core: 1 });
    const sim = new Sim(w, st);
    const [p] = core(st);
    const room = roomOf(0, 'pokoj');
    const at = await spotFor(st, 'warsztat', room);
    stockUp(st, BUILDS.warsztat.cost, room);
    sim.push({ t: 'build', ids: [p.id], kind: 'warsztat', x: at % size, y: Math.floor(at / size), rot: 0 });
    run(sim, () => (st.builds[0]?.have.deski ?? 0) >= 6);
    expect(st.builds[0].have.deski).toBeGreaterThanOrEqual(6);
    sim.push({ t: 'unbuild', ids: [], id: st.builds[0].id });
    sim.step();
    expect(canPlace(st, w, 'warsztat', at % size, Math.floor(at / size), 0).ok).toBe(true);
    const g = w.fence.yard.find((i) => canPlace(st, w, 'ogrodek', i % size, Math.floor(i / size), 0).ok)!;
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: g % size, y: Math.floor(g / size), rot: 0 });
    sim.step();
    expect(buildTiles('ogrodek', g % size, Math.floor(g / size), 0, size).some((i) => campfireSpotOk(st, w, i))).toBe(
      false,
    );
  });
});
