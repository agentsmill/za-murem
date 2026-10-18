import { describe, expect, it } from 'vitest';
import {
  type OpisGrafiki,
  type PostacLudzi,
  postacDlaOsoby,
  postacDlaWygladu,
  rampyOdNajdalszej,
} from '../../src/render/art/pixellab.ts';
import { atlasy } from '../../tools/atlasy.ts';

const opis = atlasy().get('grafika.json') as OpisGrafiki;
const wszystkie = opis.ludzie.postacie;
const id = (p: PostacLudzi) => p.id.replace('kotwica-', '');

describe('dobór postaci PixelLab do osoby z gry (płeć i wiek)', () => {
  it('płeć zawsze się zgadza, w każdym wieku, dla zarządu i dla mieszkańców', () => {
    for (const zarzad of [true, false])
      for (const f of [true, false])
        for (let age = 0; age <= 110; age++) {
          const p = postacDlaOsoby(wszystkie, { f, age, zarzad }, age * 7);
          expect(p.plec, `${f ? 'k' : 'm'} ${age} ${zarzad ? 'zarząd' : 'mieszkaniec'} → ${p.id}`).toBe(f ? 'k' : 'm');
          expect(p.zarzad).toBe(zarzad);
        }
  });

  it('zarząd: stary mężczyzna to emeryt, młodszy złota rączka, stara kobieta emerytka, młodsza młoda', () => {
    const wez = (f: boolean, age: number) => id(postacDlaOsoby(wszystkie, { f, age, zarzad: true }, 3));
    expect([wez(false, 71), wez(false, 41), wez(true, 66), wez(true, 28)]).toEqual([
      'emeryt',
      'zlota-raczka',
      'emerytka',
      'mloda',
    ]);
    // poza przedziałami wygrywa najbliższy
    expect([wez(false, 12), wez(false, 105), wez(true, 9), wez(true, 104)]).toEqual([
      'zlota-raczka',
      'emeryt',
      'mloda',
      'emerytka',
    ]);
  });

  it('mieszkańcy: dziecko to dziecko, a wiek mieści się w przedziale postaci, gdy jakaś pasuje', () => {
    expect(id(postacDlaOsoby(wszystkie, { f: false, age: 8, zarzad: false }, 5))).toBe('chlopiec');
    expect(id(postacDlaOsoby(wszystkie, { f: true, age: 11, zarzad: false }, 5))).toBe('dziewczynka');
    for (const f of [true, false])
      for (let age = 16; age <= 72; age++)
        for (const los of [0, 1, 2, 9, 12345]) {
          const p = postacDlaOsoby(wszystkie, { f, age, zarzad: false }, los);
          expect(age, `${p.id} dla ${f ? 'k' : 'm'} ${age}`).toBeGreaterThanOrEqual(p.wiek[0]);
          expect(age, `${p.id} dla ${f ? 'k' : 'm'} ${age}`).toBeLessThanOrEqual(p.wiek[1]);
        }
  });

  it('ta sama osoba daje tę samą postać, a różne losy rozkładają osoby na wszystkie pasujące postacie', () => {
    const o = { f: true, age: 50, zarzad: false };
    expect(postacDlaOsoby(wszystkie, o, 77).id).toBe(postacDlaOsoby(wszystkie, o, 77).id);
    const widziane = new Set(Array.from({ length: 200 }, (_, los) => postacDlaOsoby(wszystkie, o, los).id));
    expect([...widziane].map((x) => x.replace('kotwica-', '')).sort()).toEqual(
      ['kioskarka', 'kucharka', 'pielegniarka', 'listonoszka'].sort(),
    );
  });

  it('bez postaci o tej płci bierze dowolną z grupy, a pusta grupa to błąd', () => {
    const tylkoM = wszystkie.filter((p) => !p.zarzad && p.plec === 'm');
    expect(postacDlaOsoby(tylkoM, { f: true, age: 30, zarzad: false }, 0).plec).toBe('m');
    expect(() => postacDlaOsoby([], { f: true, age: 30, zarzad: false }, 0)).toThrow('postaci');
  });
});

describe('dobór postaci PixelLab do pionka bez osoby (wygląd z gry)', () => {
  it('to dorosły mieszkaniec (ani zarząd, ani dziecko); ten sam wygląd daje tę samą postać, a kolejne przechodzą przez wszystkich', () => {
    const pula = wszystkie.filter((p) => !p.zarzad && p.wiek[1] >= 16);
    expect(pula).toHaveLength(18);
    const ids = Array.from({ length: pula.length }, (_, look) => postacDlaWygladu(wszystkie, look).id);
    expect(new Set(ids).size).toBe(pula.length);
    expect(wszystkie.filter((p) => ids.includes(p.id) && (p.zarzad || p.wiek[1] < 16))).toEqual([]);
    expect(postacDlaWygladu(wszystkie, 7).id).toBe(postacDlaWygladu(wszystkie, 7).id);
    // wygląd spoza zakresu (szabrownik 16–19) też coś daje
    expect(postacDlaWygladu(wszystkie, 19)).toBeDefined();
  });
});

describe('kolejność ramp dla kolejnych egzemplarzy tej samej postaci', () => {
  const rampy = opis.ludzie.rampy;
  const nazwy = Object.keys(rampy);
  const lista = Object.values(rampy);
  const najblizsza = (kolory: string[]) => {
    const k = rampyOdNajdalszej(kolory, lista);
    return nazwy[k[k.length - 1]];
  };

  it('to permutacja ramp, w której na końcu jest rampa najbliższa kolorom ubrania', () => {
    const k = rampyOdNajdalszej(['#26323d', '#3b4a5e', '#3d5262'], lista);
    expect([...k].sort()).toEqual(lista.map((_, i) => i));
    expect(najblizsza(['#26323d', '#3b4a5e', '#3d5262'])).toBe('granat');
    expect(najblizsza(['#3a5229', '#4c6631', '#648043'])).toBe('zieleń');
    expect(najblizsza(['#7a4a2e', '#8e4b36', '#d2552a'])).toBe('rdza');
  });

  it('drugi egzemplarz granatowej postaci dostaje wyraźnie inny kolor niż granat', () => {
    const k = rampyOdNajdalszej(['#26323d', '#3b4a5e', '#3d5262'], lista);
    expect(nazwy[k[0]]).not.toBe('granat');
  });

  it('bez kolorów do przemalowania kolejność ramp zostaje', () => {
    expect(rampyOdNajdalszej([], lista)).toEqual(lista.map((_, i) => i));
  });
});
