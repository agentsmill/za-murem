/* Mgła nad nieodkrytymi kwadratami (miasto z kwadratów, etap 1, zadanie 6): które kwadraty leżą pod mgłą (polaMgly,
   czysta funkcja). Rysowanie mgły (Graphics i Text z PixiJS) sprawdzają zrzuty. */

import { describe, expect, it } from 'vitest';
import { polaMgly } from '../../src/render/mglaLayer.ts';

const zbior = (...k: string[]) => new Set(k);
const dziewiec = () => {
  const out = new Set<string>();
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) out.add(`${x},${y}`);
  return out;
};

describe('mgła: kwadraty pod nią', () => {
  it('sam dom: osiem sąsiadów, wierszami od północy, bez „braku danych”', () => {
    const p = polaMgly(zbior('0,0'), zbior());
    expect(p.map((x) => `${x.sx},${x.sy}`)).toEqual(['-1,-1', '0,-1', '1,-1', '-1,0', '1,0', '-1,1', '0,1', '1,1']);
    expect(p.some((x) => x.brakDanych)).toBe(false);
  });

  it('trzy na trzy odkryte: pierścień szesnastu kwadratów wokół, odkryte bez mgły', () => {
    const p = polaMgly(dziewiec(), zbior());
    expect(p).toHaveLength(16);
    for (const x of p) expect(Math.max(Math.abs(x.sx), Math.abs(x.sy))).toBe(2);
  });

  it('kwadrat, o który poproszono bez danych, jest pod mgłą z napisem, a jego sąsiedzi też', () => {
    const p = polaMgly(zbior('0,0'), zbior('1,0'));
    // prostokąt 4 × 3 (kolumny −1…2, wiersze −1…1) bez domu
    expect(p).toHaveLength(11);
    expect(p.filter((x) => x.brakDanych)).toEqual([{ sx: 1, sy: 0, brakDanych: true }]);
    expect(p.find((x) => x.sx === 2 && x.sy === 0)?.brakDanych).toBe(false);
  });

  it('kwadrat odkryty nie może być jednocześnie pod mgłą, nawet jeśli o niego poproszono', () => {
    const p = polaMgly(zbior('0,0', '1,0'), zbior('1,0'));
    expect(p.some((x) => x.sx === 1 && x.sy === 0)).toBe(false);
  });

  it('bez odkrytych kwadratów i bez próśb nie ma mgły', () => {
    expect(polaMgly(zbior(), zbior())).toEqual([]);
  });
});
