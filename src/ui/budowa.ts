/* Menu budowy w interfejsie (docs/M2-fala-1.md, docs/superpowers/specs/2026-10-18-menu-budowy-design.md): menu z BUILDS
   jako dane (buildMenu: zakładki z BuildDef.cat, koszt, czas pracy, działanie, miejsce, powód braku, blokady badaniem
   z BUILD_MENU i TECH_NAMES), treść panelu po prawej (buildPanelHtml: zakładki, kafelki z miniaturą, szczegóły),
   skróty stanu panelu (stockKey, placeKey), dozwolone miejsca w trybie stawiania z canPlace symulacji i polecenia
   przy planach i gotowych budowlach w menu pod prawym przyciskiem. Czyste funkcje stanu i świata, bez DOM
   (DOM robi panelbudowy.ts). Napisy w bieżącym języku: polskie tablice zostają tutaj, angielskie leżą obok
   (budowa.en.ts, src/sim/budowle.en.ts, src/sim/mieszkania.en.ts). */

import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import { BUILDS_EN, effectEnOf } from '../sim/budowle.en.ts';
import {
  BUILD_CATS,
  BUILDS,
  type BuildCat,
  type BuildKind,
  type BuildPlace,
  canPlace,
  effectOf,
  footprint,
  isUnlocked,
  type Mat,
} from '../sim/budowle.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { MAT_EN } from '../sim/mieszkania.en.ts';
import type { MenuItem } from '../sim/orders.ts';
import type { SimState } from '../sim/sim.ts';
import type { SimStock } from '../sim/snapshot.ts';
import type { World } from '../world/world.ts';
import { placeEn } from './budowa.en.ts';
import type { Sheet } from './okna.ts';
import { esc } from './tekst.ts';

export type Rot = 0 | 1 | 2 | 3;

/** materiały, które plany jeszcze zabiorą ze składu: potrzebne minus przyniesione, z każdego planu */
export function reservedOf(st: SimState): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = {};
  for (const p of st.builds)
    for (const [m, n] of Object.entries(p.need) as [Mat, number][]) {
      const left = n - (p.have[m] ?? 0);
      if (left > 0) out[m] = (out[m] ?? 0) + left;
    }
  return out;
}

/** materiały do menu budowy: zapas minus to, co zarezerwowały plany */
export function availableOf(st: SimState, s: SimStock): Record<Mat, number> {
  const have = matsOf(s);
  const r = reservedOf(st);
  for (const m of Object.keys(have) as Mat[]) have[m] = Math.max(0, have[m] - (r[m] ?? 0));
  return have;
}

/** materiały, które występują w kosztach budowli: tylko one zmieniają treść menu (drewno z palenia w kozie czy
    jedzenie z posiłków nie), a nowa budowla z innym materiałem dołoży go tu sama */
function costMats(): Mat[] {
  return [...new Set(Object.values(BUILDS).flatMap((d) => Object.keys(d.cost) as Mat[]))];
}

/** skrót zapasu z availableOf, od którego zależy treść panelu budowy */
export const stockKey = (have: Record<Mat, number>): string =>
  costMats()
    .map((m) => have[m] ?? 0)
    .join(',');

/** Skrót tego, od czego zależą miejsca na budowle (canPlace): plany, rzeczy z położeniem (kupka wody nosi się po
    podwórku bez zmiany liczby rzeczy), nasze mieszkania i odblokowane badania. */
export const placeKey = (st: SimState): string =>
  [
    st.builds.map((b) => b.id).join(),
    st.things.map((t) => `${t.id}@${t.x},${t.y}`).join(),
    st.apts
      .filter((a) => a.ours)
      .map((a) => a.apt)
      .join(),
    st.techDone?.length ?? 0,
  ].join('|');

/** numery naszych mieszkań w siedzibie: mieszkanie zarządu i zajęte (st.apts) */
export const ourApts = (st: SimState): number[] => st.apts.filter((a) => a.ours).map((a) => a.apt);

/** gdzie wolno stawiać, w słowach do menu i do powodu braku miejsca (nasze mieszkanie albo dom ze słownika) */
export const placeText = (place: BuildPlace, w: Words = wordsOf(BLOK)): string =>
  ({
    pokoj: `w pokoju ${w.lokal.d}`,
    kuchnia: `w kuchni ${w.lokal.d}`,
    podworko: 'na podwórku za siatką',
    obwod: 'w miejscu odcinka siatki',
  })[place];
/** to samo w bieżącym języku */
const placeL = (place: BuildPlace, w: Words, e: WordsEn): string => L(placeText(place, w), placeEn(place, e));

/** nazwa budowli w bieżącym języku (menu, pasek trybu stawiania, duch planu) */
export const buildName = (kind: BuildKind): string => L(BUILDS[kind].name, BUILDS_EN[kind].name);

