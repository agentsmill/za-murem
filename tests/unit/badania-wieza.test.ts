/* Barykada z wraków i posterunek na wieży (docs/superpowers/specs/2026-10-19-badania-design.md, „Wieża” i wiersze
   t_wieza, t_barykady): barykada na odcinku siatki ma 160 wytrzymałości (zasieki 100) i pęka od naporu jak zasieki,
   a wieża to posterunek „Warta na wieży” (warta:wieza) na karcie nocy. Wartownik z wieży dokłada do obrony każdego
   innego posterunku połowę swojej wartości warty (nie stałe 0,5), nocą stoi na kafelku wieży, bez zarządu płoszy
   z zasięgiem lampy ×1,5, a w trybie zombie strzela bronią dystansową z zasięgiem ×1,5. Wieża nie jest celem napadu:
   postsOf jej nie zna. Na wieży staje najwyżej tyle osób, ile ma kafelków (karta nocy, lista wyboru, propozycja), a
   wzmocnienie siatki deskami nie dotyka barykady. Przymorze z dema (blok). */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTE_HOLD_FIRE } from '../../src/content/napisy-zombie.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import {
  confirm,
  defenseAt,
  guardValue,
  isFenceGuard,
  makeCard,
  nightAdvice,
  nightTick,
  postsOf,
  setAssign,
  WIEZA,
  WIEZA_KEY,
  watchersOf,
  wiezaPelna,
} from '../../src/gov/noc.ts';
import type { GovInput } from '../../src/gov/typy.ts';
import { emptyEffects, round1 } from '../../src/gov/wspolne.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { type PawnLike, WIEZA_POST as POSE_WIEZA_POST, poseOf } from '../../src/render/poses.ts';
import { canPlace, footprint } from '../../src/sim/budowle.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandsAt, jobText } from '../../src/sim/orders.ts';
import {
  BARYKADA_HP,
  createSim,
  type Pawn,
  postKey,
  Sim,
  type SimState,
  spawnZombie,
  WIEZA_POST,
  WIEZA_ZASIEG,
  ZASIEKI_HP,
} from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { nightSheet } from '../../src/ui/okna.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { Atrapa, TPH } from './gov-atrapa.ts';
import { pl } from './po-angielsku.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w: World = buildWorld(d.geo, { seed, street: d.street });
const size = w.size;
const xy = (i: number): [number, number] => [i % size, Math.floor(i / size)];

afterEach(() => ustawJezyk('pl'));

/** gra z odblokowanymi badaniami (techDone powstaje dopiero przy pierwszym użyciu) */
function gra(mode?: 'zombie'): { st: SimState; sim: Sim } {
  const st = createSim(w, seed, { core: 4, ...(mode ? { mode } : {}) });
  st.techDone = ['t_wieza', 't_barykady'];
  return { st, sim: new Sim(w, st) };
}

const sterta = (st: SimState, kind: string, tile: number, n: number) =>
  st.things.push({
    id: st.nextThing++,
    kind,
    x: tile % size,
    y: Math.floor(tile / size),
    w: 1,
    h: 1,
    rot: 0,
    n,
    fuel: 0,
    by: -1,
    owner: -1,
  });

/** budowla na kafelku siatki zbudowana prawdziwą pracą zarządu: materiały leżą na podwórku przy siatce */
function postaw(st: SimState, sim: Sim, kind: 'zasieki' | 'barykada', tile: number): void {
  const near = (i: number) => Math.hypot((i % size) - (tile % size), Math.floor(i / size) - Math.floor(tile / size));
  const yard = w.fence.yard.filter((i) => !w.blocked[i]).sort((a, b) => near(a) - near(b));
  sterta(st, 'zlom', yard[3], 20);
  sterta(st, 'deski', yard[5], 4);
  const core = st.pawns.find((p) => p.kind === 'core')!;
  sim.push({ t: 'build', ids: [core.id], kind, x: tile % size, y: Math.floor(tile / size), rot: 0 });
  const t0 = st.tick;
  while (st.tick < t0 + 6 * 800 && !st.things.some((t) => t.kind === kind)) sim.step();
  expect(
    st.things.some((t) => t.kind === kind),
    `${kind} stoi`,
  ).toBe(true);
}

/** kafelki siatki bez dziur, na których wolno postawić dane zasieki, co najmniej 6 m od siebie */
function odcinki(st: SimState, kind: 'zasieki' | 'barykada', n: number): number[] {
  const hole = new Set(w.fence.hole);
  const out: number[] = [];
  for (const t of w.fence.tiles) {
    if (hole.has(t) || !canPlace(st, w, kind, t % size, Math.floor(t / size), 0).ok) continue;
    if (out.every((o) => Math.hypot((o % size) - (t % size), Math.floor(o / size) - Math.floor(t / size)) > 6))
      out.push(t);
    if (out.length === n) break;
  }
  expect(out).toHaveLength(n);
  return out;
}

