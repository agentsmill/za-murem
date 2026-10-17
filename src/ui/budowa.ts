/* Budowa w interfejsie (docs/M2-fala-1.md): menu budowy z BUILDS (koszt, czas pracy, działanie, miejsce),
   sprawdzanie miejsca w trybie stawiania i dozwolone kafelki. Miejsce sprawdza canPlace z symulacji, a do
   czasu, aż go poda (kontrakt w src/sim/budowle.ts), atrapa z tymi samymi regułami: pokój albo kuchnia
   naszego mieszkania, podwórko za siatką, odcinek siatki bez bramy, wszystko na wolnych kafelkach.
   Czyste funkcje stanu i świata, bez DOM. */

import * as budowle from '../sim/budowle.ts';
import { BUILDS, type BuildKind, type BuildPlace, type Mat } from '../sim/budowle.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import type { SimState } from '../sim/sim.ts';
import type { SimStock } from '../sim/snapshot.ts';
import type { World } from '../world/world.ts';
import type { Sheet } from './okna.ts';
import { esc } from './tekst.ts';

export type Rot = 0 | 1 | 2 | 3;

export interface PlaceCheck {
  ok: boolean;
  why?: string;
}

/** sprawdzenie miejsca jak canPlace z kontraktu: lewy górny kafelek (x, y) i obrót */
export type CanPlace = (st: SimState, w: World, kind: BuildKind, x: number, y: number, rot: Rot) => PlaceCheck;

/** plan budowy w stanie gry (st.builds z kontraktu); interfejs czyta tylko miejsce */
interface PlanLike {
  kind: BuildKind;
  x: number;
  y: number;
  rot: number;
}

/** mieszkanie w stanie gry (st.apts z kontraktu): nasze, przeszukane pomieszczenia, naprawione uszkodzenia */
export interface AptGame {
  bid: number;
  apt: number;
  ours?: boolean;
  searched?: number[];
  repaired?: number[];
}

/** stan gry z polami fali 1 (dopóki symulacja ich nie ma, są puste) */
export const plansOf = (st: SimState): PlanLike[] => (st as unknown as { builds?: PlanLike[] }).builds ?? [];
export const aptsGame = (st: SimState): AptGame[] => (st as unknown as { apts?: AptGame[] }).apts ?? [];

/** rozmiar w kafelkach po obrocie (przy 1 i 3 zamienione) */
export function footprint(kind: BuildKind, rot: Rot): { w: number; h: number } {
  const d = BUILDS[kind];
  return rot % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/** numery naszych mieszkań w siedzibie: mieszkanie zarządu i zajęte (st.apts) */
export function ourApts(st: SimState, w: World): number[] {
  const i = w.interior;
  const out = i.home >= 0 ? [i.home] : [];
  for (const a of aptsGame(st)) if (a.ours && a.bid === i.building && !out.includes(a.apt)) out.push(a.apt);
  return out;
}

/** gdzie wolno stawiać, w słowach do menu i do powodu odmowy */
export const PLACE_TEXT: Record<BuildPlace, string> = {
  pokoj: 'w pokoju naszego mieszkania',
  kuchnia: 'w kuchni naszego mieszkania',
  podworko: 'na podwórku za siatką',
  obwod: 'w miejscu odcinka siatki',
};

/** Atrapa canPlace do czasu symulacji: te same reguły co w projekcie fali */
export const canPlaceAtrapa: CanPlace = (st, w, kind, x, y, rot) => {
  const def = BUILDS[kind];
  const { w: fw, h: fh } = footprint(kind, rot);
  const inside = w.interior;
  const ours = ourApts(st, w);
  const yard = new Set(w.fence.yard);
  const fence = new Set(w.fence.tiles);
  const g = w.fence.gate;
  for (let dy = 0; dy < fh; dy++)
    for (let dx = 0; dx < fw; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= w.size || ty >= w.size) return { ok: false, why: 'Poza mapą.' };
      const i = ty * w.size + tx;
      if (def.place === 'pokoj' || def.place === 'kuchnia') {
        const r = inside.room[i];
        const room = r >= 0 ? inside.rooms[r] : null;
        if (!room || !ours.includes(room.apt) || room.kind !== def.place)
          return { ok: false, why: `Tylko ${PLACE_TEXT[def.place]}.` };
      } else if (def.place === 'podworko') {
        if (!yard.has(i)) return { ok: false, why: `Tylko ${PLACE_TEXT.podworko}.` };
      } else {
        if (tx >= g.x && tx < g.x + g.w && ty >= g.y && ty < g.y + g.h)
          return { ok: false, why: 'Na bramie nie, brama musi się otwierać.' };
        if (!fence.has(i)) return { ok: false, why: `Tylko ${PLACE_TEXT.obwod}.` };
      }
      // wolne miejsce: siatka pod zasiekami jest w porządku, reszta ma być pusta
      if (def.place !== 'obwod' && w.blocked[i]) return { ok: false, why: 'Zajęte: tu nie da się stanąć.' };
      const cover = (o: { x: number; y: number; w: number; h: number }) =>
        tx >= o.x && tx < o.x + o.w && ty >= o.y && ty < o.y + o.h;
      if (st.things.some(cover)) return { ok: false, why: 'Zajęte: coś tu stoi.' };
      if (w.props.some(cover)) return { ok: false, why: 'Zajęte: coś tu leży.' };
      if (plansOf(st).some((p) => cover({ x: p.x, y: p.y, ...footprint(p.kind, (p.rot & 3) as Rot) })))
        return { ok: false, why: 'Tu już jest plan budowy.' };
    }
  return { ok: true };
};

