/* Atrapa stanów mieszkań i zawartości pustych (World.apts, World.damage, sterty śmieci, zepsute meble) w kształcie
   kontraktu z docs/M2-fala-1.md, na dowolnym świecie z wnętrzem siedziby. Uproszczone reguły generatora świata
   (gałąź m2-mieszkania-swiat): z mieszkań poza zarządem mniej więcej połowa pusta, przy podwórku dokładnie jedno
   puste (gdy są co najmniej dwa), powód z wagami, zawartość według powodu. Dla bota i testów, dopóki świat tych pól
   nie daje; świat, który ma World.apts, zostaje bez zmian. */

import { nextRandom } from '../../src/core/rng.ts';
import { createSim } from '../../src/sim/sim.ts';
import type { AptState, AptWhy, Damage, DamageKind } from '../../src/world/apts.ts';
import type { World } from '../../src/world/world.ts';

/** powód: waga i lata opuszczenia */
const WHY: [AptWhy, number, number, number][] = [
  ['wyjazd', 30, 2029, 2038],
  ['wymarcie', 25, 2035, 2050],
  ['splądrowanie', 20, 2036, 2051],
  ['zalanie', 15, 2034, 2051],
  ['pozar', 10, 2033, 2051],
];

/** zawartość według powodu: szansa zepsucia mebla, liczba stert i ich wielkość (od, do) */
const CONTENT: Record<AptWhy, { broken: number; heaps: [number, number]; n: [number, number] }> = {
  wyjazd: { broken: 0, heaps: [1, 2], n: [1, 1] },
  wymarcie: { broken: 0.1, heaps: [1, 2], n: [1, 2] },
  splądrowanie: { broken: 0.5, heaps: [2, 4], n: [1, 3] },
  zalanie: { broken: 0.7, heaps: [1, 2], n: [1, 2] },
  pozar: { broken: 0.5, heaps: [2, 3], n: [2, 3] },
};

