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
