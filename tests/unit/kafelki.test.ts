/* Numery globalne kafelków, budynków i drzew przy wielu kwadratach (src/sim/kafelki.ts, miasto z kwadratów, etap 2,
   zadanie 1). Oczekiwane numery są policzone ręcznie z umowy, nie kodem modułu: g = k·147 456 + ly·384 + lx, gdzie
   k to miejsce kwadratu na liście (dom 0), a (lx, ly) to położenie w kwadracie (sx, sy), który zajmuje kafelki
   globalne od sx·384 do sx·384 + 383. */

import { describe, expect, it } from 'vitest';
import {
  BOK,
  bGlob,
  bKw,
  bLok,
  gid,
  gxy,
  kluczKw,
  kwNumeru,
  lokalnyNumer,
  mapaDomu,
  mapaZListy,
  N_KW,
  numerGlobalny,
  sasiadKafelka,
} from '../../src/sim/kafelki.ts';

describe('numery globalne kafelków', () => {
  it('dla samego domu numer globalny to dzisiejszy numer', () => {
    const m = mapaDomu();
    for (const [x, y] of [
      [0, 0],
      [383, 0],
      [17, 200],
      [383, 383],
    ]) {
      expect(gid(m, x, y)).toBe(y * 384 + x);
      expect(gxy(m, y * 384 + x)).toEqual([x, y]);
    }
    expect(gid(m, 384, 0)).toBe(-1);
    expect(gid(m, -1, 5)).toBe(-1);
  });

  it('sąsiad przez granicę i ujemne współrzędne', () => {
    const m = mapaZListy([
      { sx: 1, sy: 0 },
      { sx: -1, sy: 0 },
    ]);
    const brzeg = gid(m, 383, 10);
    expect(gxy(m, sasiadKafelka(m, brzeg, 1, 0))).toEqual([384, 10]);
    expect(kwNumeru(sasiadKafelka(m, brzeg, 1, 0))).toBe(1);
    expect(gxy(m, gid(m, -1, 10))).toEqual([-1, 10]);
    expect(kwNumeru(gid(m, -1, 10))).toBe(2);
    expect(sasiadKafelka(m, gid(m, 0, 0), 0, -1)).toBe(-1);
  });

  it('kwadrat z listy na miejscu k dostaje numery od k·147 456, rzędami jak dom', () => {
    const m = mapaZListy([
      { sx: 1, sy: 0 }, // k = 1
      { sx: -1, sy: 0 }, // k = 2
    ]);
    expect(gid(m, 384, 0)).toBe(147456);
    expect(gid(m, 767, 383)).toBe(294911);
    expect(gid(m, -384, 0)).toBe(294912);
    expect(gid(m, -1, 383)).toBe(442367);
    expect(gid(m, -1, 10)).toBe(299135); // 2·147 456 + 10·384 + 383
    expect(gxy(m, 299135)).toEqual([-1, 10]);
    expect(gxy(m, 147456)).toEqual([384, 0]);
  });

  it('kwadraty po przekątnej mają własne numery', () => {
    const m = mapaZListy([
      { sx: 1, sy: 1 }, // k = 1
      { sx: -1, sy: -1 }, // k = 2
      { sx: 1, sy: -1 }, // k = 3
      { sx: -1, sy: 1 }, // k = 4
    ]);
    expect(gid(m, 384, 384)).toBe(147456);
    expect(gid(m, 767, 767)).toBe(294911);
    expect(gid(m, -384, -384)).toBe(294912);
    expect(gid(m, -1, -1)).toBe(442367);
    expect(gid(m, 384, -1)).toBe(589440); // 3·147 456 + 383·384
    expect(gid(m, -1, 384)).toBe(590207); // 4·147 456 + 383
    for (const [x, y] of [
      [384, 384],
      [767, 767],
      [-384, -384],
      [-1, -1],
      [384, -1],
      [-1, 384],
    ]) {
      expect(gxy(m, gid(m, x, y))).toEqual([x, y]);
    }
    // boki domu nie są odkryte, więc kafelki przy domu z boku też dają -1
    expect(gid(m, 384, 0)).toBe(-1);
    expect(gid(m, 0, 384)).toBe(-1);
    expect(gid(m, -1, 0)).toBe(-1);
    expect(gid(m, 0, -1)).toBe(-1);
  });

  it('dalekie współrzędne ujemne i dodatnie liczą się z podłogi, a nie z obcięcia', () => {
    const m = mapaZListy([
      { sx: -16, sy: -16 }, // k = 1, kafelki od -6144 do -5761
      { sx: 16, sy: 16 }, // k = 2, kafelki od 6144 do 6527
    ]);
    expect(gid(m, -6144, -6144)).toBe(147456);
    expect(gid(m, -5761, -5761)).toBe(294911);
    expect(gid(m, 6144, 6144)).toBe(294912);
    expect(gid(m, 6527, 6527)).toBe(442367);
    expect(gxy(m, 294911)).toEqual([-5761, -5761]);
    expect(gxy(m, 294912)).toEqual([6144, 6144]);
    // tuż za brzegiem odkrytych kwadratów
    expect(gid(m, -6145, -6144)).toBe(-1);
    expect(gid(m, -6144, -6145)).toBe(-1);
    expect(gid(m, -5760, -5760)).toBe(-1);
    expect(gid(m, 6528, 6144)).toBe(-1);
    expect(gid(m, 6144, 6528)).toBe(-1);
  });

  it('kafelek -385 leży w kwadracie (-2, 0), a nie w (-1, 0)', () => {
    const m = mapaZListy([{ sx: -2, sy: 0 }]);
    expect(gid(m, -385, 0)).toBe(147839); // 147 456 + 383
    expect(gid(m, -768, 0)).toBe(147456);
    expect(gid(m, -384, 0)).toBe(-1); // to już kwadrat (-1, 0), którego nie odkryto
  });

  it('kwadrat bardzo daleko od domu liczy się tak samo jak sąsiedni', () => {
    const m = mapaZListy([{ sx: -1000, sy: 1000 }]);
    expect(gid(m, -383995, 384007)).toBe(150149); // 147 456 + 7·384 + 5
    expect(gxy(m, 150149)).toEqual([-383995, 384007]);
  });

  it('poza odkrytymi kwadratami nie ma numeru', () => {
    const m = mapaZListy([{ sx: 1, sy: 0 }]);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [-1, -1],
      [0, 384],
      [384, 384],
      [767, 384],
      [384, -1],
      [768, 0],
    ]) {
      expect(gid(m, x, y)).toBe(-1);
    }
  });

  it('numer globalny rozkłada się na numer kwadratu i numer w kwadracie', () => {
    const tabela: [number, number, number][] = [
      // g, k, i
      [0, 0, 0],
      [147455, 0, 147455],
      [147456, 1, 0],
      [442385, 3, 17], // 3·147 456 + 17
      [2147401727, 14562, 147455],
    ];
    for (const [g, k, i] of tabela) {
      expect(kwNumeru(g)).toBe(k);
      expect(lokalnyNumer(g)).toBe(i);
      expect(numerGlobalny(k, i)).toBe(g);
    }
  });

  it('brak (-1) zostaje brakiem w numerach kafelków', () => {
    expect(kwNumeru(-1)).toBe(-1);
    expect(lokalnyNumer(-1)).toBe(-1);
    expect(numerGlobalny(0, -1)).toBe(-1);
    expect(numerGlobalny(5, -1)).toBe(-1); // na przykład nearestFree bez wyniku w kwadracie 5
    expect(numerGlobalny(-1, 5)).toBe(-1);
    expect(sasiadKafelka(mapaDomu(), -1, 1, 0)).toBe(-1);
  });

  it('gxy odmawia numeru spoza odkrytych kwadratów', () => {
    const m = mapaZListy([{ sx: 1, sy: 0 }]);
    expect(() => gxy(m, 294912)).toThrow(RangeError); // k = 2, którego nie ma
    expect(() => gxy(m, -1)).toThrow(RangeError);
    expect(() => gxy(m, Number.NaN)).toThrow(RangeError);
  });

  it('każdy kafelek odkrytych kwadratów ma własny numer, bez dziur i powtórzeń', () => {
    const m = mapaZListy([
      { sx: 1, sy: 0 },
      { sx: -1, sy: -1 },
      { sx: 0, sy: 2 },
    ]);
    const razy = new Uint8Array(4 * N_KW);
    let niezgodne = 0;
    let poza = 0;
    for (const { sx, sy } of m.lista) {
      for (let ly = 0; ly < BOK; ly++) {
        for (let lx = 0; lx < BOK; lx++) {
          const gx = sx * BOK + lx;
          const gy = sy * BOK + ly;
          const g = gid(m, gx, gy);
          if (g < 0 || g >= 4 * N_KW) {
            poza++;
            continue;
          }
          razy[g]++;
          const [x, y] = gxy(m, g);
          if (x !== gx || y !== gy) niezgodne++;
        }
      }
    }
    expect(poza).toBe(0);
    expect(niezgodne).toBe(0);
    expect(razy.every((n) => n === 1)).toBe(true);
  });
});

