/* Grzbiet dachu i głębokość fasady budynku przeciętego szwem między dwoma kwadratami miasta bez domu (miasto z kwadratów,
   etap 1, poprawka po scaleniu z kluczami). Styl budynku (kierunek i położenie grzbietu dachu dwuspadowego, głębokość
   fasady) liczył się z ramki kawałka, który widzi okno kwadratu, więc dwa kawałki jednego domu miały grzbiety w różnych
   miejscach albo kierunkach i dach wyglądał jak dwa domy jeden nad drugim (Zielonki: 10 z 19 par przez szwy). Świat
   kwadratu daje teraz przeciętemu budynkowi ramkę całego budynku z pierścienia geo (`WorldBuilding.ramka`, kwadrat ma
   go w całości), a styl i rząd kominów liczą się z niej. Dom i budynki w całości w oknie ramki nie mają, więc ich wygląd
   jest taki jak dawniej (odciski świata domu pilnuje kwadraty-dom.test.ts, zrzuty domu `npm run shots`). Test odtwarza
   to, co robi main.ts dla ?kwadraty=3x3 (buildKwadrat z geoDomu i dom, opcjeSceny, buildScene), na trzech adresach. */

import { describe, expect, it } from 'vitest';
import { opcjeSceny } from '../../src/render/art/kwadratyScena.ts';
import { buildScene, type Scene, TILE } from '../../src/render/art/scene.ts';
import { kluczBudynku } from '../../src/world/klucze.ts';
import { BOK_KWADRATU, sasiedzi8 } from '../../src/world/kwadraty.ts';
import { buildKwadrat, buildWorld, type World } from '../../src/world/world.ts';
import { ADDRESSES, geoDomuTestowego, geoKwadratuTestowego, ukladTestowy } from './fixtures.ts';
import { grafikaZPlikow } from './grafika-pomoc.ts';

const N = BOK_KWADRATU;
const BOK = N * TILE;

interface Kw {
  w: World;
  sc: Scene;
}

/** dom i osiem sąsiadów jak w grze (?kwadraty=3x3 z ?pietra=1 i grafiką z PixelLab) */
function swiaty(adres: (typeof ADDRESSES)[number]): Map<string, Kw> {
  const seed = 7;
  const art = grafikaZPlikow();
  const geoDomu = geoDomuTestowego(adres);
  const uklad = ukladTestowy(adres);
  const dom = buildWorld(geoDomu, { seed, pietra: true });
  const sceneDomu = buildScene(dom, art);
  const out = new Map<string, Kw>([['0,0', { w: dom, sc: sceneDomu }]]);
  for (const [sx, sy] of sasiedzi8(0, 0)) {
    const w = buildKwadrat(geoKwadratuTestowego(adres, sx, sy), { seed, uklad, sx, sy, geoDomu, pietra: true, dom });
    out.set(`${sx},${sy}`, { w, sc: buildScene(w, art, opcjeSceny({ swiat: w, dom, sceneDomu, sx, sy, seed })) });
  }
  return out;
}

/**
 * Pary kawałków jednego budynku (ten sam klucz) po obu stronach szwów między sąsiednimi kwadratami; bez domu (kwadrat
 * 0,0), bo dom wygrywa na szwie i jego pary mają osobny test (kwadraty-styl.test.ts, kwadraty-klasa.test.ts).
 */
function pary(kw: Map<string, Kw>): Array<{ k: string; kb: string; a: number; b: number; dx: number; dy: number }> {
  const out: Array<{ k: string; kb: string; a: number; b: number; dx: number; dy: number }> = [];
  const widziane = new Set<string>();
  for (const [k, A] of kw) {
    if (k === '0,0') continue;
    const [sx, sy] = k.split(',').map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const kb = `${sx + dx},${sy + dy}`;
      const B = kw.get(kb);
      if (!B || kb === '0,0') continue;
      for (let t = 0; t < N; t++) {
        const a = A.w.bid[dx ? t * N + N - 1 : (N - 1) * N + t];
        const b = B.w.bid[dx ? t * N : t];
        if (a < 0 || b < 0) continue;
        const id = `${k}:${a}|${kb}:${b}`;
        if (widziane.has(id)) continue;
        widziane.add(id);
        const klucz = kluczBudynku(A.w.buildings[a]);
        if (klucz && klucz === kluczBudynku(B.w.buildings[b])) out.push({ k, kb, a, b, dx, dy });
      }
    }
  }
  return out;
}

