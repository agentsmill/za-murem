import { describe, expect, it } from 'vitest';
import type { AnyCanvas } from '../../src/render/art/canvas.ts';
import { drawChunk } from '../../src/render/art/chunkArt.ts';
import { rgba } from '../../src/render/art/palette.ts';
import type { GrafikaKawalkow } from '../../src/render/art/pixellab.ts';
import { buildScene, CHUNK, type ChunkScene, chunkSceneOf, type Scene } from '../../src/render/art/scene.ts';
import { type Strop, stropKolor } from '../../src/render/art/strop.ts';
import { drawInteriorTile, type InteriorTile, interiorColor } from '../../src/render/art/wnetrze.ts';
import { applyScenePatch, scenePatchOf } from '../../src/render/chunks.ts';
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

/* Rysowanie kawałków w trybie piętra (drawChunk z sc.pietro >= 1 i sc.pietra). Świat demo Lanciego, scena bez grafiki
   z PixelLab (art: null, wszystko z kodu), obraz kawałka z bliska: 32 px na kafelek, więc piksel (ox, oy) kafelka
   (x, y) leży w punkcie świata (x * 32 + ox, y * 32 + oy). */

/** skrót FNV-1a z pikseli obrazu kawałka */
function skrot(px: Uint32Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** atrapa płótna dla drawChunk (jak w grafika-rysowanie.test.ts): zapamiętuje tylko obraz z putImageData, a detale
    rysowane ścieżkami (maszynownie, kominy, anteny, cienie drzew) pomija */
function plotno(): { canvas: AnyCanvas; px: () => Uint32Array; prostokaty: () => number } {
  let img: Uint32Array = new Uint32Array(0);
  let prostokaty = 0;
  const nic = () => {};
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (d: { data: Uint8ClampedArray }) => {
      img = new Uint32Array(d.data.buffer.slice(0));
    },
    save: nic,
    restore: nic,
    scale: nic,
    translate: nic,
    fillRect: () => {
      prostokaty++;
    },
    beginPath: nic,
    moveTo: nic,
    ellipse: nic,
    fill: nic,
    drawImage: nic,
    fillStyle: '',
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as AnyCanvas;
  return { canvas, px: () => img, prostokaty: () => prostokaty };
}

/** Skróty obrazu kawałka (5, 6) Lanciego bez zmian w drawChunk, policzone na kodzie sprzed trybu piętra, ze sceną
    siedziby (sc.section = sectionOf) w przekroju (cut = true) i bez niego. Pilnują, że poza piętrem nic się nie
    zmieniło: jeśli rysowanie kawałków zmieni się celowo, policz je na nowo. */
const BAZA_CUT = '0c78df09';
const BAZA_BEZ_CUT = '43f11543';

type Kawalek = readonly [number, number];
/** siedziba (blok 5, cztery kondygnacje) obok bloku 9 (siedem) */
const SIEDZIBA: Kawalek = [5, 6];
/** dużo domów i sklepów parterowych obok wysokich bloków */
const PARTEROWE: Kawalek = [5, 8];
/** sklep z dwiema kondygnacjami obok wyższych budynków */
const DWUPIETROWE: Kawalek = [4, 5];
/** osiem domów z trzema kondygnacjami i nic wyższego w zasięgu detali */
const DOMY: Kawalek = [0, 8];
const SIDE = CHUNK * 32;
const MIEJSCA: readonly (readonly [number, number])[] = [
  [0, 0],
  [3, 4],
  [16, 16],
  [29, 30],
  [31, 31],
];

let pamiecGry: Scene | null = null;
/** scena gry Lanciego bez grafiki, z siedzibą w przekroju; do rysowania bierze się jej kopie */
function scenaGry(): Scene {
  if (!pamiecGry) {
    const w = demoSwiat('lanciego', false);
    pamiecGry = buildScene(w);
    pamiecGry.section = sectionOf(w);
  }
  return pamiecGry;
}

/** kopia sceny gry w danym piętrze (0: bez piętra) i ze sceną piętra (domyślnie typowe piętro mapy) */
function naPietrze(
  pietro: number,
  pietra: SectionScene | null = scena().sec,
  art: GrafikaKawalkow | null = null,
): Scene {
  return { ...scenaGry(), pietro, pietra, art };
}

/** obraz kawałka z bliska */
function obraz(sc: ChunkScene, [cx, cy]: Kawalek, cut: boolean): Uint32Array {
  const p = plotno();
  drawChunk(sc, cx, cy, 32, p.canvas, cut);
  return p.px();
}

/** ile prostokątów detali (maszynownie, kominy, daszki wejść) rysuje kawałek poza obrazem pikseli */
function prostokaty(sc: ChunkScene, [cx, cy]: Kawalek, cut: boolean): number {
  const p = plotno();
  drawChunk(sc, cx, cy, 32, p.canvas, cut);
  return p.prostokaty();
}

/** kafelki świata w kawałku */
function kafelkiKawalka([cx, cy]: Kawalek, size: number): { x: number; y: number; i: number }[] {
  const out: { x: number; y: number; i: number }[] = [];
  for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++)
    for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) out.push({ x, y, i: y * size + x });
  return out;
}

