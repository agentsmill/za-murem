/* Polecenia z kliknięcia i opisy prac do karty osoby. Czyste funkcje stanu i świata: interfejs pyta,
   co znaczy kliknięcie prawym przyciskiem na kafelku, i dostaje gotowe polecenie dla symulacji. */

import { wordsOfWorld } from '../gov/miejsce.ts';
import type { World } from '../world/world.ts';
import { weaponOf } from './bron.ts';
import type { BuildKind, Mat } from './budowle.ts';
import { NAPISY as HANDEL } from './handlarz.ts';
import { dryTreeOf, houseOf, inHomeApt, type RoomKind } from './house.ts';
import { MAT_ACC, REPAIR, RUBBISH } from './mieszkania.ts';
import { gateTiles } from './perimeter.ts';
import {
  BRACE_COST,
  BURNABLE,
  CAMPFIRE_WOOD,
  type Command,
  campfireSpotOk,
  canCookIn,
  dismantlable,
  FURNITURE_ACC,
  isEnemy,
  KOZA_POST,
  PATCH_COST,
  type Pawn,
  SIATKA_POST,
  type SimState,
  SPEAR_BOARDS,
  SPEAR_SCRAP,
  STAY_FIRE,
  STAY_MEAL,
  STAY_YARD,
  type Thing,
  trunkOf,
} from './sim.ts';
import { BATCH, CARRY_MATS, NAPISY, type Product, RECIPES, wreckAt, wreckStage, wreckTile } from './surowce.ts';
import { modeOf } from './tryb.ts';

/** nazwy w bierniku do menu i opisów: pomieszczenia, rzeczy do rozebrania, budowle */
const ROOM_ACC: Record<RoomKind, string> = {
  klatka: 'klatkę',
  przedpokoj: 'przedpokój',
  pokoj: 'pokój',
  kuchnia: 'kuchnię',
  lazienka: 'łazienkę',
  sala: 'salę',
  hala: 'halę',
  zaplecze: 'zaplecze',
};
export const THING_ACC: Record<string, string> = {
  ...FURNITURE_ACC,
  kuchenka: 'kuchenkę',
  lodowka: 'lodówkę',
  wanna: 'wannę',
  umywalka: 'umywalkę',
  koza: 'kozę',
  smieci: 'śmieci',
  gruz: 'gruz',
};
const BUILD_ACC: Record<BuildKind, string> = {
  warsztat: 'warsztat',
  kuchnia_spoleczna: 'kuchnię społeczną',
  magazyn: 'magazyn',
  lozka_pietrowe: 'łóżka piętrowe',
  ogrodek: 'ogródek',
  zasieki: 'zasieki',
};

export interface MenuItem {
  cmd: Command;
  label: string;
  /** można wykonać od razu jednym kliknięciem albo stuknięciem (domyślne polecenie); false: tylko z menu */
  quick: boolean;
  /** niszczy coś na zawsze (palenie mebli): interfejs pyta o potwierdzenie */
  confirm?: boolean;
  /** teraz nie da się wybrać, z tego powodu (oferta handlarza bez materiału): menu pokazuje ją wyszarzoną */
  off?: string;
}

/** drzewo pod kursorem: najbliższy pień w zasięgu korony (najwyżej 2,5 m), także sam kafelek pnia; −1: brak */
export function treeAt(st: SimState, w: World, tile: number): number {
  const cx = (tile % w.size) + 0.5;
  const cy = Math.floor(tile / w.size) + 0.5;
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d > Math.max(0.75, Math.min(t.r, 2.5)) || d >= bd || st.felled.includes(k)) return;
    bd = d;
    best = k;
  });
  return best;
}