/** canPlace z symulacji, kiedy już jest (kontrakt docs/M2-fala-1.md), a do tego czasu atrapa */
const CAN_PLACE = 'canPlace';
export const placeCheck: CanPlace =
  ((budowle as unknown as Record<string, unknown>)[CAN_PLACE] as CanPlace | undefined) ?? canPlaceAtrapa;

/** kafelki, od których (jako lewego górnego) budowla się zmieści: do podświetlenia w trybie stawiania */
export function allowedAnchors(st: SimState, w: World, kind: BuildKind, rot: Rot, check = placeCheck): number[] {
  const place = BUILDS[kind].place;
  const inside = w.interior;
  let cand: number[];
  if (place === 'podworko') cand = w.fence.yard;
  else if (place === 'obwod') cand = w.fence.tiles;
  else {
    const ours = ourApts(st, w);
    cand = [];
    inside.room.forEach((r, i) => {
      if (r >= 0 && ours.includes(inside.rooms[r].apt) && inside.rooms[r].kind === place) cand.push(i);
    });
  }
  return cand.filter((i) => check(st, w, kind, i % w.size, Math.floor(i / w.size), rot).ok);
}

/* ---------- menu budowy ---------- */

/** materiały po polsku jak w raporcie („deski 4, złom 2”) */
export const MAT_NAME: Record<Mat, string> = {
  drewno: 'drewno',
  deski: 'deski',
  zlom: 'złom',
  czesci: 'części',
  jedzenie: 'jedzenie',
  leki: 'leki',
};

/** materiały w zapasie z odczytu symulacji (drewno bez tego, co już się pali) */
export function matsOf(s: SimStock): Record<Mat, number> {
  return {
    drewno: s.woodSklad + s.woodLoose + s.woodCarried,
    deski: s.boards,
    zlom: s.scrap,
    czesci: s.parts,
    jedzenie: s.supplies,
    leki: s.meds,
  };
}