/** piksel (ox, oy) kafelka świata (x, y) w obrazie kawałka k */
function pikselKafelka(img: Uint32Array, [cx, cy]: Kawalek, x: number, y: number, ox: number, oy: number): number {
  return img[((y - cy * CHUNK) * 32 + oy) * SIDE + (x - cx * CHUNK) * 32 + ox];
}

/** czy kafelek (x, y) wygląda w obu obrazach kawałka tak samo w każdym pikselu */
function takiSam(a: Uint32Array, b: Uint32Array, k: Kawalek, x: number, y: number): boolean {
  for (let oy = 0; oy < 32; oy++)
    for (let ox = 0; ox < 32; ox++)
      if (pikselKafelka(a, k, x, y, ox, oy) !== pikselKafelka(b, k, x, y, ox, oy)) return false;
  return true;
}

describe('kawałek w trybie piętra: strop i klatka', () => {
  const { sec: pietra, size } = scena();
  const sc = () => scenaGry();

  /** kafelki posadzki piętra w budynkach o więcej niż dwóch kondygnacjach w kawałku k, z opisem kafelka */
  const posadzki = (k: Kawalek) =>
    kafelkiKawalka(k, size).flatMap(({ x, y, i }) => {
      const bid = sc().w.bid[i];
      if (bid < 0 || sc().styles[bid].levels <= 2 || pietra.cell[i] !== IN.FLOOR) return [];
      return [{ x, y, i, d: describeTile(pietra, i, size, FACADE)! }];
    });

  it('strop nad mieszkaniem: piksele kafelka to stropKolor grafiki zastępczej we współrzędnych świata', () => {
    const img = obraz(naPietrze(2), SIEDZIBA, true);
    let nadMieszkaniem = 0;
    let sprawdzone = 0;
    for (const { x, y, i, d } of posadzki(SIEDZIBA)) {
      if (d.kind !== 'strop') continue;
      if (pietra.room[i] >= 0) nadMieszkaniem++;
      for (const [ox, oy] of MIEJSCA) {
        expect(pikselKafelka(img, SIEDZIBA, x, y, ox, oy), `${x},${y} ${ox},${oy}`).toBe(
          rgba(stropKolor(null, x * 32 + ox, y * 32 + oy)),
        );
        sprawdzone++;
      }
    }
    expect(nadMieszkaniem).toBeGreaterThan(50);
    expect(sprawdzone).toBeGreaterThan(250);
  });

  it('strop bierze naklejki z grafiki sceny (sc.art.strop), a nie tylko tło z kodu', () => {
    // naklejka na cały kafelek (32 px), lewa połowa czerwona, prawa przezroczysta; gestosc 1: każdy kafelek ją ma
    const px = new Uint32Array(32 * 32);
    for (let oy = 0; oy < 32; oy++) for (let ox = 0; ox < 16; ox++) px[oy * 32 + ox] = 0xff0000ff;
    const strop: Strop = { img: { w: 32, h: 32, px }, naklejka: 32, naklejek: 1, gestosc: 1 };
    const art: GrafikaKawalkow = { teren: null, blok: null, dach: null, strop };
    const img = obraz(naPietrze(2, pietra, art), SIEDZIBA, true);
    let naklejki = 0;
    for (const { x, y, d } of posadzki(SIEDZIBA)) {
      if (d.kind !== 'strop') continue;
      for (const [ox, oy] of MIEJSCA) {
        expect(pikselKafelka(img, SIEDZIBA, x, y, ox, oy), `${x},${y} ${ox},${oy}`).toBe(
          rgba(stropKolor(strop, x * 32 + ox, y * 32 + oy)),
        );
      }
      // lewa połowa kafelka ma kolor naklejki, czyli inny niż strop z samego kodu
      expect(pikselKafelka(img, SIEDZIBA, x, y, 3, 4)).toBe(rgba(0xff0000));
      naklejki++;
    }
    expect(naklejki).toBeGreaterThan(50);
  });

  it('klatka widoczna: posadzka klatki rysuje się jak w przekroju, nie jako strop', () => {
    const img = obraz(naPietrze(2), SIEDZIBA, true);
    let klatki = 0;
    let innyNizStrop = 0;
    for (const { x, y, d } of posadzki(SIEDZIBA)) {
      if (d.kind === 'strop') continue;
      expect(d).toMatchObject({ kind: 'floor', room: 'klatka' });
      let inny = false;
      for (const [ox, oy] of MIEJSCA) {
        const kolor = pikselKafelka(img, SIEDZIBA, x, y, ox, oy);
        expect(kolor, `${x},${y} ${ox},${oy}`).toBe(rgba(interiorColor(d, x, y, ox, oy, pietra.seed)));
        if (kolor !== rgba(stropKolor(null, x * 32 + ox, y * 32 + oy))) inny = true;
      }
      klatki++;
      if (inny) innyNizStrop++;
    }
    expect(klatki).toBeGreaterThan(10);
    expect(innyNizStrop).toBe(klatki);
  });

  it('schody i ściany też są z piętra: ten sam kolor co interiorColor kafelka sceny piętra', () => {
    const img = obraz(naPietrze(2), SIEDZIBA, true);
    const rodzaje = new Set<string>();
    for (const { x, y, i } of kafelkiKawalka(SIEDZIBA, size)) {
      const bid = sc().w.bid[i];
      if (bid < 0 || sc().styles[bid].levels <= 2 || pietra.cell[i] === IN.NONE) continue;
      const d = describeTile(pietra, i, size, sc().styles[bid].wall)!;
      if (d.kind === 'strop') continue;
      rodzaje.add(d.kind);
      for (const [ox, oy] of MIEJSCA)
        expect(pikselKafelka(img, SIEDZIBA, x, y, ox, oy), `${x},${y} ${ox},${oy}`).toBe(
          rgba(interiorColor(d, x, y, ox, oy, pietra.seed)),
        );
    }
    expect(rodzaje.has('wall')).toBe(true);
    expect(rodzaje.has('door')).toBe(true);
  });
});

