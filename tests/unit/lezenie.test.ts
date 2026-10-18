import { describe, expect, it } from 'vitest';
import { komorkaLezenia, nad, obroc, wytnij } from '../../src/render/art/lezenie.ts';
import type { Obraz } from '../../src/render/art/pixellab.ts';

/** piksel jak w ImageData czytanym przez Uint32Array (0xAABBGGRR) */
const piksel = (r: number, g: number, b: number, a = 255): number => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const alfa = (p: number): number => p >>> 24;
const rgba = (p: number): number[] => [p & 255, (p >>> 8) & 255, (p >>> 16) & 255, p >>> 24];
const obraz = (w: number, h: number, wartosci: number[]): Obraz => ({ w, h, px: Uint32Array.from(wartosci) });
const wiersze = (o: Obraz): number[][] =>
  Array.from({ length: o.h }, (_, y) => Array.from(o.px.subarray(y * o.w, (y + 1) * o.w)));

describe('obrót obrazu o ćwiartki', () => {
  // A B C
  // D E F
  const abc = obraz(3, 2, [1, 2, 3, 4, 5, 6]);

  it('o 90° zgodnie z zegarem lewa kolumna od dołu staje się górnym wierszem', () => {
    const r = obroc(abc, 1);
    expect([r.w, r.h]).toEqual([2, 3]);
    expect(wiersze(r)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
  });

  it('o 180° i o 270° (90° przeciwnie do zegara)', () => {
    expect(wiersze(obroc(abc, 2))).toEqual([
      [6, 5, 4],
      [3, 2, 1],
    ]);
    expect(wiersze(obroc(abc, 3))).toEqual([
      [3, 6],
      [2, 5],
      [1, 4],
    ]);
  });

  it('zero i cztery ćwiartki to kopia, ujemne liczą się modulo 4, a źródło zostaje bez zmian', () => {
    for (const k of [0, 4, 8]) {
      const r = obroc(abc, k);
      expect(r, `${k}`).not.toBe(abc);
      expect(r.px, `${k}`).not.toBe(abc.px);
      expect(wiersze(r), `${k}`).toEqual(wiersze(abc));
    }
    expect(wiersze(obroc(abc, -1))).toEqual(wiersze(obroc(abc, 3)));
    expect(Array.from(abc.px)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('wycinek obrazu', () => {
  it('kopiuje prostokąt, a poza obrazem zostawia przezroczystość', () => {
    const o = obraz(3, 2, [1, 2, 3, 4, 5, 6]);
    const w = wytnij(o, 1, 0, 2, 2);
    expect([w.w, w.h, ...w.px]).toEqual([2, 2, 2, 3, 5, 6]);
    expect(Array.from(wytnij(o, 2, 1, 2, 2).px)).toEqual([6, 0, 0, 0]);
  });
});

describe('nałożenie piksela (alfa prosta, nie mnożona)', () => {
  const czerwony = piksel(255, 0, 0);

  it('przezroczysty nic nie zmienia, nieprzezroczysty zastępuje, na przezroczystym zostaje to, co nakładane', () => {
    expect(nad(czerwony, 0)).toBe(czerwony);
    const zielony = piksel(0, 255, 0);
    expect(nad(czerwony, zielony)).toBe(zielony);
    const pol = piksel(10, 20, 30, 77);
    expect(nad(0, pol)).toBe(pol);
  });

  it('pół białego na czerwonym daje różowy, a dwie półprzezroczyste warstwy sumują krycie', () => {
    expect(rgba(nad(czerwony, piksel(255, 255, 255, 128)))).toEqual([255, 128, 128, 255]);
    const dwa = rgba(nad(piksel(0, 0, 0, 128), piksel(255, 255, 255, 128)));
    expect(Math.abs(dwa[3] - 192)).toBeLessThanOrEqual(1);
    // kolor warstw bez krycia: biel o kryciu 0,5 nad czernią o kryciu 0,5 to szarość 170
    expect(Math.abs(dwa[0] - 170)).toBeLessThanOrEqual(1);
  });
});

const GLOWA = piksel(200, 120, 60);
const TULOW = piksel(40, 150, 60);
const STOPY = piksel(190, 40, 200);

/** sztuczna sylwetka przodem: głowa 12 × 12, tułów do przedostatniego wiersza, stopy w ostatnim; stopy między bokami */
function przod(w = 14, h = 40): Obraz {
  const o = { w, h, px: new Uint32Array(w * h) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (y < 12 && x >= 1 && x < w - 1) o.px[y * w + x] = GLOWA;
      else if (y >= 12 && y < h - 1) o.px[y * w + x] = TULOW;
      else if (y === h - 1 && ((x >= 3 && x < 6) || (x >= 8 && x < 11))) o.px[y * w + x] = STOPY;
    }
  return o;
}
const ile = (o: Obraz, kolor: number): number => o.px.reduce((n, p) => n + (p === kolor ? 1 : 0), 0);
/** środek (w pikselach, ze środkami komórek) pikseli spełniających warunek */
function srodek(o: Obraz, ok: (p: number) => boolean): [number, number] {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++)
      if (ok(o.px[y * o.w + x])) {
        n++;
        sx += x + 0.5;
        sy += y + 0.5;
      }
  return [sx / n, sy / n];
}
/** wersor od środka komórki w stronę głowy dla strony o: 0 góra, 1 prawo, 2 dół, 3 lewo */
const STRONA = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const przezroczysty = (p: number): boolean => alfa(p) > 0 && alfa(p) < 255;

describe('komórka leżenia z klatki stania przodem', () => {
  const front = przod();
  const AX = 7;
  const rodzaje = ['floor', 'bed'] as const;

  it('komórka jest kwadratem większym od sylwetki, a środek głowy ma całkowite współrzędne w jej obrębie', () => {
    for (const rodzaj of rodzaje)
      for (let o = 0; o < 4; o++) {
        const k = komorkaLezenia(front, AX, rodzaj, o);
        const nazwa = `${rodzaj} ${o}`;
        expect(k.w, nazwa).toBe(k.h);
        expect(k.w, nazwa).toBeGreaterThan(front.h);
        expect(k.px.length, nazwa).toBe(k.w * k.h);
        expect(Number.isInteger(k.hx) && Number.isInteger(k.hy), nazwa).toBe(true);
        expect(k.hx, nazwa).toBeGreaterThan(0);
        expect(k.hx, nazwa).toBeLessThan(k.w);
        expect(k.hy, nazwa).toBeGreaterThan(0);
        expect(k.hy, nazwa).toBeLessThan(k.h);
      }
  });

  it('na podłodze cała sylwetka jest w komórce, przy każdej z czterech stron głowy', () => {
    for (let o = 0; o < 4; o++) {
      const k = komorkaLezenia(front, AX, 'floor', o);
      expect(ile(k, GLOWA), `${o}`).toBe(ile(front, GLOWA));
      expect(ile(k, TULOW), `${o}`).toBe(ile(front, TULOW));
      expect(ile(k, STOPY), `${o}`).toBe(ile(front, STOPY));
    }
  });

  it('głowa leży po stronie o: 0 u góry, 1 z prawej, 2 na dole, 3 z lewej (jak lieHead w leżeniu z kodu)', () => {
    for (const rodzaj of rodzaje)
      for (let o = 0; o < 4; o++) {
        const k = komorkaLezenia(front, AX, rodzaj, o);
        const [gx, gy] = srodek(k, (p) => p === GLOWA);
        const [dx, dy] = STRONA[o];
        const nazwa = `${rodzaj} ${o}`;
        expect((gx - k.w / 2) * dx + (gy - k.h / 2) * dy, nazwa).toBeGreaterThan(5);
        // w poprzek ciała głowa jest na osi komórki
        expect(Math.abs(dx === 0 ? gx - k.w / 2 : gy - k.h / 2), nazwa).toBeLessThan(1.5);
      }
  });

  it('środek głowy leży na głowie, w obu rodzajach i przy każdej stronie', () => {
    for (const rodzaj of rodzaje)
      for (let o = 0; o < 4; o++) {
        const k = komorkaLezenia(front, AX, rodzaj, o);
        for (const [dx, dy] of [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [0, 0],
        ])
          expect(k.px[(k.hy + dy) * k.w + k.hx + dx], `${rodzaj} ${o} ${dx},${dy}`).toBe(GLOWA);
      }
  });

  it('na podłodze sylwetka stoi na środku komórki (zwłoki kładzie się środkiem) i ma pod sobą lekki cień', () => {
    for (let o = 0; o < 4; o++) {
      const k = komorkaLezenia(front, AX, 'floor', o);
      const [cx, cy] = srodek(k, (p) => alfa(p) === 255);
      expect(Math.abs(cx - k.w / 2), `${o}`).toBeLessThanOrEqual(1);
      expect(Math.abs(cy - k.h / 2), `${o}`).toBeLessThanOrEqual(1);
      const cien = Array.from(k.px).filter(przezroczysty);
      expect(cien.length, `${o}`).toBeGreaterThan(50);
      for (const p of cien) {
        expect(rgba(p).slice(0, 3), `${o}`).toEqual([10, 12, 18]);
        expect(alfa(p), `${o}`).toBeGreaterThan(30);
        expect(alfa(p), `${o}`).toBeLessThan(120);
      }
    }
  });

  it('w łóżku widać głowę i kark, a resztę ciała przykrywa półprzezroczysty koc od głowy w stronę nóg', () => {
    for (let o = 0; o < 4; o++) {
      const k = komorkaLezenia(front, AX, 'bed', o);
      expect(ile(k, STOPY), `${o}`).toBe(0);
      expect(ile(k, GLOWA), `${o}`).toBe(ile(front, GLOWA));
      for (const p of k.px) if (alfa(p) === 255) expect([GLOWA, TULOW], `${o}`).toContain(p);
      const koc = Array.from(k.px).filter(przezroczysty);
      expect(koc.length, `${o}`).toBeGreaterThan(100);
      // koc nie zasłania łóżka pod spodem: tylko lekki cień i światło
      for (const p of koc) expect(alfa(p), `${o}`).toBeLessThan(100);
      const [gx, gy] = srodek(k, (p) => p === GLOWA);
      const [bx, by] = srodek(k, przezroczysty);
      const [dx, dy] = STRONA[o];
      expect((bx - gx) * -dx + (by - gy) * -dy, `${o}`).toBeGreaterThan(8);
    }
  });

  it('koc w łóżku jest tak szeroki jak ramiona w ostatnim widocznym wierszu (od 14 do 24 px), żeby nie wystawały', () => {
    // wiersz pod karkiem, głową do góry: liczba półprzezroczystych pikseli to szerokość koca
    const szerokoscKoca = (w: number): number => {
      const k = komorkaLezenia(przod(w, 40), w >> 1, 'bed', 0);
      const y = k.hy + 22;
      let n = 0;
      for (let x = 0; x < k.w; x++) if (przezroczysty(k.px[y * k.w + x])) n++;
      return n;
    };
    expect(szerokoscKoca(14)).toBe(14);
    expect(szerokoscKoca(20)).toBe(20);
    expect(szerokoscKoca(24)).toBe(24);
    expect(szerokoscKoca(40)).toBe(24);
  });

  it('w łóżku nie widać rekwizytów daleko od osi ciała (kij do selfie), na podłodze leżą przy ciele', () => {
    // szeroka sylwetka z osią przesuniętą w prawo, jak influencerka z kijem po lewej stronie
    const szeroka = przod(40, 40);
    const szerokoscRysunku = (k: Obraz): number => {
      let od = k.w;
      let do_ = -1;
      for (let y = 0; y < k.h; y++)
        for (let x = 0; x < k.w; x++)
          if (alfa(k.px[y * k.w + x]) === 255) {
            od = Math.min(od, x);
            do_ = Math.max(do_, x);
          }
      return do_ - od + 1;
    };
    expect(szerokoscRysunku(komorkaLezenia(szeroka, 30, 'floor', 0))).toBe(40);
    expect(szerokoscRysunku(komorkaLezenia(szeroka, 30, 'bed', 0))).toBeLessThanOrEqual(26);
    // zwykła sylwetka mieści się cała
    expect(szerokoscRysunku(komorkaLezenia(przod(), AX, 'bed', 0))).toBe(14);
  });

  it('w łóżku znika to, co nie łączy się z głową (urwany kawałek rekwizytu), na podłodze zostaje', () => {
    const WYSPA = piksel(10, 250, 250);
    const baza = przod();
    // sylwetka szersza o miejsce na wyspę 2 × 2 oddzieloną od głowy przerwą, w obrębie 13 px od osi ciała
    const z: Obraz = { w: 22, h: baza.h, px: new Uint32Array(22 * baza.h) };
    for (let y = 0; y < baza.h; y++) for (let x = 0; x < baza.w; x++) z.px[y * z.w + x] = baza.px[y * baza.w + x];
    for (const [x, y] of [
      [17, 4],
      [18, 4],
      [17, 5],
      [18, 5],
    ])
      z.px[y * z.w + x] = WYSPA;
    for (let o = 0; o < 4; o++) {
      expect(ile(komorkaLezenia(z, AX, 'floor', o), WYSPA), `floor ${o}`).toBe(4);
      const lozko = komorkaLezenia(z, AX, 'bed', o);
      expect(ile(lozko, WYSPA), `bed ${o}`).toBe(0);
      expect(ile(lozko, GLOWA), `bed ${o}`).toBe(ile(baza, GLOWA));
    }
  });

  it('nie zmienia sylwetki źródłowej, a strona głowy liczy się modulo 4', () => {
    const przed = Array.from(front.px);
    const a = komorkaLezenia(front, AX, 'floor', 1);
    expect(Array.from(front.px)).toEqual(przed);
    const b = komorkaLezenia(front, AX, 'floor', 5);
    expect(Array.from(b.px)).toEqual(Array.from(a.px));
    expect([b.hx, b.hy]).toEqual([a.hx, a.hy]);
  });
});
