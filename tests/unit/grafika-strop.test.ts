import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Obraz } from '../../src/render/art/pixellab.ts';
import { STROP, type Strop, stropKolor } from '../../src/render/art/strop.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** pola `uzycie` wpisu strop-tynk z manifestu (źródło prawdy dla kolorów i przepisu) */
interface Uzycie {
  tlo: string;
  kurz: string;
  posredni: string;
  ciemny: string;
  brazowy: string;
  szum: Record<
    'kurz' | 'posredni' | 'ciemny' | 'brazowy',
    { kolor: string; udzial: number; rodzaj: string; siatka: number }
  >;
  szwy: [number, number];
  szwy_kolor: string;
}

const hex = (c: string) => Number.parseInt(c.slice(1), 16);
const SZEW = hex('#b07a55');

const kanaly = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** luminancja względna WCAG koloru 0xRRGGBB */
function luminancja(c: number): number {
  const [r, g, b] = kanaly(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const naSzwie = (ax: number, ay: number) => ax % STROP.szwy[0] === 0 || ay % STROP.szwy[1] === 0;

describe('strop z kodu (src/render/art/strop.ts)', () => {
  it('stałe są z uzycie wpisu strop-tynk w manifeście', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')) as {
      assety: { id: string; status: string; uzycie?: Uzycie }[];
    };
    const a = m.assety.find((q) => q.id === 'strop-tynk')!;
    expect(a.status).toBe('zatwierdzony');
    const u = a.uzycie!;
    expect(STROP.tlo).toBe(hex(u.tlo));
    expect(STROP.szwy).toEqual(u.szwy);
    expect(STROP.szwyKolor).toBe(hex(u.szwy_kolor));
    for (const k of ['kurz', 'posredni', 'ciemny', 'brazowy'] as const) {
      expect(STROP[k].kolor, k).toBe(hex(u.szum[k].kolor));
      expect(STROP[k].kolor, k).toBe(hex(u[k]));
      expect(STROP[k].udzial, k).toBe(u.szum[k].udzial);
    }
    // kurz i brąz to biały szum po pikselu, #b7b2a6 i #9a958a to pola z kratą 3 i 2 px (tak je rysuje strop.ts)
    expect([u.szum.kurz, u.szum.brazowy].map((k) => [k.rodzaj, k.siatka])).toEqual([
      ['piksel', 1],
      ['piksel', 1],
    ]);
    expect([u.szum.posredni, u.szum.ciemny].map((k) => k.rodzaj)).toEqual(['pole', 'pole']);
    expect(STROP.posredni.krata).toBe(u.szum.posredni.siatka);
    expect(STROP.ciemny.krata).toBe(u.szum.ciemny.siatka);
  });

  it('średni kolor stropu z kodu', () => {
    const suma = [0, 0, 0];
    for (let ay = 0; ay < 256; ay++)
      for (let ax = 0; ax < 256; ax++) {
        const [r, g, b] = kanaly(stropKolor(null, ax, ay));
        suma[0] += r;
        suma[1] += g;
        suma[2] += b;
      }
    const sr = suma.map((v) => v / (256 * 256));
    const oczekiwany = [214, 183, 152];
    for (let i = 0; i < 3; i++) expect(Math.abs(sr[i] - oczekiwany[i]), `kanał ${i}`).toBeLessThanOrEqual(4);
  });

  it('udziały kolorów ziarna poza szwami', () => {
    const liczba = new Map<number, number>();
    let razem = 0;
    for (let ay = 1; ay < 1025; ay++)
      for (let ax = 1; ax < 1025; ax++) {
        if (naSzwie(ax, ay)) continue;
        const c = stropKolor(null, ax, ay);
        liczba.set(c, (liczba.get(c) ?? 0) + 1);
        razem++;
      }
    const udzial = (c: string) => (liczba.get(hex(c)) ?? 0) / razem;
    expect(Math.abs(udzial('#cac6bc') - 0.28)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(udzial('#b7b2a6') - 0.05)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(udzial('#9a958a') - 0.01)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(udzial('#765e42') - 0.02)).toBeLessThanOrEqual(0.01);
    // poza pięcioma kolorami (baza i cztery warstwy ziarna) strop nic nie rysuje
    expect([...liczba.keys()].sort((a, b) => a - b)).toEqual(
      [STROP.tlo, STROP.kurz.kolor, STROP.posredni.kolor, STROP.ciemny.kolor, STROP.brazowy.kolor].sort(
        (a, b) => a - b,
      ),
    );
  });

  it('szwy co 96 × 64', () => {
    for (let k = 0; k < 6; k++)
      for (let t = 0; t < 300; t += 7) {
        expect(stropKolor(null, k * 96, t), `x ${k * 96}`).toBe(SZEW);
        expect(stropKolor(null, t, k * 64), `y ${k * 64}`).toBe(SZEW);
      }
    // poza tymi kolumnami i wierszami kolor szwu się nie pojawia
    let obce = 0;
    for (let ay = 1; ay < 192; ay++)
      for (let ax = 1; ax < 288; ax++) if (!naSzwie(ax, ay) && stropKolor(null, ax, ay) === SZEW) obce++;
    expect(obce).toBe(0);
  });

  it('ciągłość między kafelkami: kolor zależy tylko od współrzędnych świata', () => {
    // po kafelkach 32 px (z przesunięciem w kafelku) i wierszami to te same piksele
    const naraz = new Map<string, number>();
    for (let ay = 0; ay < 160; ay++)
      for (let ax = 0; ax < 160; ax++) naraz.set(`${ax},${ay}`, stropKolor(null, ax, ay));
    for (let cy = 0; cy < 5; cy++)
      for (let cx = 0; cx < 5; cx++)
        for (let v = 0; v < 32; v++)
          for (let u = 0; u < 32; u++)
            expect(stropKolor(null, cx * 32 + u, cy * 32 + v)).toBe(naraz.get(`${cx * 32 + u},${cy * 32 + v}`));
    // plamy pola przechodzą przez granicę kafelka tak samo jak przez jego środek: gdy lewy piksel pary jest
    // #b7b2a6, prawy też jest nim równie często na granicy kafelków (kolumny 31 i 32) co w środku (13 i 14). Różnica
    // 18 to wielokrotność 6, więc kolumny mają tę samą fazę kraty 3 i 2 px, od której zależy zgodność sąsiadów;
    // pomijamy co trzeci kafelek, bo jego prawa granica leży na szwie (96 = 3 × 32) i zabrałaby jedną fazę
    const posr = STROP.posredni.kolor;
    const sasiad = (kolumna: number) => {
      let lewy = 0;
      let oba = 0;
      for (let cx = 0; cx < 64; cx++)
        for (let ay = 1; ay < 2049; ay++) {
          if (cx % 3 === 2) continue;
          const ax = cx * 32 + kolumna;
          if (naSzwie(ax, ay) || naSzwie(ax + 1, ay)) continue;
          if (stropKolor(null, ax, ay) !== posr) continue;
          lewy++;
          if (stropKolor(null, ax + 1, ay) === posr) oba++;
        }
      return oba / lewy;
    };
    const granica = sasiad(31);
    const srodek = sasiad(13);
    expect(srodek).toBeGreaterThan(0.3);
    expect(Math.abs(granica - srodek)).toBeLessThan(0.06);
  });

  it('strop jest co najmniej 2,5 razy jaśniejszy od dachu #313336', () => {
    let l = 0;
    for (let ay = 0; ay < 256; ay++) for (let ax = 0; ax < 256; ax++) l += luminancja(stropKolor(null, ax, ay));
    expect(l / (256 * 256) / luminancja(hex('#313336'))).toBeGreaterThanOrEqual(2.5);
  });
});

