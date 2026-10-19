import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Atlas, atlasy, type OpisGrafiki, WYJSCIE } from '../../tools/atlasy.ts';
import { decodePng } from '../../tools/png.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const json = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;

interface Manifest {
  zarzad: string[];
  mieszkancy: string[];
  assety: { id: string; status: string }[];
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
      opis.strop.id,
      opis.trzepak.id,
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

  it('naklejki stropu: wnętrza kafelków strop-tynk w komórkach 32 × 32, bez koloru klucza (przezroczystego)', () => {
    const m = json<{ assety: { id: string; uzycie?: Record<string, unknown> }[] }>('assets/manifest.json');
    const u = m.assety.find((a) => a.id === opis.strop.id)!.uzycie as {
      klucz: string;
      naklejki: number[];
      wnetrze_wariantu: Record<string, [number, number, number, number]>;
      gestosc: number;
    };
    const s = opis.strop;
    const a = obraz(s.plik);
    expect(fs.existsSync(path.join(ROOT, WYJSCIE, s.plik)), `${WYJSCIE}/${s.plik}`).toBe(true);
    expect([a.w, a.h]).toEqual([s.naklejka * s.naklejek, s.naklejka]);
    expect(s.naklejek).toBe(u.naklejki.length);
    expect(s.gestosc).toBe(u.gestosc);
    const klucz = Number.parseInt(u.klucz.slice(1), 16);
    const dir = path.join(ROOT, 'assets/raw/strop-tynk');
    u.naklejki.forEach((n, i) => {
      const plik = fs.readdirSync(dir).find((f) => f.endsWith(`_${n}.png`))!;
      const src = decodePng(fs.readFileSync(path.join(dir, plik)));
      const [wx, wy, ww, wh] = u.wnetrze_wariantu[n];
      let widac = 0;
      for (let y = 0; y < s.naklejka; y++)
        for (let x = 0; x < s.naklejka; x++) {
          const p = px(a, i * s.naklejka + x, y);
          const w = x < ww && y < wh;
          const j = ((wy + y) * src.width + wx + x) * 4;
          const z = w ? [...src.rgba.subarray(j, j + 4)] : null;
          const jestKlucz = z !== null && ((z[0] << 16) | (z[1] << 8) | z[2]) === klucz;
          // piksel jest widoczny tylko we wnętrzu wariantu (od lewego górnego rogu komórki) i nie w kolorze klucza
          if (z === null || jestKlucz) expect(p[3], `naklejka ${n} (${x}, ${y})`).toBe(0);
          else {
            expect(p, `naklejka ${n} (${x}, ${y})`).toEqual(z);
            widac++;
          }
        }
      expect(widac, `naklejka ${n} ma widoczne piksele`).toBeGreaterThan(0);
    });
  });

  it('trzepak: stopy w wierszu pod najniższym pikselem', () => {
    const t = opis.trzepak;
    const a = obraz(t.plik);
    let dol = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (px(a, x, y)[3]) dol = y + 1;
    expect(t.stopy).toBe(dol);
  });
});