/** kafelki, na których budowla może stanąć: suma podstaw z dozwolonych zakotwiczeń (dla view.setPlacement) */
export function okTilesOf(anchors: readonly number[], kind: BuildKind, rot: Rot, size: number): number[] {
  const { w: fw, h: fh } = footprint(kind, rot);
  const out = new Set<number>();
  for (const a of anchors) for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) out.add(a + dy * size + dx);
  return [...out].sort((x, y) => x - y);
}

/** Kafelki, od których (jako lewego górnego) budowla może stanąć według canPlace symulacji, do podświetlenia
    w trybie stawiania. Pytam tylko o pomieszczenia naszych mieszkań, podwórko albo siatkę, a nie o całą mapę:
    lewy górny kafelek leży zawsze w tym samym miejscu co cała budowla. */
export function allowedAnchors(st: SimState, w: World, kind: BuildKind, rot: Rot): number[] {
  const place = BUILDS[kind].place;
  const inside = w.interior;
  let cand: number[];
  if (place === 'podworko') cand = w.fence.yard;
  else if (place === 'obwod') cand = w.fence.tiles;
  else {
    const ours = ourApts(st);
    cand = [];
    inside.room.forEach((r, i) => {
      if (r >= 0 && ours.includes(inside.rooms[r].apt) && inside.rooms[r].kind === place) cand.push(i);
    });
  }
  return cand.filter((i) => canPlace(st, w, kind, i % w.size, Math.floor(i / w.size), rot).ok);
}

/* ---------- polecenia przy planach i budowlach ---------- */

/** nazwy budowli w bierniku do menu („Rozebrać zasieki”) */
const BUILD_ACC: Record<BuildKind, string> = {
  warsztat: 'warsztat',
  kuchnia_spoleczna: 'kuchnię społeczną',
  magazyn: 'magazyn',
  lozka_pietrowe: 'łóżka piętrowe',
  ogrodek: 'ogródek',
  zasieki: 'zasieki',
};

/** Polecenia przy planie budowy albo gotowej budowli pod kafelkiem, do menu pod prawym przyciskiem (przed
    „Idź tu”): zaznaczeni z zarządu biorą się do planu, plan można odwołać (przyniesione materiały zostają obok),
    a gotową budowlę rozebrać (wraca połowa kosztu, więc z potwierdzeniem). „Budować” tylko wtedy, gdy
    symulacja je przyjmie: nikt inny przy planie nie pracuje, a materiału starczy na całość (sterty minus to,
    czego potrzebują plany, przy których pracuje ktoś inny, jak coverable w symulacji). */
