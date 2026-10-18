import { describe, expect, it } from 'vitest';
import { HEAT_EVERY } from '../../src/sim/house.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import { createSim, type Pawn, Sim, type SimState, STAY_HOME } from '../../src/sim/sim.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
const strangers = (st: SimState) => st.pawns.filter((p) => p.kind === 'szabrownik');
const core = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

/** napad bez warty na pierwszą dziurę o godzinie h: szabrownicy wchodzą na podwórko */
function breakIn(h = 23, mode: 'zwykly' | 'zombie' = 'zwykly') {
  const st = createSim(w, 3, { core: 2, mode });
  st.tick = atHour(1, h - 1);
  const sim = new Sim(w, st);
  const hole = st.fence!.holes[0];
  sim.push({ t: 'raid', ids: [], at: atHour(1, h), post: `d${hole.id}` });
  let inside: Pawn | undefined;
  while (!inside && st.tick < atHour(1, h + 2)) {
    sim.step();
    inside = strangers(st).find((p) => yard.has(tileOf(p)));
  }
  return { st, sim, inside: inside! };
}

/** szabrownicy czekają za zamkniętą bramą, a przy bramie stoi warta z daną bronią (i nabojami w magazynie) */
function gateWatch(weapon: Pawn['weapon'], mode: 'zwykly' | 'zombie' = 'zwykly', naboje = 0) {
  const st = createSim(w, 3, { core: 2, mode });
  if (naboje) st.store.ammo!.naboje = naboje;
  st.tick = atHour(1, 22);
  const sim = new Sim(w, st);
  const g = core(st)[0];
  g.weapon = weapon;
  sim.push({ t: 'gate', ids: [], open: false });
  sim.push({ t: 'guard', ids: [g.id], post: 'brama' });
  sim.push({ t: 'raid', ids: [], at: atHour(1, 23), post: 'brama' });
  while (!strangers(st).length) sim.step();
  return { st, sim, g };
}

describe('walka', () => {
  it('zarząd z łomem na polecenie dochodzi do szabrownika na podwórku i zabija go; zwłoki nie wstają', () => {
    const { st, sim, inside } = breakIn();
    expect(inside).toBeTruthy();
    expect(inside.hp).toBe(70);
    const a = core(st)[0];
    // menu pod prawym przyciskiem na szabrowniku: atak jako pierwsza, domyślna pozycja
    const menu = commandsAt(st, w, [a.id], tileOf(inside));
    expect(menu[0].cmd).toEqual({ t: 'attack', ids: [a.id], target: inside.id });
    expect(menu[0].quick).toBe(true);
    sim.push({ t: 'arm', ids: [a.id], weapon: 'lom' });
    sim.push({ t: 'attack', ids: [a.id], target: inside.id });
    sim.step();
    expect(jobText(st, w, a)).toMatch(/walczy|atakuje|idzie/i);
    const end = st.tick + 4000;
    while (st.pawns.some((p) => p.id === inside.id) && st.tick < end) sim.step();
    expect(st.pawns.some((p) => p.id === inside.id)).toBe(false);
    expect(st.dead?.some((d) => d.kind === 'szabrownik' && d.cause === 'rany')).toBe(true);
    const body = st.things.find((t) => t.kind === 'zwloki');
    expect(body).toBeTruthy();
    // w zwykłym trybie zwłoki nie wstają
    expect(body!.fuel).toBe(0);
    expect(st.tally?.killed).toBe(1);
    expect(st.things.some((t) => t.kind === 'krew')).toBe(true);
  });

  it('warta z nożem przy zamkniętej bramie nie sięga szabrownika za siatką, warta z dzidą sięga', () => {
    const hurt = (weapon: Pawn['weapon']) => {
      const { st, sim } = gateWatch(weapon);
      // ranny ucieka i znika z mapy, więc patrzymy w każdym kroku
      let hit = false;
      while (st.tick < atHour(1, 22.95) && !hit) {
        sim.step();
        hit = strangers(st).some((p) => (p.hp ?? 70) < 70) || (st.dead ?? []).length > 0;
      }
      return hit;
    };
    expect(hurt('noz')).toBe(false);
    expect(hurt('dzida')).toBe(true);
  });

  it('strzał z rewolweru zdejmuje nabój i robi hałas na 40 m przez 2 sekundy; bez naboi bije jak gołe ręce', () => {
    // zwykły tryb: warta strzela przez bramę (w trybie zombie sama nie strzela przez siatkę, tests/unit/zombie-szlif)
    const { st, sim } = gateWatch('rewolwer', 'zwykly', 12);
    expect(st.store.ammo!.naboje).toBe(12);
    while (st.store.ammo!.naboje === 12 && st.tick < atHour(1, 23)) sim.step();
    expect(st.store.ammo!.naboje).toBe(11);
    expect(st.noise?.some((n) => n.r === 40 && n.until === st.tick - 1 + 40)).toBe(true);
    expect(st.fx?.some((f) => f.t === 'strzal')).toBe(true);
    // hałas wygasa po 2 sekundach gry
    for (let k = 0; k < 45; k++) sim.step();
    expect(st.noise?.some((n) => n.r === 40 && n.until <= st.tick)).toBe(false);
    // bez naboi: gołe ręce przez siatkę nie sięgają
    st.store.ammo!.naboje = 0;
    const hp0 = strangers(st).map((p) => p.hp);
    for (let k = 0; k < 200; k++) sim.step();
    expect(st.store.ammo!.naboje).toBe(0);
    expect(strangers(st).map((p) => p.hp)).toEqual(hp0.slice(0, strangers(st).length));
  });

  it('mieszkańcy z wrogiem w promieniu 8 m idą do domu', () => {
    const { st, sim, inside } = breakIn(16);
    expect(inside).toBeTruthy();
    // jeden mieszkaniec pracuje na podwórku 4–6 m od szabrownika
    const r = st.pawns.find((p) => p.kind === 'resident')!;
    const spot = w.fence.yard.find((i) => {
      const d = Math.hypot((i % size) + 0.5 - inside.x, Math.floor(i / size) + 0.5 - inside.y);
      return d >= 4 && d <= 6 && sim.canWalk('resident', i);
    })!;
    expect(spot).toBeDefined();
    Object.assign(r, { x: (spot % size) + 0.5, y: Math.floor(spot / size) + 0.5, path: [], pi: 0, job: null });
    for (let k = 0; k < 60; k++) sim.step();
    expect(r.job?.t).toBe('stay');
    expect(r.job?.target).toBe(STAY_HOME);
  });

  it('nikt nie umiera od samego zimna i głodu (zdrowie 0 z potrzeb nie zabija)', () => {
    const st = createSim(w, 3, { core: 2 });
    const sim = new Sim(w, st);
    for (const p of core(st)) {
      p.needs!.health = 0;
      p.needs!.warm = 0;
      p.needs!.food = 0;
    }
    for (let k = 0; k < HEAT_EVERY * 3; k++) sim.step();
    expect(core(st)).toHaveLength(2);
    expect(st.dead ?? []).toEqual([]);
  });

  it('walka jest powtarzalna: to samo ziarno, ten sam skrót', () => {
    const play = () => {
      const { st, sim, inside } = breakIn();
      const a = core(st)[0];
      sim.push({ t: 'attack', ids: [a.id], target: inside.id });
      for (let k = 0; k < 1500; k++) sim.step();
      return sim.hash();
    };
    expect(play()).toBe(play());
  });
});