const thingAt = (st: SimState, w: World, tile: number, kind: string): Thing | undefined => {
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  return st.things.find((t) => t.kind === kind && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
};

/** Polecenia, które mają sens na klikniętym kafelku (menu kontekstowe z GDD), „Idź tu” zawsze na końcu.
    Drewno poza składem: zanieść do składu. Koza albo ognisko, gdy jest skąd wziąć drewno: dołożyć. Drzewo: ściąć,
    od razu tylko po kliknięciu w pień albo tuż obok, bo drzewa nie odrastają, a stuknięcie w las ma znaczyć „idź”.
    Dziura w siatce: załatać (gdy na stertach starczy desek i złomu) i pilnować. Brama: pilnować, zamknąć albo
    otworzyć. Wolny kafelek podwórka: rozpalić ognisko (tylko z menu). Polecenia przyjmuje tylko zarząd: bez nikogo
    z rdzenia lista jest pusta. */
export function commandsAt(st: SimState, w: World, ids: readonly number[], tile: number): MenuItem[] {
  const core = ids.filter((id) => st.pawns.some((p) => p.id === id && p.kind === 'core'));
  if (!core.length) return [];
  const out: MenuItem[] = [];
  // wróg pod kursorem (najwyżej metr od środka kafelka): atak jako pierwsze, domyślne polecenie
  const cx = (tile % w.size) + 0.5;
  const cy = Math.floor(tile / w.size) + 0.5;
  let foe: Pawn | undefined;
  let fd = 1;
  for (const p of st.pawns)
    if (isEnemy(p) && !p.away && Math.hypot(p.x - cx, p.y - cy) <= fd) {
      fd = Math.hypot(p.x - cx, p.y - cy);
      foe = p;
    }
  // wróg za siatką: atak tylko dla tych, których broń sięga przez siatkę (nikt nie wychodzi na ulicę)
  const fighters = foe && acrossFence(st, w, core, foe) ? core.filter((id) => reachesThrough(st, id)) : core;
  if (foe && fighters.length)
    out.push({
      cmd: { t: 'attack', ids: fighters, target: foe.id },
      label: foe.kind === 'zombie' ? 'Atakuj szwendacza' : 'Atakuj szabrownika',
      quick: true,
    });
  // handlarz pod bramą (na nim albo na jego wózku): jego towar, wyszarzony, gdy nie starcza materiału, i napaść
  const trader = st.obcy && st.obcy.trader >= 0 ? st.pawns.find((p) => p.id === st.obcy!.trader) : undefined;
  if (trader?.job?.t === 'trader' && trader.job.phase === 1) {
    const cart = st.things.find((t) => t.id === trader.job!.from);
    const onCart = !!cart && cart.y * w.size + cart.x === tile;
    if (onCart || Math.hypot(trader.x - cx, trader.y - cy) <= 1) {
      const stock = (m: Mat) => st.things.reduce((a, t) => a + (t.kind === m && t.n > 0 ? t.n : 0), 0);
      st.obcy!.offers.forEach((o, k) => {
        if (o.left <= 0) return;
        const short: Partial<Record<Mat, number>> = {};
        for (const [m, n] of Object.entries(o.take) as [Mat, number][]) if (stock(m) < n) short[m] = n - stock(m);
        const item: MenuItem = { cmd: { t: 'trade', ids: core, offer: k }, label: HANDEL.oferta(o).pl, quick: false };
        if (Object.keys(short).length) item.off = HANDEL.brakuje(short).pl;
        out.push(item);
      });
      out.push({ cmd: { t: 'rob', ids: core }, label: HANDEL.napasc.pl, quick: false, confirm: true });
    }
  }
  // zwłoki, które wstaną: dobić
  const body = thingAt(st, w, tile, 'zwloki');
  if (body && body.fuel > 0) out.push({ cmd: { t: 'finish', ids: core, thing: body.id }, label: 'Dobić', quick: true });
  const sklad = houseOf(w)?.sklad ?? [];
  const pile = thingAt(st, w, tile, 'drewno');
  if (pile && sklad.length && !sklad.includes(tile))
    out.push({ cmd: { t: 'haul', ids: core, thing: pile.id }, label: 'Zanieść do składu', quick: true });
  const koza = thingAt(st, w, tile, 'koza');
  const wood = st.things.some((t) => t.kind === 'drewno' && t.n > 0) || st.pawns.some((p) => p.carry > 0);
  if (koza && wood)
    out.push({ cmd: { t: 'refuel', ids: core, thing: koza.id }, label: 'Dołożyć do kozy', quick: true });
  // dyżur przy kozie zarządu do rana (warta z posterunkiem 'koza'; w karcie nocy klucz 'warta:koza')
  const house = houseOf(w);
  if (koza && house && inHomeApt(house, koza.y * w.size + koza.x))
    out.push({ cmd: { t: 'guard', ids: core, post: 'koza' }, label: 'Czuwać przy kozie', quick: false });
  const fire = thingAt(st, w, tile, 'ognisko');
  if (fire && wood)
    out.push({ cmd: { t: 'refuel', ids: core, thing: fire.id }, label: 'Dołożyć do ogniska', quick: true });
  // dziura w siatce: łata z desek albo złomu ze sterty, warta przy niej
  const hole = st.fence?.holes.find((h) => !h.patch && h.tiles.includes(tile));
  if (hole) {
    // łata jest z jednego materiału: desek albo złomu musi starczyć na całą
    const mat = (k: string) => st.things.reduce((a, t) => a + (t.kind === k ? t.n : 0), 0);
    if (mat('deski') >= PATCH_COST || mat('zlom') >= PATCH_COST)
      out.push({ cmd: { t: 'patch', ids: core, hole: hole.id }, label: 'Załatać dziurę', quick: true });
    out.push({ cmd: { t: 'guard', ids: core, post: `d${hole.id}` }, label: 'Pilnować tutaj', quick: false });
  }
  // siatka: wzmocnić uszkodzony kafelek (2 deski albo 2 złomu ze stert), w trybie zombie pilnować przy siatce
  const k = w.fence?.tiles.indexOf(tile) ?? -1;
  if (st.fence && k >= 0 && !st.fence.holes.some((h) => h.tiles.includes(tile))) {
    const mat = (kind: string) => st.things.reduce((a, t) => a + (t.kind === kind ? t.n : 0), 0);
    if (st.fence.hp[k] > 0 && st.fence.hp[k] < 100 && (mat('deski') >= BRACE_COST || mat('zlom') >= BRACE_COST))
      out.push({ cmd: { t: 'brace', ids: core, tile }, label: 'Wzmocnić siatkę', quick: true });
    if (modeOf(st) === 'zombie')
      out.push({ cmd: { t: 'guard', ids: core, post: 'siatka' }, label: 'Pilnować przy siatce', quick: false });
  }
  // sterta desek albo złomu: dzida, gdy starczy materiału
  if (thingAt(st, w, tile, 'deski') || thingAt(st, w, tile, 'zlom')) {
    const mat = (kind: string) => st.things.reduce((a, t) => a + (t.kind === kind ? t.n : 0), 0);
    if (mat('deski') >= SPEAR_BOARDS && mat('zlom') >= SPEAR_SCRAP)
      out.push({ cmd: { t: 'craft', ids: core, item: 'dzida' }, label: 'Zrobić dzidę', quick: false });
  }
  if (st.fence && gateTiles(w).includes(tile)) {
    // w domu furtka
    const brama = wordsOfWorld(w).brama;
    out.push({ cmd: { t: 'guard', ids: core, post: 'brama' }, label: `Pilnować ${brama.d}`, quick: false });
    const open = st.fence.gateOpen;
    out.push({
      cmd: { t: 'gate', ids: core, open: !open },
      label: `${open ? 'Zamknąć' : 'Otworzyć'} ${brama.b}`,
      quick: false,
    });
  }
  // wrak: przeszukać (domyślne na samym aucie, tuż obok tylko z menu, żeby kliknięcie obok znaczyło „idź”), po
  // przeszukaniu rozebrać (tylko z menu: długo i głośno)
  const wreck = wreckAt(w, tile);
  if (wreck) {
    const wt = wreckTile(wreck, w.size);
    const s = wreckStage(st.wraki, wt);
    const tx = tile % w.size;
    const ty = Math.floor(tile / w.size);
    const onBase = tx >= wreck.x && tx < wreck.x + wreck.w && ty >= wreck.y && ty < wreck.y + wreck.h;
    if (s === 0)
      out.push({
        cmd: { t: 'wreck', ids: core, tile: wt, how: 'szukaj' },
        label: NAPISY.szukaj(wreck.model).pl,
        quick: onBase,
      });
    else if (s === 1)
      out.push({
        cmd: { t: 'wreck', ids: core, tile: wt, how: 'rozbierz' },
        label: NAPISY.rozbierz(wreck.model).pl,
        quick: false,
      });
  }
  const tree = treeAt(st, w, tile);
  if (tree >= 0) {
    const trunk = trunkOf(w, w.trees[tree]);
    const near =
      Math.abs((trunk % w.size) - (tile % w.size)) <= 1 &&
      Math.abs(Math.floor(trunk / w.size) - Math.floor(tile / w.size)) <= 1;
    out.push({ cmd: { t: 'chop', ids: core, tree }, label: 'Ściąć drzewo', quick: near });
  }
  // kuchenka zarządu albo zapasy: gotować, gdy jest z czego i na czym
  if ((thingAt(st, w, tile, 'kuchenka') || thingAt(st, w, tile, 'jedzenie')) && canCookIn(st, w))
    out.push({ cmd: { t: 'cook', ids: core }, label: 'Gotować', quick: true });
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  const furniture = st.things.find((t) => BURNABLE[t.kind] && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  if (furniture)
    out.push({
      cmd: { t: 'burn', ids: core, thing: furniture.id },
      label: `Spalić ${FURNITURE_ACC[furniture.kind]}`,
      quick: false,
      confirm: true,
    });
  // M2: rozbiórka na materiał (śmieci i gruz od razu, meble pustych mieszkań z menu), naprawa uszkodzenia, gdy
  // materiałów starczy, przeszukanie pomieszczenia i zajęcie pustego mieszkania
  const things = st.things.filter((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  for (const t of things)
    if (dismantlable(st, w, t)) {
      const rubbish = RUBBISH.has(t.kind);
      const item: MenuItem = {
        cmd: { t: 'dismantle', ids: core, thing: t.id },
        label: `Rozebrać ${THING_ACC[t.kind] ?? 'to'}`,
        quick: rubbish,
      };
      if (rubbish) out.unshift(item);
      else out.push(item);
    }
  const have = (m: Mat) => st.things.reduce((a, t) => a + (t.kind === m ? t.n : 0), 0);
  st.damage.forEach((d, k) => {
    if (d.fixed || d.tile !== tile) return;
    const def = REPAIR[d.kind];
    const ok = (Object.entries(def.cost) as [Mat, number][]).every(([m, v]) => have(m) + (d.have[m] ?? 0) >= v);
    if (ok) out.push({ cmd: { t: 'repair', ids: core, damage: k }, label: `Naprawić ${def.acc}`, quick: false });
  });
  const hq = houseOf(w);
  const room = hq && hq.room[tile] >= 0 ? hq.rooms[hq.room[tile]] : null;
  const g = room ? st.apts.find((a) => a.apt === room.apt) : undefined;
  if (room && g?.state === 'puste') {
    if (!g.searched.includes(room.id))
      out.push({
        cmd: { t: 'search', ids: core, room: room.id },
        label: `Przeszukać ${ROOM_ACC[room.kind]}`,
        quick: false,
      });
    if (!g.ours) out.push({ cmd: { t: 'claim', ids: core, apt: g.apt }, label: 'Zająć mieszkanie', quick: false });
  }
  // łup za siatką: zanieść na podwórko (drewno ma swoje „Zanieść do składu”)
  const loot = st.fence ? things.find((t) => CARRY_MATS.has(t.kind) && t.n > 0) : undefined;
  if (loot && !insideOf(st, w, tile))
    out.push({ cmd: { t: 'carry', ids: core, thing: loot.id }, label: NAPISY.zaniesc.pl, quick: true });
  // warsztat: drewno na deski, złom na części; jedna sztuka albo do BATCH naraz, gdy materiału starczy
  if (things.some((t) => t.kind === 'warsztat')) {
    const make = (what: Product, one: string, many: (n: number) => string) => {
      const r = RECIPES[what];
      const can = Math.min(BATCH, Math.floor(have(r.from) / r.n));
      if (can >= 1) out.push({ cmd: { t: 'saw', ids: core, what, n: 1 }, label: one, quick: false });
      if (can >= 2) out.push({ cmd: { t: 'saw', ids: core, what, n: can }, label: many(can), quick: false });
    };
    make('deski', NAPISY.deska.pl, (n) => NAPISY.deskiN(n).pl);
    make('czesci', NAPISY.czesc.pl, (n) => NAPISY.czesciN(n).pl);
  }
  // ognisko na wolnym kafelku podwórka, gdy jest z czego (drewno luzem albo w rękach)
  const woodN =
    st.things.reduce((a, t) => a + (t.kind === 'drewno' ? t.n : 0), 0) + st.pawns.reduce((a, p) => a + p.carry, 0);
  if (woodN >= CAMPFIRE_WOOD && campfireSpotOk(st, w, tile))
    out.push({ cmd: { t: 'campfire', ids: core, at: tile }, label: 'Rozpalić ognisko tutaj', quick: false });
  out.push({ cmd: { t: 'move', ids: core, to: tile }, label: 'Idź tu', quick: true });
  return out;
}

/** po stronie podwórka: podwórko, budynek siedziby, otwarta dziura albo otwarta brama; bez siatki jedna strona */
function insideOf(st: SimState, w: World, tile: number): boolean {
  if (!st.fence || !w.fence?.tiles.length) return true;
  const h = houseOf(w);
  if (w.fence.yard.includes(tile)) return true;
  if (h && (h.room[tile] >= 0 || h.doors.includes(tile))) return true;
  if (st.fence.holes.some((x) => !x.patch && x.tiles.includes(tile))) return true;
  return st.fence.gateOpen && gateTiles(w).includes(tile);
}

/** wróg po drugiej stronie siatki niż zaznaczony zarząd */
function acrossFence(st: SimState, w: World, ids: readonly number[], foe: Pawn): boolean {
  const tileOf = (p: Pawn) => Math.floor(p.y) * w.size + Math.floor(p.x);
  const side = insideOf(st, w, tileOf(foe));
  return ids.some((id) => {
    const p = st.pawns.find((q) => q.id === id);
    return !!p && insideOf(st, w, tileOf(p)) !== side;
  });
}

/** broń osoby sięga przez siatkę (dzida, a kusza i broń palna tylko z amunicją) */
function reachesThrough(st: SimState, id: number): boolean {
  const w = weaponOf(st.pawns.find((p) => p.id === id)?.weapon);
  return w.fence && (!w.ammo || (st.store.ammo?.[w.ammo] ?? 0) > 0);
}

/** domyślne polecenie dla klikniętego kafelka (pierwsze, które można wykonać od razu) albo null bez nikogo
    z zarządu */
export function commandFor(st: SimState, w: World, ids: readonly number[], tile: number): Command | null {
  return commandsAt(st, w, ids, tile).find((m) => m.quick && !m.off)?.cmd ?? null;
}

/** co robi osoba: krótki opis do karty */
export function jobText(st: SimState, w: World, p: Pawn): string {
  const j = p.job;
  // polecenia dostaje tylko zarząd; mieszkaniec (karta do odczytu) po prostu stoi
  if (!j) return p.pi < p.path.length ? 'Idzie.' : p.kind === 'core' ? 'Stoi i czeka na polecenie.' : 'Stoi.';
  const walking = j.phase === 0;
  switch (j.t) {
    case 'go':
      return walking ? 'Idzie.' : 'Czeka na miejscu.';
    case 'chop': {
      const dry = j.target === dryTreeOf(w);
      if (walking) return dry ? 'Idzie do suchego drzewa.' : 'Idzie ściąć drzewo.';
      return dry ? 'Rąbie suche drzewo.' : 'Ścina drzewo.';
    }
    case 'haul':
      return walking ? 'Idzie po drewno.' : 'Niesie drewno do składu.';
    case 'refuel': {
      const fire = st.things.find((t) => t.id === j.target)?.kind === 'ognisko';
      if (fire) return walking ? 'Idzie po drewno do ogniska.' : 'Dokłada do ogniska.';
      return walking ? 'Idzie po drewno do kozy.' : 'Dokłada do kozy.';
    }
    case 'warm':
      return walking ? 'Idzie ogrzać się przy kozie.' : 'Grzeje się przy kozie.';
    case 'eat':
      if (j.n === 1) return walking ? 'Idzie na wspólny posiłek.' : 'Je wspólny posiłek.';
      if (walking) return 'Idzie coś zjeść.';
      return j.target >= 0 ? 'Je przy stole.' : 'Je.';
    case 'sleep':
      if (walking) return 'Idzie spać.';
      return j.target >= 0 ? 'Śpi.' : 'Śpi na podłodze.';
    case 'stay':
      if (j.target === STAY_YARD) return walking ? 'Idzie na podwórko.' : 'Pracuje na podwórku.';
      if (j.target === STAY_FIRE) return walking ? 'Idzie do ogniska.' : 'Grzeje się przy ognisku.';
      if (j.target === STAY_MEAL)
        return walking ? 'Idzie na wspólny posiłek.' : `Je wspólny posiłek przy stole ${wordsOfWorld(w).zarzad.dk}.`;
      return walking ? 'Idzie do domu.' : 'Siedzi w domu.';
    case 'cook': {
      if (walking) return 'Idzie gotować.';
      return st.things.find((t) => t.id === j.target)?.kind === 'koza' ? 'Gotuje na kozie.' : 'Gotuje na kuchence.';
    }
    case 'burn': {
      const f = st.things.find((t) => t.id === j.target);
      const what = f ? (FURNITURE_ACC[f.kind] ?? 'mebel') : 'mebel';
      return walking ? `Idzie rozbić ${what} na opał.` : `Rozbiera ${what} na opał.`;
    }
    case 'guard':
      if (j.phase === 4) return 'Przysypia na warcie.';
      if (j.target === KOZA_POST) {
        if (j.phase === 2) return 'Idzie po drewno do kozy.';
        if (j.phase === 3) return 'Dokłada do kozy.';
        return walking ? 'Idzie czuwać przy kozie.' : 'Czuwa przy kozie.';
      }
      if (j.target === SIATKA_POST) return walking ? 'Idzie na wartę przy siatce.' : 'Trzyma wartę przy siatce.';
      if (j.target === 0) return `${walking ? 'Idzie na wartę' : 'Trzyma wartę'} ${wordsOfWorld(w).brama.przy}.`;
      return walking ? 'Idzie na wartę przy dziurze.' : 'Trzyma wartę przy dziurze.';
    case 'patch':
      if (j.phase === 0) return 'Idzie po deski i złom.';
      return j.phase === 1 ? 'Niesie materiał do dziury.' : 'Łata dziurę w siatce.';
    case 'campfire':
      if (j.phase === 0) return 'Idzie po drewno na ognisko.';
      return j.phase === 1 ? 'Niesie drewno na ognisko.' : 'Rozpala ognisko.';
    case 'search': {
      const r = houseOf(w)?.rooms[j.target];
      const where = r ? ROOM_ACC[r.kind] : 'pomieszczenie';
      return walking ? `Idzie przeszukać ${where}.` : `Przeszukuje ${where}.`;
    }
    case 'dismantle': {
      const t = st.things.find((q) => q.id === j.target);
      const what = t ? (THING_ACC[t.kind] ?? 'to') : 'to';
      return walking ? `Idzie rozebrać ${what}.` : `Rozbiera ${what}.`;
    }
    case 'repair': {
      const d = st.damage[j.target];
      const what = d ? REPAIR[d.kind].acc : 'uszkodzenie';
      if (j.phase === 0) return `Idzie po ${MAT_ACC[j.what as Mat] ?? 'materiał'} do naprawy.`;
      if (j.phase === 1) return `Niesie ${MAT_ACC[j.what as Mat] ?? 'materiał'} do naprawy.`;
      return `Naprawia ${what}.`;
    }
    case 'claim':
      return walking ? 'Idzie zająć mieszkanie.' : 'Zajmuje mieszkanie.';
    case 'arrive':
      return 'Przychodzi do siedziby.';
    case 'build': {
      const b = st.builds.find((q) => q.id === j.target);
      const what = b ? BUILD_ACC[b.kind] : 'budowlę';
      if (j.phase === 0) return `Idzie po ${MAT_ACC[j.what as Mat] ?? 'materiał'} na ${what}.`;
      if (j.phase === 1) return `Niesie ${MAT_ACC[j.what as Mat] ?? 'materiał'} na ${what}.`;
      return `Buduje ${what}.`;
    }
    case 'leave':
      return walking ? 'Wychodzi na wyprawę.' : 'Na wyprawie.';
    case 'raid':
      return ['Skrada się pod siatkę.', 'Czai się za siatką.', 'Kradnie.', 'Ucieka.', 'Ucieka.'][j.phase] ?? 'Ucieka.';
    case 'fight':
      return walking ? 'Idzie walczyć.' : 'Walczy.';
    case 'finish':
      return walking ? 'Idzie dobić zwłoki.' : 'Dobija zwłoki.';
    case 'craft':
      return walking ? 'Idzie po deski na dzidę.' : 'Robi dzidę.';
    case 'brace':
      if (j.phase === 0) return 'Idzie po deski i złom.';
      return j.phase === 1 ? 'Niesie materiał do siatki.' : 'Wzmacnia siatkę.';
    case 'amputate':
      return walking ? 'Idzie amputować.' : 'Amputuje.';
    case 'wreck':
      if (j.what === 'rozbierz') return (walking ? NAPISY.idzieRozbierac : NAPISY.rozbiera).pl;
      return (walking ? NAPISY.idzieSzukac : NAPISY.szuka).pl;
    case 'carry':
      return (walking ? NAPISY.poLup : NAPISY.niesie).pl;
    case 'trader':
      return [HANDEL.przychodzi, HANDEL.czeka, HANDEL.odchodzi, HANDEL.ucieka, HANDEL.odchodzi][j.phase]?.pl ?? '';
    case 'trade':
      return (walking ? HANDEL.idzieHandlowac : HANDEL.handluje).pl;
    case 'rob':
      return HANDEL.idzieNapasc.pl;
    case 'saw':
      if (walking) return NAPISY.idzieWarsztat.pl;
      return (j.what === 'czesci' ? NAPISY.robiCzesci(j.from) : NAPISY.pilujeDeski(j.from)).pl;
    case 'zombie':
      return (
        ['Snuje się.', 'Idzie do siatki.', 'Napiera na siatkę.', 'Goni.', 'Idzie na hałas.'][j.phase] ?? 'Snuje się.'
      );
  }
}
