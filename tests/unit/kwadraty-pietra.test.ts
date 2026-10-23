/* Piętra w kwadratach obok domu (miasto z kwadratów, etap 1, zadanie 6; widok pięter ?pietra=1): `buildKwadrat` przyjmuje
   `pietra` jak `buildWorld`, ale awans domów do dwóch kondygnacji liczy się z klucza budynku (nie z kolejności w kwadracie),
   żeby dwa kawałki jednego budynku po dwóch stronach szwu dostały to samo; kawałek przy szwie z domem bierze `levels`
   z domu („dom wygrywa”, jak na rastrze i w stylu). Dopasowanie kawałków przez szew robi `budynkiZDomem` po sąsiadujących
   kafelkach budynków. Dla kilku adresów testowych sprawdzamy to na prawdziwych danych, a składniki na małych tablicach. */

import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import type { Geo, GeoBuilding, Pt } from '../../src/world/geo.ts';
import { budynkiZDomem, sasiedzi8, type Uklad } from '../../src/world/kwadraty.ts';
import { awansujDomyKwadratu, DOM_MIN_POLE, domAwansuje, uzgodnijPietraZDomem } from '../../src/world/pietra.ts';
import { buildKwadrat, buildWorld, type World, type WorldBuilding } from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';

const BOK = 384;

/** tablica numerów budynków size×size z napisu: kropka to brak, cyfra to numer budynku */
function bidZ(size: number, wiersze: string[]): Int32Array {
  const out = new Int32Array(size * size).fill(-1);
  wiersze.forEach((w, y) => {
    [...w].forEach((c, x) => {
      if (c !== '.') out[y * size + x] = Number(c);
    });
  });
  return out;
}
const swiat = (size: number, wiersze: string[]) => ({ size, bid: bidZ(size, wiersze) });

describe('budynkiZDomem: który budynek kwadratu sąsiaduje przez szew z którym budynkiem domu', () => {
  const dom = swiat(4, ['...5', '...5', '....', '...7']);

  it('kwadrat na wschodzie: jego kolumna 0 sąsiaduje z ostatnią kolumną domu, pierwszy budynek domu wygrywa', () => {
    const e = swiat(4, ['22..', '2...', '....', '33..']);
    expect([...budynkiZDomem(dom, e, 1, 0)]).toEqual([
      [2, 5],
      [3, 7],
    ]);
    // budynek 2 dotyka domu 5 (wiersze 0 i 1) i 6 w wierszu 2: bierze pierwszy napotkany (od północy)
    const e2 = swiat(4, ['2...', '2...', '2...', '....']);
    const dom2 = swiat(4, ['...5', '...5', '...6', '....']);
    expect([...budynkiZDomem(dom2, e2, 1, 0)]).toEqual([[2, 5]]);
  });

  it('kwadrat na zachodzie, północy i południu: odpowiednie brzegi', () => {
    const domW = swiat(4, ['5...', '....', '6...', '....']);
    expect([...budynkiZDomem(domW, swiat(4, ['...1', '....', '...2', '...2']), -1, 0)]).toEqual([
      [1, 5],
      [2, 6],
    ]);
    const domN = swiat(4, ['.3..', '....', '....', '....']);
    expect([...budynkiZDomem(domN, swiat(4, ['....', '....', '....', '.4..']), 0, -1)]).toEqual([[4, 3]]);
    const domS = swiat(4, ['....', '....', '....', '..8.']);
    expect([...budynkiZDomem(domS, swiat(4, ['..9.', '..9.', '....', '....']), 0, 1)]).toEqual([[9, 8]]);
  });

  it('narożniki: jedna para kafelków przez róg', () => {
    const domSE = swiat(4, ['....', '....', '....', '...5']);
    expect([...budynkiZDomem(domSE, swiat(4, ['1...', '....', '....', '....']), 1, 1)]).toEqual([[1, 5]]);
    const domNE = swiat(4, ['...5', '....', '....', '....']);
    expect([...budynkiZDomem(domNE, swiat(4, ['....', '....', '....', '1...']), 1, -1)]).toEqual([[1, 5]]);
    const domSW = swiat(4, ['....', '....', '....', '5...']);
    expect([...budynkiZDomem(domSW, swiat(4, ['...1', '....', '....', '....']), -1, 1)]).toEqual([[1, 5]]);
    const domNW = swiat(4, ['5...', '....', '....', '....']);
    expect([...budynkiZDomem(domNW, swiat(4, ['....', '....', '....', '...1']), -1, -1)]).toEqual([[1, 5]]);
  });

  it('kwadrat niesąsiadujący z domem, sam dom i brak budynków przy szwie dają pustą mapę', () => {
    const e = swiat(4, ['22..', '....', '....', '....']);
    expect(budynkiZDomem(dom, e, 2, 0).size).toBe(0);
    expect(budynkiZDomem(dom, e, 1, 2).size).toBe(0);
    expect(budynkiZDomem(dom, e, 0, 0).size).toBe(0);
    expect(budynkiZDomem(dom, swiat(4, ['....', '....', '....', '....']), 1, 0).size).toBe(0);
  });
});

