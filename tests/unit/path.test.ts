import { describe, expect, it } from 'vitest';
import { findPath, nearestFree, PathFinder } from '../../src/sim/path.ts';

/** siatka z napisu: '#' zajęte, '.' wolne, S start, G cel */
function grid(rows: string[]) {
  const size = rows.length;
  const blocked = new Uint8Array(size * size);
  let s = -1;
  let g = -1;
  rows.forEach((r, y) => {
    [...r].forEach((ch, x) => {
      const i = y * size + x;
      if (ch === '#') blocked[i] = 1;
      if (ch === 'S') s = i;
      if (ch === 'G') g = i;
    });
  });
  return { size, blocked, s, g };
}

const cost = (path: number[], size: number, start: number) => {
  let c = 0;
  let prev = start;
  for (const p of path) {
    const dx = Math.abs((p % size) - (prev % size));
    const dy = Math.abs(Math.floor(p / size) - Math.floor(prev / size));
    expect(Math.max(dx, dy)).toBe(1);
    c += dx && dy ? Math.SQRT2 : 1;
    prev = p;
  }
  return c;
};

describe('A* na siatce 1 m', () => {
  it('prosta droga po przekątnej', () => {
    const g = grid(['S....', '.....', '.....', '.....', '....G']);
    const p = findPath(g.blocked, g.size, g.s, g.g)!;
    expect(p.at(-1)).toBe(g.g);
    expect(cost(p, g.size, g.s)).toBeCloseTo(4 * Math.SQRT2, 5);
  });

  it('omija ścianę najkrótszą drogą', () => {
    const g = grid(['S..#...', '...#...', '...#...', '...#...', '.......', '...#..G', '...#...']);
    const p = findPath(g.blocked, g.size, g.s, g.g)!;
    expect(p).not.toBeNull();
    for (const i of p) expect(g.blocked[i]).toBe(0);
    // optimum: do (2,4), prosto przez szczelinę (3,4)→(4,4), bez ścinania narożników ściany
    expect(cost(p, g.size, g.s)).toBeCloseTo(5 + 3 * Math.SQRT2, 5);
  });

  it('nie ścina narożników ścian', () => {
    const g = grid(['S#', '#G']);
    expect(findPath(g.blocked, g.size, g.s, g.g)).toBeNull();
  });

  it('brak drogi zwraca null', () => {
    const g = grid(['S.#..', '..#..', '###..', '.....', '....G']);
    expect(findPath(g.blocked, g.size, g.s, g.g)).toBeNull();
  });

  it('start równy celowi daje pustą drogę', () => {
    const g = grid(['S...', '....', '....', '....']);
    expect(findPath(g.blocked, g.size, g.s, g.s)).toEqual([]);
  });

  it('wielokrotne wyszukiwania na tej samej instancji dają te same wyniki', () => {
    const g = grid(['S..#....', '...#.#..', '.....#..', '####.#..', '.....#..', '.###....', '.......G', '........']);
    const pf = new PathFinder(g.size);
    const a = pf.find(g.blocked, g.s, g.g);
    for (let k = 0; k < 5; k++) expect(pf.find(g.blocked, g.s, g.g)).toEqual(a);
  });

  it('najbliższy wolny kafelek', () => {
    const g = grid(['....', '.##.', '.##.', '....']);
    const i = nearestFree(g.blocked, g.size, 1 * 4 + 1);
    expect(g.blocked[i]).toBe(0);
    expect([0, 1, 4, 2, 8]).toContain(i);
  });

  it('duża siatka 384×384 z przeszkodami: szybko i poprawnie', () => {
    const size = 384;
    const blocked = new Uint8Array(size * size);
    // bloki 60×12 w regularnym układzie
    for (let by = 20; by < size - 20; by += 40)
      for (let bx = 20; bx < size - 80; bx += 90)
        for (let y = by; y < by + 12; y++) for (let x = bx; x < bx + 60; x++) blocked[y * size + x] = 1;
    const pf = new PathFinder(size);
    const t0 = performance.now();
    let n = 0;
    for (let k = 0; k < 50; k++) {
      const s = nearestFree(blocked, size, ((k * 37) % size) * size + ((k * 91) % size));
      const g = nearestFree(blocked, size, ((k * 113 + 200) % size) * size + ((k * 59 + 150) % size));
      const p = pf.find(blocked, s, g);
      if (p) {
        n++;
        for (const i of p) expect(blocked[i]).toBe(0);
      }
    }
    const ms = (performance.now() - t0) / 50;
    expect(n).toBe(50);
    expect(ms).toBeLessThan(15);
  });
});