/** wieża postawiona wprost na mapie (kształt i rozmiar z BUILDS) na pierwszym dozwolonym kafelku podwórka */
function wieza(st: SimState): number {
  const a = allowedAnchors(st, w, 'wieza', 0)[0];
  const f = footprint('wieza', 0);
  st.things.push({
    id: st.nextThing++,
    kind: 'wieza',
    x: a % size,
    y: Math.floor(a / size),
    w: f.w,
    h: f.h,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  });
  return a;
}

describe('barykada na odcinku siatki', () => {
  it('ma 160 wytrzymałości, zasieki 100', () => {
    expect(BARYKADA_HP).toBe(160);
    expect(ZASIEKI_HP).toBe(100);
  });

  it('po budowie kafelek siatki ma 160, a rozbiórka oddaje to, co było przed nią', () => {
    const { st, sim } = gra();
    const [a] = odcinki(st, 'barykada', 1);
    const k = w.fence.tiles.indexOf(a);
    const przed = st.fence!.hp[k];
    expect(przed).toBeGreaterThan(0);
    expect(przed).toBeLessThan(BARYKADA_HP);
    postaw(st, sim, 'barykada', a);
    expect(st.fence!.hp[k]).toBe(BARYKADA_HP);
    const t = st.things.find((q) => q.kind === 'barykada')!;
    expect(t.prev).toBe(przed);
    sim.push({ t: 'unbuild', ids: [], id: t.id });
    sim.step();
    expect(st.things.some((q) => q.kind === 'barykada')).toBe(false);
    expect(st.fence!.hp[k]).toBe(przed);
  });

  it('pęka od naporu później niż zasieki: sto punktów zbija zasieki, barykadę dopiero 160', () => {
    const { st, sim } = gra();
    const [z] = odcinki(st, 'zasieki', 1);
    postaw(st, sim, 'zasieki', z);
    const [b] = odcinki(st, 'barykada', 1);
    postaw(st, sim, 'barykada', b);
    const breaches = st.tally!.breaches;
    sim.damageFence(z, 100);
    expect(st.things.some((t) => t.kind === 'zasieki')).toBe(false);
    expect(st.fence!.holes.some((h) => h.tiles.includes(z))).toBe(true);
    sim.damageFence(b, 100);
    expect(st.things.some((t) => t.kind === 'barykada')).toBe(true);
    expect(st.fence!.hp[w.fence.tiles.indexOf(b)]).toBe(60);
    expect(st.fence!.holes.some((h) => h.tiles.includes(b))).toBe(false);
    expect(st.tally!.breaches).toBe(breaches + 1);
    // dobita do zera znika bez zwrotu materiału, a w jej miejscu jest dziura
    const zlom = st.things.filter((t) => t.kind === 'zlom').reduce((s, t) => s + t.n, 0);
    sim.damageFence(b, 60);
    expect(st.things.some((t) => t.kind === 'barykada')).toBe(false);
    expect(st.fence!.holes.some((h) => h.tiles.includes(b))).toBe(true);
    expect(sim.canWalk('zombie', b)).toBe(true);
    expect(st.things.filter((t) => t.kind === 'zlom').reduce((s, t) => s + t.n, 0)).toBe(zlom);
  });

  it('na dziurze zamyka ją łatą o 160 wytrzymałości i znika dopiero z nią', () => {
    const { st, sim } = gra();
    const dziura = w.fence.hole[0];
    expect(canPlace(st, w, 'barykada', ...xy(dziura), 0).ok).toBe(true);
    postaw(st, sim, 'barykada', dziura);
    const h = st.fence!.holes.find((x) => x.tiles.includes(dziura))!;
    expect(h.patch).toBe(BARYKADA_HP);
    sim.damageFence(dziura, 100);
    expect(h.patch).toBe(60);
    expect(st.things.some((t) => t.kind === 'barykada')).toBe(true);
    sim.damageFence(dziura, 60);
    expect(h.patch).toBe(0);
    expect(st.things.some((t) => t.kind === 'barykada')).toBe(false);
  });

  it('kafelek z barykadą nie liczy się do wytrzymałości siatki ponad całość (0–1)', () => {
    const { st, sim } = gra();
    const przed = snapshot(st, w).fence.durability;
    const [b] = odcinki(st, 'barykada', 1);
    postaw(st, sim, 'barykada', b);
    const po = snapshot(st, w).fence.durability;
    expect(po).toBeGreaterThanOrEqual(przed);
    expect(po).toBeLessThanOrEqual(1);
    expect(po - przed).toBeLessThan(0.6 / w.fence.tiles.length + 1e-9);
  });
});

/** wejście zarządu z atrapy; wieża: true dopisuje posterunek */
const wejscie = (over: Partial<GovInput> = {}): GovInput => ({ ...new Atrapa(1).input(), ...over });