describe('sasiadKafelka', () => {
  it('w obrębie kwadratu to zwykłe przesunięcie o dy·384 + dx', () => {
    const m = mapaZListy([{ sx: 1, sy: 0 }]);
    for (const [x, y] of [
      [10, 10], // dom
      [384 + 10, 10], // kwadrat (1, 0)
      [1, 1], // tuż przy brzegu, ale jeszcze w środku
      [382, 382],
    ]) {
      const g = gid(m, x, y);
      expect(sasiadKafelka(m, g, 1, 0)).toBe(g + 1);
      expect(sasiadKafelka(m, g, 0, 1)).toBe(g + 384);
      expect(sasiadKafelka(m, g, -1, -1)).toBe(g - 385);
      expect(sasiadKafelka(m, g, 1, 1)).toBe(g + 385);
    }
  });

  it('przez granicę w obie strony, a za ostatnim odkrytym kwadratem daje -1', () => {
    const m = mapaZListy([{ sx: 1, sy: 0 }]);
    // koniec rzędu w domu to początek rzędu w kwadracie (1, 0), a nie początek następnego rzędu domu
    expect(sasiadKafelka(m, gid(m, 383, 10), 1, 0)).toBe(147456 + 10 * 384);
    expect(sasiadKafelka(m, gid(m, 384, 10), -1, 0)).toBe(10 * 384 + 383);
    expect(sasiadKafelka(m, gid(m, 767, 10), 1, 0)).toBe(-1);
    expect(sasiadKafelka(m, gid(m, 383, 383), 0, 1)).toBe(-1);
    expect(sasiadKafelka(m, gid(m, 0, 0), -1, 0)).toBe(-1);
  });

  it('przez róg idzie po przekątnej, także gdy boki nie są odkryte', () => {
    const przekatne = mapaZListy([
      { sx: 1, sy: 1 },
      { sx: -1, sy: -1 },
      { sx: 1, sy: -1 },
      { sx: -1, sy: 1 },
    ]);
    expect(sasiadKafelka(przekatne, gid(przekatne, 383, 383), 1, 1)).toBe(147456);
    expect(sasiadKafelka(przekatne, gid(przekatne, 0, 0), -1, -1)).toBe(442367);
    expect(sasiadKafelka(przekatne, gid(przekatne, 383, 0), 1, -1)).toBe(589440);
    expect(sasiadKafelka(przekatne, gid(przekatne, 0, 383), -1, 1)).toBe(590207);
    expect(sasiadKafelka(przekatne, gid(przekatne, 384, 384), -1, -1)).toBe(147455);
    // sam krok w bok z rogu domu nie ma dokąd iść
    expect(sasiadKafelka(przekatne, gid(przekatne, 383, 383), 1, 0)).toBe(-1);
    expect(sasiadKafelka(przekatne, gid(przekatne, 383, 383), 0, 1)).toBe(-1);

    // odkryte oba boki, ale nie przekątna: róg domu nie przechodzi bokiem do sąsiada sąsiada
    const boki = mapaZListy([
      { sx: 1, sy: 0 },
      { sx: 0, sy: 1 },
    ]);
    expect(sasiadKafelka(boki, gid(boki, 383, 383), 1, 1)).toBe(-1);
  });

  it('zgadza się z liczeniem przez współrzędne globalne na brzegach i w środku dziewięciu kwadratów', () => {
    const dodane = [];
    for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) if (sx !== 0 || sy !== 0) dodane.push({ sx, sy });
    const m = mapaZListy(dodane);
    const polozenia = [0, 1, 100, 382, 383];
    let sprawdzone = 0;
    let brakDomu = 0;
    for (const { sx, sy } of m.lista) {
      for (let ly = 0; ly < BOK; ly++) {
        for (let lx = 0; lx < BOK; lx++) {
          const brzeg = lx === 0 || lx === BOK - 1 || ly === 0 || ly === BOK - 1;
          if (!brzeg && !(polozenia.includes(lx) && polozenia.includes(ly))) continue;
          const gx = sx * BOK + lx;
          const gy = sy * BOK + ly;
          const g = gid(m, gx, gy);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const jest = sasiadKafelka(m, g, dx, dy);
              expect(jest).toBe(gid(m, gx + dx, gy + dy));
              sprawdzone++;
              if (sx === 0 && sy === 0 && jest < 0) brakDomu++;
            }
          }
        }
      }
    }
    expect(sprawdzone).toBeGreaterThan(100000);
    // wszystkie osiem kwadratów wokół domu jest odkrytych, więc z domu nigdzie nie wypada się w nicość
    expect(brakDomu).toBe(0);
  });

  it('odmawia numeru z kwadratu, którego nie odkryto', () => {
    expect(() => sasiadKafelka(mapaDomu(), 147456 + 5, 1, 0)).toThrow(RangeError);
  });
});

