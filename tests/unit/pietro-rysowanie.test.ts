import { describe, expect, it } from 'vitest';
import { rgba } from '../../src/render/art/palette.ts';
import { stropKolor } from '../../src/render/art/strop.ts';
import { drawInteriorTile, type InteriorTile, interiorColor } from '../../src/render/art/wnetrze.ts';
import { sectionPietra } from '../../src/render/pietro.ts';
import { describeTile, IN, type SectionScene, sectionOf } from '../../src/render/section.ts';
import { demoSwiat } from './pietra-pomoc.ts';

const FACADE = 0xaabbcc;

let pamiec: { sec: SectionScene; size: number } | null = null;
/** scena typowego piętra świata demo Lanciego (budowana raz) i rozmiar mapy */
function scena(): { sec: SectionScene; size: number } {
  if (!pamiec) {
    const w = demoSwiat('lanciego', false);
    pamiec = { sec: sectionPietra(w)!, size: w.size };
  }
  return pamiec;
}

/** indeksy kafelków sceny z komórką danego rodzaju */
function kafelki(sec: SectionScene, cell: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sec.cell.length; i++) if (sec.cell[i] === cell) out.push(i);
  return out;
}

describe('opis kafelka na piętrze (describeTile ze sceną typowego piętra)', () => {
  it('kafelek mieszkania to strop, klatki to posadzka', () => {
    const { sec, size } = scena();
    let strop = 0;
    let klatka = 0;
    let bezPomieszczenia = 0;
    for (const i of kafelki(sec, IN.FLOOR)) {
      const d = describeTile(sec, i, size, FACADE);
      const rodzaj = sec.room[i] >= 0 ? sec.kinds[sec.room[i]] : null;
      if (rodzaj === 'klatka') {
        expect(d).toMatchObject({ kind: 'floor', room: 'klatka' });
        klatka++;
      } else {
        expect(d?.kind).toBe('strop');
        strop++;
        if (rodzaj === null) bezPomieszczenia++;
      }
    }
    // scena Lanciego ma i mieszkania, i klatki, i posadzkę bez pomieszczenia (piętro sklepu albo szkoły)
    expect(strop).toBeGreaterThan(0);
    expect(klatka).toBeGreaterThan(0);
    expect(bezPomieszczenia).toBeGreaterThan(0);
  });

  it('strop dostaje maskę ścian taką samą jak posadzka tego kafelka w zwykłym przekroju', () => {
    const { sec, size } = scena();
    const { pietro: _pietro, ...zwykla } = sec;
    let zeScianami = 0;
    for (const i of kafelki(sec, IN.FLOOR)) {
      const d = describeTile(sec, i, size, FACADE);
      if (d?.kind !== 'strop') continue;
      const posadzka = describeTile(zwykla, i, size, FACADE);
      expect(posadzka?.kind).toBe('floor');
      expect(d.walls).toBe((posadzka as Extract<InteriorTile, { kind: 'floor' }>).walls);
      if (d.walls) zeScianami++;
    }
    expect(zeScianami).toBeGreaterThan(0);
  });

  it('drzwi we wnętrzu są zamknięte i nie są wejściem', () => {
    const { sec, size } = scena();
    const drzwi = kafelki(sec, IN.DOOR);
    expect(drzwi.length).toBeGreaterThan(0);
    for (const i of drzwi) {
      const d = describeTile(sec, i, size, FACADE);
      expect(d?.kind).toBe('door');
      expect(d).toMatchObject({ closed: true, entrance: false });
    }
  });

  it('schody zostają', () => {
    const { sec, size } = scena();
    const schody = kafelki(sec, IN.STAIRS);
    expect(schody.length).toBeGreaterThan(0);
    for (const i of schody) expect(describeTile(sec, i, size, FACADE)?.kind).toBe('stairs');
  });

  it('reszta kafelków (ściany, okna, schody, klatka) jak w zwykłym przekroju, drzwi tylko zamknięte', () => {
    const { sec, size } = scena();
    const { pietro: _pietro, ...zwykla } = sec;
    const rodzaje = new Set<string>();
    for (let i = 0; i < sec.cell.length; i++) {
      const d = describeTile(sec, i, size, FACADE);
      const przekroj = describeTile(zwykla, i, size, FACADE);
      if (!d || !przekroj) {
        expect(d).toBe(przekroj);
        continue;
      }
      if (d.kind === 'strop') continue;
      rodzaje.add(d.kind);
      if (d.kind === 'door') expect(d).toEqual({ ...przekroj, closed: true, entrance: false });
      else expect(d).toEqual(przekroj);
    }
    expect([...rodzaje].sort()).toEqual(['door', 'floor', 'stairs', 'wall', 'window']);
  });

  it('bez flagi pietro describeTile działa jak dziś: bez stropu i bez zamkniętych drzwi', () => {
    const w = demoSwiat('lanciego', false);
    const sec = sectionOf(w);
    expect(sec.pietro).toBeUndefined();
    const rodzaje = new Set<string>();
    for (let i = 0; i < sec.cell.length; i++) {
      const d = describeTile(sec, i, w.size, FACADE);
      if (!d) continue;
      rodzaje.add(d.kind);
      expect(d.kind).not.toBe('strop');
      expect(Object.keys(d)).not.toContain('closed');
    }
    // dowód, że sprawdzono i posadzki, i drzwi
    expect(rodzaje.has('floor')).toBe(true);
    expect(rodzaje.has('door')).toBe(true);
  });
});