export function buildItems(st: SimState, w: World, ids: readonly number[], tile: number, stock: SimStock): MenuItem[] {
  const core = st.pawns.filter((p) => ids.includes(p.id) && p.kind === 'core').map((p) => p.id);
  if (!core.length || tile < 0) return [];
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  const plan = st.builds.find((b) => {
    const f = footprint(b.kind, b.rot);
    return x >= b.x && x < b.x + f.w && y >= b.y && y < b.y + f.h;
  });
  if (plan) {
    const free = matsOf(stock);
    for (const o of st.builds) {
      if (o === plan || o.by < 0 || core.includes(o.by)) continue;
      for (const [m, n] of Object.entries(o.need) as [Mat, number][]) free[m] -= Math.max(0, n - (o.have[m] ?? 0));
    }
    const enough = (Object.entries(plan.need) as [Mat, number][]).every(([m, n]) => n - (plan.have[m] ?? 0) <= free[m]);
    const out: MenuItem[] = [];
    if (enough && (plan.by < 0 || core.includes(plan.by)))
      out.push({
        cmd: { t: 'build', ids: core, kind: plan.kind, x: plan.x, y: plan.y, rot: plan.rot },
        label: L(`Budować ${BUILD_ACC[plan.kind]}`, `Build ${BUILDS_EN[plan.kind].the}`),
        quick: true,
      });
    out.push({
      cmd: { t: 'unbuild', ids: core, id: plan.id },
      label: L('Odwołać plan', 'Cancel the plan'),
      quick: false,
    });
    return out;
  }
  const done = st.things.find((t) => t.kind in BUILDS && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  if (done)
    return [
      {
        cmd: { t: 'unbuild', ids: core, id: done.id },
        label: L(`Rozebrać ${BUILD_ACC[done.kind as BuildKind]}`, `Tear down ${BUILDS_EN[done.kind as BuildKind].the}`),
        quick: false,
        confirm: true,
      },
    ];
  return [];
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
/** materiał w bieżącym języku */
const matName = (m: Mat): string => L(MAT_NAME[m], MAT_EN[m]);

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
    .map(([m, n]) => `${matName(m)} ${n}`)
    .join(', ');

/** czas pracy jednej osoby w godzinach gry („1 h pracy”, „1,5 h pracy”, „45 min pracy”; po angielsku „1.5 h of
    work”) */
export function workText(ticks: number): string {
  const min = Math.round((ticks / TICKS_PER_HOUR) * 60);
  const of = L('pracy', 'of work');
  if (min < 60) return `${min} min ${of}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!m) return `${h} h ${of}`;
  return m === 30 ? `${h}${L(',5', '.5')} h ${of}` : `${h} h ${m} min ${of}`;
}

/** Widok z kłódkami: do czasu badań zablokowana budowla, której nie da się odblokować, byłaby ślepą uliczką, więc
    menu pokazuje tylko to, co wolno postawić. Gdy badania ruszą, wystarczy tu ustawić true. */
export const BUILD_MENU: { showLocked: boolean } = { showLocked: false };

/** nazwy badań do napisu „Wymaga badania”; wypełni je projekt badań (bez wpisu pokazuje się identyfikator) */
export const TECH_NAMES: Record<string, Tx> = {};
const techName = (id: string): string => (TECH_NAMES[id] ? tr(TECH_NAMES[id]) : id);

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
  /** „Wymaga badania: …”, gdy budowla czeka na badanie (tylko przy BUILD_MENU.showLocked); jest też w why */
  locked?: string;
}

export interface BuildCategory {
  key: BuildCat;
  title: string;
  items: BuildItem[];
}

const CAT_TITLE: Record<BuildCat, Tx> = {
  dom: tx('Dom', 'Home'),
  podworko: tx('Podwórko', 'Yard'),
  obwod: tx('Obwód', 'Perimeter'),
};

/** skąd brać materiał, do powodu „brakuje”, w obu językach (w domu przeszukiwanie domu i gruz ze słownika) */
const source = (w: Words, e: WordsEn): Partial<Record<Mat, Tx>> => ({
  deski: tx(`Deski daje ${w.szukanie.zrodla.deski}.`, `Planks come from ${e.szukanie.zrodla.deski}.`),
  zlom: tx(`Złom daje ${w.szukanie.zrodla.zlom}.`, `Scrap comes from ${e.szukanie.zrodla.zlom}.`),
  czesci: tx(`Części daje ${w.szukanie.zrodla.czesci}.`, `Parts come from ${e.szukanie.zrodla.czesci}.`),
  drewno: tx('Drewno daje ścinanie drzew.', 'Wood comes from chopping down trees.'),
});

/** Menu budowy: zakładki z budowlami (zakładka bez pozycji znika); niedostępne z powodem (nie ma gdzie postawić
    albo brakuje materiałów). room(kind): czy jest choć jedno wolne miejsce na tę budowlę. Zablokowane badaniem
    (opts.st.techDone) są ukryte, a z opts.showLocked (domyślnie BUILD_MENU.showLocked) pokazane jako „Wymaga badania”. */
export function buildMenu(
  have: Partial<Record<Mat, number>>,
  room: (kind: BuildKind) => boolean,
  words: Words = wordsOf(BLOK),
  en: WordsEn = wordsEn(BLOK),
  opts: { st?: Pick<SimState, 'techDone'>; showLocked?: boolean } = {},
): BuildCategory[] {
  const st = opts.st ?? {};
  const showLocked = opts.showLocked ?? BUILD_MENU.showLocked;
  return BUILD_CATS.map((key) => ({
    key,
    title: tr(CAT_TITLE[key]),
    items: (Object.keys(BUILDS) as BuildKind[])
      .filter((k) => BUILDS[k].cat === key && (showLocked || isUnlocked(st, k)))
      .map((kind) => {
        const d = BUILDS[kind];
        const short = (Object.entries(d.cost) as [Mat, number][])
          .map(([m, n]): [Mat, number] => [m, n - (have[m] ?? 0)])
          .filter(([, n]) => n > 0);
        let why: string | undefined;
        let locked: string | undefined;
        if (!isUnlocked(st, kind)) {
          const name = techName(d.tech ?? '');
          locked = L(`Wymaga badania: ${name}`, `Needs research: ${name}`);
          why = locked;
        } else if (!room(kind))
          why = L(
            `Nie ma gdzie postawić: brak wolnego miejsca ${placeText(d.place, words)}.`,
            `Nowhere to put it: no free space ${placeEn(d.place, en)}.`,
          );
        else if (short.length) {
          const list = short.map(([m, n]) => `${matName(m)} ${n}`).join(', ');
          const src = tr(source(words, en)[short[0][0]]);
          why = L(`Brakuje: ${list}. ${src}`, `Still needed: ${list}. ${src}`).trim();
        }
        return {
          kind,
          name: buildName(kind),
          size: `${d.w}×${d.h}`,
          cost: costText(d.cost),
          time: workText(d.work),
          effect: L(effectOf(kind, words), effectEnOf(kind, en)),
          place: placeL(d.place, words, en),
          ok: !why,
          why,
          locked,
        };
      }),
  })).filter((c) => c.items.length > 0);
}

/** co panel pokazuje: aktywna zakładka i wybrana budowla (null: pierwsza z menu) */
export type PanelView = { tab: BuildCat | null; kind: BuildKind | null };

/** Treść panelu budowy (aside obok karty osoby): zakładki, kafelki aktywnej zakładki z miniaturą i szczegóły
    każdej jej budowli (widoczne tylko wybranej, przycisk „Postaw” tylko dla dostępnych). Wybór spoza aktywnej
    zakładki albo spoza menu wraca do pierwszej budowli zakładki, a puste menu daje komunikat. Zwraca kształt Sheet
    (kicker, title, body) razem z wyliczonym widokiem; miniatury podaje thumb (data: URL), w testach atrapa. */
export function buildPanelHtml(
  menu: BuildCategory[],
  view: PanelView,
  touch: boolean,
  words: Words = wordsOf(BLOK),
  en: WordsEn = wordsEn(BLOK),
  thumb: (kind: BuildKind) => string = () => '',
): Sheet & { view: PanelView } {
  const kicker = touch ? L('Budowa', 'Build') : L('Budowa (B)', 'Build (B)');
  const title = L('Co budujemy?', 'What are we building?');
  const wrap = (body: string, v: PanelView) => ({ tone: 'menu' as const, kicker, title, body, foot: '', view: v });
  const cat = menu.find((c) => c.key === view.tab) ?? menu[0];
  if (!cat) {
    return wrap(`<p class="build-empty">${L('Na razie nic nie można zbudować.', 'Nothing can be built yet.')}</p>`, {
      tab: null,
      kind: null,
    });
  }
  const sel = cat.items.find((b) => b.kind === view.kind) ?? cat.items[0];
  const tile = (b: BuildItem) =>
    `<button type="button" class="tile${b.kind === sel.kind ? ' sel' : ''}${b.locked ? ' lock' : b.ok ? '' : ' no'}" data-kind="${
      b.kind
    }" aria-pressed="${b.kind === sel.kind}"><span class="th"><img src="${esc(thumb(b.kind))}" alt=""></span><span class="tn">${esc(
      b.name,
    )}</span><span class="ts">${esc(b.size)}${b.locked ? ' <span aria-hidden="true">🔒</span>' : ''}</span></button>`;
  const detail = (b: BuildItem) =>
    `<section class="bd" data-kind="${b.kind}"${b.kind === sel.kind ? '' : ' hidden'}><div class="build-head"><b class="build-n">${esc(
      b.name,
    )}</b><small class="build-size">${esc(b.size)}</small></div><p class="build-d">${esc(b.effect)}</p><p class="build-m"><span class="build-cost">${esc(
      b.cost,
    )}</span> · <span>${esc(b.time)}</span> · <span>${esc(b.place)}</span></p>${
      b.ok
        ? `<button type="button" class="btn go" data-act="build" data-arg="${b.kind}">${L('Postaw', 'Build')}</button>`
        : `<p class="build-why">${esc(b.why ?? '')}</p>`
    }</section>`;
  const lead = `<p class="lead">${L(
    `Plan stawia się na mapie, a ${words.zarzad.krotko} sam przynosi materiały i buduje.`,
    `You place the plan on the map, and ${en.krotko} fetches the materials and does the building.`,
  )}${
    touch
      ? L(
          ' Stuknięcie stawia plan, przyciski na dole obracają i anulują.',
          ' Tap to place the plan; the buttons at the bottom rotate and cancel.',
        )
      : L(
          ' Lewy klik stawia plan, R obraca, prawy klik albo Esc anuluje.',
          ' Left-click places the plan, R rotates, right-click or Esc cancels.',
        )
  }</p>`;
  const tabs = menu
    .map(
      (c) =>
        `<button type="button" role="tab" class="btab" data-tab="${c.key}" aria-selected="${c.key === cat.key}" tabindex="${
          c.key === cat.key ? 0 : -1
        }">${esc(c.title)}</button>`,
    )
    .join('');
  return wrap(
    `${lead}<div class="btabs" role="tablist" aria-label="${esc(title)}">${tabs}</div><div class="bgrid" role="tabpanel">${cat.items
      .map(tile)
      .join('')}</div><div class="bdet">${cat.items.map(detail).join('')}</div>`,
    { tab: cat.key, kind: sel.kind },
  );
}
