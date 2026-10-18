import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Atlas, atlasy, DIRS, type OpisGrafiki, WYJSCIE } from '../../tools/atlasy.ts';
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

  it('trzepak: stopy w wierszu pod najniższym pikselem', () => {
    const t = opis.trzepak;
    const a = obraz(t.plik);
    let dol = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (px(a, x, y)[3]) dol = y + 1;
    expect(t.stopy).toBe(dol);
  });

  it('ludzie: 24 postacie po 5 wersji (oryginał i rampy palety) w 8 kierunkach, stopy na tej samej linii', () => {
    const l = opis.ludzie;
    const a = obraz(l.plik);
    const pal = json<{ rampy: Record<string, string[]> }>('assets/palette.json');
    expect(l.kierunki).toEqual(DIRS);
    expect(l.wersje).toEqual(['oryginał', ...Object.keys(pal.rampy)]);
    expect(l.postacie).toHaveLength(24);
    expect([a.w, a.h]).toEqual([l.klatka * l.kierunki.length * l.wersje.length, l.klatka * l.postacie.length]);
    l.postacie.forEach((p, c) => {
      // pod stopami w każdej wersji i kierunku już nic, a w wierszu stóp coś stoi przynajmniej w jednym kierunku
      for (let v = 0; v < l.wersje.length; v++)
        for (let d = 0; d < l.kierunki.length; d++) {
          const x0 = (v * l.kierunki.length + d) * l.klatka;
          for (let y = p.stopy; y < l.klatka; y++)
            for (let x = 0; x < l.klatka; x++) expect(px(a, x0 + x, c * l.klatka + y)[3], `${p.id} ${v} ${d}`).toBe(0);
        }
      let stoi = false;
      for (let x = 0; x < l.klatka * l.kierunki.length; x++) if (px(a, x, c * l.klatka + p.stopy - 1)[3]) stoi = true;
      expect(stoi, p.id).toBe(true);
    });
  });

  it('przemalowanie zmienia tylko ubranie: twarz i obrys zostają, wersje różnią się kolorem kurtki', () => {
    const l = opis.ludzie;
    const a = obraz(l.plik);
    const k = l.kierunki.length * l.klatka;
    let rozne = 0;
    for (let y = 0; y < l.klatka; y++)
      for (let x = 0; x < l.klatka; x++) {
        const o = px(a, x, y);
        const v = px(a, k + x, y);
        expect(v[3]).toBe(o[3]);
        if (o.join() !== v.join()) rozne++;
      }
    expect(rozne).toBeGreaterThan(40);
  });
});
