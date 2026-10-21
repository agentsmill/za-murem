/* Pies i kot w rysowaniu (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Pies i kot”): własny atlas
   rysowany kodem (jak atlas szwendaczy, bez PixelLab), poza z pracy zwierzęcia (chód, leżenie, szczekanie), pies widoczny
   nocą jako ciemny zarys, zwierzę poza ścieżką ludzi z PixelLab i poza wyborem pionka pod kursorem. Atlas rysuje się w Node
   na atrapie płótna (tools/arkusz-plotno.ts). */

import { describe, expect, it } from 'vitest';
import {
  animalFrameRect,
  makeAnimalAtlas,
  ZW_ATLAS_H,
  ZW_ATLAS_W,
  ZW_FH,
  ZW_FW,
  ZW_KLATKI,
  ZW_POZY,
  ZW_RODZAJE,
} from '../../src/render/art/zwierzeta.ts';
import { isBoard, isLokator, STRANGERS, strangerVisibility, ZOMBIE_SHADOW } from '../../src/render/game.ts';
import { LudziePixellab } from '../../src/render/ludziePixellab.ts';
import { type PawnLike, poseOf } from '../../src/render/poses.ts';
import { SZCZEK_NAPIS } from '../../src/sim/zwierzeta.ts';
import { type FakeCanvas, fakeDocument } from '../../tools/arkusz-plotno.ts';

const pionek = (o: Partial<PawnLike> = {}): PawnLike => ({
  id: 4,
  kind: 'pies',
  x: 10.5,
  y: 20.5,
  dir: 3,
  walk: 0,
  pi: 0,
  path: [],
  carry: 0,
  job: { t: 'zwierze', phase: 0, target: -1, what: 'stoi' },
  ...o,
});
const at = (tick: number) => tick / 20;

describe('atlas zwierząt', () => {
  fakeDocument();
  const c = makeAnimalAtlas() as unknown as FakeCanvas;
  const nieprzezroczyste = ([x0, y0, w, h]: [number, number, number, number]) => {
    let n = 0;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) if (c.data[(y * c.width + x) * 4 + 3] === 255) n++;
    return n;
  };

  it('atlas zwierząt ma klatki dla obu rodzajów: chód, leżenie i szczekanie w każdym kierunku', () => {
    expect([c.width, c.height]).toEqual([ZW_ATLAS_W, ZW_ATLAS_H]);
    expect(ZW_ATLAS_W).toBeLessThanOrEqual(4096);
    expect(ZW_RODZAJE).toEqual(['pies', 'kot']);
    expect(ZW_POZY).toEqual(['chod', 'lez', 'szczek']);
    for (const rodzaj of ZW_RODZAJE)
      for (const poza of ZW_POZY)
        for (let dir = 0; dir < 4; dir++)
          for (let f = 0; f < ZW_KLATKI[poza]; f++) {
            const r = animalFrameRect(rodzaj, poza, dir, f);
            expect(r[2]).toBe(ZW_FW);
            expect(r[3]).toBe(ZW_FH);
            expect(r[0] + r[2]).toBeLessThanOrEqual(ZW_ATLAS_W);
            expect(r[1] + r[3]).toBeLessThanOrEqual(ZW_ATLAS_H);
            expect(nieprzezroczyste(r), `${rodzaj} ${poza} ${dir} ${f}`).toBeGreaterThan(100);
          }
  });

  it('klatki się nie nakładają: każda ma swoje miejsce w atlasie', () => {
    const widziane = new Set<string>();
    for (const rodzaj of ZW_RODZAJE)
      for (const poza of ZW_POZY)
        for (let dir = 0; dir < 4; dir++)
          for (let f = 0; f < ZW_KLATKI[poza]; f++) {
            const [x, y] = animalFrameRect(rodzaj, poza, dir, f);
            const k = `${x},${y}`;
            expect(widziane.has(k), k).toBe(false);
            widziane.add(k);
          }
    expect(widziane.size).toBe(2 * 4 * (ZW_KLATKI.chod + ZW_KLATKI.lez + ZW_KLATKI.szczek));
  });

  it('pies jest szaro-brązowy, kot rudy', () => {
    const sredni = (rodzaj: 'pies' | 'kot') => {
      const [x0, y0, w, h] = animalFrameRect(rodzaj, 'chod', 3, 0);
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const i = (y * c.width + x) * 4;
          if (c.data[i + 3] !== 255) continue;
          r += c.data[i];
          g += c.data[i + 1];
          b += c.data[i + 2];
          n++;
        }
      return [r / n, g / n, b / n];
    };
    const [pr, pg, pb] = sredni('pies');
    const [kr, kg, kb] = sredni('kot');
    // burek: mało nasycony (kanały blisko siebie), kot: wyraźnie czerwono-pomarańczowy
    expect(Math.max(pr, pg, pb) - Math.min(pr, pg, pb)).toBeLessThan(40);
    expect(kr - kb).toBeGreaterThan(60);
    expect(kr).toBeGreaterThan(kg);
  });
});