describe('kawałek w trybie piętra: budynki niższe niż piętro', () => {
  const { sec: pietra, size } = scena();

  /** budynek jest niższy albo równy piętru: rysuje się jak bez przekroju, czyli dachem */
  const porownaj = (k: Kawalek, pietro: number) => {
    const sc = scenaGry();
    const a = obraz(naPietrze(pietro), k, true);
    const bez = obraz(naPietrze(0), k, false);
    const wynik = { niskie: 0, niskieInne: 0, wysokie: 0, wysokieInne: 0, teren: 0, terenInny: 0 };
    for (const { x, y, i } of kafelkiKawalka(k, size)) {
      const bid = sc.w.bid[i];
      const inne = !takiSam(a, bez, k, x, y);
      if (bid < 0) {
        wynik.teren++;
        if (inne) wynik.terenInny++;
      } else if (sc.styles[bid].levels > pietro && pietra.cell[i] !== IN.NONE) {
        wynik.wysokie++;
        if (inne) wynik.wysokieInne++;
      } else {
        wynik.niskie++;
        if (inne) wynik.niskieInne++;
      }
    }
    return wynik;
  };

  it('budynek niższy niż piętro ma dach jak bez piętra, teren też, a wyższy ma wnętrze', () => {
    const r = porownaj(PARTEROWE, 2);
    // dużo domów i sklepów parterowych w kawałku i dużo kafelków wyższych budynków
    expect(r.niskie).toBeGreaterThan(100);
    expect(r.wysokie).toBeGreaterThan(100);
    expect(r.niskieInne).toBe(0);
    expect(r.terenInny).toBe(0);
    expect(r.wysokieInne).toBe(r.wysokie);
  });

  it('budynek o tylu kondygnacjach co piętro ma dach, a piętro niżej już wnętrze', () => {
    const wyzszeNiz2 = porownaj(DWUPIETROWE, 2);
    expect(wyzszeNiz2.niskie).toBeGreaterThan(30);
    expect(wyzszeNiz2.niskieInne).toBe(0);
    const pietroPierwsze = porownaj(DWUPIETROWE, 1);
    // przy pierwszym piętrze sklep z dwiema kondygnacjami też ma wnętrze, więc "niskie" są tu tylko parterowe
    expect(pietroPierwsze.wysokie).toBeGreaterThan(wyzszeNiz2.wysokie + 30);
    expect(pietroPierwsze.wysokieInne).toBe(pietroPierwsze.wysokie);
    expect(pietroPierwsze.niskieInne).toBe(0);
  });
});