describe('posterunek wieży na karcie nocy', () => {
  it('klucz warta:wieza ma każda osoba, gdy wieża stoi, bez wieży nikt', () => {
    expect(WIEZA).toBe('wieza');
    expect(WIEZA_KEY).toBe('warta:wieza');
    const z = makeCard(newGov(1), wejscie({ wieza: 4 })).card;
    for (const p of z.people) {
      const o = p.options.find((x) => x.key === WIEZA_KEY)!;
      expect(o, p.name).toBeTruthy();
      expect(pl(o.label)).toBe('Warta na wieży');
      expect(o.guard).toBeGreaterThan(0);
    }
    const bez = makeCard(newGov(1), wejscie()).card;
    for (const p of bez.people) expect(p.options.some((x) => x.key === WIEZA_KEY)).toBe(false);
    expect(bez.wieza).toBeUndefined();
    expect(z.wieza).toBe(4);
  });

  it('wieża nie jest celem napadu: postsOf jej nie zna, a karta nie dopisuje jej do miejsc do pilnowania', () => {
    const i = wejscie({ wieza: 4 });
    expect(postsOf(i).map((p) => p.key)).not.toContain(WIEZA);
    expect(postsOf(i, true).map((p) => p.key)).not.toContain(WIEZA);
    expect(makeCard(newGov(1), i).card.posts.map((p) => p.key)).not.toContain(WIEZA);
  });

  it('warta na wieży liczy się jako warta przy siatce (odstrasza), a zarząd sam nikogo tam nie wysyła', () => {
    const i = wejscie({ wieza: 4 });
    expect(isFenceGuard(WIEZA_KEY)).toBe(true);
    const { card, assign } = makeCard(newGov(1), i);
    expect(Object.values(assign)).not.toContain(WIEZA_KEY);
    const id = card.people[0].id;
    expect(watchersOf(i, { [id]: WIEZA_KEY })).toBe(1);
  });

  it('opcja dokłada tyle obrony, ile wartownik daje każdemu innemu posterunkowi (połowa jego wartości)', () => {
    const st = newGov(1);
    const i = wejscie({ wieza: 4 });
    const { card } = makeCard(st, i);
    const p = i.people[0];
    const o = card.people.find((c) => c.id === p.id)!.options.find((x) => x.key === WIEZA_KEY)!;
    expect(o.guard).toBe(round1(0.5 * guardValue(st, i, p, WIEZA)));
    expect(pl(o.note)).toMatch(/podwórk/i);
  });

  it('karta w interfejsie pokazuje wieżę w wykazie posterunków i w liście wyboru; bez wieży jej nie ma', () => {
    const st = newGov(1);
    const i = wejscie({ wieza: 4 });
    const { card, assign } = makeCard(st, i);
    const odds = { chance: card.chance, now: card.chance, watchers: 0 };
    const html = nightSheet(card, assign, odds).body;
    expect(html).toContain('<span class="post-k">na wieży</span>');
    expect(html).toContain('value="warta:wieza"');
    const bez = makeCard(st, wejscie());
    const html2 = nightSheet(bez.card, bez.assign, odds).body;
    expect(html2).not.toContain('<span class="post-k">na wieży</span>');
    expect(html2).not.toContain('warta:wieza');
    // wykaz pokazuje, kto stoi na wieży
    const id = card.people[0].id;
    const html3 = nightSheet(card, { ...assign, [id]: WIEZA_KEY }, odds).body;
    expect(html3).toContain(`<span class="post-k">na wieży</span><b class="post-v">${card.people[0].name}</b>`);
    ustawJezyk('en');
    expect(nightSheet(card, assign, odds).body).toContain('<span class="post-k">on the tower</span>');
  });
});

describe('obrona z wieży', () => {
  const st = newGov(1);
  const i = wejscie({ wieza: 4 });
  // odważny, bez umiejętności, wypoczęty: wartość warty równo 3,0 (2,5 × 1,2)
  const p = { ...i.people[0], traits: ['odwazny'], skills: {}, arm: 'brak' as const };
  const gv = guardValue(st, i, p, 'brama');

  it('wartownik z wieży dodaje do bramy połowę swojej wartości, a nie stałe 0,5', () => {
    expect(gv).toBe(3);
    const bez = defenseAt(st, i, 'brama', []);
    const zWiezy = defenseAt(st, i, 'brama', [{ p, post: WIEZA }]);
    const zInnej = defenseAt(st, i, 'brama', [{ p, post: 'd1' }]);
    const zBramy = defenseAt(st, i, 'brama', [{ p, post: 'brama' }]);
    expect(round1(zWiezy - bez)).toBe(1.5);
    expect(round1(zInnej - bez)).toBe(0.5);
    expect(round1(zBramy - bez)).toBe(gv);
    // przy dziurze tak samo: połowa wartości z wieży, 0,5 z bramy
    expect(round1(defenseAt(st, i, 'd1', [{ p, post: WIEZA }]) - defenseAt(st, i, 'd1', []))).toBe(1.5);
    expect(round1(defenseAt(st, i, 'd1', [{ p, post: 'brama' }]) - defenseAt(st, i, 'd1', []))).toBe(0.5);
  });

  it('słabszy wartownik daje z wieży mniej: połowa jego wartości', () => {
    const slaby = { ...p, traits: ['tchorz'], needs: { ...p.needs, rest: 10 } };
    const v = guardValue(st, i, slaby, WIEZA);
    const bez = defenseAt(st, i, 'brama', []);
    expect(round1(defenseAt(st, i, 'brama', [{ p: slaby, post: WIEZA }]) - bez)).toBe(round1(0.5 * v));
  });
});

