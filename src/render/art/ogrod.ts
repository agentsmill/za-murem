/* Ogród domu jednorodzinnego rysowany kodem (grafika zastępcza): rzeczy, które świat stawia w ogrodzie
   domu zamiast trzepaka z podwórka bloku. Sznur na pranie (z praniem i bez), kompostownik, pusta psia
   buda, drewniana huśtawka i ławka ogrodowa. Te same bryły i ten sam raster co meble i podwórko
   (bryly.ts), 1 m siatki to 32 px w poziomie i 16 px w pionie; po latach bez gospodarza: spłowiałe,
   przybrudzone, z rdzą. Czyste funkcje bez DOM, kotwica na środku dolnej krawędzi podstawy.
   Rozmiary w metrach (szerokość × głębokość przy rot 0, przy rot 1 i 3 odwrotnie):
   - sznur 3 × 1: dwa słupki z poprzeczką, trzy linki; pranie to drobiazgi z ziarna (bez wpływu na rozmiar);
   - kompost 1 × 1: skrzynia z desek ze szparami, z przodu niższa, w środku kompost;
   - buda 1 × 1: plecami do ściany rot jak meble, wejście z przodu, dwuspadowy daszek, pusta miska;
   - hustawka 2 × 1: dwie pary słupków z belką, siedzisko na linach albo łańcuchach;
   - lawka 2 × 1: plecami do rot, żeliwne boki, siedzisko i oparcie z listew. */

import {
  type Box,
  box,
  HOLE,
  M,
  type Paint,
  PX,
  pick,
  type Rot,
  renderBoxes,
  rnd,
  type Sprite,
  WOODS,
} from './bryly.ts';
import { h2, vnoise } from './hash.ts';
import { mix, shade } from './palette.ts';

/** kolory ogrodu; reszta z M (bryly.ts) */
const G = {
  pole: 0x5b6b5e, // ocynk pomalowany na zielono, łuszczy się
  line: 0xd6d0bf,
  peg: 0xb08a5a,
  basket: 0x4f7aa6,
  soil: 0x3b2e22,
  soilD: 0x2c2219,
  scrap: [0x6a8a3a, 0x8a5a2e, 0xd8d0c0, 0xd88a3a, 0x5a7a34] as const,
  felt: 0x4f3a32, // papa na daszku budy
  feltD: 0x3a2a24,
  dark: 0x1c1714,
  iron: 0x2f3a33, // żeliwo ławki, ciemna zieleń
  ironHi: 0x46554b,
  rope: 0xc8b48a,
} as const;

/** pranie: prześcieradła, koszule, ręczniki, skarpety; spłowiałe kolory */
const CLOTH = [0xe8e4da, 0x4a6fa5, 0xb04a3c, 0xd9b84a, 0x5f8a5a, 0x8a6aa0, 0xe2a4a0] as const;

/** słoje drewna: deski co 4 px, czasem sęk */
const boards =
  (c: number, s: number, vertical = true): Paint =>
  (u, v) => {
    const a = vertical ? u : v;
    const b = vertical ? v : u;
    if (a % 4 === 3) return shade(c, 0.7);
    const k = Math.floor(a / 4);
    if (h2(a, b, s) < 0.025) return shade(c, 0.6); // sęk albo gwóźdź
    return h2(k, 0, s + 1) < 0.3 ? shade(c, 0.9) : h2(k, 1, s + 2) < 0.3 ? shade(c, 1.08) : c;
  };

/** spłowienie i brud po latach */
const weather = (c: number, u: number, v: number, s: number) => {
  const n = vnoise(u, v, 5, s);
  return n > 0.75 ? shade(c, 0.85) : n < 0.2 ? mix(c, 0xc8c2b4, 0.18) : c;
};

// ---------------------------------------------------------------- sznur na pranie

