import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atlasWersji, mapaPrzemalowania, type OpisGrafiki, przemalujKlatki } from '../../src/render/art/pixellab.ts';
import { type Atlas, atlasy, PRACE, PRACE_MIESZKANCOW } from '../../tools/atlasy.ts';
import { KIERUNKI_PL, kotwicaKlatki, przytnij, stopyWzgledne } from '../../tools/ludzie.ts';
import { dociagnijDoPalety } from '../../tools/paleta.ts';
import { decodePng } from '../../tools/png.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const json = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
const { kolory, rampy } = json<{ kolory: string[]; rampy: Record<string, string[]> }>('assets/palette.json');
const manifest = json<{ zarzad: string[]; mieszkancy: string[] }>('assets/manifest.json');

const wynik = atlasy();
const opis = wynik.get('grafika.json') as OpisGrafiki;
const atlas = wynik.get(opis.ludzie.plik) as Atlas;

/** klatka źródłowa po palecie: animacja postaci w kierunku PixelLab */
function zrodlo(id: string, nazwa: string, kierunek: string): { w: number; h: number; rgba: Uint8Array }[] {
  const dir = path.join(ROOT, 'assets/raw', id, 'Idle/animations', nazwa, kierunek);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => {
      const d = decodePng(fs.readFileSync(path.join(dir, f)));
      return { w: d.width, h: d.height, rgba: dociagnijDoPalety(d.rgba, kolory) };
    });
}

const postac = (id: string) => opis.ludzie.postacie.find((p) => p.id === id)!;

/** statyczna postać od południa po palecie (z niej kotwica stóp) */
function statyczna(id: string) {
  const d = decodePng(fs.readFileSync(path.join(ROOT, 'assets/raw', id, 'paleta/south.png')));
  return { w: d.width, h: d.height, rgba: d.rgba };
}

