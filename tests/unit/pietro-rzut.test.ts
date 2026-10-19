import { describe, expect, it } from 'vitest';
import { sectionPietra } from '../../src/render/pietro.ts';
import type { SectionScene } from '../../src/render/section.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import { buildInterior, IN } from '../../src/world/interior.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { demoSwiat } from './pietra-pomoc.ts';

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

/** brzeg obrysu budynku id policzony ze współrzędnych: któryś z czterech sąsiadów poza budynkiem albo poza mapą */
function naBrzegu(w: World, i: number, id: number): boolean {
  const x = i % w.size;
  const y = (i - x) / w.size;
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w.size || ny >= w.size || w.bid[ny * w.size + nx] !== id) return true;
  }
  return false;
}

/** kafelki budynku id */
function kafelki(w: World, id: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.bid.length; i++) if (w.bid[i] === id) out.push(i);
  return out;
}

const pamiec = new Map<string, SectionScene | null>();
/** scena świata demo (przymorze liczy się chwilę, więc raz na klucz i flagę) */
function scena(key: 'przymorze' | 'lanciego' | 'zielonki', pietra: boolean): SectionScene | null {
  const klucz = `${key}:${pietra}`;
  if (!pamiec.has(klucz)) pamiec.set(klucz, sectionPietra(demoSwiat(key, pietra)));
  return pamiec.get(klucz) ?? null;
}