describe('wartownik na wieży w symulacji', () => {
  it('klucz posterunku z celu pracy i z odczytu zarządu', () => {
    expect(WIEZA_POST).toBe(-3);
    expect(postKey(WIEZA_POST)).toBe('wieza');
    const { st } = gra();
    expect(govInput(st, w, 0).wieza).toBeUndefined();
    wieza(st);
    expect(govInput(st, w, 0).wieza).toBe(4);
  });

  it('wieża w planie jeszcze nie jest posterunkiem, polecenie bez wieży nic nie robi', () => {
    const { st, sim } = gra();
    const core = st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'guard', ids: [core.id], post: WIEZA });
    sim.step();
    expect(core.job?.t).not.toBe('guard');
    const a = allowedAnchors(st, w, 'wieza', 0)[0];
    sim.push({ t: 'build', ids: [], kind: 'wieza', x: a % size, y: Math.floor(a / size), rot: 0 });
    sim.step();
    expect(st.builds.map((b) => b.kind)).toEqual(['wieza']);
    expect(govInput(st, w, 0).wieza).toBeUndefined();
  });

  it('nocą wartownik stoi na kafelku wieży do rana, a odczyt pokazuje posterunek wieży', () => {
    const { st, sim } = gra();
    wieza(st);
    const t = st.things.find((q) => q.kind === 'wieza')!;
    // gra zaczyna się o 15:00, polecenie przychodzi o 22:00
    while (st.tick < (22 - 15) * 800) sim.step();
    const core = st.pawns.filter((p) => p.kind === 'core');
    sim.push({ t: 'guard', ids: [core[1].id], post: WIEZA });
    for (let k = 0; k < 4 * 800 && core[1].job?.phase !== 1; k++) sim.step();
    const g = core[1];
    expect(g.job?.t).toBe('guard');
    expect(g.job?.target).toBe(WIEZA_POST);
    expect(g.job?.phase).toBe(1);
    const na = (p: Pawn) => p.x >= t.x && p.x < t.x + t.w && p.y >= t.y && p.y < t.y + t.h;
    expect(na(g), `(${g.x}, ${g.y}) na wieży (${t.x}, ${t.y})`).toBe(true);
    // stoi tam godzinę później i w odczycie dla zarządu ma posterunek wieży
    for (let k = 0; k < 800; k++) sim.step();
    expect(na(g)).toBe(true);
    expect(g.job?.t).toBe('guard');
    const person = snapshot(st, w).people.find((q) => q.name === st.people[g.person].name)!;
    expect(person.post).toBe('wieza');
    expect(govInput(st, w, 0).people.find((q) => q.post === 'wieza')).toBeTruthy();
    expect(jobText(st, w, g)).toBe('Trzyma wartę na wieży.');
    ustawJezyk('en');
    expect(jobText(st, w, g)).toBe('On watch on the tower.');
  });

  it('dwóch wartowników na wieży staje na różnych kafelkach', () => {
    const { st, sim } = gra();
    wieza(st);
    const core = st.pawns.filter((p) => p.kind === 'core');
    sim.push({ t: 'guard', ids: [core[0].id, core[1].id], post: WIEZA });
    for (let k = 0; k < 3 * 800 && !(core[0].job?.phase === 1 && core[1].job?.phase === 1); k++) sim.step();
    expect(core[0].job?.phase).toBe(1);
    expect(core[1].job?.phase).toBe(1);
    expect(core[0].job!.tile).not.toBe(core[1].job!.tile);
  });

  it('rozebrana wieża zwalnia wartownika z posterunku', () => {
    const { st, sim } = gra();
    wieza(st);
    const g = st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'guard', ids: [g.id], post: WIEZA });
    for (let k = 0; k < 3 * 800 && g.job?.phase !== 1; k++) sim.step();
    expect(g.job?.phase).toBe(1);
    sim.push({ t: 'unbuild', ids: [], id: st.things.find((q) => q.kind === 'wieza')!.id });
    for (let k = 0; k < 40; k++) sim.step();
    expect(g.job?.target).not.toBe(WIEZA_POST);
  });
});

type Prywatne = {
  litNear(x: number, y: number): boolean;
  guardStrike(p: Pawn): void;
  lineCheck(ax: number, ay: number, bx: number, by: number): 'clear' | 'fence' | 'wall';
};

