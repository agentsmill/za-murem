/* Wygląd budynków w kwadratach obok domu (miasto z kwadratów, etap 1, zadanie 6): ziarno stylu z klucza budynku, żeby ten sam
   budynek po obu stronach szwu miał ten sam kolor i szum dachu niezależnie od numeru w kwadracie, a kawałek budynku domu w
   kwadracie obok styl tego budynku z domu („dom wygrywa”, wygląd domu bez zmian). Opcje sceny składa opcjeSceny
   (kwadratyScena.ts), którą woła main.ts; testy na kafelkach trzech adresów (różne kąty obrotu i różne dane). */

import { describe, expect, it } from 'vitest';
import { opcjeSceny } from '../../src/render/art/kwadratyScena.ts';
import { buildScene, przesunStyl, ziarnoStyluZKlucza } from '../../src/render/art/scene.ts';
import { kluczBudynku } from '../../src/world/klucze.ts';
import { budynkiZDomem } from '../../src/world/kwadraty.ts';
import { buildKwadrat, buildWorld } from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';

const BOK = 384;
const TILE = 32;
const seed = 7;

describe('styl budynków kwadratu obok domu', () => {
  for (const a of ADDRESSES) {
    it(`${a.key}: budynek z kluczem ma ziarno stylu z klucza, kawałek budynku domu styl domu przesunięty do kwadratu`, () => {
      const geoDomu = geoDomuTestowego(a);
      const uklad = ukladTestowy(a);
      const dom = buildWorld(geoDomu, { seed });
      const sceneDomu = buildScene(dom);
      let zKluczem = 0;
      let zDomem = 0;
      for (const [sx, sy] of [
        [1, 0],
        [0, 1],
        [-1, -1],
      ]) {
        const w = buildKwadrat(geoKwadratuTestowego(a, sx, sy), { seed, uklad, sx, sy, geoDomu });
        const sc = buildScene(w, null, opcjeSceny({ swiat: w, dom, sceneDomu, sx, sy, seed }));
        expect(sc.poczatek).toEqual({ x: sx * BOK * TILE, y: sy * BOK * TILE });
        const sasiedzi = budynkiZDomem(dom, w, sx, sy);
        for (const b of w.buildings) {
          const st = sc.styles[b.id];
          const hb = sasiedzi.get(b.id);
          if (hb !== undefined) {
            zDomem++;
            expect(st).toEqual(przesunStyl(sceneDomu.styles[hb], sx * BOK * TILE, sy * BOK * TILE));
            continue;
          }
          const k = kluczBudynku(b);
          if (!k) continue;
          zKluczem++;
          expect(st.seed).toBe(ziarnoStyluZKlucza(seed, k));
        }
      }
      expect(zKluczem).toBeGreaterThan(20);
      console.log(`  ${a.key}: ${zKluczem} budynków ze stylem z klucza, ${zDomem} z domu`);
    });

    it(`${a.key}: ten sam budynek w dwóch kwadratach (kawałki przy szwie, różne numery) ma ten sam kolor, ziarno i rodzaj dachu`, () => {
      const geoDomu = geoDomuTestowego(a);
      const uklad = ukladTestowy(a);
      const dom = buildWorld(geoDomu, { seed });
      const sceneDomu = buildScene(dom);
      const buduj = (sx: number, sy: number) => {
        const w = buildKwadrat(geoKwadratuTestowego(a, sx, sy), { seed, uklad, sx, sy, geoDomu });
        return { w, sc: buildScene(w, null, opcjeSceny({ swiat: w, dom, sceneDomu, sx, sy, seed })) };
      };
      // dwa kwadraty obok siebie bez wspólnego szwu z domem: (1, −1) i (1, 0) mają wspólny szew poziomy y = −192
      let wspolne = 0;
      for (const [x1, y1, x2, y2] of [
        [1, -1, 1, 0],
        [-1, 1, 0, 1],
        [0, 1, 1, 1],
      ]) {
        const A = buduj(x1, y1);
        const B = buduj(x2, y2);
        const poKluczu = new Map(
          A.w.buildings.flatMap((b) => (kluczBudynku(b) ? [[kluczBudynku(b) as string, b.id]] : [])),
        );
        for (const b of B.w.buildings) {
          const k = kluczBudynku(b);
          const i = k ? poKluczu.get(k) : undefined;
          if (i === undefined) continue;
          if (budynkiZDomem(dom, A.w, x1, y1).has(i) || budynkiZDomem(dom, B.w, x2, y2).has(b.id)) continue;
          wspolne++;
          const sa = A.sc.styles[i];
          const sb = B.sc.styles[b.id];
          for (const pole of ['seed', 'wall', 'roof', 'accent', 'balconies', 'kind'] as const)
            expect(sb[pole], `${k} ${pole}`).toEqual(sa[pole]);
        }
      }
      console.log(`  ${a.key}: ${wspolne} wspólnych budynków między kwadratami bez domu`);
    });
  }
});