/** jedna sztuka prania na lince y (przód sztuki w y + 1), od x0, szeroka w, dół na wysokości z0 */
function cloth(kind: number, x0: number, y: number, w: number, z0: number, c: number, s: number): Box {
  const top = 27;
  const paint: Paint = (u, v, bw, bh) => {
    // klamerki na górze
    if (v === 0 && (u === 1 || u === bw - 2)) return G.peg;
    if (kind === 1) {
      // koszula: ramiona szersze, rękawy do połowy, dół węższy
      const body = u >= 2 && u < bw - 2;
      if (!body && v > bh / 2) return HOLE;
      if (u === Math.floor(bw / 2) && v > 1) return shade(c, 0.82); // zapięcie
    } else if (kind === 2) {
      // spodnie: między nogawkami przerwa
      if (v > bh / 3 && Math.abs(u + 0.5 - bw / 2) < 1.2) return HOLE;
    } else if (kind === 3) {
      // ręcznik w paski
      if (v % 4 === 2) return shade(c, 0.75);
    }
    return weather(v === bh - 1 ? shade(c, 0.85) : c, u, v, s);
  };
  // wybrzuszona na wietrze (4 px grubości wokół linki), żeby z boku (rot 1 i 3) było widać kolorowy pas
  const side: Paint = (u, v) => weather(shade(c, 0.9), u, v, s + 1);
  return box(x0, y - 2, z0, x0 + w, y + 2, top, c, {
    front: paint,
    back: paint,
    left: side,
    right: side,
    top: (u, v) => weather(shade(c, 1.05), u, v, s + 2),
    opt: true,
    flat: true,
  });
}

function sznur(rot: Rot, pranie: boolean, seed: number): Sprite {
  const r = rnd(seed, 1301);
  const rusty: Paint = (u, v) => (h2(u, v, seed + 1302) < 0.2 ? M.rust : G.pole);
  const pipe: Partial<Box> = { round: true, top: rusty, front: rusty, back: rusty, left: rusty, right: rusty };
  const b: Box[] = [
    // betonowe stopy, słupki z poprzeczkami (kształt T)
    box(2, 12, 0, 9, 19, 1, M.concrete),
    box(87, 12, 0, 94, 19, 1, M.concrete),
    box(4, 14, 0, 7, 17, 28, G.pole, pipe),
    box(89, 14, 0, 92, 17, 28, G.pole, pipe),
    box(4, 6, 27, 7, 25, 29, G.pole, pipe),
    box(89, 6, 27, 92, 25, 29, G.pole, pipe),
  ];
  // trzy linki
  for (const y of [8, 15, 22]) b.push(box(7, y, 27, 89, y + 1, 28, G.line, { flat: true }));
  if (pranie) {
    // na każdej lince kilka sztuk z ziarna: prześcieradło, koszula, spodnie, ręcznik, skarpety
    let k = 0;
    for (const y of [8, 15, 22]) {
      let x = 9 + Math.floor(r(k++) * 6);
      while (x < 82) {
        const kind = Math.floor(r(k++) * 5);
        const c = pick(CLOTH, r(k++));
        const w = kind === 0 ? 16 : kind === 1 ? 10 : kind === 2 ? 8 : kind === 3 ? 7 : 3;
        const z0 = kind === 0 ? 11 : kind === 1 ? 17 : kind === 2 ? 13 : kind === 3 ? 18 : 22;
        if (x + w > 87) break;
        if (r(k++) < 0.8) b.push(cloth(kind, x, y, w, z0, kind === 0 ? 0xe8e4da : c, seed + k));
        x += w + 2 + Math.floor(r(k++) * 5);
      }
    }
    // kosz na pranie przy słupku
    b.push(
      box(10, 21, 0, 19, 29, 5, G.basket, {
        opt: true,
        top: (u, v, bw, bh) => (u === 0 || v === 0 || u === bw - 1 || v === bh - 1 ? G.basket : 0x2d4561),
      }),
    );
  } else {
    // kilka zapomnianych klamerek
    for (let k = 0; k < 4; k++) {
      const x = 12 + Math.floor(r(k + 40) * 72);
      const y = [8, 15, 22][k % 3];
      b.push(box(x, y, 26, x + 1, y + 1, 28, G.peg, { opt: true, flat: true }));
    }
  }
  return renderBoxes(b, 96, 32, rot);
}

// ---------------------------------------------------------------- kompostownik

