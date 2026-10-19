import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOOKI } from '../../src/render/art/lookBudynku.ts';
import { ASSET_LOOKA, type Atlas, atlasy, type OpisGrafiki, WYJSCIE } from '../../tools/atlasy.ts';
import { decodePng } from '../../tools/png.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const json = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;

interface Manifest {
  zarzad: string[];
  mieszkancy: string[];
  assety: {
    id: string;
    status: string;
    wybrany?: string;
    moduly?: {
      attyka: [number, number, number, number];
      fasada: { y: number; gora: number; pietro: [number, number]; dol: [number, number] };
      przesla: [number, number];
      przeslaPasow?: { gora?: number; pietro?: number; dol?: number };
      wejscie: [number, number];
      wejsciePasow?: { gora?: number; pietro?: number; dol?: number };
      drzwi: number;
      tlo?: string | string[];
      dach?: 'papa' | [number, number, number, number];
      ozdoba?: {
        prostokat: [number, number, number, number];
        os: number;
        podstawa: number;
        kotwica: string;
        polozenie?: string;
        tlo?: string | string[];
        zalew?: 'obraz' | 'prostokat';
      };
    };
  }[];
}

const wynik = atlasy();
const opis = wynik.get('grafika.json') as OpisGrafiki;
const obraz = (nazwa: string) => wynik.get(nazwa) as Atlas;
const px = (a: Atlas, x: number, y: number) => {
  const i = (y * a.w + x) * 4;
  return [a.rgba[i], a.rgba[i + 1], a.rgba[i + 2], a.rgba[i + 3]];
};