/** budynek do prób awansu; liczy się to, co czyta pietra.ts */
const budynek = (id: number, cls: WorldBuilding['cls'], levels: number, area: number, klucz?: string): WorldBuilding =>
  ({ id, cls, levels, area, tags: klucz ? { 'zm:klucz': klucz, 'zm:os': '0,0,1,1' } : {} }) as WorldBuilding;

describe('awansujDomyKwadratu: każdy dom decyduje sam z klucza budynku', () => {
  it('domAwansuje to skrót z ziarna gry i klucza, bez zależności od reszty budynków', () => {
    expect(domAwansuje(7, 'px:1:2:3:4:3')).toBe(Number.parseInt(hashString('7:pietra:px:1:2:3:4:3'), 16) % 2 === 0);
    // około połowa kluczy awansuje, rozkład nie jest zdegenerowany
    let tak = 0;
    for (let k = 0; k < 400; k++) if (domAwansuje(7, `px:${k}:5:1:1:3`)) tak++;
    expect(tak).toBeGreaterThan(140);
    expect(tak).toBeLessThan(260);
    // zależy od ziarna gry
    const inne = Array.from(
      { length: 50 },
      (_, k) => domAwansuje(8, `px:${k}:5:1:1:3`) === domAwansuje(7, `px:${k}:5:1:1:3`),
    );
    expect(inne.some((x) => !x)).toBe(true);
  });

  it('awansuje tylko domy od 60 m² z jedną kondygnacją, reszta bez zmian, i zwraca liczbę awansowanych', () => {
    const klucze = Array.from({ length: 40 }, (_, k) => `px:${k}:9:1:1:3`);
    const b = [
      ...klucze.map((k, i) => budynek(i, 'dom', 1, 100, k)),
      budynek(40, 'dom', 1, DOM_MIN_POLE - 1, 'px:40:9:1:1:3'),
      budynek(41, 'dom', 3, 100, 'px:41:9:1:1:3'),
      budynek(42, 'blok', 1, 400, 'px:42:9:1:1:3'),
    ];
    const n = awansujDomyKwadratu({ buildings: b }, 7);
    const oczekiwane = klucze.filter((k) => domAwansuje(7, k));
    expect(n).toBe(oczekiwane.length);
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(40);
    for (const [i, k] of klucze.entries()) expect(b[i].levels).toBe(domAwansuje(7, k) ? 2 : 1);
    expect(b[40].levels).toBe(1);
    expect(b[41].levels).toBe(3);
    expect(b[42].levels).toBe(1);
  });

  it('decyzja nie zależy od numeru budynku ani od innych budynków w kwadracie', () => {
    const a = [budynek(0, 'dom', 1, 100, 'px:5:5:1:1:3')];
    const b = [budynek(9, 'dom', 1, 100, 'px:1:1:1:1:3'), budynek(3, 'dom', 1, 100, 'px:5:5:1:1:3')];
    awansujDomyKwadratu({ buildings: a }, 7);
    awansujDomyKwadratu({ buildings: b }, 7);
    expect(a[0].levels).toBe(b[1].levels);
  });

  it('budynek bez klucza decyduje po numerze w kwadracie (dane bez kluczy), deterministycznie', () => {
    const f = () => {
      const b = Array.from({ length: 12 }, (_, i) => budynek(i, 'dom', 1, 100));
      awansujDomyKwadratu({ buildings: b }, 7);
      return b.map((x) => x.levels);
    };
    expect(f()).toEqual(f());
  });
});