function kompost(rot: Rot, seed: number): Sprite {
  const r = rnd(seed, 1311);
  const wood = shade(pick(WOODS, r(1)), 0.85);
  // listwy poziome ze szparami (przez szpary widać kompost)
  const slats: Paint = (u, v, _bw, bh) => {
    if (v % 4 === 3 && v < bh - 1) return HOLE;
    return weather(boards(wood, seed + 1312, false)(u, v, 0, 0), u, v, seed + 1313);
  };
  const compost: Paint = (u, v) => {
    const t = h2(u, v, seed + 1314);
    if (t < 0.12) return pick(G.scrap, h2(v, u, seed + 1315));
    return vnoise(u, v, 3, seed + 1316) < 0.45 ? G.soilD : G.soil;
  };
  const post = shade(wood, 0.8);
  const b: Box[] = [
    // kompost w środku, z wierzchu resztki
    box(6, 6, 0, 26, 26, 11, G.soil, { top: compost, front: compost, left: compost, right: compost, back: compost }),
    // słupki w rogach
    box(4, 4, 0, 7, 7, 15, post),
    box(25, 4, 0, 28, 7, 15, post),
    box(4, 25, 0, 7, 28, 10, post),
    box(25, 25, 0, 28, 28, 10, post),
    // ściany: tył i boki wysokie, przód niski (do wybierania)
    box(7, 4, 0, 25, 6, 14, wood, { front: slats, back: slats, top: () => shade(wood, 1.1) }),
    box(4, 7, 0, 6, 25, 14, wood, { left: slats, right: slats, top: () => shade(wood, 1.1) }),
    box(26, 7, 0, 28, 25, 14, wood, { left: slats, right: slats, top: () => shade(wood, 1.1) }),
    box(7, 26, 0, 25, 28, 8, wood, { front: slats, back: slats, top: () => shade(wood, 1.1) }),
  ];
  // widły oparte o tylną ścianę
  if (r(2) < 0.5) b.push(box(21, 7, 9, 22, 8, 24, 0x8a6a44, { opt: true, flat: true }));
  return renderBoxes(b, PX, PX, rot);
}

// ---------------------------------------------------------------- psia buda

function buda(rot: Rot, seed: number): Sprite {
  const r = rnd(seed, 1321);
  const wood = pick(WOODS, r(1));
  const wall = boards(wood, seed + 1322);
  // przód z wejściem: łuk ciemnego otworu na środku
  const front: Paint = (u, v, bw, bh) => {
    const du = u + 0.5 - bw / 2;
    const door = Math.abs(du) < 4.5 && v > 3 && (v > 5 || Math.abs(du) < 3);
    if (door) return v === bh - 1 ? shade(G.dark, 1.3) : G.dark;
    return weather(wall(u, v, bw, bh), u, v, seed + 1323);
  };
  // szczyt daszku: trójkąt, poza nim dziura; brzeg trójkąta to papa
  const gable: Paint = (u, v, bw, bh) => {
    const half = ((v + 1) * bw) / 2 / bh;
    const d = Math.abs(u + 0.5 - bw / 2);
    if (d > half) return HOLE;
    if (d > half - 1.6) return G.feltD;
    return shade(wood, 0.85);
  };
  // połacie z papy: kalenica przez środek od przodu do tyłu, lewa jaśniejsza
  const roof: Paint = (u, v, bw) => {
    const mid = bw / 2;
    if (Math.abs(u + 0.5 - mid) < 1) return shade(G.felt, 0.8);
    const c = u < mid ? shade(G.felt, 1.18) : G.felt;
    if (v % 3 === 0) return shade(c, 0.85);
    return h2(u, v, seed + 1324) < 0.08 ? mix(c, 0x8a8a7a, 0.4) : c;
  };
  const eave: Paint = (_u, v, _bw, bh) => (v >= bh - 2 ? G.feltD : HOLE);
  const b: Box[] = [
    box(5, 7, 0, 27, 27, 2, shade(wood, 0.7)),
    box(6, 8, 2, 26, 26, 15, wood, { front, back: wall, left: wall, right: wall }),
    box(4, 6, 15, 28, 28, 22, G.felt, { top: roof, front: gable, back: gable, left: eave, right: eave }),
  ];
  // pusta miska z boku wejścia i łańcuch w trawie
  if (r(2) < 0.7)
    b.push(
      box(22, 28, 0, 28, 31, 2, M.steelD, {
        opt: true,
        top: (u, v, bw, bh) => (u === 0 || v === 0 || u === bw - 1 || v === bh - 1 ? M.steel : M.ironD),
      }),
    );
  if (r(3) < 0.6)
    for (let k = 0; k < 5; k++)
      b.push(box(9 + k * 2, 27 + (k & 1), 0, 10 + k * 2, 28 + (k & 1), 1, M.iron, { opt: true, flat: true }));
  return renderBoxes(b, PX, PX, rot);
}