describe('atlasy grafiki z PixelLab (tools/atlasy.ts)', () => {
  it('public/assets ma te same piksele i opis co świeżo złożone z assets/raw (po zmianie: npm run atlasy)', () => {
    for (const [nazwa, dane] of wynik) {
      const plik = path.join(ROOT, WYJSCIE, nazwa);
      expect(fs.existsSync(plik), `${WYJSCIE}/${nazwa}`).toBe(true);
      if (nazwa.endsWith('.json')) expect(json(`${WYJSCIE}/${nazwa}`)).toEqual(dane);
      else {
        const a = dane as Atlas;
        const b = decodePng(fs.readFileSync(plik));
        expect([b.width, b.height], nazwa).toEqual([a.w, a.h]);
        expect(Buffer.from(b.rgba).equals(Buffer.from(a.rgba)), `piksele ${nazwa}`).toBe(true);
      }
    }
    const nadmiar = fs.readdirSync(path.join(ROOT, WYJSCIE)).filter((f) => !wynik.has(f));
    expect(nadmiar, 'pliki w public/assets spoza skryptu').toEqual([]);
  });

  it('biorą tylko assety zatwierdzone w manifeście', () => {
    const m = json<Manifest>('assets/manifest.json');
    const status = new Map(m.assety.map((a) => [a.id, a.status]));
    const uzyte = [
      opis.teren.id,
      opis.blok.id,
      opis.dach.id,
      opis.trzepak.id,
      ...Object.values(opis.budynki.typy).map((t) => t.id),
      ...opis.ludzie.postacie.map((p) => p.id),
    ];
    for (const id of uzyte) expect(status.get(id), id).toBe('zatwierdzony');
    // obsada w kolejności z manifestu: najpierw zarząd
    expect(opis.ludzie.postacie.map((p) => p.id)).toEqual([...m.zarzad, ...m.mieszkancy]);
    expect(opis.ludzie.postacie.filter((p) => p.zarzad).map((p) => p.id)).toEqual(m.zarzad);
  });

  it('kafelki Wanga leżą w kolejności narożników NW NE SW SE (1 = trawnik)', () => {
    interface Kafel {
      corners: Record<'NW' | 'NE' | 'SW' | 'SE', 'upper' | 'lower'>;
      bounding_box: { x: number; y: number };
    }
    const meta = json<{ tileset_data: { tiles: Kafel[] } }>('assets/raw/kotwica-chodnik-trawa/metadata.json');
    const src = decodePng(fs.readFileSync(path.join(ROOT, 'assets/raw/kotwica-chodnik-trawa/tileset.png')));
    const t = obraz(opis.teren.plik);
    expect([t.w, t.h]).toEqual([128, 128]);
    const numery = new Set<number>();
    for (const k of meta.tileset_data.tiles) {
      const c = k.corners;
      const n = (['NW', 'NE', 'SW', 'SE'] as const).reduce((s, q) => s * 2 + (c[q] === 'upper' ? 1 : 0), 0);
      numery.add(n);
      for (const [x, y] of [
        [0, 0],
        [31, 0],
        [7, 19],
        [31, 31],
      ]) {
        const i = ((k.bounding_box.y + y) * src.width + k.bounding_box.x + x) * 4;
        expect(px(t, (n % 4) * 32 + x, (n >> 2) * 32 + y), `kafelek ${n}`).toEqual([...src.rgba.subarray(i, i + 4)]);
      }
    }
    expect(numery.size).toBe(16);
  });

  it('blok: moduły z wybranego kawałka, piętro 13 px, attyka i wejście z drzwiami', () => {
    const b = opis.blok;
    const a = obraz(b.plik);
    expect(b.srodek[1]).toBe(13);
    expect(b.gora[0] + b.gora[1]).toBe(b.srodek[0]);
    expect(b.srodek[0] + b.srodek[1]).toBe(b.dol[0]);
    expect(b.dol[0] + b.dol[1]).toBe(a.h);
    expect(b.drzwi).toBeGreaterThan(0);
    expect(b.drzwi).toBeLessThan(b.wejscie[1]);
    // pełny pas: z kawałka bloku (assets/raw, prostokąty w manifeście) ten sam piksel w tym samym miejscu
    const src = decodePng(fs.readFileSync(path.join(ROOT, 'assets/raw/kotwica-blok/1.png')));
    const at = (x: number, y: number) => {
      const i = (y * src.width + x) * 4;
      return [...src.rgba.subarray(i, i + 4)];
    };
    // dolny wiersz parteru pod drzwiami: x wejścia 32 + drzwi 23 w pliku, wiersz 103 + 18
    expect(px(a, b.wejscie[0] + b.drzwi, b.dol[0] + b.dol[1] - 1)).toEqual(at(32 + 23, 103 + 18));
    // środkowe piętro z wiersza 77, przęsło od x 67
    expect(px(a, b.przesla[0] + 5, b.srodek[0] + 4)).toEqual(at(67 + 5, 77 + 4));
    // profil attyki z kolumny 80, od wiersza 8
    for (let e = 0; e < b.attyka[1]; e++) expect(px(a, b.attyka[0], e)).toEqual(at(80, 8 + e));
  });

  it('naklejki dachu bez tła papy, które zostaje przezroczyste', () => {
    const d = opis.dach;
    const a = obraz(d.plik);
    expect([a.w, a.h]).toEqual([d.naklejka * d.naklejek, d.naklejka]);
    const tlo = Number.parseInt(d.tlo.slice(1), 16);
    let widac = 0;
    for (let i = 0; i < a.rgba.length; i += 4) {
      if (!a.rgba[i + 3]) continue;
      widac++;
      expect((a.rgba[i] << 16) | (a.rgba[i + 1] << 8) | a.rgba[i + 2]).not.toBe(tlo);
    }
    expect(widac).toBeGreaterThan(0);
    expect(d.gestosc).toBeGreaterThan(0);
  });

  it('trzepak: stopy w wierszu pod najniższym pikselem', () => {
    const t = opis.trzepak;
    const a = obraz(t.plik);
    let dol = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (px(a, x, y)[3]) dol = y + 1;
    expect(t.stopy).toBe(dol);
  });
});