describe('scena typowego piętra', () => {
  it('null dla świata bez budynków z dwiema kondygnacjami', () => {
    const w = demoSwiat('zielonki', false);
    expect(w.buildings.some((b) => b.levels >= 2)).toBe(false);
    expect(sectionPietra(w)).toBeNull();
  });

  it('kształt sceny: tablice na całą mapę, otwarte to budynki od dwóch kondygnacji, bez wejść i świateł', () => {
    const w = demoSwiat('lanciego', false);
    const s = scena('lanciego', false)!;
    expect(s.cell).toHaveLength(w.size * w.size);
    expect(s.room).toHaveLength(w.size * w.size);
    expect(s.building).toBe(-1);
    expect(s.pietro).toBe(true);
    expect(s.seed).toBe(w.seed | 0);
    expect(s.entrances.size).toBe(0);
    expect(s.lit.size).toBe(0);
    expect(s.damage).toBeUndefined();
    expect(s.why).toBeUndefined();
    expect(s.roomApt).toBeUndefined();
    const wysokie = w.buildings.filter((b) => b.levels >= 2).map((b) => b.id);
    expect(wysokie).toContain(w.hq);
    expect([...(s.otwarte ?? [])].sort((a, b) => a - b)).toEqual(wysokie);
    // poza obrysem tych budynków pusto
    for (let i = 0; i < w.bid.length; i++)
      if (!s.otwarte!.has(w.bid[i])) {
        expect(s.cell[i]).toBe(IN.NONE);
        expect(s.room[i]).toBe(-1);
      }
  });

  it('szkielet piętra bloku jest taki sam jak parteru', () => {
    const w = demoSwiat('lanciego', false);
    const s = scena('lanciego', false)!;
    expect(w.buildings[w.hq].levels).toBeGreaterThanOrEqual(2);
    const parter = buildInterior(w, w.hq);
    const roznice: number[] = [];
    const tiles = kafelki(w, w.hq);
    for (const i of tiles) if (s.cell[i] !== parter.cell[i]) roznice.push(i);
    expect(tiles.length).toBeGreaterThan(0);
    expect(roznice.length).toBeGreaterThan(0);
    // różnice to wyłącznie drzwi na brzegu obrysu, które na piętrze są ścianą
    for (const i of roznice) {
      expect(parter.cell[i]).toBe(IN.DOOR);
      expect(naBrzegu(w, i, w.hq)).toBe(true);
      expect(s.cell[i]).toBe(IN.WALL);
    }
    // i odwrotnie: każde drzwi brzegowe parteru się zamieniły
    const brzegowe = parter.doors.filter((i) => naBrzegu(w, i, w.hq));
    expect(roznice).toEqual(brzegowe);
  });

  it.each(['przymorze', 'lanciego', 'zielonki'] as const)(
    'siedziba z home i bez home ma ten sam szkielet (%s)',
    (key) => {
      const w = demoSwiat(key, false);
      const bez = buildInterior(w, w.hq);
      expect(Buffer.compare(Buffer.from(w.interior.cell), Buffer.from(bez.cell))).toBe(0);
    },
  );

  it.each(['przymorze', 'lanciego'] as const)('drzwi zewnętrzne to okna (%s)', (key) => {
    const w = demoSwiat(key, false);
    const s = scena(key, false)!;
    let zamienione = 0;
    for (const id of s.otwarte!) {
      const it = buildInterior(w, id);
      for (const i of it.doors)
        if (naBrzegu(w, i, id)) {
          zamienione++;
          expect(s.cell[i]).toBe(IN.WALL);
          expect(s.windows.has(i)).toBe(true);
        }
      // okna z wnętrza zostają oknami
      for (const i of it.windows) expect(s.windows.has(i)).toBe(true);
    }
    expect(zamienione).toBeGreaterThan(0);
    // żadne drzwi w scenie nie leżą przy zewnętrznej stronie budynku
    let drzwi = 0;
    for (let i = 0; i < s.cell.length; i++)
      if (s.cell[i] === IN.DOOR) {
        drzwi++;
        expect(naBrzegu(w, i, w.bid[i])).toBe(false);
      }
    expect(drzwi).toBeGreaterThan(0);
  });

  it('dom: ściany działowe zostają', () => {
    const w = demoSwiat('zielonki', true);
    const s = scena('zielonki', true)!;
    // prawdziwy dom z kilkoma pomieszczeniami, nie wąski ułamek obrysu na brzegu mapy (ten ma jedno pomieszczenie)
    const dom = w.buildings.find((b) => b.cls === 'dom' && b.levels >= 2 && buildInterior(w, b.id).rooms.length >= 3);
    expect(dom).toBeDefined();
    let dzialowe = 0;
    const kindy = new Set<string>();
    for (const i of kafelki(w, dom!.id)) {
      if (s.cell[i] === IN.WALL && !naBrzegu(w, i, dom!.id)) dzialowe++;
      if (s.room[i] >= 0) kindy.add(s.kinds[s.room[i]]);
    }
    expect(dzialowe).toBeGreaterThan(0);
    expect(kindy.size).toBeGreaterThan(0);
    expect(kindy.has('klatka')).toBe(false);
  });

  it('dom: na piętrze kuchnia z parteru to sypialnia, łazienka i przedpokój zostają, a bloki mają rodzaje jak parter', () => {
    // Lanciego z flagą: 16 domów z trzema kondygnacjami z danych i bloki
    const w = demoSwiat('lanciego', true);
    const s = scena('lanciego', true)!;
    const domy = new Set<string>();
    let kuchnieParteruDomow = 0;
    let kuchnieBlokow = 0;
    let base = 0;
    // numery pomieszczeń rosną po budynkach od dwóch kondygnacji w kolejności świata (sectionPietra)
    for (const b of w.buildings.filter((q) => q.levels >= 2)) {
      const parter = buildInterior(w, b.id);
      for (const r of parter.rooms) {
        const naPietrze = s.kinds[base + r.id];
        if (b.cls === 'dom') {
          domy.add(naPietrze);
          if (r.kind === 'kuchnia') {
            kuchnieParteruDomow++;
            expect(naPietrze).toBe('pokoj');
          } else expect(naPietrze).toBe(r.kind);
        } else {
          if (b.cls === 'blok' && r.kind === 'kuchnia') kuchnieBlokow++;
          expect(naPietrze).toBe(r.kind);
        }
      }
      base += parter.rooms.length;
    }
    expect(s.kinds).toHaveLength(base);
    // test niczego by nie sprawdzał bez kuchni w domach parteru i w blokach
    expect(kuchnieParteruDomow).toBeGreaterThan(0);
    expect(kuchnieBlokow).toBeGreaterThan(0);
    // dom na piętrze: pokoje (z kuchni też), łazienki i przedpokoje, bez kuchni i klatki
    expect(domy.has('kuchnia')).toBe(false);
    expect(domy.has('klatka')).toBe(false);
    expect(domy.has('pokoj')).toBe(true);
    expect(domy.has('lazienka')).toBe(true);
    expect(domy.has('przedpokoj')).toBe(true);
  });

  it('budynek inny niż blok i dom nie ma ścian działowych', () => {
    const g: Geo = {
      c: [0, 0],
      b: [
        // siedziba pod adresem (jedna kondygnacja, więc w scenie jej nie ma); sklep z dwiema kondygnacjami obok
        { p: rect(-4, -4, 8, 8), t: { building: 'house', 'building:levels': '1' } },
        { p: rect(14, -6, 24, 12), t: { building: 'retail', 'building:levels': '2' } },
      ],
      r: [
        {
          l: [
            [-80, 12],
            [80, 12],
          ],
          h: 'residential',
        },
      ],
      a: [],
      w: [],
      poi: [],
    };
    const w = buildWorld(g, { seed: 11, size: 128 });
    const sklep = w.buildings.find((b) => b.levels >= 2)!;
    expect(sklep.cls).not.toBe('blok');
    expect(sklep.cls).not.toBe('dom');
    const s = sectionPietra(w)!;
    expect([...s.otwarte!]).toEqual([sklep.id]);
    // parter ma ściany działowe i drzwi we wnętrzu, inaczej test niczego by nie sprawdzał
    const parter = buildInterior(w, sklep.id);
    const tiles = kafelki(w, sklep.id);
    expect(tiles.some((i) => parter.cell[i] === IN.WALL && !naBrzegu(w, i, sklep.id))).toBe(true);
    expect(tiles.some((i) => parter.cell[i] === IN.DOOR && !naBrzegu(w, i, sklep.id))).toBe(true);
    let brzegowe = 0;
    let posadzki = 0;
    for (const i of tiles) {
      const c = s.cell[i];
      if (naBrzegu(w, i, sklep.id)) {
        expect(c).not.toBe(IN.DOOR);
        if (c === IN.WALL) brzegowe++;
      } else {
        expect(c === IN.WALL || c === IN.DOOR).toBe(false);
        if (c === IN.FLOOR) posadzki++;
      }
    }
    expect(brzegowe).toBeGreaterThan(0);
    expect(posadzki).toBeGreaterThan(0);
    // ściana działowa zamieniona na posadzkę nie należy do żadnego pomieszczenia
    for (const i of tiles)
      if (parter.cell[i] === IN.WALL && !naBrzegu(w, i, sklep.id)) {
        expect(s.cell[i]).toBe(IN.FLOOR);
        expect(s.room[i]).toBe(-1);
      }
  });

  it('deterministyczna', () => {
    const w = demoSwiat('lanciego', false);
    const a = sectionPietra(w)!;
    const b = sectionPietra(w)!;
    expect(Buffer.compare(Buffer.from(a.cell), Buffer.from(b.cell))).toBe(0);
    expect(Buffer.compare(Buffer.from(a.room.buffer), Buffer.from(b.room.buffer))).toBe(0);
    expect(b.kinds).toEqual(a.kinds);
    expect([...b.windows]).toEqual([...a.windows]);
  });

  it('numery pomieszczeń nie nachodzą na siebie', () => {
    const w = demoSwiat('przymorze', false);
    const s = scena('przymorze', false)!;
    const ids = [...s.otwarte!].sort((a, b) => a - b);
    expect(ids.length).toBeGreaterThan(10);
    const uzyte = new Map<number, Set<number>>(ids.map((id) => [id, new Set()]));
    for (let i = 0; i < w.bid.length; i++) if (s.room[i] >= 0) uzyte.get(w.bid[i])!.add(s.room[i]);
    // każdy budynek dostaje przedział numerów od sumy pomieszczeń poprzednich: [base, base + liczba pomieszczeń)
    let base = 0;
    let zPomieszczeniami = 0;
    const wszystkie = new Set<number>();
    for (const id of ids) {
      const parter = buildInterior(w, id);
      for (const r of uzyte.get(id)!) {
        expect(r).toBeGreaterThanOrEqual(base);
        expect(r).toBeLessThan(base + parter.rooms.length);
        expect(wszystkie.has(r)).toBe(false);
        wszystkie.add(r);
      }
      for (const r of parter.rooms) expect(s.kinds[base + r.id]).toBe(r.kind);
      if (uzyte.get(id)!.size) zPomieszczeniami++;
      base += parter.rooms.length;
    }
    // wąskie ułamki obrysu na brzegu mapy to sama ściana, bez pomieszczeń; reszta ma je wszystkie
    expect(zPomieszczeniami).toBeGreaterThan(ids.length / 2);
    expect(s.kinds).toHaveLength(base);
  });
});