describe('uzgodnijPietraZDomem: kawałek przy szwie z domem ma poziomy budynku domu', () => {
  it('nadpisuje levels kawałków sąsiada przez szew, reszta bez zmian', () => {
    const dom = { ...swiat(4, ['...5', '...5', '....', '...7']), buildings: [] as WorldBuilding[] };
    dom.buildings[5] = budynek(5, 'dom', 2, 100);
    dom.buildings[7] = budynek(7, 'dom', 1, 100);
    const e = { ...swiat(4, ['22..', '2...', '....', '33.4']), buildings: [] as WorldBuilding[] };
    e.buildings[2] = budynek(2, 'dom', 1, 100);
    e.buildings[3] = budynek(3, 'dom', 2, 100);
    e.buildings[4] = budynek(4, 'dom', 1, 100);
    uzgodnijPietraZDomem(e, dom, 1, 0);
    expect(e.buildings[2].levels).toBe(2);
    expect(e.buildings[3].levels).toBe(1);
    expect(e.buildings[4].levels).toBe(1);
  });
});

/* ---------- buildKwadrat ---------- */

const geoZ = (b: GeoBuilding[]): Geo => ({ c: [52, 21], b, r: [], a: [], w: [], poi: [] });
const prostokat = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const dom = (p: Pt[], klucz: string): GeoBuilding => ({
  p,
  t: { building: 'house', 'building:levels': '1', 'zm:klucz': klucz, 'zm:os': '0,0,1,1' },
});

