/* Portret osoby z listy ludzi z prawdziwego atlasu PixelLab (src/ui/portret.ts, `portretPixellab`): ta sama postać i ta
   sama wersja kolorystyczna, którą na mapie gra pionek (LudziePixellab), więc osobę z listy da się znaleźć na mapie. */

import { describe, expect, it } from 'vitest';
import type { LudzieGrafika, OpisGrafiki } from '../../src/render/art/pixellab.ts';
import { LudziePixellab } from '../../src/render/ludziePixellab.ts';
import { BOK_PORTRETU, portretPixellab } from '../../src/ui/portret.ts';
import { type Atlas, atlasy } from '../../tools/atlasy.ts';

const wynik = atlasy();
const opis = (wynik.get('grafika.json') as OpisGrafiki).ludzie;
const atlas = wynik.get(opis.plik) as Atlas;
const grafika: LudzieGrafika = {
  opis,
  img: { w: atlas.w, h: atlas.h, px: new Uint32Array(atlas.rgba.buffer.slice(0)) },
};

const pionek = (id: number, person: number) => ({ id, kind: 'core', person, look: id });
/** czterech starszych i młodszych z zarządu z różną płcią i wiekiem: każdy dostaje inną postać zarządu */
const osoby = [
  { f: false, age: 70 },
  { f: true, age: 60 },
  { f: false, age: 30 },
  { f: true, age: 30 },
];
const zarzad = osoby.map((_, i) => pionek(i + 1, i));
const zajete = (px: Uint32Array) => px.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);

describe('portretPixellab: portret z klatki stania przodem', () => {
  it('daje kwadrat BOK × BOK z sylwetką od drugiego wiersza, dla każdej osoby zarządu', () => {
    const dane = new LudziePixellab(grafika);
    dane.przypiszZarzad(zarzad, osoby);
    for (const p of zarzad) {
      const r = portretPixellab(dane, grafika.img, p, osoby)!;
      expect(r, `pionek ${p.id}`).not.toBeNull();
      expect(r.px).toHaveLength(BOK_PORTRETU * BOK_PORTRETU);
      expect(r.px.subarray(0, BOK_PORTRETU).every((v) => v >>> 24 === 0)).toBe(true);
      expect(r.px.subarray(BOK_PORTRETU, 2 * BOK_PORTRETU).some((v) => v >>> 24 !== 0)).toBe(true);
      expect(zajete(r.px)).toBeGreaterThan(120);
    }
  });

  it('różni ludzie mają różne portrety i różne klucze, ta sama osoba zawsze ten sam', () => {
    const dane = new LudziePixellab(grafika);
    dane.przypiszZarzad(zarzad, osoby);
    const a = zarzad.map((p) => portretPixellab(dane, grafika.img, p, osoby)!);
    expect(new Set(a.map((r) => r.klucz)).size).toBe(4);
    const jeszczeRaz = portretPixellab(dane, grafika.img, zarzad[0], osoby)!;
    expect(jeszczeRaz.klucz).toBe(a[0].klucz);
    expect(jeszczeRaz.px).toEqual(a[0].px);
    expect(a[0].px).not.toEqual(a[1].px);
  });

  it('dwie osoby z tą samą postacią dostają przemalowaną wersję, jak na mapie (inny klucz i inne kolory)', () => {
    // dwóch mężczyzn po sześćdziesiątce: oboje grają postać „emeryt”, drugi w innych kolorach ubrania
    const dwaj = [
      { f: false, age: 70 },
      { f: false, age: 71 },
    ];
    const piony = [pionek(1, 0), pionek(2, 1)];
    const dane = new LudziePixellab(grafika);
    dane.przypiszZarzad(piony, dwaj);
    const a = portretPixellab(dane, grafika.img, piony[0], dwaj)!;
    const b = portretPixellab(dane, grafika.img, piony[1], dwaj)!;
    expect(a.klucz).not.toBe(b.klucz);
    expect(a.px).not.toEqual(b.px);
    // ten sam kształt sylwetki (przemalowanie zmienia kolory, nie piksele alfa)
    expect(Array.from(a.px, (v) => v >>> 24)).toEqual(Array.from(b.px, (v) => v >>> 24));
  });

  it('osoba spoza obsady (brak osoby w grze) nie ma portretu z PixelLab, więc lista bierze kod', () => {
    const dane = new LudziePixellab(grafika);
    expect(portretPixellab(dane, grafika.img, pionek(9, 99), osoby)).toBeNull();
  });
});