describe('bez zarządu: światło z wieży', () => {
  it('lampa wartownika z wieży płoszy z zasięgiem ×1,5, z bramy tylko do LAMP_REACH', () => {
    expect(WIEZA_ZASIEG).toBe(1.5);
    const { st, sim } = gra();
    wieza(st);
    st.things = st.things.filter((t) => t.kind !== 'ognisko');
    const g = st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'guard', ids: [g.id], post: WIEZA });
    for (let k = 0; k < 3 * 800 && g.job?.phase !== 1; k++) sim.step();
    expect(g.job?.phase).toBe(1);
    const lit = (r: number) => (sim as unknown as Prywatne).litNear(g.x + r, g.y);
    expect(lit(4.9)).toBe(true);
    expect(lit(7.4)).toBe(true);
    expect(lit(7.7)).toBe(false);
    // ten sam pionek na posterunku przy bramie: tylko 5 m
    g.job!.target = 0;
    expect(lit(4.9)).toBe(true);
    expect(lit(5.5)).toBe(false);
    expect(lit(7.4)).toBe(false);
  });
});

describe('tryb zombie: zasięg strzału z wieży', () => {
  /** gra w trybie zombie z wartownikiem z daną bronią na wieży i bez szwendaczy na mapie */
  function wartownik(weapon: 'kusza' | 'dzida') {
    const { st, sim } = gra('zombie');
    wieza(st);
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    st.store.ammo!.belty = 20;
    const g = st.pawns.find((p) => p.kind === 'core')!;
    g.weapon = weapon;
    g.needs!.health = 100;
    g.needs!.rest = 100;
    sim.push({ t: 'guard', ids: [g.id], post: WIEZA });
    for (let k = 0; k < 3 * 800 && g.job?.phase !== 1; k++) sim.step();
    expect(g.job?.phase, 'wartownik doszedł na wieżę').toBe(1);
    return { st, sim, g, priv: sim as unknown as Prywatne };
  }

  /** szwendacz na wolnym kafelku w odległości [lo, hi] od wartownika, bez ściany po drodze (siatka może być) */
  function szwendaczW(st: SimState, priv: Prywatne, g: Pawn, lo: number, hi: number): void {
    const free: number[] = [];
    for (let i = 0; i < size * size; i++) {
      const dist = Math.hypot((i % size) + 0.5 - g.x, Math.floor(i / size) + 0.5 - g.y);
      if (w.blocked[i] || dist < lo || dist > hi) continue;
      if (priv.lineCheck(g.x, g.y, (i % size) + 0.5, Math.floor(i / size) + 0.5) !== 'wall') free.push(i);
    }
    expect(free.length, `miejsce w ${lo}–${hi} m od wartownika`).toBeGreaterThan(0);
    spawnZombie(st, w, free[0], 0, true);
  }

  const strzela = (priv: Prywatne, g: Pawn, st: SimState): boolean => {
    g.cd = 0;
    priv.guardStrike(g);
    return (g.cd ?? 0) > st.tick;
  };

  it('kusza (12 m) z wieży sięga 18 m, spoza posterunku wieży tylko 12 m', () => {
    const { st, g, priv } = wartownik('kusza');
    szwendaczW(st, priv, g, 13.5, 17.5);
    expect(strzela(priv, g, st), 'z wieży, 13,5–17,5 m').toBe(true);
    // ten sam pionek na posterunku przy bramie nie sięga tak daleko
    g.job!.target = 0;
    expect(strzela(priv, g, st), 'z bramy, 13,5–17,5 m').toBe(false);
  });

  it('dalej niż 18 m z wieży też nie sięga', () => {
    const { st, g, priv } = wartownik('kusza');
    szwendaczW(st, priv, g, 19, 22);
    expect(strzela(priv, g, st)).toBe(false);
  });

  it('dzida nie dostaje premii: zasięg jak dotąd', () => {
    const { st, g, priv } = wartownik('dzida');
    // dzida 2,6 m: ×1,5 dałoby 3,9 m
    szwendaczW(st, priv, g, 3.3, 3.7);
    expect(strzela(priv, g, st)).toBe(false);
  });

  it('karta nocy: z dzidą „Na wieży trzeba broni dystansowej.”, z kuszą nie', () => {
    const st = newGov(3, 'zombie');
    const i = wejscie({ wieza: 4 });
    const dzida = { ...i.people[0], arm: 'dzida' as const, weapon: 'dzida' };
    const kusza = { ...i.people[1], arm: 'palna' as const, weapon: 'kusza' };
    const gol = { ...i.people[2], arm: 'brak' as const, weapon: null };
    const rewolwer = { ...i.people[3], arm: 'palna' as const, weapon: 'rewolwer' };
    const { card } = makeCard(st, { ...i, people: [dzida, kusza, gol, rewolwer] });
    const nota = (id: string) => card.people.find((c) => c.id === id)!.options.find((o) => o.key === WIEZA_KEY)!.note;
    expect(pl(nota(dzida.id))).toBe('Na wieży trzeba broni dystansowej.');
    expect(pl(nota(gol.id))).toBe('Na wieży trzeba broni dystansowej.');
    expect(pl(nota(kusza.id))).not.toContain('broni dystansowej');
    // broń palna przez siatkę sama nie strzela (strzał ściąga stado), jak przy każdej warcie za siatką
    expect(pl(nota(rewolwer.id))).toBe(NOTE_HOLD_FIRE);
    ustawJezyk('en');
    expect(nota(dzida.id)!.en).toBe('The tower needs a ranged weapon.');
  });

  it('w zwykłej grze nota o broni dystansowej się nie pojawia', () => {
    const i = wejscie({ wieza: 4 });
    const dzida = { ...i.people[0], arm: 'dzida' as const, weapon: 'dzida' };
    const { card } = makeCard(newGov(1), { ...i, people: [dzida, ...i.people.slice(1)] });
    const o = card.people[0].options.find((x) => x.key === WIEZA_KEY)!;
    expect(pl(o.note)).not.toContain('broni dystansowej');
  });
});

