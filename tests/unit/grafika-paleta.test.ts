import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dociagnijDoPalety } from '../../tools/paleta.ts';
import { decodePng } from '../../tools/png.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const json = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
const png = (rel: string) => decodePng(fs.readFileSync(path.join(ROOT, rel)));

const KIERUNKI = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
const { zarzad, mieszkancy } = json<{ zarzad: string[]; mieszkancy: string[] }>('assets/manifest.json');
const { kolory } = json<{ kolory: string[] }>('assets/palette.json');

describe('dociąganie do palety gry (tools/paleta.ts)', () => {
  it('daje te same piksele co reduce_colors PixelLab dla 24 postaci w 8 kierunkach (assets/raw/*/paleta)', () => {
    let obrazow = 0;
    let pikseli = 0;
    for (const id of [...zarzad, ...mieszkancy])
      for (const d of KIERUNKI) {
        const z = png(`assets/raw/${id}/Idle/rotations/${d}.png`);
        const oczekiwane = png(`assets/raw/${id}/paleta/${d}.png`);
        const wynik = dociagnijDoPalety(z.rgba, kolory);
        // piksel liczy się jako inny, gdy inna jest jego alfa albo (dla widocznych) kolor; kolor przezroczystych jest bez znaczenia
        let rozne = 0;
        for (let i = 0; i < wynik.length; i += 4) {
          const a = wynik[i + 3];
          if (a !== oczekiwane.rgba[i + 3] || (a && [0, 1, 2].some((k) => wynik[i + k] !== oczekiwane.rgba[i + k])))
            rozne++;
        }
        expect(rozne, `${id} ${d}`).toBe(0);
        obrazow++;
        pikseli += z.width * z.height;
      }
    expect(obrazow).toBe(192);
    expect(pikseli).toBeGreaterThan(300_000);
  });

  it('przezroczyste piksele zostają bez zmian, a każdy widoczny ma kolor z palety', () => {
    const wejscie = new Uint8Array([10, 200, 30, 0, 12, 34, 56, 255, 240, 10, 10, 255]);
    const w = dociagnijDoPalety(wejscie, kolory);
    expect([...w.subarray(0, 4)]).toEqual([10, 200, 30, 0]);
    const hex = (i: number) => `#${[...w.subarray(i, i + 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    expect(kolory).toContain(hex(4));
    expect(kolory).toContain(hex(8));
  });

  it('nie zmienia wejścia i daje ten sam wynik za drugim razem', () => {
    const z = png('assets/raw/kotwica-emeryt/Idle/rotations/south.png');
    const kopia = Uint8Array.from(z.rgba);
    const a = dociagnijDoPalety(z.rgba, kolory);
    expect(Buffer.from(z.rgba).equals(Buffer.from(kopia))).toBe(true);
    expect(Buffer.from(dociagnijDoPalety(z.rgba, kolory)).equals(Buffer.from(a))).toBe(true);
  });
});