describe('buildKwadrat z flagą piętra', () => {
  const uklad: Uklad = { c: [52, 21], kat: 0, bok: BOK };

  /** domy 10 x 12 m w kwadracie (1, 0) (okno x od 192 do 576 m od adresu), z kluczami k0, k1, ... */
  const sasiad = (klucze: string[]) => geoZ(klucze.map((k, i) => dom(prostokat(200 + i * 20, -6, 210 + i * 20, 6), k)));

  it('bez flagi poziomy domów są takie jak z danych, z flagą tylko domy od 60 m² idą do dwóch po kluczu', () => {
    const klucze = Array.from({ length: 12 }, (_, k) => `px:${k}:3:1:1:3`);
    const g = sasiad(klucze);
    const bez = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0 });
    const z = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0, pietra: true });
    expect(bez.buildings.length).toBe(12);
    expect(bez.buildings.every((b) => b.levels === 1)).toBe(true);
    // teren i budynki te same, różnią się tylko poziomy
    expect([...z.terr]).toEqual([...bez.terr]);
    expect([...z.bid]).toEqual([...bez.bid]);
    for (const b of z.buildings) {
      const k = b.tags['zm:klucz'];
      expect(b.levels).toBe(domAwansuje(7, k) ? 2 : 1);
    }
    expect(z.buildings.some((b) => b.levels === 2)).toBe(true);
    expect(z.buildings.some((b) => b.levels === 1)).toBe(true);
  });

  it('ten sam budynek w dwóch kwadratach bez domu dostaje te same poziomy', () => {
    // dom przecięty szwem kwadratów (1, 0) i (1, 1): granica okien w y = 192 m od adresu
    for (let k = 0; k < 8; k++) {
      const klucz = `px:${k}:4:1:1:3`;
      const przeciety = dom(prostokat(260, 186, 272, 198), klucz);
      const a = buildKwadrat(geoZ([przeciety]), { seed: 7, uklad, sx: 1, sy: 0, pietra: true });
      const b = buildKwadrat(geoZ([przeciety]), { seed: 7, uklad, sx: 1, sy: 1, pietra: true });
      expect(a.buildings.length).toBe(1);
      expect(b.buildings.length).toBe(1);
      expect(a.buildings[0].levels).toBe(b.buildings[0].levels);
      expect(a.buildings[0].levels).toBe(domAwansuje(7, klucz) ? 2 : 1);
    }
  });

  it('kawałek przy szwie z domem ma poziomy domu, także gdy własna decyzja z klucza byłaby inna', () => {
    let sprawdzone = 0;
    for (let k = 0; k < 12; k++) {
      const klucz = `px:${k}:6:1:1:3`;
      // dom (udawany: tylko tablica numerów i budynki) ma kawałek budynku w kolumnach 378–383, wiersze 186–197
      const bid = new Int32Array(BOK * BOK).fill(-1);
      for (let y = 186; y < 198; y++) for (let x = 378; x < BOK; x++) bid[y * BOK + x] = 0;
      const wlasne = domAwansuje(7, klucz) ? 2 : 1;
      const odDomu = wlasne === 2 ? 1 : 2;
      const swiatDomu = { size: BOK, bid, buildings: [budynek(0, 'dom', odDomu, 100, klucz)] };
      // ten sam budynek w geo sąsiada: x od 186 do 198 m (okno sąsiada zaczyna się w 192)
      const g = geoZ([dom(prostokat(186, -6, 198, 6), klucz)]);
      const s = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0, pietra: true, dom: swiatDomu });
      expect(s.buildings.length).toBe(1);
      expect(s.buildings[0].levels).toBe(odDomu);
      sprawdzone++;
    }
    expect(sprawdzone).toBe(12);
  });

  it('bez flagi piętra opcja domu nic nie zmienia', () => {
    const bid = new Int32Array(BOK * BOK).fill(-1);
    for (let y = 186; y < 198; y++) for (let x = 378; x < BOK; x++) bid[y * BOK + x] = 0;
    const swiatDomu = { size: BOK, bid, buildings: [budynek(0, 'dom', 4, 100)] };
    const g = geoZ([dom(prostokat(186, -6, 198, 6), 'px:1:1:1:1:3')]);
    const s = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0, dom: swiatDomu });
    expect(s.buildings[0].levels).toBe(1);
  });
});

/* ---------- prawdziwe dane: kawałki budynków przez szew mają te same poziomy ---------- */

/** pary (numer budynku w a, numer w b) kafelków budynków po obu stronach szwu: b leży o (dx, dy) kwadratów od a */
function paryPrzezSzew(a: World, b: World, dx: number, dy: number): Array<[number, number]> {
  const n = a.size;
  const out: Array<[number, number]> = [];
  const dodaj = (ia: number, ib: number) => {
    if (a.bid[ia] >= 0 && b.bid[ib] >= 0) out.push([a.bid[ia], b.bid[ib]]);
  };
  if (dy === 0) for (let y = 0; y < n; y++) dodaj(y * n + (dx > 0 ? n - 1 : 0), y * n + (dx > 0 ? 0 : n - 1));
  else for (let x = 0; x < n; x++) dodaj((dy > 0 ? n - 1 : 0) * n + x, (dy > 0 ? 0 : n - 1) * n + x);
  return out;
}