describe('zbieg z obwodem i widokiem', () => {
  it('rada w trybie zombie nie liczy wartownika z wieży bez broni dystansowej jako warty przy siatce', () => {
    const i = wejscie({ wieza: 4 });
    const dzida = { ...i.people[0], arm: 'dzida' as const, weapon: 'dzida' };
    const kusza = { ...i.people[0], arm: 'palna' as const, weapon: 'kusza' };
    const { card } = makeCard(newGov(3, 'zombie'), { ...i, people: [dzida, ...i.people.slice(1)] });
    const radaDzida = nightAdvice({ ...i, people: [dzida, ...i.people.slice(1)] }, card, { [dzida.id]: WIEZA_KEY });
    expect(pl(radaDzida)).toMatch(/^Bez warty stado/);
    const radaKusza = nightAdvice({ ...i, people: [kusza, ...i.people.slice(1)] }, card, { [kusza.id]: WIEZA_KEY });
    expect(pl(radaKusza)).not.toMatch(/^Bez warty stado/);
  });

  it('widok: wartownik z wieży rysuje się przed jej sprite’em (nie zasłania go kabina na palach)', () => {
    expect(POSE_WIEZA_POST).toBe(WIEZA_POST);
    const tower = { id: 9, kind: 'wieza', x: 20, y: 30, w: 2, h: 2, rot: 0 };
    const guard = (target: number): PawnLike => ({
      id: 3,
      kind: 'core',
      x: 20.5,
      y: 31.5,
      dir: 1,
      walk: 0,
      pi: 0,
      path: [],
      carry: 0,
      job: { t: 'guard', phase: 1, target },
    });
    const na = poseOf(guard(WIEZA_POST), 1, [tower]);
    expect(na.pose).toBe('guard');
    expect(na.z).toBeGreaterThan(tower.y + tower.h);
    expect(poseOf(guard(0), 1, [tower]).z).toBeUndefined();
  });
});