describe('budynek przecięty szwem między dwoma kwadratami bez domu: ten sam grzbiet dachu i fasada po obu stronach', () => {
  let razem = 0;
  for (const adres of ADDRESSES) {
    it(`${adres.key}: kierunek i położenie grzbietu (w układzie miasta) oraz fasada zgadzają się w każdej parze kawałków`, () => {
      const kw = swiaty(adres);
      const rozne: string[] = [];
      let zGrzbietem = 0;
      for (const p of pary(kw)) {
        const A = kw.get(p.k) as Kw;
        const B = kw.get(p.kb) as Kw;
        const [sx, sy] = p.k.split(',').map(Number);
        const sa = A.sc.styles[p.a];
        const sb = B.sc.styles[p.b];
        const nazwa = `${p.k}→${p.kb} ${A.w.buildings[p.a].name}`;
        if (sa.facade !== sb.facade) rozne.push(`${nazwa}: fasada ${sa.facade} wobec ${sb.facade}`);
        if (sa.ridge !== sb.ridge) {
          rozne.push(`${nazwa}: kierunek grzbietu ${sa.ridge} wobec ${sb.ridge}`);
          continue;
        }
        if (!sa.ridge) continue;
        zGrzbietem++;
        const oa = (sa.ridge === 'h' ? sy : sx) * BOK + sa.ridgeAt;
        const ob = (sa.ridge === 'h' ? sy + p.dy : sx + p.dx) * BOK + sb.ridgeAt;
        if (oa !== ob) rozne.push(`${nazwa}: grzbiet ${oa} wobec ${ob} px miasta`);
      }
      expect(rozne).toEqual([]);
      razem += zGrzbietem;
      // test mierzy: Zielonki to domy z dachami dwuspadowymi przeciętymi szwami
      if (adres.key === 'zielonki') expect(zGrzbietem).toBeGreaterThanOrEqual(10);
    });
  }

  it('w sumie z grzbietem dachu sprawdzono co najmniej piętnaście par kawałków', () => {
    expect(razem).toBeGreaterThanOrEqual(15);
  });
});

describe('ramka całego budynku w świecie kwadratu', () => {
  for (const adres of ADDRESSES) {
    it(`${adres.key}: dom i budynki w całości w oknie jej nie mają, przecięte mają ją po obu stronach szwu jednakową`, () => {
      const kw = swiaty(adres);
      const dom = (kw.get('0,0') as Kw).w;
      expect(dom.buildings.every((b) => b.ramka === undefined)).toBe(true);
      let zRamka = 0;
      for (const [k, { w }] of kw) {
        for (const b of w.buildings) {
          if (!b.ramka) continue;
          zRamka++;
          // wystaje poza okno (inaczej budynek jest w całości w oknie i ramki nie ma) i obejmuje kafelki kawałka
          expect(b.ramka.x0 < 0 || b.ramka.y0 < 0 || b.ramka.x1 >= N || b.ramka.y1 >= N, `${k} ${b.name}`).toBe(true);
          expect(
            b.ramka.x0 <= b.x0 && b.ramka.y0 <= b.y0 && b.ramka.x1 >= b.x1 && b.ramka.y1 >= b.y1,
            `${k} ${b.name}`,
          ).toBe(true);
        }
      }
      expect(zRamka).toBeGreaterThan(5);
      let porownane = 0;
      for (const p of pary(kw)) {
        const A = kw.get(p.k) as Kw;
        const B = kw.get(p.kb) as Kw;
        const [sx, sy] = p.k.split(',').map(Number);
        const ra = A.w.buildings[p.a].ramka;
        const rb = B.w.buildings[p.b].ramka;
        const nazwa = `${p.k}→${p.kb} ${A.w.buildings[p.a].name}`;
        expect(ra, nazwa).toBeDefined();
        expect(rb, nazwa).toBeDefined();
        if (!ra || !rb) continue;
        const miasto = (r: NonNullable<typeof ra>, qx: number, qy: number) => [
          qx * N + r.x0,
          qy * N + r.y0,
          qx * N + r.x1,
          qy * N + r.y1,
        ];
        expect(miasto(ra, sx, sy), nazwa).toEqual(miasto(rb, sx + p.dx, sy + p.dy));
        porownane++;
      }
      expect(porownane).toBeGreaterThan(0);
    });
  }
});