describe('poza zwierzęcia', () => {
  it('chodzi, gdy idzie, stoi, gdy czeka, leży, gdy tak mówi praca', () => {
    expect(poseOf(pionek({ pi: 0, path: [1, 2, 3] as unknown as { length: number } }), 5, []).apose).toBe('chod');
    expect(poseOf(pionek(), 5, []).apose).toBe('chod');
    const lezy = pionek({ job: { t: 'zwierze', phase: 0, target: -1, what: 'lezy' } });
    const p = poseOf(lezy, 5, []);
    expect(p.apose).toBe('lez');
    // bez zwykłej pozy ludzi: nie ma tu ani leżenia w łóżku, ani zpose szwendacza
    expect(p.lie).toBeUndefined();
    expect(p.zpose).toBeUndefined();
    // oddech: dwie klatki z upływem czasu
    const klatki = new Set([0, 1, 2, 3, 4, 5].map((s) => poseOf(lezy, s, []).frame));
    expect([...klatki].sort()).toEqual([0, 1]);
    // kot też
    expect(
      poseOf(pionek({ kind: 'kot', job: { t: 'zwierze', phase: 0, target: -1, what: 'lezy' } }), 5, []).apose,
    ).toBe('lez');
  });

  it('pies szczeka tylko przez chwilę po szczeknięciu i tylko stojąc', () => {
    const tick = 1000;
    const ctx = { szczek: tick };
    expect(poseOf(pionek(), at(tick + 3), [], false, ctx).apose).toBe('szczek');
    expect(poseOf(pionek(), at(tick + SZCZEK_NAPIS - 1), [], false, ctx).apose).toBe('szczek');
    expect(poseOf(pionek(), at(tick + SZCZEK_NAPIS), [], false, ctx).apose).toBe('chod');
    // w biegu nie szczeka
    const idzie = pionek({ path: [1, 2, 3] as unknown as { length: number }, pi: 0 });
    expect(poseOf(idzie, at(tick + 3), [], false, ctx).apose).toBe('chod');
    // leżący pies szczeka, gdy go obudzi wróg (nie leży dalej z zamkniętą mordą)
    const lezy = pionek({ job: { t: 'zwierze', phase: 0, target: -1, what: 'lezy' } });
    expect(poseOf(lezy, at(tick + 3), [], false, ctx).apose).toBe('szczek');
    // kot nigdy
    const kot = pionek({ kind: 'kot' });
    expect(poseOf(kot, at(tick + 3), [], false, ctx).apose).toBe('chod');
  });
});

describe('zwierzę poza ludźmi', () => {
  it('pies jest widoczny nocą jako ciemny zarys, jak gość i szwendacz', () => {
    expect(STRANGERS.has('pies')).toBe(true);
    expect(strangerVisibility(1, 0, 'pies')).toBeGreaterThanOrEqual(ZOMBIE_SHADOW);
    expect(strangerVisibility(1, 0, 'szabrownik')).toBe(0);
    expect(strangerVisibility(0, 0, 'pies')).toBe(1);
  });

  it('nie da się go zaznaczyć jako zarządu ani mieszkańca', () => {
    for (const kind of ['pies', 'kot']) {
      const p = { kind, person: -1, away: false, x: 1, y: 1 };
      expect(isBoard(p)).toBe(false);
      expect(isLokator(p)).toBe(false);
    }
  });

  it('nie trafia do postaci z PixelLab, choć pionek bez osoby dostaje postać z wyglądu', () => {
    const wygladLudzi = (id: string, zarzad: boolean) =>
      ({
        id,
        co: id,
        zarzad,
        plec: 'm',
        wiek: [18, 99],
        animacje: {
          chod: { kierunki: [[[0, 0, 1, 1, 0, 0]], [[0, 0, 1, 1, 0, 0]], [[0, 0, 1, 1, 0, 0]], 2] },
          stanie: {},
        },
        przemalowanie: { kolory: [] },
      }) as never;
    const l = new LudziePixellab({
      opis: {
        plik: 'x.png',
        regiony: { mieszkancy: [0, 0], zarzad: [0, 0] },
        postacie: [wygladLudzi('a', false), wygladLudzi('b', true)],
        rampy: {},
      },
      img: { w: 16, h: 16, px: new Uint32Array(256) },
    } as never);
    // kontrola: szabrownik bez osoby dostaje postać z wyglądu pionka
    expect(l.postacPionka({ id: 3, kind: 'szabrownik', person: -1, look: 4 }, [])).not.toBeNull();
    // zwierzę nie dostaje człowieka
    expect(l.postacPionka({ id: 4, kind: 'pies', person: -1, look: 0 }, [])).toBeNull();
    expect(l.postacPionka({ id: 5, kind: 'kot', person: -1, look: 0 }, [])).toBeNull();
  });
});
