/* Ścieżki: A* na siatce 1 m, 8 kierunków, bez ścinania narożników.
   Kopiec binarny na tablicach typowanych, licznik pokoleń zamiast czyszczenia tablic,
   więc jedno wyszukiwanie nie alokuje pamięci. Remisy rozstrzygane deterministycznie. */

const SQ2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class PathFinder {
  readonly size: number;
  private g: Float64Array;
  private parent: Int32Array;
  private seen: Uint32Array;
  private done: Uint32Array;
  private gen = 0;
  private hk: Float64Array;
  private hn: Int32Array;
  private hl = 0;
  /** liczba rozwiniętych węzłów w ostatnim wyszukiwaniu */
  expanded = 0;

  constructor(size: number) {
    const N = size * size;
    this.size = size;
    this.g = new Float64Array(N);
    this.parent = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.done = new Uint32Array(N);
    this.hk = new Float64Array(4096);
    this.hn = new Int32Array(4096);
  }

  private push(k: number, n: number): void {
    if (this.hl === this.hk.length) {
      const hk = new Float64Array(this.hk.length * 2);
      hk.set(this.hk);
      const hn = new Int32Array(this.hn.length * 2);
      hn.set(this.hn);
      this.hk = hk;
      this.hn = hn;
    }
    const hk = this.hk;
    const hn = this.hn;
    let i = this.hl++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] < k || (hk[p] === k && hn[p] <= n)) break;
      hk[i] = hk[p];
      hn[i] = hn[p];
      i = p;
    }
    hk[i] = k;
    hn[i] = n;
  }

  private pop(): number {
    const hk = this.hk;
    const hn = this.hn;
    const top = hn[0];
    const k = hk[--this.hl];
    const n = hn[this.hl];
    const len = this.hl;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= len) break;
      if (c + 1 < len && (hk[c + 1] < hk[c] || (hk[c + 1] === hk[c] && hn[c + 1] < hn[c]))) c++;
      if (k < hk[c] || (k === hk[c] && n <= hn[c])) break;
      hk[i] = hk[c];
      hn[i] = hn[c];
      i = c;
    }
    hk[i] = k;
    hn[i] = n;
    return top;
  }

  /** droga od start do goal: kolejne kafelki bez startu, z celem; [] gdy start = cel; null gdy nie da się dojść */
  find(blocked: Uint8Array, start: number, goal: number, maxNodes = 150_000): number[] | null {
    this.expanded = 0;
    if (start === goal) return [];
    if (blocked[goal]) return null;
    const size = this.size;
    if (++this.gen === 0xffffffff) {
      this.seen.fill(0);
      this.done.fill(0);
      this.gen = 1;
    }
    const gen = this.gen;
    const gx = goal % size;
    const gy = (goal - gx) / size;
    const H = (i: number) => {
      const x = i % size;
      const dx = Math.abs(x - gx);
      const dy = Math.abs((i - x) / size - gy);
      return dx + dy + (SQ2 - 2) * Math.min(dx, dy);
    };
    this.hl = 0;
    this.g[start] = 0;
    this.seen[start] = gen;
    this.parent[start] = -1;
    this.push(H(start), start);
    while (this.hl) {
      const c = this.pop();
      if (this.done[c] === gen) continue;
      this.done[c] = gen;
      if (c === goal) {
        const out: number[] = [];
        for (let k = c; k !== start; k = this.parent[k]) out.push(k);
        return out.reverse();
      }
      if (++this.expanded > maxNodes) return null;
      const cx = c % size;
      const cy = (c - cx) / size;
      const gc = this.g[c];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (blocked[n] || this.done[n] === gen) continue;
        if (d >= 4 && (blocked[cy * size + nx] || blocked[ny * size + cx])) continue;
        const ng = gc + (d >= 4 ? SQ2 : 1);
        if (this.seen[n] === gen && ng >= this.g[n]) continue;
        this.seen[n] = gen;
        this.g[n] = ng;
        this.parent[n] = c;
        // przy równym f wygrywa węzeł bliżej celu
        this.push(ng + H(n) * (1 + 1e-7), n);
      }
    }
    return null;
  }
}

const finders = new Map<number, PathFinder>();
export function findPath(blocked: Uint8Array, size: number, start: number, goal: number): number[] | null {
  let pf = finders.get(size);
  if (!pf) {
    pf = new PathFinder(size);
    finders.set(size, pf);
  }
  return pf.find(blocked, start, goal);
}

/** najbliższy wolny kafelek (BFS w 4 kierunkach); i, jeśli sam jest wolny */
export function nearestFree(blocked: Uint8Array, size: number, i: number): number {
  if (!blocked[i]) return i;
  const seen = new Uint8Array(size * size);
  const q = [i];
  seen[i] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    if (!blocked[c]) return c;
    const x = c % size;
    const y = (c - x) / size;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (!seen[n]) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return i;
}