describe('atlas animacji ludzi z PixelLab (public/assets/ludzie.png)', () => {
  it('klatka w atlasie to przycięta sylwetka klatki źródłowej po palecie, z kotwicą stóp na tym samym wierszu', () => {
    const id = 'kotwica-emeryt';
    for (const nazwa of ['chod', 'stanie'])
      for (let d = 0; d < 4; d++) {
        const kl = postac(id).animacje[nazwa].kierunki[d];
        expect(Array.isArray(kl), `${nazwa} ${KIERUNKI_PL[d]}`).toBe(true);
        const zr = zrodlo(id, nazwa, KIERUNKI_PL[d]);
        // kotwica stóp: stopy statycznej postaci przeniesione na środek płótna klatki
        const rel = stopyWzgledne(statyczna(id));
        (kl as number[][]).forEach((k, i) => {
          const [x, y, w, h, ax, ay] = k;
          const p = przytnij(zr[i]);
          expect([w, h], `${nazwa} ${KIERUNKI_PL[d]} klatka ${i}`).toEqual([p.w, p.h]);
          expect(ax).toBe(Math.floor(zr[i].w / 2) - p.x);
          expect(ay).toBe(kotwicaKlatki(rel, zr[i].h, p.y));
          for (let r = 0; r < h; r++)
            for (let c = 0; c < w; c++) {
              const a = ((y + r) * atlas.w + x + c) * 4;
              const b = (r * w + c) * 4;
              expect([...atlas.rgba.subarray(a, a + 4)]).toEqual([...p.rgba.subarray(b, b + 4)]);
            }
        });
      }
  });

  it('stopy w klatkach rąbania leżą w tym samym miejscu, choć siekiera wbija się pod nie, a klęczenie stoi dolną krawędzią', () => {
    const id = 'kotwica-emeryt';
    const rel = stopyWzgledne(statyczna(id));
    for (const d of [0, 1, 2]) {
      const zr = zrodlo(id, 'rabanie-px', KIERUNKI_PL[d]).slice(-4);
      const kl = postac(id).animacje.rabanie.kierunki[d] as number[][];
      kl.forEach((k, i) => {
        const p = przytnij(zr[i]);
        // wiersz stóp w płótnie 68 jest ten sam w każdej klatce, także tej z siekierą w ziemi (najniższy piksel 67)
        expect(k[5] + p.y, `rąbanie ${KIERUNKI_PL[d]} klatka ${i}`).toBe(rel + 34);
      });
    }
    for (let d = 0; d < 4; d++)
      for (const k of postac(id).animacje.klekanie.kierunki[d] as number[][]) expect(k[5], `klękanie ${d}`).toBe(k[3]);
  });

  it('klatki nie nakładają się na siebie i mieszczą się w atlasie (najwyżej 4096 px na telefonach)', () => {
    expect(atlas.w).toBeLessThanOrEqual(4096);
    expect(atlas.h).toBeLessThanOrEqual(4096);
    const prost: [number, number, number, number][] = [];
    for (const p of opis.ludzie.postacie)
      for (const a of Object.values(p.animacje))
        for (const kl of a.kierunki) if (Array.isArray(kl)) for (const k of kl) prost.push([k[0], k[1], k[2], k[3]]);
    expect(prost.length).toBeGreaterThan(100);
    const zajete = new Uint8Array(atlas.w * atlas.h);
    for (const [x, y, w, h] of prost) {
      expect(x + w).toBeLessThanOrEqual(atlas.w);
      expect(y + h).toBeLessThanOrEqual(atlas.h);
      for (let r = y; r < y + h; r++)
        for (let c = x; c < x + w; c++) {
          expect(zajete[r * atlas.w + c], `nakładanie w ${c},${r}`).toBe(0);
          zajete[r * atlas.w + c] = 1;
        }
    }
  });

  it('zarząd ma wszystkie prace z gry w czterech kierunkach (wschód własny albo odbity zachód), mieszkańcy tylko chód i stanie', () => {
    for (const p of opis.ludzie.postacie) {
      const klucze = p.zarzad ? Object.keys(PRACE) : PRACE_MIESZKANCOW;
      expect(Object.keys(p.animacje).sort(), p.id).toEqual([...klucze].sort());
      for (const k of klucze) {
        const kier = p.animacje[k].kierunki;
        expect(kier, `${p.id} ${k}`).toHaveLength(4);
        for (const d of [0, 1, 2]) expect(Array.isArray(kier[d]), `${p.id} ${k} kierunek ${d}`).toBe(true);
        // wschód: własne klatki albo odbicie zachodu (numer 2); tyle samo klatek w każdym kierunku
        expect(Array.isArray(kier[3]) || kier[3] === 2, `${p.id} ${k} wschód`).toBe(true);
        const n = (kier[0] as unknown[]).length;
        for (const d of [1, 2, 3]) if (Array.isArray(kier[d])) expect(kier[d], `${p.id} ${k} ${d}`).toHaveLength(n);
      }
    }
  });

  it('klatki mieszkańców leżą razem w swoim pasie wierszy, klatki zarządu w drugim, pod nim', () => {
    const { mieszkancy, zarzad } = opis.ludzie.regiony;
    expect(mieszkancy[0]).toBe(0);
    expect(mieszkancy[1]).toBeLessThanOrEqual(zarzad[0]);
    expect(zarzad[1]).toBeLessThanOrEqual(atlas.h);
    for (const p of opis.ludzie.postacie)
      for (const a of Object.values(p.animacje))
        for (const kl of a.kierunki)
          if (Array.isArray(kl))
            for (const [, y, , h] of kl) {
              const [od, do_] = p.zarzad ? zarzad : mieszkancy;
              expect(y, p.id).toBeGreaterThanOrEqual(od);
              expect(y + h, p.id).toBeLessThanOrEqual(do_);
            }
  });

  it('chód i stanie mają cztery własne kierunki po cztery klatki, a ubranie do przemalowania kolory z palety', () => {
    expect(opis.ludzie.postacie).toHaveLength(24);
    for (const p of opis.ludzie.postacie)
      for (const nazwa of ['chod', 'stanie']) {
        const kier = p.animacje[nazwa]?.kierunki;
        expect(kier, `${p.id} ${nazwa}`).toHaveLength(4);
        for (const k of kier) expect((k as number[][]).length, `${p.id} ${nazwa}`).toBe(4);
      }
    // ochroniarz ma czarny strój w kolorze obrysu, więc nie ma ubrania do przemalowania; reszta ma
    expect(opis.ludzie.postacie.filter((p) => p.przemalowanie.kolory.length === 0).map((p) => p.id)).toEqual([
      'kotwica-ochroniarz',
    ]);
    for (const p of opis.ludzie.postacie) {
      for (const c of p.przemalowanie.kolory) expect(kolory, p.id).toContain(c);
    }
    expect(Object.keys(opis.ludzie.rampy)).toEqual(Object.keys(rampy));
  });

  it('płeć i przedział wieku z manifestu; zarząd ma po dwie postaci każdej płci i ich przedziały się nie dotykają', () => {
    for (const p of opis.ludzie.postacie) {
      expect(['m', 'k'], p.id).toContain(p.plec);
      expect(p.wiek[0], p.id).toBeLessThanOrEqual(p.wiek[1]);
    }
    for (const plec of ['m', 'k']) {
      const dwie = opis.ludzie.postacie
        .filter((p) => p.zarzad && p.plec === plec)
        .sort((a, b) => a.wiek[0] - b.wiek[0]);
      expect(
        dwie.map((p) => p.id),
        plec,
      ).toHaveLength(2);
      expect(dwie[0].wiek[1], plec).toBeLessThan(dwie[1].wiek[0]);
    }
  });

  it('zarząd i mieszkańcy w kolejności z manifestu, zarząd z flagą', () => {
    expect(opis.ludzie.postacie.map((p) => p.id)).toEqual([...manifest.zarzad, ...manifest.mieszkancy]);
    expect(opis.ludzie.postacie.filter((p) => p.zarzad).map((p) => p.id)).toEqual(manifest.zarzad);
  });
});