export function withApts(w: World, seed: number): World {
  if ((w as { apts?: unknown }).apts) return w;
  const h = w.interior;
  const size = w.size;
  const N = size * size;
  const aptOf = (i: number) => (i >= 0 && i < N && h.room[i] >= 0 ? h.rooms[h.room[i]].apt : -1);
  const near4 = (i: number) => [i % size > 0 ? i - 1 : -1, i % size < size - 1 ? i + 1 : -1, i - size, i + size];
  const gen = (s: number) => {
    const st = { s: s >>> 0 };
    const r = () => nextRandom(st);
    return { r, int: (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1)) };
  };
  const { r } = gen(Math.imul(seed | 0, 2654435761) ^ 0x2f6b);
  const nums = [...new Set(h.rooms.map((x) => x.apt).filter((a) => a >= 0))].sort((a, b) => a - b);
  const others = nums.filter((a) => a !== h.home);
  // przy podwórku: mieszkania, w których symulacja bez stanów osadza mieszkańców
  const yard = [
    ...new Set(
      createSim(w, seed)
        .pawns.filter((p) => p.kind === 'resident')
        .map((p) => p.apt),
    ),
  ];
  const nEmpty = r() < 0.5 ? Math.floor(others.length / 2) : Math.ceil(others.length / 2);
  const rest = others.filter((a) => !yard.includes(a));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const empty = new Set<number>();
  const atYard = others.filter((a) => yard.includes(a));
  if (atYard.length >= 2) empty.add(atYard[Math.floor(r() * atYard.length)]);
  for (const a of rest) if (empty.size < nEmpty) empty.add(a);

  const apts: AptState[] = nums.map((apt) => {
    const state = apt === h.home ? 'zarzad' : empty.has(apt) ? 'puste' : 'mieszkancy';
    const out: AptState = { bid: h.building, apt, state };
    if (state !== 'puste') return out;
    const a = gen(Math.imul(seed | 0, 31) ^ Math.imul(apt + 1, 7919));
    let roll = a.r() * 100;
    const [why, , lo, hi] = WHY.find(([, wgt]) => (roll -= wgt) < 0) ?? WHY[0];
    out.why = why;
    out.year = a.int(lo, hi);
    return out;
  });

  const furniture = h.furniture.map((f) => ({ ...f }));
  const covered = new Set<number>();
  for (const f of furniture)
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) covered.add(y * size + x);
  const props = [...w.props] as unknown[];
  const damage: Damage[] = [];
  for (const s of apts) {
    if (s.state !== 'puste' || !s.why) continue;
    const c = CONTENT[s.why];
    const a = gen(Math.imul(seed | 0, 977) ^ Math.imul(s.apt + 1, 104729));
    const tiles: number[] = [];
    for (let i = 0; i < N; i++) if (aptOf(i) === s.apt && !w.blocked[i]) tiles.push(i);
    for (const f of furniture)
      if (aptOf(f.y * size + f.x) === s.apt && a.r() < c.broken) (f as { broken?: true }).broken = true;
    // śmieci na wolnej posadzce, nie w progu
    const floor = tiles.filter((i) => !covered.has(i) && !near4(i).some((n) => h.doors.includes(n)));
    const heaps = a.int(...c.heaps);
    for (let k = 0; k < heaps && floor.length; k++) {
      const i = floor.splice(Math.floor(a.r() * floor.length), 1)[0];
      props.push({ kind: 'smieci', x: i % size, y: Math.floor(i / size), w: 1, h: 1, n: a.int(...c.n) });
    }
    const add = (kind: DamageKind, tile: number | undefined) => {
      if (tile !== undefined && tile >= 0 && !damage.some((d) => d.tile === tile))
        damage.push({ kind, tile, bid: h.building, apt: s.apt });
    };
    const pick = (list: number[]) => (list.length ? list[Math.floor(a.r() * list.length)] : undefined);
    const window = () => pick(h.windows.filter((i) => near4(i).some((n) => aptOf(n) === s.apt)));
    const door = () =>
      pick(
        h.doors.filter(
          (i) => near4(i).some((n) => aptOf(n) === s.apt) && near4(i).some((n) => n >= 0 && aptOf(n) !== s.apt),
        ),
      );
    const kindTiles = (kind: string) => tiles.filter((i) => h.rooms[h.room[i]].kind === kind);
    const pipe = () => {
      const wet = kindTiles('lazienka').length ? kindTiles('lazienka') : kindTiles('kuchnia');
      return pick(wet.filter((i) => !covered.has(i) && near4(i).some((n) => n >= 0 && w.blocked[n])));
    };
    const plank = () => pick(tiles.filter((i) => !covered.has(i) && !damage.some((d) => d.tile === i)));
    const stove = () => {
      const f = furniture.find((q) => q.kind === 'kuchenka' && aptOf(q.y * size + q.x) === s.apt);
      return f ? f.y * size + f.x : undefined;
    };
    if (s.why === 'wyjazd' && a.r() < 0.3) add('okno', window());
    if (s.why === 'wymarcie' && a.r() < 0.4) add('rura', pipe());
    if (s.why === 'splądrowanie') {
      add('drzwi', door());
      if (a.r() < 0.4) add('okno', window());
    }
    if (s.why === 'zalanie') {
      add('rura', pipe());
      for (let k = a.int(1, 2); k > 0; k--) add('podloga', plank());
    }
    if (s.why === 'pozar') {
      add('okno', window());
      if (a.r() < 0.5) add('piec', stove());
      if (a.r() < 0.6) add('podloga', plank());
    }
    // każde puste ma coś do odzyskania albo naprawienia
    if (!heaps && !damage.some((d) => d.apt === s.apt)) add('podloga', plank());
  }
  return { ...w, apts, damage, props, interior: { ...h, furniture } } as World;
}
