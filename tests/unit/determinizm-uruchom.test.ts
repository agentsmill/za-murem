import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { przebieg } from '../../tools/determinizm/przebieg.ts';
import { uruchom } from '../../tools/determinizm/uruchom.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/zielonki.json'), 'utf8'));
const dane = { geo: demo.geo, street: demo.street as string };

describe('wspólne wejście nóg silników', () => {
  it('powtarza przebieg w tym samym procesie i liczy czas podanym zegarem', () => {
    let t = 0;
    const r = uruchom({ demo: 'zielonki', godziny: 3, tryb: 'zwykly', seed: 9, powtorz: 3 }, dane, () => (t += 10));
    expect(r.biegi).toHaveLength(3);
    for (const b of r.biegi) {
      expect(b.skroty).toHaveLength(3);
      expect(b.skroty).toEqual(r.biegi[0].skroty);
      expect(b.ms).toBe(10);
    }
    expect(r.biegi[0].skroty).toEqual(przebieg({ ...dane, seed: 9, godziny: 3, tryb: 'zwykly' }));
  });
});