export const costText = (cost: Partial<Record<Mat, number>>): string =>
  (Object.entries(cost) as [Mat, number][])
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${MAT_NAME[m]} ${n}`)
    .join(', ');

/** czas pracy jednej osoby w godzinach gry („1 h pracy”, „30 min pracy”) */
export function workText(ticks: number): string {
  const min = Math.round((ticks / TICKS_PER_HOUR) * 60);
  return min >= 60 && min % 60 === 0 ? `${min / 60} h pracy` : `${min} min pracy`;
}

export interface BuildItem {
  kind: BuildKind;
  name: string;
  size: string;
  cost: string;
  time: string;
  effect: string;
  place: string;
  ok: boolean;
  /** czemu nie (brak miejsca albo materiałów), z podpowiedzią, skąd wziąć */
  why?: string;
}

export interface BuildCategory {
  key: 'pomieszczenie' | 'podworko' | 'obwod';
  title: string;
  items: BuildItem[];
}

const CATEGORIES: { key: BuildCategory['key']; title: string; places: BuildPlace[] }[] = [
  { key: 'pomieszczenie', title: 'Pomieszczenie', places: ['pokoj', 'kuchnia'] },
  { key: 'podworko', title: 'Podwórko', places: ['podworko'] },
  { key: 'obwod', title: 'Obwód', places: ['obwod'] },
];

/** skąd brać materiał, do powodu „brakuje” */
const SOURCE: Partial<Record<Mat, string>> = {
  deski: 'Deski daje przeszukiwanie pustych mieszkań i rozbiórka mebli.',
  zlom: 'Złom daje przeszukiwanie i rozbiórka śmieci i sprzętów.',
  czesci: 'Części daje przeszukiwanie i rozbiórka sprzętów.',
  drewno: 'Drewno daje ścinanie drzew.',
};

/** Menu budowy: kategorie z budowlami; niedostępne z powodem (nie ma gdzie postawić albo brakuje
    materiałów). room(kind): czy jest choć jedno wolne miejsce na tę budowlę. */
export function buildMenu(have: Partial<Record<Mat, number>>, room: (kind: BuildKind) => boolean): BuildCategory[] {
  return CATEGORIES.map((c) => ({
    key: c.key,
    title: c.title,
    items: (Object.keys(BUILDS) as BuildKind[])
      .filter((k) => c.places.includes(BUILDS[k].place))
      .map((kind) => {
        const d = BUILDS[kind];
        const short = (Object.entries(d.cost) as [Mat, number][])
          .map(([m, n]): [Mat, number] => [m, n - (have[m] ?? 0)])
          .filter(([, n]) => n > 0);
        let why: string | undefined;
        if (!room(kind)) why = `Nie ma gdzie postawić: brak wolnego miejsca ${PLACE_TEXT[d.place]}.`;
        else if (short.length)
          why =
            `Brakuje: ${short.map(([m, n]) => `${MAT_NAME[m]} ${n}`).join(', ')}. ${SOURCE[short[0][0]] ?? ''}`.trim();
        return {
          kind,
          name: d.name,
          size: `${d.w}×${d.h}`,
          cost: costText(d.cost),
          time: workText(d.work),
          effect: d.effect,
          place: PLACE_TEXT[d.place],
          ok: !why,
          why,
        };
      }),
  }));
}

/** okno menu budowy (przycisk „Budowa” i klawisz B) */
export function buildSheet(menu: BuildCategory[], touch: boolean): Sheet {
  const item = (b: BuildItem) =>
    `<li class="build ${b.ok ? 'ok' : 'no'}"><div class="build-head"><b class="build-n">${esc(b.name)}</b><small class="build-size">${esc(
      b.size,
    )}</small></div><p class="build-d">${esc(b.effect)}</p><p class="build-m"><span class="build-cost">${esc(
      b.cost,
    )}</span> · <span>${esc(b.time)}</span> · <span>${esc(b.place)}</span></p>${
      b.ok
        ? `<button type="button" class="btn go" data-act="build" data-arg="${b.kind}">Postaw</button>`
        : `<p class="build-why">${esc(b.why ?? '')}</p>`
    }</li>`;
  return {
    tone: 'menu',
    kicker: touch ? 'Budowa' : 'Budowa (B)',
    title: 'Co budujemy?',
    body: `<p class="lead">Plan stawia się na mapie, a zarząd sam przynosi materiały i buduje.${
      touch
        ? ' Stuknięcie stawia plan, przyciski na dole obracają i anulują.'
        : ' Lewy klik stawia plan, R obraca, prawy klik albo Esc anuluje.'
    }</p>${menu
      .map(
        (c) =>
          `<section class="bcat" data-cat="${c.key}"><h3 class="bcat-h">${esc(c.title)}</h3><ul class="builds">${c.items
            .map(item)
            .join('')}</ul></section>`,
      )
      .join('')}`,
    foot: '<button type="button" class="btn ghost" data-act="build-close">Zamknij</button>',
    closable: true,
  };
}