describe('naklejki stropu z atlasu', () => {
  /** cztery naklejki 32 × 32: lewa połowa w znanym kolorze (każda w innym), prawa przezroczysta */
  const KOLORY = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
  const px = new Uint32Array(128 * 32);
  for (let n = 0; n < 4; n++)
    for (let v = 0; v < 32; v++)
      for (let u = 0; u < 16; u++) {
        const [r, g, b] = kanaly(KOLORY[n]);
        // kolory jak w ImageData: 0xAABBGGRR
        px[v * 128 + n * 32 + u] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
      }
  const img: Obraz = { w: 128, h: 32, px };

  it('przy gęstości 1 piksele naklejki przykrywają tło, a przezroczyste przepuszczają tło', () => {
    const s: Strop = { img, naklejka: 32, naklejek: 4, gestosc: 1 };
    const uzyte = new Set<number>();
    for (let cy = 0; cy < 8; cy++)
      for (let cx = 0; cx < 8; cx++) {
        const lewa = new Set<number>();
        for (let v = 0; v < 32; v++)
          for (let u = 0; u < 32; u++) {
            const ax = cx * 32 + u;
            const ay = cy * 32 + v;
            if (u < 16) lewa.add(stropKolor(s, ax, ay));
            else expect(stropKolor(s, ax, ay)).toBe(stropKolor(null, ax, ay));
          }
        // cała lewa połowa kafelka to jedna naklejka (jej kolor), także na szwie
        expect(lewa.size).toBe(1);
        const [kolor] = lewa;
        expect(KOLORY).toContain(kolor);
        uzyte.add(kolor);
      }
    // 64 kafelki losują wszystkie cztery naklejki
    expect(uzyte.size).toBe(4);
  });

  it('przy gęstości 0 albo bez obrazu strop jest taki sam jak z samego kodu', () => {
    for (const s of [
      { img, naklejka: 32, naklejek: 4, gestosc: 0 },
      { img: null, naklejka: 32, naklejek: 4, gestosc: 1 },
    ] satisfies Strop[])
      for (let ay = 0; ay < 96; ay++)
        for (let ax = 0; ax < 192; ax++) expect(stropKolor(s, ax, ay)).toBe(stropKolor(null, ax, ay));
  });

  it('naklejka trafia w część kafelków, w tym co gestosc', () => {
    const s: Strop = { img, naklejka: 32, naklejek: 4, gestosc: 0.12 };
    let z = 0;
    const n = 40 * 40;
    for (let k = 0; k < n; k++) {
      const ax = (k % 40) * 32;
      const ay = ((k / 40) | 0) * 32 + 1;
      if (stropKolor(s, ax + 3, ay) !== stropKolor(null, ax + 3, ay)) z++;
    }
    expect(z / n).toBeGreaterThan(0.12 * 0.7);
    expect(z / n).toBeLessThan(0.12 * 1.3);
  });
});