describe('budynki publiczne i zabytkowe (budynki.png)', () => {
  const m = json<Manifest>('assets/manifest.json');
  const zrodlo = (id: string) => {
    const a = m.assety.find((q) => q.id === id);
    if (!a?.moduly || !a.wybrany) throw new Error(`${id}: brak modułów w manifeście`);
    return { M: a.moduly, src: decodePng(fs.readFileSync(path.join(ROOT, a.wybrany))) };
  };
  const at = (src: { width: number; rgba: Uint8Array }, x: number, y: number) => {
    const i = (y * src.width + x) * 4;
    return [...src.rgba.subarray(i, i + 4)];
  };
  const atlas = obraz(opis.budynki.plik);

  it('każdy z 11 wyglądów ma zatwierdzony asset z modułami w manifeście', () => {
    expect(Object.keys(opis.budynki.typy).sort()).toEqual([...LOOKI].sort());
    for (const look of LOOKI) {
      expect(opis.budynki.typy[look].id).toBe(ASSET_LOOKA[look]);
      expect(m.assety.find((a) => a.id === ASSET_LOOKA[look])?.moduly, look).toBeDefined();
    }
  });

  it('prostokąty leżą w atlasie i nie nachodzą na siebie, a atlas mieści się w teksturze telefonu', () => {
    expect(Math.max(atlas.w, atlas.h)).toBeLessThanOrEqual(4096);
    const prostokaty: { nazwa: string; r: number[] }[] = [];
    for (const look of LOOKI) {
      const t = opis.budynki.typy[look];
      prostokaty.push({ nazwa: `${look} fasada`, r: t.fasada });
      if (t.dach) prostokaty.push({ nazwa: `${look} dach`, r: t.dach });
      if (t.ozdoba) prostokaty.push({ nazwa: `${look} ozdoba`, r: t.ozdoba.prostokat });
    }
    for (const { nazwa, r } of prostokaty) {
      expect(r[0], nazwa).toBeGreaterThanOrEqual(0);
      expect(r[1], nazwa).toBeGreaterThanOrEqual(0);
      expect(r[0] + r[2], nazwa).toBeLessThanOrEqual(atlas.w);
      expect(r[1] + r[3], nazwa).toBeLessThanOrEqual(atlas.h);
    }
    for (let i = 0; i < prostokaty.length; i++)
      for (let j = i + 1; j < prostokaty.length; j++) {
        const a = prostokaty[i].r;
        const b = prostokaty[j].r;
        const nachodza = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
        expect(nachodza, `${prostokaty[i].nazwa} z ${prostokaty[j].nazwa}`).toBe(false);
      }
  });

  it('żaden plik w public/assets nie przekracza tekstury 4096 px (telefony)', () => {
    for (const nazwa of fs.readdirSync(path.join(ROOT, WYJSCIE)).filter((f) => f.endsWith('.png'))) {
      const d = decodePng(fs.readFileSync(path.join(ROOT, WYJSCIE, nazwa)));
      expect(Math.max(d.width, d.height), nazwa).toBeLessThanOrEqual(4096);
    }
  });

  for (const look of LOOKI) {
    it(`${look}: fasada z modułów wybranego kawałka (piętra, przęsło, wejście z drzwiami, profil krawędzi)`, () => {
      const t = opis.budynki.typy[look];
      const { M, src } = zrodlo(t.id);
      const [fx, fy] = t.fasada;
      // wiersze: gzyms z górnym piętrem, środkowe piętro i parter pod sobą, bez dziur
      expect(t.gora).toEqual([0, M.fasada.gora]);
      expect(t.srodek).toEqual([M.fasada.gora, M.fasada.pietro[1]]);
      expect(t.dol).toEqual([M.fasada.gora + M.fasada.pietro[1], M.fasada.dol[1]]);
      expect(t.dol[0] + t.dol[1]).toBeLessThanOrEqual(t.fasada[3]);
      // kolumny: wejście, potem przęsła, potem jedna kolumna profilu
      expect(t.wejscie).toEqual([0, M.wejscie[1]]);
      expect(t.przesla).toEqual([M.wejscie[1], M.przesla[1]]);
      expect(t.attyka).toEqual([M.wejscie[1] + M.przesla[1], M.attyka[3]]);
      expect(t.fasada[2]).toBe(M.wejscie[1] + M.przesla[1] + 1);
      expect(t.drzwi).toBeGreaterThanOrEqual(0);
      expect(t.drzwi).toBeLessThan(t.wejscie[1]);
      // piksele z pliku PixelLab, w miejscach policzonych z manifestu (nie z kodu składającego)
      const wejDol = M.wejsciePasow?.dol ?? M.fasada.dol[0];
      expect(px(atlas, fx + t.wejscie[0] + t.drzwi, fy + t.dol[0] + t.dol[1] - 1), 'parter pod drzwiami').toEqual(
        at(src, M.wejscie[0] + M.drzwi, wejDol + M.fasada.dol[1] - 1),
      );
      const przPietro = M.przeslaPasow?.pietro ?? M.przesla[0];
      expect(px(atlas, fx + t.przesla[0] + 2, fy + t.srodek[0] + 3), 'przęsło środkowego piętra').toEqual(
        at(src, przPietro + 2, M.fasada.pietro[0] + 3),
      );
      const przGora = M.przeslaPasow?.gora ?? M.przesla[0];
      expect(px(atlas, fx + t.przesla[0] + 1, fy + 1), 'przęsło gzymsu').toEqual(at(src, przGora + 1, M.fasada.y + 1));
      for (let e = 0; e < t.attyka[1]; e++)
        expect(px(atlas, fx + t.attyka[0], fy + e), `profil, piksel ${e}`).toEqual(
          at(src, M.attyka[0], M.attyka[1] + e),
        );
    });

    it(`${look}: dach (próbka albo papa) i ozdoba z przezroczystym tłem`, () => {
      const t = opis.budynki.typy[look];
      const { M, src } = zrodlo(t.id);
      if (M.dach && M.dach !== 'papa') {
        expect(t.dach).not.toBeNull();
        expect(t.dach?.slice(2)).toEqual(M.dach.slice(2));
        const [dx, dy] = t.dach as number[];
        expect(px(atlas, dx + 3, dy + 4)).toEqual(at(src, M.dach[0] + 3, M.dach[1] + 4));
      } else expect(t.dach).toBeNull();
      if (!M.ozdoba) {
        expect(t.ozdoba).toBeNull();
        return;
      }
      const o = t.ozdoba;
      if (!o) throw new Error(`${look}: brak ozdoby w opisie`);
      const [ox, oy, ow, oh] = o.prostokat;
      expect([ow, oh]).toEqual(M.ozdoba.prostokat.slice(2));
      expect([o.ax, o.ay]).toEqual([M.ozdoba.os - M.ozdoba.prostokat[0], M.ozdoba.podstawa - M.ozdoba.prostokat[1]]);
      expect(o.kotwica).toBe(M.ozdoba.kotwica);
      expect(o.polozenie).toBe(M.ozdoba.polozenie ?? 'wejscie');
      // coś zostało i coś zniknęło (tło wycięte), a to, co zostało, ma kolor z pliku
      let widac = 0;
      let znikl = 0;
      for (let y = 0; y < oh; y++)
        for (let x = 0; x < ow; x++) {
          const p = px(atlas, ox + x, oy + y);
          if (p[3]) {
            widac++;
            expect(p).toEqual(at(src, M.ozdoba.prostokat[0] + x, M.ozdoba.prostokat[1] + y));
          } else znikl++;
        }
      expect(widac).toBeGreaterThan(ow * oh * 0.1);
      expect(znikl).toBeGreaterThan(ow * oh * 0.05);
      // zalew od brzegu prostokąta zaczyna od kolorów tła na jego brzegu: górne rogi o kolorze tła znikają
      if (M.ozdoba.zalew === 'prostokat') {
        const tla = [(M.ozdoba.tlo ?? M.tlo) as string | string[]].flat().map((c) => Number.parseInt(c.slice(1), 16));
        for (const [x, y] of [
          [0, 0],
          [ow - 1, 0],
        ]) {
          const [r, g, b] = at(src, M.ozdoba.prostokat[0] + x, M.ozdoba.prostokat[1] + y);
          if (tla.includes((r << 16) | (g << 8) | b)) expect(px(atlas, ox + x, oy + y)[3], `róg ${x},${y}`).toBe(0);
        }
      }
    });
  }
});
