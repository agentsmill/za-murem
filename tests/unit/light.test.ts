import { describe, expect, it } from 'vitest';
import {
  ambientOf,
  darknessAt,
  flickerOf,
  gridFor,
  type Light,
  lightCell,
  renderLightMap,
} from '../../src/render/light.ts';

const H = 60;
const lamp = (x: number, y: number, over: Partial<Light> = {}): Light => ({
  x,
  y,
  r: 4,
  color: 0xffc070,
  strength: 1,
  flicker: 0,
  ...over,
});

/** mapa światła dla prostokąta 16×16 m przy zoomie 1: mnożnik, poświata i odczyty w metrach */
function map(lights: Light[], d = 1, time = 0) {
  const g = gridFor(0, 0, 16 * 32, 16 * 32, 1);
  const mul = new Uint8Array(g.w * g.h * 4);
  const glow = new Uint8Array(g.w * g.h * 4);
  renderLightMap(mul, glow, g.w, new Float32Array(g.w * g.h * 6), g, d, lights, time);
  const idx = (x: number, y: number) =>
    ((Math.floor((y * 32) / g.cell) - g.gy) * g.w + Math.floor((x * 32) / g.cell) - g.gx) * 4;
  /** jasność mnożnika w komórce pod punktem (x, y): suma kanałów */
  const at = (x: number, y: number) => {
    const o = idx(x, y);
    return mul[o] + mul[o + 1] + mul[o + 2];
  };
  const glowAt = (x: number, y: number) => {
    const o = idx(x, y);
    return [glow[o], glow[o + 1], glow[o + 2]];
  };
  /** średnia jasność metra kwadratowego od (x, y): wszystkie komórki, czyli pełne okresy ditheringu */
  const block = (x: number, y: number) => {
    const n = 32 / g.cell;
    let s = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s += at(x + (i + 0.5) / n, y + (j + 0.5) / n);
    return s / (n * n);
  };
  return { g, mul, glow, at, glowAt, block };
}

describe('ciemność z godziny', () => {
  it('dzień jasny, noc ciemna, zmierzch i świt łagodne', () => {
    expect(darknessAt(7 * H)).toBe(0);
    expect(darknessAt(12 * H)).toBe(0);
    expect(darknessAt(16.99 * H)).toBe(0);
    expect(darknessAt(22 * H)).toBe(1);
    expect(darknessAt(3 * H)).toBe(1);
    const dusk = [17, 17.5, 18, 18.5, 19, 19.5, 20].map((h) => darknessAt(h * H));
    for (let k = 1; k < dusk.length; k++) expect(dusk[k]).toBeGreaterThan(dusk[k - 1]);
    const dawn = [5, 5.5, 6, 6.5, 7].map((h) => darknessAt(h * H));
    for (let k = 1; k < dawn.length; k++) expect(dawn[k]).toBeLessThan(dawn[k - 1]);
    // kolejna doba liczy się tak samo
    expect(darknessAt((24 + 22) * H)).toBe(1);
  });

  it('otoczenie: biel w dzień, ciemny granat w nocy', () => {
    expect(ambientOf(0)).toEqual([1, 1, 1]);
    const [r, g, b] = ambientOf(1);
    expect(r).toBeLessThan(0.2);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });
});

describe('mapa światła', () => {
  it('komórka ma kilka pikseli ekranu przy każdym zoomie', () => {
    for (const z of [0.07, 0.3, 0.6, 1, 2, 3]) {
      const c = lightCell(z);
      expect(Math.log2(c) % 1).toBe(0);
      expect(c * z).toBeGreaterThanOrEqual(3);
      expect(c * z).toBeLessThanOrEqual(13);
    }
  });

  it('w dzień bez świateł mapa jest biała, czyli obraz się nie zmienia', () => {
    const { mul } = map([], 0);
    expect(mul.every((v) => v === 255)).toBe(true);
  });

  it('w dzień światła nie dają poświaty, nocą ogień świeci ciepło i mocniej w środku', () => {
    expect(map([lamp(8, 8)], 0).glow.every((v) => v === 0)).toBe(true);
    const { glowAt } = map([lamp(8, 8, { color: 0xff8a30 })]);
    const [r, g, b] = glowAt(8.1, 8.1);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(glowAt(10.6, 8.1)[0]);
    expect(glowAt(1, 1)).toEqual([0, 0, 0]);
  });

  it('brzeg światła jest miękki: w zewnętrznym pasie część komórek świeci, część nie', () => {
    const { g, at } = map([lamp(8, 8)]);
    const dark = at(1, 1);
    let lit = 0;
    let all = 0;
    for (let k = 0; k < 200; k++) {
      const a = (k / 200) * Math.PI * 2;
      const x = 8 + Math.cos(a) * 3.75;
      const y = 8 + Math.sin(a) * 3.75;
      all++;
      if (at(x, y) > dark) lit++;
    }
    expect(g.cell).toBe(4);
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(all);
  });

  it('światło rozjaśnia wokół siebie i gaśnie ku brzegowi, poza zasięgiem jest noc', () => {
    const { at, block } = map([lamp(8, 8)]);
    const dark = at(1, 1);
    // bloki 1×1 m coraz dalej od lampy w (8, 8) o zasięgu 4 m
    expect(block(8, 8)).toBeGreaterThan(block(9, 8));
    expect(block(9, 8)).toBeGreaterThan(block(10, 8));
    expect(block(10, 8)).toBeGreaterThan(block(11, 8));
    expect(block(11, 8)).toBeGreaterThan(dark);
    expect(block(12, 8)).toBe(dark);
    // równa ciemność bez szachownicy
    expect(new Set([at(1, 1), at(1.3, 1), at(1, 1.3), at(2, 14)]).size).toBe(1);
  });

  it('światła się sumują, ale nie ponad biel', () => {
    const one = map([lamp(8, 8)]).at(8, 8);
    const two = map([lamp(8, 8), lamp(8, 8, { color: 0x6080ff })]).at(8, 8);
    expect(two).toBeGreaterThan(one);
    expect(map([lamp(8, 8, { strength: 9 })]).at(8, 8)).toBe(765);
  });

  it('siatka przypięta do świata: przesunięcie widoku nie zmienia światła w tym samym miejscu', () => {
    const l = [lamp(8, 8)];
    const a = gridFor(0, 0, 512, 512, 1);
    const b = gridFor(37, 101, 549, 613, 1);
    const draw = (g: typeof a) => {
      const out = new Uint8Array(g.w * g.h * 4);
      renderLightMap(out, null, g.w, new Float32Array(g.w * g.h * 6), g, 1, l, 0);
      return (x: number, y: number) => out[((Math.floor(y / g.cell) - g.gy) * g.w + Math.floor(x / g.cell) - g.gx) * 4];
    };
    const pa = draw(a);
    const pb = draw(b);
    for (const [x, y] of [
      [260, 260],
      [300, 230],
      [330, 300],
      [200, 280],
    ])
      expect(pb(x, y)).toBe(pa(x, y));
  });

  it('migotanie: stałe światło stoi, ognisko zmienia się w czasie w granicach', () => {
    expect(flickerOf(lamp(0, 0), 0, 1.23)).toBe(1);
    const fire = lamp(0, 0, { flicker: 0.4 });
    const vals = Array.from({ length: 40 }, (_, k) => flickerOf(fire, 3, k * 0.05));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(1 - 0.4 * 0.45);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    expect(new Set(vals.map((v) => v.toFixed(3))).size).toBeGreaterThan(5);
  });
});