describe('rozstrzygnięcie napadu z wartą na wieży', () => {
  /** noc zatwierdzona o 20:00 z danym przydziałem, napad na bramę o sile 50 rozstrzygnięty o 5:00; zwraca obronę */
  function obrona(przydzial: (ids: string[]) => Record<string, string>): number {
    const gov = newGov(1);
    const atr = new Atrapa(1);
    atr.tick = 5 * TPH;
    const i20: GovInput = { ...atr.input(), wieza: 4 };
    const odwazni = i20.people.map((p) => ({ ...p, traits: ['odwazny'], skills: {}, arm: 'brak' as const }));
    const wej = { ...i20, people: odwazni };
    const { card, assign } = makeCard(gov, wej);
    Object.assign(assign, przydzial(odwazni.map((p) => p.id)));
    gov.night = {
      day: 1,
      card,
      assign,
      confirmed: false,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    confirm(gov, wej, emptyEffects(), false);
    gov.night.raid = { ...gov.night.raid!, come: true, post: 'brama', attack: 50 };
    const rano = new Atrapa(1);
    rano.tick = (24 + 5 - 15) * TPH;
    const fx = emptyEffects();
    nightTick(gov, { ...rano.input(), wieza: 4, people: odwazni }, fx);
    return fx.raidResult!.defense;
  }

  it('wartownik z wieży podnosi obronę bramy o połowę swojej wartości, ten przy bramie o całą', () => {
    const nikt = obrona((ids) => Object.fromEntries(ids.map((id) => [id, 'sen'])));
    const zWiezy = obrona(([a, ...reszta]) => ({
      [a]: WIEZA_KEY,
      ...Object.fromEntries(reszta.map((id) => [id, 'sen'])),
    }));
    const zBramy = obrona(([a, ...reszta]) => ({
      [a]: 'warta:brama',
      ...Object.fromEntries(reszta.map((id) => [id, 'sen'])),
    }));
    // odważny wypoczęty ma 3,0: z wieży 1,5, przy bramie całe 3,0
    expect(round1(zWiezy - nikt)).toBe(1.5);
    expect(round1(zBramy - nikt)).toBe(3);
  });
});

describe('wieża ma tyle miejsc, ile kafelków obrysu', () => {
  it('wieża 2×2 mieści cztery osoby: odczyt mówi o czterech miejscach i tyle osób staje na niej w symulacji', () => {
    const st = createSim(w, seed, { core: 6 });
    st.techDone = ['t_wieza'];
    const sim = new Sim(w, st);
    wieza(st);
    expect(govInput(st, w, 0).wieza).toBe(4);
    const core = st.pawns.filter((p) => p.kind === 'core');
    expect(core).toHaveLength(6);
    sim.push({ t: 'guard', ids: core.map((p) => p.id), post: WIEZA });
    const stoi = () => core.filter((p) => p.job?.t === 'guard' && p.job.target === WIEZA_POST && p.job.phase === 1);
    for (let k = 0; k < 4 * 800 && stoi().length < 4; k++) sim.step();
    expect(stoi()).toHaveLength(4);
    for (let k = 0; k < 800; k++) sim.step();
    expect(stoi()).toHaveLength(4);
    expect(new Set(stoi().map((p) => p.job!.tile)).size).toBe(4);
    // piąta i szósta osoba nie dostają posterunku wieży
    expect(core.filter((p) => p.job?.target === WIEZA_POST)).toHaveLength(4);
  });

  /** sześć osób z atrapy i wieża o czterech miejscach; noc z kartą w stanie zarządu, jak o 20:00 */
  function noc() {
    const base = wejscie({ wieza: 4 });
    const dodatkowe = [4, 5].map((k) => ({
      ...base.people[0],
      pawn: k,
      id: `s${k + 10}`,
      name: `Osoba ${k}`,
      first: `Osoba${k}`,
    }));
    const i: GovInput = { ...base, people: [...base.people, ...dodatkowe] };
    const gov = newGov(1);
    const { card, assign } = makeCard(gov, i);
    gov.night = {
      day: 1,
      card,
      assign,
      confirmed: false,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: 50,
      a0: 20,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    };
    return { gov, i, card, ids: i.people.map((p) => p.id) };
  }

  it('karta niesie liczbę miejsc wieży, a bez wieży nie ma pola', () => {
    const { card } = noc();
    expect(card.wieza).toBe(4);
    expect(card.people).toHaveLength(6);
  });

  it('czterech może iść na wieżę, piąty już nie: setAssign odmawia, a przydział zostaje', () => {
    const { gov, ids } = noc();
    for (const id of ids.slice(0, 4)) expect(setAssign(gov, id, WIEZA_KEY), id).toBe(true);
    expect(setAssign(gov, ids[4], WIEZA_KEY)).toBe(false);
    expect(setAssign(gov, ids[5], WIEZA_KEY)).toBe(false);
    expect(gov.night!.assign[ids[4]]).not.toBe(WIEZA_KEY);
    expect(Object.values(gov.night!.assign).filter((k) => k === WIEZA_KEY)).toHaveLength(4);
  });

  it('kto stoi na wieży, może swój wybór potwierdzić, a po zejściu jednego miejsce zajmuje następny', () => {
    const { gov, ids } = noc();
    for (const id of ids.slice(0, 4)) setAssign(gov, id, WIEZA_KEY);
    expect(setAssign(gov, ids[0], WIEZA_KEY)).toBe(true);
    expect(setAssign(gov, ids[4], WIEZA_KEY)).toBe(false);
    expect(setAssign(gov, ids[0], 'sen')).toBe(true);
    expect(setAssign(gov, ids[4], WIEZA_KEY)).toBe(true);
    expect(Object.values(gov.night!.assign).filter((k) => k === WIEZA_KEY)).toHaveLength(4);
    // inne posterunki i sen nie mają takiego limitu
    expect(setAssign(gov, ids[5], 'warta:brama')).toBe(true);
  });

  it('wiezaPelna: pełna dla każdego poza tymi, którzy na niej stoją; bez wieży nigdy', () => {
    const { card, ids } = noc();
    const naWiezy = Object.fromEntries(ids.slice(0, 4).map((id) => [id, WIEZA_KEY]));
    expect(wiezaPelna(card, {}, ids[4])).toBe(false);
    expect(wiezaPelna(card, Object.fromEntries(ids.slice(0, 3).map((id) => [id, WIEZA_KEY])), ids[4])).toBe(false);
    expect(wiezaPelna(card, naWiezy, ids[4])).toBe(true);
    expect(wiezaPelna(card, naWiezy, ids[0])).toBe(false);
    expect(wiezaPelna({ ...card, wieza: undefined }, naWiezy, ids[4])).toBe(false);
  });

  it('propozycja zarządu nie wysyła na wieżę więcej osób, niż jest miejsc, nawet gdy stoi tam więcej', () => {
    const { i, ids } = noc();
    const stoja = { ...i, guards: ids.map((id) => ({ id, post: WIEZA })) };
    const { assign } = makeCard(newGov(1), stoja);
    expect(Object.values(assign).filter((k) => k === WIEZA_KEY)).toHaveLength(4);
  });

  it('okno karty: piąta osoba ma opcję wieży wyszarzoną z dopiskiem, czterej na wieży swoją aktywną', () => {
    const { card, ids } = noc();
    const assign = Object.fromEntries(card.people.map((p) => [p.id, 'sen']));
    const odds = { chance: card.chance, now: card.chance, watchers: 0 };
    const opcja = (html: string, id: string) => {
      const sel = html.split(`data-id="${id}"`)[1].split('</select>')[0];
      return sel.match(/<option value="warta:wieza"[^>]*>[^<]*<\/option>/)![0];
    };
    // wieża wolna: nikt nie ma jej wyszarzonej
    const wolna = nightSheet(card, assign, odds).body;
    for (const id of ids) expect(opcja(wolna, id)).not.toContain('disabled');
    // cztery osoby na wieży: reszta ma ją wyszarzoną, ci na niej nie
    for (const id of ids.slice(0, 4)) assign[id] = WIEZA_KEY;
    const pelna = nightSheet(card, assign, odds).body;
    for (const id of ids.slice(0, 4)) expect(opcja(pelna, id), id).not.toContain('disabled');
    for (const id of ids.slice(4)) {
      expect(opcja(pelna, id), id).toContain('disabled');
      expect(opcja(pelna, id), id).toContain('wieża pełna');
    }
    ustawJezyk('en');
    expect(opcja(nightSheet(card, assign, odds).body, ids[4])).toContain('tower full');
  });
});

describe('wzmacnianie siatki a barykada', () => {
  /** barykada postawiona na kafelku siatki i zbita naporem do 60, plus sterta desek: wzmocnienie byłoby możliwe */
  function uszkodzona() {
    const { st, sim } = gra();
    const [b] = odcinki(st, 'barykada', 1);
    postaw(st, sim, 'barykada', b);
    sim.damageFence(b, 100);
    const k = w.fence.tiles.indexOf(b);
    expect(st.fence!.hp[k]).toBe(60);
    sterta(st, 'deski', w.fence.yard.filter((i) => !w.blocked[i])[8], 10);
    const core = st.pawns.find((p) => p.kind === 'core')!;
    return { st, sim, b, k, core };
  }

  it('menu kafelka z uszkodzoną barykadą nie ma „Wzmocnić”, a zwykłego uszkodzonego kafelka ma', () => {
    const { st, b, core } = uszkodzona();
    const brace = (tile: number) => commandsAt(st, w, [core.id], tile).some((m) => m.cmd.t === 'brace');
    expect(brace(b)).toBe(false);
    // kontrola: ten sam materiał i uszkodzony zwykły kafelek siatki dostają „Wzmocnić”
    const [zwykly] = odcinki(st, 'zasieki', 2).filter((t) => t !== b);
    st.fence!.hp[w.fence.tiles.indexOf(zwykly)] = 60;
    expect(brace(zwykly)).toBe(true);
    const m = commandsAt(st, w, [core.id], zwykly).find((x) => x.cmd.t === 'brace')!;
    expect(m.label).toBe('Wzmocnić siatkę');
  });

  it('polecenie brace na barykadzie nic nie robi: wytrzymałość i praca zostają, sterta nie jest zajęta', () => {
    const { st, sim, b, k, core } = uszkodzona();
    // samo przyjęcie rozkazu odmawia od razu (nie bierze sterty ani nie rusza w drogę)
    (sim as unknown as { orderBrace(p: Pawn[], tile: number): void }).orderBrace([core], b);
    expect(core.job).toBeNull();
    expect(st.things.every((t) => t.by !== core.id)).toBe(true);
    sim.push({ t: 'brace', ids: [core.id], tile: b });
    for (let n = 0; n < 6 * 800; n++) sim.step();
    expect(st.fence!.hp[k]).toBe(60);
    expect(core.job?.t).not.toBe('brace');
  });

  it('wzmacnianie w toku kończy się, gdy na kafelku stanie barykada, i nie rusza jej wytrzymałości', () => {
    const { st, sim } = gra();
    const [t] = odcinki(st, 'barykada', 1);
    const k = w.fence.tiles.indexOf(t);
    st.fence!.hp[k] = 60;
    sterta(st, 'deski', w.fence.yard.filter((i) => !w.blocked[i])[8], 10);
    const core = st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'brace', ids: [core.id], tile: t });
    sim.step();
    expect(core.job?.t).toBe('brace');
    // barykada staje na kafelku w trakcie (z wytrzymałością 60 po naporze)
    const f = footprint('barykada', 0);
    st.things.push({
      id: st.nextThing++,
      kind: 'barykada',
      x: t % size,
      y: Math.floor(t / size),
      w: f.w,
      h: f.h,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    for (let n = 0; n < 6 * 800; n++) sim.step();
    expect(st.fence!.hp[k]).toBe(60);
    expect(core.job?.t).not.toBe('brace');
  });

  it('zwykłe wzmocnienie dalej działa: uszkodzony kafelek bez barykady wraca najwyżej do 100', () => {
    const { st, sim } = gra();
    const [t] = odcinki(st, 'zasieki', 1);
    const k = w.fence.tiles.indexOf(t);
    st.fence!.hp[k] = 60;
    sterta(st, 'deski', w.fence.yard.filter((i) => !w.blocked[i])[8], 10);
    const core = st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'brace', ids: [core.id], tile: t });
    for (let n = 0; n < 6 * 800 && st.fence!.hp[k] === 60; n++) sim.step();
    expect(st.fence!.hp[k]).toBe(100);
  });
});
