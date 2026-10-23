/* Parametr ?kwadraty= (miasto z kwadratów, etap 1, zadanie 7): jak adres zamienia się na listę kwadratów obok domu
   (czytajKwadraty), skąd bierze się ziarno stylu budynku kwadratu (z klucza budynku, nie z numeru w kwadracie) i jak styl
   domu przesuwa się do układu kwadratu. Wczytywanie kwadratów w grze i ich wygląd sprawdzają zrzuty. */

import { describe, expect, it } from 'vitest';
import { h2 } from '../../src/render/art/hash.ts';
import { type BStyle, przesunStyl, ziarnoStyluZKlucza } from '../../src/render/art/scene.ts';
import { czytajKwadraty, MAX_KWADRATOW, sasiedzi8 } from '../../src/world/kwadraty.ts';

describe('czytajKwadraty', () => {
  it('3x3 to ośmiu sąsiadów w stałej kolejności, lista par w podanej kolejności bez domu i bez powtórzeń', () => {
    expect(czytajKwadraty('3x3')).toEqual(sasiedzi8(0, 0));
    expect(czytajKwadraty('1,0;0,-1;1,0;0,0')).toEqual([
      [1, 0],
      [0, -1],
    ]);
  });

  it('błędne albo puste dają pustą listę', () => {
    expect(czytajKwadraty('x')).toEqual([]);
    expect(czytajKwadraty(null)).toEqual([]);
    expect(czytajKwadraty('')).toEqual([]);
    expect(czytajKwadraty('1,0;x')).toEqual([]);
    expect(czytajKwadraty('1,0;')).toEqual([]);
    expect(czytajKwadraty('1.5,0')).toEqual([]);
    expect(czytajKwadraty('1,0,0')).toEqual([]);
    expect(czytajKwadraty('0,0')).toEqual([]);
  });

  it('NxN dla nieparzystego N to pierścienie wokół domu: najpierw ośmiu sąsiadów, potem następny pierścień po zegarze od północy', () => {
    const p5 = czytajKwadraty('5x5');
    expect(p5).toHaveLength(24);
    expect(p5.slice(0, 8)).toEqual(sasiedzi8(0, 0));
    expect(p5.slice(8)).toEqual([
      [0, -2],
      [1, -2],
      [2, -2],
      [2, -1],
      [2, 0],
      [2, 1],
      [2, 2],
      [1, 2],
      [0, 2],
      [-1, 2],
      [-2, 2],
      [-2, 1],
      [-2, 0],
      [-2, -1],
      [-2, -2],
      [-1, -2],
    ]);
    expect(new Set(p5.map((x) => x.join())).size).toBe(24);
    expect(czytajKwadraty('7X7')).toHaveLength(48);
  });

  it('nie przyjmuje sama dom, parzystych, niekwadratowych ani zbyt dużych siatek', () => {
    for (const z of ['1x1', '2x2', '4x4', '3x5', '0x0', '9x9', '3x3x3', '3 x 3'])
      expect(czytajKwadraty(z), z).toEqual([]);
  });

  it('białe znaki przy parach nie przeszkadzają, a kwadraty dalej niż 16 od domu albo ponad limit są błędem', () => {
    expect(czytajKwadraty(' 1,0 ; 0,-1 ')).toEqual([
      [1, 0],
      [0, -1],
    ]);
    expect(czytajKwadraty('16,-16')).toEqual([[16, -16]]);
    expect(czytajKwadraty('17,0')).toEqual([]);
    expect(czytajKwadraty('0,-17')).toEqual([]);
    const duzo = Array.from({ length: MAX_KWADRATOW + 1 }, (_, i) => `${i % 9},${1 + Math.floor(i / 9)}`).join(';');
    expect(czytajKwadraty(duzo)).toEqual([]);
  });
});

describe('ziarno stylu budynku kwadratu', () => {
  it('zależy od ziarna gry i klucza budynku, jest stałe i różne dla różnych kluczy', () => {
    const a = ziarnoStyluZKlucza(7, 'px:1:2:3:4:3');
    expect(ziarnoStyluZKlucza(7, 'px:1:2:3:4:3')).toBe(a);
    expect(ziarnoStyluZKlucza(8, 'px:1:2:3:4:3')).not.toBe(a);
    expect(ziarnoStyluZKlucza(7, 'px:1:2:3:4:1')).not.toBe(a);
    expect(Number.isInteger(a)).toBe(true);
    // wartości z całego zakresu, jak ziarno z h2 (kolory ścian wybiera h2(ziarno, k, 77))
    const kolory = new Set<number>();
    for (let k = 0; k < 40; k++) kolory.add(Math.floor(h2(ziarnoStyluZKlucza(7, `px:${k}:9:1:1:3`), 1, 77) * 6));
    expect(kolory.size).toBeGreaterThan(3);
  });
});

describe('styl domu w układzie kwadratu', () => {
  const styl = (ridge: BStyle['ridge'], ridgeAt: number): BStyle => ({
    kind: 'dom',
    roof: 'tiles',
    wall: 0xffffff,
    facade: 40,
    floorH: 10,
    base: 4,
    levels: 2,
    seed: 5,
    ridge,
    ridgeAt,
    balconies: false,
    accent: 0,
  });

  it('grzbiet poziomy przesuwa się o przesunięcie w pionie, pionowy w poziomie, dach bez grzbietu nic', () => {
    expect(przesunStyl(styl('h', 12000), 20000, 12288)).toEqual(styl('h', 12000 - 12288));
    expect(przesunStyl(styl('v', 12000), 12288, 5)).toEqual(styl('v', 12000 - 12288));
    expect(przesunStyl(styl(null, 0), 12288, 12288)).toEqual(styl(null, 0));
  });

  it('nie zmienia oryginału', () => {
    const o = styl('h', 100);
    przesunStyl(o, 0, 50);
    expect(o.ridgeAt).toBe(100);
  });
});