describe('kawałek w trybie piętra: budynek wyższy niż limit stylu fasady', () => {
  it('17 kondygnacji na Przymorzu: piętro 16 ma wnętrze zamiast dachu, jak każde piętro z listy', () => {
    // styleOf tnie levels do 16 (wysokość fasady), a lista pięter sięga do levels - 1, czyli do piętra 16
    const w = demoSwiat('przymorze', false);
    const b = w.buildings.find((q) => q.levels > 16)!;
    const pietra = sectionPietra(w)!;
    const bazowa = buildScene(w);
    expect(bazowa.styles[b.id].levels).toBe(16);
    const k: Kawalek = [Math.floor(b.x0 / CHUNK), Math.floor((b.y0 + b.y1) / 2 / CHUNK)];
    const a = obraz({ ...bazowa, pietro: 16, pietra, art: null }, k, true);
    const bez = obraz({ ...bazowa, pietro: 0, pietra: null, art: null }, k, false);
    let inne = 0;
    for (const { x, y, i } of kafelkiKawalka(k, w.size))
      if (w.bid[i] === b.id && pietra.cell[i] !== IN.NONE && !takiSam(a, bez, k, x, y)) inne++;
    expect(inne).toBeGreaterThan(50);
  });
});

describe('detale dachów w trybie piętra', () => {
  it('kominy domów znikają tylko tam, gdzie dom ma to piętro: trzy kondygnacje na 2, dach na 3', () => {
    const sc = scenaGry();
    const domy = sc.w.buildings.filter(
      (b) =>
        b.cls === 'dom' &&
        sc.styles[b.id].levels === 3 &&
        b.x1 >= DOMY[0] * CHUNK - 8 &&
        b.x0 <= (DOMY[0] + 1) * CHUNK + 8 &&
        b.y1 >= DOMY[1] * CHUNK - 8 &&
        b.y0 <= (DOMY[1] + 1) * CHUNK + 8,
    ).length;
    expect(domy).toBeGreaterThanOrEqual(8);
    const bez = prostokaty(naPietrze(0), DOMY, false);
    const pietro2 = prostokaty(naPietrze(2), DOMY, true);
    const pietro3 = prostokaty(naPietrze(3), DOMY, true);
    // otwarty dom nie ma komina (co najmniej jeden prostokąt mniej na dom), a dom bez tego piętra rysuje komin jak zawsze
    expect(bez - pietro2).toBeGreaterThanOrEqual(domy);
    expect(pietro3).toBe(bez);
  });
});