describe('piętra przez szwy na prawdziwych danych (trzy adresy, różne kąty obrotu)', () => {
  const seed = 7;
  let wszystkie = 0;
  let domyPrzeciete = 0;
  let awansowaneKtoreInaczej = 0;

  for (const a of ADDRESSES) {
    it(`${a.key}: kawałki budynków przeciętych szwem z domem i szwem sąsiad–sąsiad mają te same poziomy`, () => {
      const uklad = ukladTestowy(a);
      const geoDomu = geoDomuTestowego(a);
      const swiatDomu = buildWorld(geoDomu, { seed, pietra: true });
      expect(swiatDomu.size).toBe(BOK);
      const budowa = (sx: number, sy: number) =>
        buildKwadrat(geoKwadratuTestowego(a, sx, sy), { seed, uklad, sx, sy, geoDomu, pietra: true, dom: swiatDomu });
      const nasze = new Map<string, World>();
      for (const [sx, sy] of sasiedzi8(0, 0)) nasze.set(`${sx},${sy}`, budowa(sx, sy));
      for (const [sx, sy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const w = nasze.get(`${sx},${sy}`) as World;
        for (const [ia, ib] of paryPrzezSzew(swiatDomu, w, sx, sy)) {
          wszystkie++;
          const bd = swiatDomu.buildings[ia];
          expect(w.buildings[ib].levels).toBe(bd.levels);
          if (bd.cls === 'dom' && bd.area >= DOM_MIN_POLE) domyPrzeciete++;
          const wlasna = domAwansuje(seed, bd.tags['zm:klucz'] ?? '') ? 2 : 1;
          if (bd.levels === 1 && wlasna === 2) awansowaneKtoreInaczej++;
        }
      }
      // szew sąsiad–sąsiad (bez domu): kwadraty (1, −1) i (1, 0), (1, 0) i (1, 1), (−1, 1) i (0, 1)
      for (const [x1, y1, x2, y2] of [
        [1, -1, 1, 0],
        [1, 0, 1, 1],
        [-1, 1, 0, 1],
        [0, 1, 1, 1],
      ]) {
        const w1 = nasze.get(`${x1},${y1}`) as World;
        const w2 = nasze.get(`${x2},${y2}`) as World;
        for (const [i1, i2] of paryPrzezSzew(w1, w2, x2 - x1, y2 - y1)) {
          const b1 = w1.buildings[i1];
          const b2 = w2.buildings[i2];
          // ta sama budowla (klucz), ta sama klasa: poziomy takie same
          if (b1.tags['zm:klucz'] && b1.tags['zm:klucz'] === b2.tags['zm:klucz'] && b1.cls === b2.cls)
            expect(b2.levels).toBe(b1.levels);
        }
      }
    });
  }

  it('w sumie sprawdzono sporo par kafelków przez szwy, w tym domy (zielonki)', () => {
    expect(wszystkie).toBeGreaterThan(100);
    expect(domyPrzeciete).toBeGreaterThan(0);
    // zdarza się, że dom nie awansuje u siebie, a własna decyzja z klucza kazałaby awansować: dom wygrywa (wypisane)
    console.log(
      `  par kafelków przez szew z domem ${wszystkie}, domów od 60 m² ${domyPrzeciete}, domu bez awansu mimo klucza ${awansowaneKtoreInaczej}`,
    );
  });

  it('poza szwem z domem poziomy domów wynikają z klucza budynku i danych', () => {
    const a = ADDRESSES[2];
    const uklad = ukladTestowy(a);
    const geoDomu = geoDomuTestowego(a);
    const swiatDomu = buildWorld(geoDomu, { seed, pietra: true });
    const bez = buildKwadrat(geoKwadratuTestowego(a, -1, 0), { seed, uklad, sx: -1, sy: 0 });
    const z = buildKwadrat(geoKwadratuTestowego(a, -1, 0), {
      seed,
      uklad,
      sx: -1,
      sy: 0,
      pietra: true,
      dom: swiatDomu,
    });
    const zDomem = budynkiZDomem(swiatDomu, z, -1, 0);
    let domy = 0;
    for (const b of z.buildings) {
      if (zDomem.has(b.id)) continue;
      const przed = bez.buildings[b.id];
      expect(b.cls).toBe(przed.cls);
      const awans = b.cls === 'dom' && b.area >= DOM_MIN_POLE && przed.levels === 1;
      if (awans) domy++;
      expect(b.levels).toBe(awans && domAwansuje(seed, b.tags['zm:klucz']) ? 2 : przed.levels);
    }
    expect(domy).toBeGreaterThan(50);
  });
});