describe('mapa kwadratów', () => {
  it('dom ma numer 0, a dalsze kwadraty numery w kolejności listy', () => {
    const m = mapaZListy([
      { sx: 2, sy: -1 },
      { sx: -3, sy: 4 },
    ]);
    expect(m.lista).toEqual([
      { sx: 0, sy: 0 },
      { sx: 2, sy: -1 },
      { sx: -3, sy: 4 },
    ]);
    expect(m.poKluczu.size).toBe(3);
    expect(m.poKluczu.get('0,0')).toBe(0);
    expect(m.poKluczu.get('2,-1')).toBe(1);
    expect(m.poKluczu.get('-3,4')).toBe(2);
  });

  it('sam dom: mapaDomu to mapa z pustej listy', () => {
    expect(mapaDomu()).toEqual(mapaZListy([]));
    expect(mapaDomu().lista).toEqual([{ sx: 0, sy: 0 }]);
  });

  it('klucz kwadratu to napis „sx,sy”', () => {
    expect(kluczKw(2, -1)).toBe('2,-1');
    expect(kluczKw(0, 0)).toBe('0,0');
    expect(kluczKw(-16, 16)).toBe('-16,16');
  });

  it('odrzuca kwadrat podany drugi raz, dom na liście i współrzędne niecałkowite', () => {
    expect(() =>
      mapaZListy([
        { sx: 1, sy: 0 },
        { sx: 1, sy: 0 },
      ]),
    ).toThrow(RangeError);
    expect(() => mapaZListy([{ sx: 0, sy: 0 }])).toThrow(RangeError);
    expect(() => mapaZListy([{ sx: 0.5, sy: 0 }])).toThrow(RangeError);
    expect(() => mapaZListy([{ sx: 1, sy: Number.NaN }])).toThrow(RangeError);
    expect(() => mapaZListy([{ sx: Number.POSITIVE_INFINITY, sy: 0 }])).toThrow(RangeError);
  });

  it('nie zmienia się, gdy wołający zmieni potem swoją listę', () => {
    const dodane = [{ sx: 1, sy: 0 }];
    const m = mapaZListy(dodane);
    dodane[0].sx = 5;
    dodane.push({ sx: 2, sy: 2 });
    expect(m.lista).toEqual([
      { sx: 0, sy: 0 },
      { sx: 1, sy: 0 },
    ]);
    expect(gid(m, 384, 0)).toBe(147456);
    expect(gid(m, 5 * 384, 0)).toBe(-1);
  });

  it('numery kafelków mieszczą się w Int32 dla 14 563 kwadratów, o jeden więcej mapa nie powstaje', () => {
    const lista = (n: number) => Array.from({ length: n }, (_, j) => ({ sx: j + 1, sy: 0 }));
    const m = mapaZListy(lista(14562)); // dom i 14 562 dodane, czyli k od 0 do 14 562
    const ostatni = gid(m, 14562 * 384 + 383, 383); // ostatni kafelek ostatniego kwadratu
    expect(ostatni).toBe(2147401727);
    expect(ostatni).toBeLessThanOrEqual(2 ** 31 - 1);
    expect(() => mapaZListy(lista(14563))).toThrow(RangeError);
  });
});