describe('kawałek siedziby: piętro 0 i powrót na parter', () => {
  const { sec: pietra } = scena();

  it('skróty wyjściowe: przekrój siedziby i kawałek bez przekroju jak przed trybem piętra, sama scena piętra nic nie zmienia', () => {
    expect(skrot(obraz(naPietrze(0, null), SIEDZIBA, true))).toBe(BAZA_CUT);
    expect(skrot(obraz(naPietrze(0, null), SIEDZIBA, false))).toBe(BAZA_BEZ_CUT);
    expect(skrot(obraz(naPietrze(0, pietra), SIEDZIBA, true))).toBe(BAZA_CUT);
    expect(skrot(obraz(naPietrze(0, pietra), SIEDZIBA, false))).toBe(BAZA_BEZ_CUT);
  });

  it('piętro bez przekroju (cut = false) albo bez sceny piętra nie zmienia obrazu', () => {
    expect(skrot(obraz(naPietrze(2, pietra), SIEDZIBA, false))).toBe(BAZA_BEZ_CUT);
    expect(skrot(obraz(naPietrze(2, null), SIEDZIBA, true))).toBe(BAZA_CUT);
  });

  it('piętro 2 ma inny obraz niż przekrój siedziby i niż kawałek bez przekroju', () => {
    const s = skrot(obraz(naPietrze(2), SIEDZIBA, true));
    expect(s).not.toBe(BAZA_CUT);
    expect(s).not.toBe(BAZA_BEZ_CUT);
    // typowe piętro jest to samo na każdym piętrze, które budynek ma: siedziba (cztery kondygnacje) na trzecim wygląda
    // jak na drugim, a na czwartym ma już dach, więc obraz kawałka się zmienia (blok 9 ma jeszcze wnętrze)
    expect(skrot(obraz(naPietrze(3), SIEDZIBA, true))).toBe(s);
    expect(skrot(obraz(naPietrze(4), SIEDZIBA, true))).not.toBe(s);
  });

  it('powrót na 0 przywraca obraz piksel w piksel', () => {
    const sc = naPietrze(0);
    expect(skrot(obraz(sc, SIEDZIBA, true))).toBe(BAZA_CUT);
    sc.pietro = 2;
    expect(skrot(obraz(sc, SIEDZIBA, true))).not.toBe(BAZA_CUT);
    sc.pietro = 0;
    expect(skrot(obraz(sc, SIEDZIBA, true))).toBe(BAZA_CUT);
    expect(skrot(obraz(sc, SIEDZIBA, false))).toBe(BAZA_BEZ_CUT);
  });
});

describe('łatka sceny z piętrem', () => {
  const { sec: pietra } = scena();

  it('scenePatchOf niesie piętro i scenę piętra tylko wtedy, gdy zmiana je podaje', () => {
    const sc = scenaGry();
    const p = scenePatchOf(sc, { pietro: 2, pietra });
    expect(p.pietro).toBe(2);
    expect(p.pietra).toBe(pietra);
    // powrót na parter: samo piętro, bez ponownego wysyłania całej sceny
    const wroc = scenePatchOf(sc, { pietro: 0 });
    expect(wroc.pietro).toBe(0);
    expect('pietra' in wroc).toBe(false);
    // zwykła zmiana terenu nie rusza piętra
    const teren = scenePatchOf(sc, { tiles: [] });
    expect('pietro' in teren).toBe(false);
    expect('pietra' in teren).toBe(false);
  });

  it('applyScenePatch ustawia oba pola na kopii sceny i kopia rysuje to samo co główny wątek', () => {
    const gra = scenaGry();
    const kopia = structuredClone(chunkSceneOf(gra));
    expect(kopia.pietro).toBe(0);
    expect(kopia.pietra).toBeNull();
    expect(skrot(obraz(kopia, SIEDZIBA, true))).toBe(BAZA_CUT);

    applyScenePatch(kopia, structuredClone(scenePatchOf(gra, { pietro: 2, pietra })));
    expect(kopia.pietro).toBe(2);
    expect(kopia.pietra).toEqual(pietra);
    const zPietrem = skrot(obraz(naPietrze(2), SIEDZIBA, true));
    expect(zPietrem).not.toBe(BAZA_CUT);
    expect(skrot(obraz(kopia, SIEDZIBA, true))).toBe(zPietrem);

    // zmiana terenu z łatki nie rusza piętra, powrót na 0 oddaje przekrój siedziby
    applyScenePatch(kopia, scenePatchOf(gra, { tiles: [] }));
    expect(kopia.pietro).toBe(2);
    expect(kopia.pietra).toEqual(pietra);
    applyScenePatch(kopia, scenePatchOf(gra, { pietro: 0 }));
    expect(kopia.pietro).toBe(0);
    expect(kopia.pietra).toEqual(pietra);
    expect(skrot(obraz(kopia, SIEDZIBA, true))).toBe(BAZA_CUT);
    expect(skrot(obraz(kopia, SIEDZIBA, false))).toBe(BAZA_BEZ_CUT);
  });
});