describe('rysowanie stropu i zamkniętych drzwi', () => {
  /** piksele kafelka w kolejnych współrzędnych świata (13, 21) i z ziarnem 7 */
  const piksele = (t: InteriorTile): Uint32Array => {
    const a = new Uint32Array(32 * 32);
    drawInteriorTile(a, 32, 0, 0, t, 13, 21, 7);
    return a;
  };
  /** ułamek pikseli, którymi różnią się dwa kafelki, w całym kafelku albo tylko tam, gdzie where(x, y) */
  const roznica = (a: Uint32Array, b: Uint32Array, where: (x: number, y: number) => boolean = () => true): number => {
    let ile = 0;
    let razem = 0;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        if (!where(x, y)) continue;
        razem++;
        if (a[y * 32 + x] !== b[y * 32 + x]) ile++;
      }
    return ile / razem;
  };

  it('zamknięte drzwi wyglądają inaczej niż otwarte, a poziome inaczej niż pionowe', () => {
    const otwarte = (vertical: boolean) => piksele({ kind: 'door', vertical, face: 'pokoj' });
    const zamkniete = (vertical: boolean) => piksele({ kind: 'door', vertical, face: 'pokoj', closed: true });
    for (const vertical of [false, true]) {
      expect(roznica(otwarte(vertical), zamkniete(vertical))).toBeGreaterThanOrEqual(0.2);
    }
    expect(roznica(zamkniete(false), zamkniete(true))).toBeGreaterThanOrEqual(0.2);
    // bez zamknięcia drzwi rysują się jak zawsze
    for (const vertical of [false, true]) {
      const dawne = otwarte(vertical);
      const jawnie = piksele({ kind: 'door', vertical, face: 'pokoj', closed: false });
      expect(roznica(dawne, jawnie)).toBe(0);
    }
  });

  it('zamknięte drzwi zamykają przejście: próg znika, front i ościeża zostają', () => {
    const otwarte = piksele({ kind: 'door', vertical: false, face: 'pokoj' });
    const zamkniete = piksele({ kind: 'door', vertical: false, face: 'pokoj', closed: true });
    // przejście między ościeżami (nad frontem) wypełnia skrzydło zamiast progu
    expect(roznica(otwarte, zamkniete, (x, y) => x >= 4 && x <= 27 && y <= 17)).toBeGreaterThan(0.9);
    // front ściany i kawałki ściany po bokach przejścia są te same
    expect(roznica(otwarte, zamkniete, (x, y) => y >= 20 || x <= 2 || x >= 29)).toBe(0);
  });

  it('strop i zamknięte drzwi: te same argumenty dają te same piksele, nigdy kolor błędu ani przezroczystość', () => {
    const warianty: InteriorTile[] = [{ kind: 'strop' }, { kind: 'strop', walls: 0xff }];
    for (const vertical of [false, true])
      for (const entrance of [false, true])
        for (const face of ['pokoj', 'klatka', 'out'] as const)
          warianty.push({ kind: 'door', vertical, entrance, face, facade: 0x887766, closed: true });
    for (const t of warianty) {
      const a = piksele(t);
      expect(piksele(t)).toEqual(a);
      expect(a.includes(rgba(0xff00ff)), JSON.stringify(t)).toBe(false);
      expect(
        a.every((v) => v >>> 24 === 255),
        JSON.stringify(t),
      ).toBe(true);
    }
  });

  it('kolor stropu z interiorColor to stropKolor(null, ...) we współrzędnych świata', () => {
    const miejsca: [number, number, number, number][] = [
      [0, 0, 0, 0],
      [3, 5, 31, 31],
      [13, 21, 7, 19],
      [96, 64, 0, 0],
      [200, 150, 17, 2],
    ];
    for (const [tx, ty, px, py] of miejsca)
      for (const t of [{ kind: 'strop' }, { kind: 'strop', walls: 0xff }] as const)
        expect(interiorColor(t, tx, ty, px, py, 7)).toBe(stropKolor(null, tx * 32 + px, ty * 32 + py));
  });
});