describe('numery budynków i drzew', () => {
  it('numery budynków i drzew', () => {
    expect(bGlob(0, 41)).toBe(41);
    expect(bKw(bGlob(3, 41))).toBe(3);
    expect(bLok(bGlob(3, 41))).toBe(41);
  });

  it('numer z kwadratu k leży w przedziale od k·65 536', () => {
    const tabela: [number, number, number][] = [
      // k, numer w świecie kwadratu, numer globalny
      [0, 0, 0],
      [0, 65535, 65535],
      [1, 0, 65536],
      [3, 41, 196649],
      [14562, 65535, 954400767],
    ];
    for (const [k, b, g] of tabela) {
      expect(bGlob(k, b)).toBe(g);
      expect(bKw(g)).toBe(k);
      expect(bLok(g)).toBe(b);
    }
  });

  it('brak (-1) zostaje brakiem w każdym kwadracie', () => {
    expect(bGlob(0, -1)).toBe(-1);
    expect(bGlob(5, -1)).toBe(-1); // w kwadracie 5 nie ma budynku: nie wolno zrobić z tego 327 679
    expect(bGlob(-1, 5)).toBe(-1); // brak kwadratu, na przykład po kwNumeru(-1)
    expect(bKw(-1)).toBe(-1);
    expect(bLok(-1)).toBe(-1);
  });

  it('odmawia numeru, który nie mieści się w kwadracie', () => {
    expect(() => bGlob(1, 65536)).toThrow(RangeError);
  });
});