describe('przemalowanie ubrań w locie (pixellab.ts)', () => {
  const emeryt = postac('kotwica-emeryt');
  const rampa = rampy.zieleń;
  const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
  const rgb = (p: number) => ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff);

  it('najciemniejszy kolor ubrania idzie na pierwszy kolor rampy, następny na drugi, nadmiar na ostatni', () => {
    const mapa = mapaPrzemalowania(['#b07a55', '#463324', '#765e42', '#5f5a3a', '#7a4a2e'], rampa);
    expect([...mapa].map(([a, b]) => [hex(a), hex(b)])).toEqual([
      ['#463324', rampa[0]],
      ['#7a4a2e', rampa[1]],
      ['#5f5a3a', rampa[2]],
      ['#765e42', rampa[3]],
      ['#b07a55', rampa[3]],
    ]);
    expect(mapaPrzemalowania([], rampa).size).toBe(0);
  });

  it('zmienia tylko piksele w kolorach ubrania na kolory rampy w podanych klatkach, a alfa i reszta atlasu zostają', () => {
    const klatki = emeryt.animacje.chod.kierunki[0] as number[][];
    const kopia = new Uint32Array(atlas.rgba.buffer.slice(0));
    const mapa = mapaPrzemalowania(emeryt.przemalowanie.kolory, rampa);
    przemalujKlatki(kopia, atlas.w, klatki as never, mapa);
    const przed = new Uint32Array(atlas.rgba.buffer);
    let zmienione = 0;
    const wKlatkach = new Set<number>();
    for (const [x, y, w, h] of klatki)
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
          const i = (y + r) * atlas.w + x + c;
          wKlatkach.add(i);
          if (przed[i] === kopia[i]) continue;
          zmienione++;
          expect(emeryt.przemalowanie.kolory, 'stary kolor ubrania').toContain(hex(rgb(przed[i])));
          expect(rampa, 'nowy kolor z rampy').toContain(hex(rgb(kopia[i])));
        }
    expect(zmienione).toBeGreaterThan(100);
    // alfa wszędzie bez zmian, a piksele poza klatkami tej animacji nietknięte
    for (let i = 0; i < przed.length; i++) {
      expect(przed[i] >>> 24).toBe(kopia[i] >>> 24);
      if (!wKlatkach.has(i)) expect(kopia[i]).toBe(przed[i]);
    }
  });

  it('kolor ubrania jest przemalowany tak samo w każdej pozie: klatki klękania i rąbania też dostają ten sam kolor', () => {
    const kopia = new Uint32Array(atlas.rgba.buffer.slice(0));
    const mapa = mapaPrzemalowania(emeryt.przemalowanie.kolory, rampa);
    for (const klucz of ['klekanie', 'rabanie', 'siedzenie'])
      for (const kier of emeryt.animacje[klucz].kierunki)
        if (Array.isArray(kier)) przemalujKlatki(kopia, atlas.w, kier as never, mapa);
    const przed = new Uint32Array(atlas.rgba.buffer);
    for (const klucz of ['klekanie', 'rabanie', 'siedzenie']) {
      let zmienione = 0;
      for (const kier of emeryt.animacje[klucz].kierunki)
        if (Array.isArray(kier))
          for (const [x, y, w, h] of kier as number[][])
            for (let r = 0; r < h; r++)
              for (let c = 0; c < w; c++)
                if (przed[(y + r) * atlas.w + x + c] !== kopia[(y + r) * atlas.w + x + c]) zmienione++;
      expect(zmienione, klucz).toBeGreaterThan(50);
    }
  });
});