// ---------------------------------------------------------------- huśtawka

function hustawka(rot: Rot, seed: number): Sprite {
  const r = rnd(seed, 1331);
  const wood = pick(WOODS, r(1));
  const post = shade(wood, 0.9);
  const grain = boards(wood, seed + 1332, false);
  const b: Box[] = [];
  // pary słupków na końcach (rozstawione do przodu i do tyłu) z zastrzałem pod belką
  for (const x of [4, 57]) {
    b.push(box(x, 4, 0, x + 3, 7, 35, post));
    b.push(box(x, 25, 0, x + 3, 28, 35, post));
    b.push(box(x, 7, 28, x + 3, 25, 31, post));
  }
  // belka na górze
  b.push(box(2, 14, 35, 62, 18, 39, wood, { top: grain, front: grain, back: grain }));
  // siedzisko na dwóch linach (albo łańcuchach)
  const chain = r(2) < 0.35;
  const hang = chain ? M.steelD : G.rope;
  b.push(box(24, 15, 9, 25, 16, 35, hang, { flat: true }));
  b.push(box(39, 15, 9, 40, 16, 35, hang, { flat: true }));
  b.push(box(22, 13, 7, 42, 19, 9, shade(wood, 1.05), { top: grain }));
  return renderBoxes(b, 64, 32, rot);
}

// ---------------------------------------------------------------- ławka ogrodowa

function lawka(rot: Rot, seed: number): Sprite {
  const r = rnd(seed, 1341);
  const wood = shade(pick(WOODS, r(1)), 1.05);
  // listwy siedziska i oparcia ze szparami
  const seat: Paint = (u, v) =>
    v % 3 === 2 ? HOLE : weather(u % 9 === 0 ? shade(wood, 0.85) : wood, u, v, seed + 1342);
  const back: Paint = (u, v, _bw, bh) =>
    v % 3 === 2 && v < bh - 1 ? HOLE : weather(v === 0 ? shade(wood, 1.15) : wood, u, v, seed + 1343);
  const iron: Paint = (u, v) => (h2(u, v, seed + 1344) < 0.12 ? M.rust : G.iron);
  const b: Box[] = [];
  for (const x of [6, 55]) {
    // żeliwne boki: noga przednia, tylna aż do oparcia, podłokietnik
    b.push(box(x, 21, 0, x + 3, 24, 8, G.iron, { front: iron, left: iron, right: iron }));
    b.push(box(x, 9, 0, x + 3, 12, 20, G.iron, { front: iron, left: iron, right: iron }));
    b.push(box(x, 12, 11, x + 3, 24, 13, G.ironHi, { top: iron }));
  }
  b.push(box(4, 12, 7, 60, 24, 9, wood, { top: seat, front: () => shade(wood, 0.8) }));
  b.push(box(4, 9, 11, 60, 11, 20, wood, { front: back, back, top: () => shade(wood, 1.15) }));
  return renderBoxes(b, 64, 32, rot);
}

// ---------------------------------------------------------------- wejście (przez thingSprite)

export const sznurSprite = (rot: Rot, pranie = false, seed = 0) => sznur(rot, pranie, seed | 0);
export const kompostSprite = (rot: Rot, seed = 0) => kompost(rot, seed | 0);
export const budaSprite = (rot: Rot, seed = 0) => buda(rot, seed | 0);
export const hustawkaSprite = (rot: Rot, seed = 0) => hustawka(rot, seed | 0);
export const lawkaSprite = (rot: Rot, seed = 0) => lawka(rot, seed | 0);