describe('atlas przemalowanej wersji (pixellab.ts)', () => {
  const px = new Uint32Array(atlas.rgba.buffer.slice(0));
  const rampa = rampy.zieleń;
  const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
  const rgb = (p: number) => ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff);

  it('to kopia pasa wierszy: ten sam rozmiar, alfa bez zmian, a ubrania mieszkańców dostają kolory rampy', () => {
    const { mieszkancy } = opis.ludzie.regiony;
    const postacie = opis.ludzie.postacie.filter((p) => !p.zarzad);
    const w = atlasWersji(px, atlas.w, mieszkancy, postacie, rampa);
    expect(w).toHaveLength((mieszkancy[1] - mieszkancy[0]) * atlas.w);
    let zmienione = 0;
    for (let i = 0; i < w.length; i++) {
      const przed = px[mieszkancy[0] * atlas.w + i];
      expect(w[i] >>> 24).toBe(przed >>> 24);
      if (w[i] === przed) continue;
      zmienione++;
      expect(rampa, 'nowy kolor z rampy').toContain(hex(rgb(w[i])));
    }
    expect(zmienione).toBeGreaterThan(1000);
  });

  it('nie rusza atlasu źródłowego i zostawia postacie spoza listy', () => {
    const kopia = px.slice();
    const { mieszkancy } = opis.ludzie.regiony;
    const wszystkie = opis.ludzie.postacie.filter((p) => !p.zarzad);
    const bez = wszystkie.filter((p) => p.id !== 'kotwica-chlopiec');
    const w = atlasWersji(px, atlas.w, mieszkancy, bez, rampa);
    expect(px).toEqual(kopia);
    // klatki chłopca (nie na liście) są takie same jak w źródle
    for (const k of opis.ludzie.postacie.find((p) => p.id === 'kotwica-chlopiec')!.animacje.chod.kierunki.flat()) {
      if (!Array.isArray(k)) continue;
      const [x, y, sz, h] = k as number[];
      for (let r = 0; r < h; r++)
        for (let c = 0; c < sz; c++)
          expect(w[(y - mieszkancy[0] + r) * atlas.w + x + c]).toBe(px[(y + r) * atlas.w + x + c]);
    }
  });

  it('pas zarządu zaczyna się od swojego pierwszego wiersza (klatki z przesunięciem)', () => {
    const { zarzad } = opis.ludzie.regiony;
    const postacie = opis.ludzie.postacie.filter((p) => p.zarzad);
    const w = atlasWersji(px, atlas.w, zarzad, postacie, rampa);
    expect(w).toHaveLength((zarzad[1] - zarzad[0]) * atlas.w);
    let zmienione = 0;
    for (let i = 0; i < w.length; i++) if (w[i] !== px[zarzad[0] * atlas.w + i]) zmienione++;
    expect(zmienione).toBeGreaterThan(500);
  });
});
