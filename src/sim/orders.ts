/* Polecenia z kliknięcia i opisy prac do karty osoby. Czyste funkcje stanu i świata: interfejs pyta,
   co znaczy kliknięcie prawym przyciskiem na kafelku, i dostaje gotowe polecenie dla symulacji.

   Napisy (MenuItem.label, jobText) są w bieżącym języku (L z src/core/jezyk.ts, angielskie nazwy rzeczy
   z nazwy.en.ts): to tylko tekst do rysowania, nic go nie zapisuje w stanie ani nie porównuje. W Node domyślnie po
   polsku, więc testy i boty widzą polskie napisy jak dotąd. Brama albo furtka i zarząd albo komitet ze słownika
   wspólnoty (wordsOfWorld, wordsEnOfWorld). Napisy przy sąsiadach (fala 2) z src/content/napisy-sasiedzi.ts przez tr(). */

import { MENU, PRACA, PRACA_DRZWI } from '../content/napisy-sasiedzi.ts';
import { jezyk, L, liczba, tr } from '../core/jezyk.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../gov/miejsce.ts';
import { IN } from '../world/interior.ts';
import type { World } from '../world/world.ts';
import { kartka, koncowaZbadana, kosztTech, nazwaTech, siecWlaczona, TECH_BY } from './badania.ts';
import { weaponOf } from './bron.ts';
import type { BuildKind, Mat } from './budowle.ts';
import { TICKS_PER_HOUR } from './clock.ts';
import { NAPISY as HANDEL } from './handlarz.ts';
import { dryTreeOf, houseOf, inHomeApt, type RoomKind } from './house.ts';
import { MAT_ACC, REPAIR, RUBBISH, searchable } from './mieszkania.ts';
import { BUILD_EN, FURNITURE_EN, MAT_EN, REPAIR_EN, ROOM_EN, THING_EN } from './nazwy.en.ts';
import { gateTiles } from './perimeter.ts';
import {
  drzwiPod,
  gidB,
  gidRoom,
  kafelkiZajete,
  kosztPlotu,
  materialNaPlot,
  mieszkalny,
  moznaPrzeszukac,
  pietraBudynku,
  plotDla,
  pokojSasiada,
  procentPlotu,
  przechodnie,
  uSasiada,
  wariantyPlotu,
  wnetrze,
  ZABIJANIE_DESKI,
} from './sasiedzi.ts';
import {
  BRACE_COST,
  BURNABLE,
  CAMPFIRE_WOOD,
  type Command,
  campfireSpotOk,
  canCookIn,
  crewAt,
  dismantlable,
  FURNITURE_ACC,
  isEnemy,
  KOZA_POST,
  PATCH_COST,
  type Pawn,
  RESEARCH_SEATS,
  SIATKA_POST,
  type SimState,
  SPEAR_BOARDS,
  SPEAR_SCRAP,
  STAY_FIRE,
  STAY_MEAL,
  STAY_YARD,
  type Thing,
  trunkOf,
  WIEZA_POST,
} from './sim.ts';
import { BATCH, CARRY_MATS, NAPISY, type Product, RECIPES, wreckAt, wreckStage, wreckTile } from './surowce.ts';
import { modeOf } from './tryb.ts';
import { NAPISY as OBCY } from './wedrowcy.ts';

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
  pracownia: 'pracownię',
  koza_beczka: 'kozę z beczki',
  kociol: 'kocioł',
  pieczarkarnia: 'pieczarkarnię',
  szklarnia: 'szklarnię',
  barykada: 'barykadę',
  wieza: 'wieżę',
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

/** rozbiórka po angielsku: śmieci i gruz się sprząta („clear the rubbish”), resztę rozbiera („take apart the
    fridge”); base do menu i „Going to …”, ing do opisu pracy */
function dismantleEn(kind: string | undefined): { base: string; ing: string } {
  const what = kind === undefined ? undefined : THING_EN[kind];
  if (!what) return { base: 'take it apart', ing: 'taking it apart' };
  return RUBBISH.has(kind!)
    ? { base: `clear the ${what}`, ing: `clearing the ${what}` }
    : { base: `take apart the ${what}`, ing: `taking apart the ${what}` };
}

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

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
      label:
        foe.kind === 'zombie'
          ? L('Atakuj szwendacza', 'Attack the shambler')
          : foe.kind === 'handlarz'
            ? tr(HANDEL.atakuj)
            : foe.kind === 'zbir'
              ? tr(HANDEL.atakujZbira)
              : L('Atakuj szabrownika', 'Attack the looter'),
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
        const item: MenuItem = { cmd: { t: 'trade', ids: core, offer: k }, label: tr(HANDEL.oferta(o)), quick: false };
        if (Object.keys(short).length) item.off = tr(HANDEL.brakuje(short));
        out.push(item);
      });
      out.push({ cmd: { t: 'rob', ids: core }, label: tr(HANDEL.napasc), quick: false, confirm: true });
    }
  }
  // wędrowiec: zagadać, gdy przystanął przy siatce (raz), napaść, dopóki nie ucieka; obca ekipa: przegonić
  let near: Pawn | undefined;
  let nd = 1;
  for (const p of st.pawns)
    if (
      (p.kind === 'wedrowiec' || p.kind === 'obcy') &&
      (p.job?.phase ?? 4) < 3 &&
      Math.hypot(p.x - cx, p.y - cy) <= nd
    ) {
      nd = Math.hypot(p.x - cx, p.y - cy);
      near = p;
    }
  if (near?.kind === 'wedrowiec') {
    if (near.job?.phase === 1 && near.job.what !== 'zagadany')
      out.push({ cmd: { t: 'talk', ids: core, target: near.id }, label: tr(OBCY.zagadac), quick: false });
    out.push({ cmd: { t: 'mug', ids: core, target: near.id }, label: tr(OBCY.napasc), quick: false, confirm: true });
  } else if (near?.kind === 'obcy' && (near.job?.phase ?? 4) < 2)
    out.push({ cmd: { t: 'shoo', ids: core, target: near.id }, label: tr(OBCY.przegonic), quick: false });
  // zwłoki, które wstaną: dobić
  const body = thingAt(st, w, tile, 'zwloki');
  if (body && body.fuel > 0)
    out.push({
      cmd: { t: 'finish', ids: core, thing: body.id },
      label: L('Dobić', 'Finish off the body'),
      quick: true,
    });
  // M2 fala 2: cudze drzwi, pomieszczenia i łup sąsiadów; w ich wnętrzu bez poleceń siedziby (gotowanie, palenie mebli)
  out.push(...sasiedziAt(st, w, core, tile));
  const obce = uSasiada(st, w, tile);
  const sklad = houseOf(w)?.sklad ?? [];
  const pile = thingAt(st, w, tile, 'drewno');
  if (pile && sklad.length && !sklad.includes(tile))
    out.push({
      cmd: { t: 'haul', ids: core, thing: pile.id },
      label: L('Zanieść do składu', 'Carry to the woodpile'),
      quick: true,
    });
  const koza = thingAt(st, w, tile, 'koza');
  const wood = st.things.some((t) => t.kind === 'drewno' && t.n > 0) || st.pawns.some((p) => p.carry > 0);
  if (koza && wood)
    out.push({
      cmd: { t: 'refuel', ids: core, thing: koza.id },
      label: L('Dołożyć do kozy', 'Feed the stove'),
      quick: true,
    });
  // dyżur przy kozie zarządu do rana (warta z posterunkiem 'koza'; w karcie nocy klucz 'warta:koza')
  const house = houseOf(w);
  if (koza && house && inHomeApt(house, koza.y * w.size + koza.x))
    out.push({
      cmd: { t: 'guard', ids: core, post: 'koza' },
      label: L('Czuwać przy kozie', 'Keep watch by the stove'),
      quick: false,
    });
  const fire = thingAt(st, w, tile, 'ognisko');
  if (fire && wood)
    out.push({
      cmd: { t: 'refuel', ids: core, thing: fire.id },
      label: L('Dołożyć do ogniska', 'Feed the campfire'),
      quick: true,
    });
  // dziura w siatce: łata z desek albo złomu ze sterty, warta przy niej
  const hole = st.fence?.holes.find((h) => !h.patch && h.tiles.includes(tile));
  if (hole) {
    // łata jest z jednego materiału: desek albo złomu musi starczyć na całą
    const mat = (k: string) => st.things.reduce((a, t) => a + (t.kind === k ? t.n : 0), 0);
    if (mat('deski') >= PATCH_COST || mat('zlom') >= PATCH_COST)
      out.push({
        cmd: { t: 'patch', ids: core, hole: hole.id },
        label: L('Załatać dziurę', 'Patch the hole'),
        quick: true,
      });
    out.push({
      cmd: { t: 'guard', ids: core, post: `d${hole.id}` },
      label: L('Pilnować tutaj', 'Keep watch here'),
      quick: false,
    });
  }
  // siatka: wzmocnić uszkodzony kafelek (2 deski albo 2 złomu ze stert; nie pod barykadą, która ma 160, a wzmocnienie
  // sięga 100), w trybie zombie pilnować przy siatce
  const k = w.fence?.tiles.indexOf(tile) ?? -1;
  if (st.fence && k >= 0 && !st.fence.holes.some((h) => h.tiles.includes(tile))) {
    const mat = (kind: string) => st.things.reduce((a, t) => a + (t.kind === kind ? t.n : 0), 0);
    if (
      st.fence.hp[k] > 0 &&
      st.fence.hp[k] < 100 &&
      !thingAt(st, w, tile, 'barykada') &&
      (mat('deski') >= BRACE_COST || mat('zlom') >= BRACE_COST)
    )
      out.push({
        cmd: { t: 'brace', ids: core, tile },
        label: L('Wzmocnić siatkę', 'Shore up the fence'),
        quick: true,
      });
    if (modeOf(st) === 'zombie')
      out.push({
        cmd: { t: 'guard', ids: core, post: 'siatka' },
        label: L('Pilnować przy siatce', 'Keep watch at the fence'),
        quick: false,
      });
  }
  // sterta desek albo złomu: dzida, gdy starczy materiału
  if (thingAt(st, w, tile, 'deski') || thingAt(st, w, tile, 'zlom')) {
    const mat = (kind: string) => st.things.reduce((a, t) => a + (t.kind === kind ? t.n : 0), 0);
    if (mat('deski') >= SPEAR_BOARDS && mat('zlom') >= SPEAR_SCRAP)
      out.push({
        cmd: { t: 'craft', ids: core, item: 'dzida' },
        label: L('Zrobić dzidę', 'Make a spear'),
        quick: false,
      });
  }
  if (st.fence && gateTiles(w).includes(tile)) {
    // w domu furtka
    const brama = wordsOfWorld(w).brama;
    const gate = wordsEnOfWorld(w).brama;
    out.push({
      cmd: { t: 'guard', ids: core, post: 'brama' },
      label: L(`Pilnować ${brama.d}`, `Keep watch at ${gate}`),
      quick: false,
    });
    const open = st.fence.gateOpen;
    out.push({
      cmd: { t: 'gate', ids: core, open: !open },
      label: L(`${open ? 'Zamknąć' : 'Otworzyć'} ${brama.b}`, `${open ? 'Close' : 'Open'} ${gate}`),
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
    const busy = crewAt(st, wt);
    if (s === 0) {
      const item: MenuItem = {
        cmd: { t: 'wreck', ids: core, tile: wt, how: 'szukaj' },
        label: tr(NAPISY.szukaj(wreck.model)),
        quick: onBase && !busy,
      };
      if (busy) item.off = tr(NAPISY.obcyPrzyAucie);
      out.push(item);
    } else if (s === 1)
      out.push({
        cmd: { t: 'wreck', ids: core, tile: wt, how: 'rozbierz' },
        label: tr(NAPISY.rozbierz(wreck.model)),
        quick: false,
      });
  }
  const tree = treeAt(st, w, tile);
  if (tree >= 0) {
    const trunk = trunkOf(w, w.trees[tree]);
    const near =
      Math.abs((trunk % w.size) - (tile % w.size)) <= 1 &&
      Math.abs(Math.floor(trunk / w.size) - Math.floor(tile / w.size)) <= 1;
    out.push({ cmd: { t: 'chop', ids: core, tree }, label: L('Ściąć drzewo', 'Chop down the tree'), quick: near });
  }
  // kuchenka zarządu albo zapasy: gotować, gdy jest z czego i na czym
  if (!obce && (thingAt(st, w, tile, 'kuchenka') || thingAt(st, w, tile, 'jedzenie')) && canCookIn(st, w))
    out.push({ cmd: { t: 'cook', ids: core }, label: L('Gotować', 'Cook'), quick: true });
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  const furniture = st.things.find((t) => BURNABLE[t.kind] && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  if (furniture && !obce)
    out.push({
      cmd: { t: 'burn', ids: core, thing: furniture.id },
      label: L(`Spalić ${FURNITURE_ACC[furniture.kind]}`, `Burn the ${FURNITURE_EN[furniture.kind]}`),
      quick: false,
      confirm: true,
    });
  // M2: rozbiórka na materiał (śmieci i gruz od razu, meble pustych mieszkań z menu), naprawa uszkodzenia, gdy
  // materiałów starczy, przeszukanie pomieszczenia (pustego mieszkania, w domu jednorodzinnym też domu komitetu)
  // i zajęcie pustego mieszkania (dom komitetu jest już nasz)
  const things = st.things.filter((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  for (const t of things)
    if (dismantlable(st, w, t)) {
      const rubbish = RUBBISH.has(t.kind);
      const item: MenuItem = {
        cmd: { t: 'dismantle', ids: core, thing: t.id },
        label: L(`Rozebrać ${THING_ACC[t.kind] ?? 'to'}`, cap(dismantleEn(t.kind).base)),
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
    if (ok)
      out.push({
        cmd: { t: 'repair', ids: core, damage: k },
        label: L(`Naprawić ${def.acc}`, `Fix the ${REPAIR_EN[d.kind]}`),
        quick: false,
      });
  });
  const hq = houseOf(w);
  const room = hq && hq.room[tile] >= 0 ? hq.rooms[hq.room[tile]] : null;
  const g = room ? st.apts.find((a) => a.apt === room.apt) : undefined;
  if (room && g && searchable(w, g)) {
    if (!g.searched.includes(room.id))
      out.push({
        cmd: { t: 'search', ids: core, room: room.id },
        label: L(`Przeszukać ${ROOM_ACC[room.kind]}`, `Search the ${ROOM_EN[room.kind]}`),
        quick: false,
      });
    if (!g.ours)
      out.push({
        cmd: { t: 'claim', ids: core, apt: g.apt },
        label: L('Zająć mieszkanie', 'Claim the flat'),
        quick: false,
      });
  }
  // łup za siatką: zanieść na podwórko (drewno ma swoje „Zanieść do składu”)
  const loot = st.fence ? things.find((t) => CARRY_MATS.has(t.kind) && t.n > 0) : undefined;
  if (loot && !insideOf(st, w, tile))
    out.push({ cmd: { t: 'carry', ids: core, thing: loot.id }, label: tr(NAPISY.zaniesc), quick: true });
  // warsztat: drewno na deski, złom na części; jedna sztuka albo do BATCH naraz, gdy materiału starczy
  if (things.some((t) => t.kind === 'warsztat')) {
    const make = (what: Product, one: string, many: (n: number) => string) => {
      const r = RECIPES[what];
      const can = Math.min(BATCH, Math.floor(have(r.from) / r.n));
      if (can >= 1) out.push({ cmd: { t: 'saw', ids: core, what, n: 1 }, label: one, quick: false });
      if (can >= 2) out.push({ cmd: { t: 'saw', ids: core, what, n: can }, label: many(can), quick: false });
    };
    make('deski', tr(NAPISY.deska), (n) => tr(NAPISY.deskiN(n)));
    make('czesci', tr(NAPISY.czesc), (n) => tr(NAPISY.czesciN(n)));
  }
  // pracownia: zarząd do stołu i tablica badań (Badać: <nazwa>, Tablica badań albo Wybrać badanie)
  const lab = things.find((t) => t.kind === 'pracownia');
  if (lab) out.push(...pracowniaItems(st, core, lab.id));
  // pracownia po zbadaniu technologii końcowej: włączyć sieć (raz; nieodwracalne i zaczyna epilog, więc z potwierdzeniem,
  // którego okno to `siecSheet` w src/ui/okna.ts; sam epilog robi rama zwycięstwa)
  if (things.some((t) => t.kind === 'pracownia') && koncowaZbadana(st) && !siecWlaczona(st))
    out.push({
      cmd: { t: 'siec', ids: core },
      label: L('Włączyć sieć', 'Switch on the grid'),
      quick: false,
      confirm: true,
    });
  // ognisko na wolnym kafelku podwórka, gdy jest z czego (drewno luzem albo w rękach)
  const woodN =
    st.things.reduce((a, t) => a + (t.kind === 'drewno' ? t.n : 0), 0) + st.pawns.reduce((a, p) => a + p.carry, 0);
  if (woodN >= CAMPFIRE_WOOD && campfireSpotOk(st, w, tile))
    out.push({
      cmd: { t: 'campfire', ids: core, at: tile },
      label: L('Rozpalić ognisko tutaj', 'Light a campfire here'),
      quick: false,
    });
  out.push({ cmd: { t: 'move', ids: core, to: tile }, label: L('Idź tu', 'Go here'), quick: true });
  return out;
}

/** Polecenia przy pracowni (badania). Z wybranym badaniem „Badać: <nazwa>” (polecenie `study`: zaznaczeni siadają do
    stołu) i „Tablica badań”; bez wybranego „Wybrać badanie” (otwiera tablicę). „Badać” nie znika, kiedy nie da się
    usiąść, tylko jest wyszarzone z powodem: oba miejsca zajęli inni (zaznaczeni, którzy już siedzą, nie liczą się) albo
    badanie stanęło, bo osadzie zabrakło wiedzy. Polecenie `tablica` przechwytuje interfejs (main.ts). */
function pracowniaItems(st: SimState, core: number[], lab: number): MenuItem[] {
  const cur = st.research?.cur;
  if (!cur || !Object.hasOwn(TECH_BY, cur))
    return [{ cmd: { t: 'tablica', ids: core }, label: L('Wybrać badanie', 'Choose research'), quick: false }];
  const nazwa = nazwaTech(cur);
  const badac: MenuItem = {
    cmd: { t: 'study', ids: core, thing: lab },
    label: L(`Badać: ${nazwa.pl}`, `Research: ${nazwa.en}`),
    quick: false,
  };
  const inni = st.pawns.filter((p) => !core.includes(p.id) && p.job?.t === 'research' && p.job.target === lab).length;
  if (kartka(st, cur, modeOf(st)).stan !== 'w_toku')
    badac.off = L('Brakuje wiedzy w osadzie.', 'The estate lacks the know-how.');
  else if (inni >= RESEARCH_SEATS) badac.off = L('Przy stole nie ma miejsca.', 'No free seat at the table.');
  return [badac, { cmd: { t: 'tablica', ids: core }, label: L('Tablica badań', 'Research board'), quick: false }];
}

/** M2 fala 2 (docs/M2-fala-2.md): polecenia przy cudzych drzwiach (otworzyć, wejść, zapukać, wyważyć, zabić deskami,
    odbić deski) i w pomieszczeniach otwartego sąsiada (przeszukać, a mieszkanie lokatorów okraść pod ich nieobecność).
    Łup z jego wnętrza niesie się na podwórko poleceniem z surowców. Drzwi od ulicy budynku przy podwórku mają
    ostrzeżenie. */
function sasiedziAt(st: SimState, w: World, core: number[], tile: number): MenuItem[] {
  const out: MenuItem[] = [];
  // gra sieciowa: drzwi klatki innej drużyny i wszystko za nimi bez poleceń (menu sieci mówi, czyja to klatka)
  const dpAll = drzwiPod(st.sasiedzi, w, modeOf(st), tile);
  const dp = dpAll && !kafelkiZajete(st, w, dpAll.bid).has(dpAll.tile) ? dpAll : null;
  if (dp) {
    const flat = dp.rodzaj === 'mieszkanie';
    const warn = dp.wylom ? tr(MENU.wylom) : '';
    const door = dp.tile;
    const knock = mieszkalny(w, dp.bid) ? tr(flat ? MENU.zapukajMieszkanie : MENU.zapukaj) : '';
    if (dp.s === 'zamkniete') {
      out.push({
        cmd: { t: 'open', ids: core, door },
        label: `${tr(flat ? MENU.otworzMieszkanie : MENU.otworz)}${warn}`,
        quick: true,
      });
      if (knock) out.push({ cmd: { t: 'knock', ids: core, door }, label: knock, quick: false });
    }
    if (dp.s === 'na_klucz' && knock) out.push({ cmd: { t: 'knock', ids: core, door }, label: knock, quick: true });
    if (dp.s === 'zamkniete' || dp.s === 'na_klucz')
      out.push({
        cmd: { t: 'force', ids: core, door },
        label: `${tr(flat ? MENU.wywazMieszkanie : MENU.wywaz)}${warn}`,
        quick: false,
      });
    if (przechodnie(dp.s)) {
      out.push({ cmd: { t: 'open', ids: core, door }, label: tr(MENU.wejdz), quick: true });
      const boards = st.things.reduce(
        (a, t) => a + (t.kind === 'deski' && !uSasiada(st, w, t.y * w.size + t.x) ? t.n : 0),
        0,
      );
      if (!flat && boards >= ZABIJANIE_DESKI)
        out.push({ cmd: { t: 'board', ids: core, door }, label: tr(MENU.zabij), quick: false });
    }
    if (dp.s === 'zabite' && !flat)
      out.push({ cmd: { t: 'unboard', ids: core, door }, label: `${tr(MENU.odbij)}${warn}`, quick: true });
  }
  // etap 2: na schodach otwartego budynku następne piętro (rysujemy tylko parter)
  const bid = w.bid[tile];
  const rec = bid >= 0 ? st.sasiedzi?.budynki.find((b) => b.bid === bid && b.otwarty) : undefined;
  if (rec && wnetrze(w, bid).cell[tile] === IN.STAIRS) {
    const left = pietraBudynku(w, bid) - rec.pietra;
    if (left > 0) out.push({ cmd: { t: 'upstairs', ids: core, bid, tile }, label: tr(MENU.pietro(left)), quick: true });
  }
  const ps = pokojSasiada(st, w, tile);
  if (ps) {
    const bid = st.sasiedzi!.budynki[ps.k].bid;
    const can = moznaPrzeszukac(st, w, ps.k, ps.room);
    const kind = wnetrze(w, bid).rooms[ps.room].kind;
    if (can === 'tak')
      out.push({
        cmd: { t: 'loot', ids: core, bid, room: ps.room },
        label: tr(MENU.przeszukaj(kind)),
        quick: false,
      });
    else if (can === 'szaber')
      out.push({
        cmd: { t: 'loot', ids: core, bid, room: ps.room },
        label: tr(MENU.okradnij),
        quick: false,
        confirm: true,
      });
  }
  // etap 3: wspólny płot na drzwiach albo w pomieszczeniu otwartego budynku (z kosztem i czasem; czemu się nie da);
  // warianty materiału, na które starcza naszych desek i złomu, a bez materiału deska i złom
  const plotBid = dp ? dp.bid : ps ? st.sasiedzi!.budynki[ps.k].bid : -1;
  if (plotBid >= 0 && !st.plot?.bids.includes(plotBid)) {
    const plan = st.plot?.plan;
    if (plan?.bid === plotBid)
      out.push({ cmd: { t: 'enclose', ids: core, bid: plotBid }, label: tr(MENU.plotDalej), quick: false });
    else if (!plan) {
      const r = plotDla(st, w, plotBid);
      if (r?.ok) {
        for (const wariant of wariantyPlotu(r, materialNaPlot(st, w))) {
          const k = kosztPlotu(r, wariant);
          out.push({
            cmd: { t: 'enclose', ids: core, bid: plotBid, wariant },
            label: tr(MENU.plot(r.dlugosc, k.need.deski ?? 0, k.need.zlom ?? 0, k.total / TICKS_PER_HOUR, wariant)),
            quick: false,
            confirm: true,
          });
        }
      } else if (r) {
        out.push({
          cmd: { t: 'enclose', ids: core, bid: plotBid },
          label: tr(MENU.plotNie(r.why, r.dlugosc)),
          quick: false,
        });
      }
    }
  }
  // łup w cudzym budynku niesie się jak łup zza siatki: „Zanieść na podwórko” w commandsAt (razem z resztą z budynku)
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
  if (!j)
    return p.pi < p.path.length
      ? L('Idzie.', 'Walking.')
      : p.kind === 'core'
        ? L('Stoi i czeka na polecenie.', 'Standing by for orders.')
        : L('Stoi.', 'Standing around.');
  const walking = j.phase === 0;
  switch (j.t) {
    case 'go':
      return walking ? L('Idzie.', 'Walking.') : L('Czeka na miejscu.', 'Waiting on the spot.');
    case 'chop': {
      const dry = j.target === dryTreeOf(w);
      if (walking)
        return dry
          ? L('Idzie do suchego drzewa.', 'Heading for the dead tree.')
          : L('Idzie ściąć drzewo.', 'Going to chop down the tree.');
      return dry
        ? L('Rąbie suche drzewo.', 'Chopping down the dead tree.')
        : L('Ścina drzewo.', 'Chopping down the tree.');
    }
    case 'haul':
      return walking
        ? L('Idzie po drewno.', 'Fetching wood.')
        : L('Niesie drewno do składu.', 'Carrying wood to the woodpile.');
    case 'refuel': {
      const fire = st.things.find((t) => t.id === j.target)?.kind === 'ognisko';
      if (fire)
        return walking
          ? L('Idzie po drewno do ogniska.', 'Fetching wood for the campfire.')
          : L('Dokłada do ogniska.', 'Feeding the campfire.');
      return walking
        ? L('Idzie po drewno do kozy.', 'Fetching wood for the stove.')
        : L('Dokłada do kozy.', 'Feeding the stove.');
    }
    case 'warm':
      return walking
        ? L('Idzie ogrzać się przy kozie.', 'Going to warm up by the stove.')
        : L('Grzeje się przy kozie.', 'Warming up by the stove.');
    case 'eat':
      if (j.n === 1)
        return walking
          ? L('Idzie na wspólny posiłek.', 'Heading to the shared meal.')
          : L('Je wspólny posiłek.', 'Having the shared meal.');
      if (walking) return L('Idzie coś zjeść.', 'Going to get something to eat.');
      return j.target >= 0 ? L('Je przy stole.', 'Eating at the table.') : L('Je.', 'Eating.');
    case 'sleep':
      if (walking) return L('Idzie spać.', 'Going to bed.');
      return j.target >= 0 ? L('Śpi.', 'Sleeping.') : L('Śpi na podłodze.', 'Sleeping on the floor.');
    case 'stay':
      if (j.target === STAY_YARD)
        return walking
          ? L('Idzie na podwórko.', 'Heading out to the yard.')
          : L('Pracuje na podwórku.', 'Working in the yard.');
      if (j.target === STAY_FIRE)
        return walking
          ? L('Idzie do ogniska.', 'Heading for the campfire.')
          : L('Grzeje się przy ognisku.', 'Warming up by the campfire.');
      if (j.target === STAY_MEAL)
        return walking
          ? L('Idzie na wspólny posiłek.', 'Heading to the shared meal.')
          : L(
              `Je wspólny posiłek przy stole ${wordsOfWorld(w).zarzad.dk}.`,
              `Having the shared meal at ${wordsEnOfWorld(w).krotko}’s table.`,
            );
      return walking ? L('Idzie do domu.', 'Going home.') : L('Siedzi w domu.', 'Staying in.');
    case 'cook': {
      if (walking) return L('Idzie gotować.', 'Going to cook.');
      return st.things.find((t) => t.id === j.target)?.kind === 'koza'
        ? L('Gotuje na kozie.', 'Cooking on the stove.')
        : L('Gotuje na kuchence.', 'Cooking on the gas cooker.');
    }
    case 'burn': {
      const f = st.things.find((t) => t.id === j.target);
      const what = f ? (FURNITURE_ACC[f.kind] ?? 'mebel') : 'mebel';
      const whatEn = (f && FURNITURE_EN[f.kind]) || 'furniture';
      return walking
        ? L(`Idzie rozbić ${what} na opał.`, `Going to break up the ${whatEn} for fuel.`)
        : L(`Rozbiera ${what} na opał.`, `Breaking up the ${whatEn} for fuel.`);
    }
    case 'guard':
      if (j.phase === 4) return L('Przysypia na warcie.', 'Dozing off on watch.');
      if (j.target === KOZA_POST) {
        if (j.phase === 2) return L('Idzie po drewno do kozy.', 'Fetching wood for the stove.');
        if (j.phase === 3) return L('Dokłada do kozy.', 'Feeding the stove.');
        return walking
          ? L('Idzie czuwać przy kozie.', 'Going to keep watch by the stove.')
          : L('Czuwa przy kozie.', 'Keeping watch by the stove.');
      }
      if (j.target === SIATKA_POST)
        return walking
          ? L('Idzie na wartę przy siatce.', 'Going on watch at the fence.')
          : L('Trzyma wartę przy siatce.', 'On watch at the fence.');
      if (j.target === WIEZA_POST)
        return walking
          ? L('Idzie na wartę na wieżę.', 'Going on watch on the tower.')
          : L('Trzyma wartę na wieży.', 'On watch on the tower.');
      if (j.target === 0) {
        const gate = wordsEnOfWorld(w).brama;
        return L(
          `${walking ? 'Idzie na wartę' : 'Trzyma wartę'} ${wordsOfWorld(w).brama.przy}.`,
          `${walking ? 'Going on watch' : 'On watch'} at ${gate}.`,
        );
      }
      return walking
        ? L('Idzie na wartę przy dziurze.', 'Going on watch at the hole in the fence.')
        : L('Trzyma wartę przy dziurze.', 'On watch at the hole in the fence.');
    case 'patch':
      if (j.phase === 0) return L('Idzie po deski i złom.', 'Fetching planks and scrap.');
      return j.phase === 1
        ? L('Niesie materiał do dziury.', 'Carrying materials to the hole.')
        : L('Łata dziurę w siatce.', 'Patching the hole in the fence.');
    case 'campfire':
      if (j.phase === 0) return L('Idzie po drewno na ognisko.', 'Fetching wood for a campfire.');
      return j.phase === 1
        ? L('Niesie drewno na ognisko.', 'Carrying wood for the campfire.')
        : L('Rozpala ognisko.', 'Lighting a campfire.');
    case 'search': {
      const r = houseOf(w)?.rooms[j.target];
      const where = r ? ROOM_ACC[r.kind] : 'pomieszczenie';
      const whereEn = (r && ROOM_EN[r.kind]) || 'room';
      return walking
        ? L(`Idzie przeszukać ${where}.`, `Going to search the ${whereEn}.`)
        : L(`Przeszukuje ${where}.`, `Searching the ${whereEn}.`);
    }
    case 'dismantle': {
      const t = st.things.find((q) => q.id === j.target);
      const what = t ? (THING_ACC[t.kind] ?? 'to') : 'to';
      const en = dismantleEn(t?.kind);
      return walking ? L(`Idzie rozebrać ${what}.`, `Going to ${en.base}.`) : L(`Rozbiera ${what}.`, `${cap(en.ing)}.`);
    }
    case 'repair': {
      const d = st.damage[j.target];
      const what = d ? REPAIR[d.kind].acc : 'uszkodzenie';
      const mat = MAT_ACC[j.what as Mat] ?? 'materiał';
      const matEn = MAT_EN[j.what as Mat] ?? 'materials';
      if (j.phase === 0) return L(`Idzie po ${mat} do naprawy.`, `Fetching ${matEn} for the repair.`);
      if (j.phase === 1) return L(`Niesie ${mat} do naprawy.`, `Carrying ${matEn} for the repair.`);
      return L(`Naprawia ${what}.`, d ? `Fixing the ${REPAIR_EN[d.kind]}.` : 'Fixing the damage.');
    }
    case 'claim':
      return walking
        ? L('Idzie zająć mieszkanie.', 'Going to claim the flat.')
        : L('Zajmuje mieszkanie.', 'Claiming the flat.');
    case 'arrive':
      return L('Przychodzi do siedziby.', 'Arriving at HQ.');
    case 'build': {
      const b = st.builds.find((q) => q.id === j.target);
      const what = b ? BUILD_ACC[b.kind] : 'budowlę';
      const whatEn = b ? BUILD_EN[b.kind] : 'structure';
      const mat = MAT_ACC[j.what as Mat] ?? 'materiał';
      const matEn = MAT_EN[j.what as Mat] ?? 'materials';
      if (j.phase === 0) return L(`Idzie po ${mat} na ${what}.`, `Fetching ${matEn} for the ${whatEn}.`);
      if (j.phase === 1) return L(`Niesie ${mat} na ${what}.`, `Carrying ${matEn} to the ${whatEn}.`);
      return L(`Buduje ${what}.`, `Building the ${whatEn}.`);
    }
    case 'leave':
      return walking
        ? L('Wychodzi na wyprawę.', 'Heading out on a supply run.')
        : L('Na wyprawie.', 'Out on a supply run.');
    case 'raid':
      return (
        [
          L('Skrada się pod siatkę.', 'Sneaking up to the fence.'),
          L('Czai się za siatką.', 'Lurking behind the fence.'),
          L('Kradnie.', 'Stealing.'),
          L('Ucieka.', 'Running off.'),
          L('Ucieka.', 'Running off.'),
        ][j.phase] ?? L('Ucieka.', 'Running off.')
      );
    case 'fight':
      return walking ? L('Idzie walczyć.', 'Going in to fight.') : L('Walczy.', 'Fighting.');
    case 'finish':
      return walking
        ? L('Idzie dobić zwłoki.', 'Going to finish off the body.')
        : L('Dobija zwłoki.', 'Finishing off the body.');
    case 'craft':
      return walking
        ? L('Idzie po deski na dzidę.', 'Fetching planks for a spear.')
        : L('Robi dzidę.', 'Making a spear.');
    case 'brace':
      if (j.phase === 0) return L('Idzie po deski i złom.', 'Fetching planks and scrap.');
      return j.phase === 1
        ? L('Niesie materiał do siatki.', 'Carrying materials to the fence.')
        : L('Wzmacnia siatkę.', 'Shoring up the fence.');
    case 'amputate':
      return walking ? L('Idzie amputować.', 'Going to amputate.') : L('Amputuje.', 'Amputating.');
    case 'wreck':
      if (j.what === 'rozbierz') return tr(walking ? NAPISY.idzieRozbierac : NAPISY.rozbiera);
      return tr(walking ? NAPISY.idzieSzukac : NAPISY.szuka);
    case 'carry':
      return tr(walking ? NAPISY.poLup : NAPISY.niesie);
    case 'trader':
      return tr(
        [HANDEL.przychodzi, HANDEL.czeka, HANDEL.odchodzi, HANDEL.ucieka, HANDEL.odchodzi, HANDEL.walczy][j.phase] ??
          HANDEL.czeka,
      );
    case 'zemsta':
      return tr(HANDEL.zemstaPraca[Math.min(3, j.phase)]);
    case 'wander':
      return tr(OBCY.wander[Math.min(3, j.phase)]);
    case 'scavenge':
      return tr(OBCY.scavenge[Math.min(3, j.phase)]);
    case 'talk':
      return tr(walking ? OBCY.idzieZagadac : OBCY.rozmawia);
    case 'mug':
      return tr(OBCY.idzieNapasc);
    case 'shoo':
      return tr(OBCY.idziePrzegonic);
    case 'trade':
      return tr(walking ? HANDEL.idzieHandlowac : HANDEL.handluje);
    case 'rob':
      return tr(HANDEL.idzieNapasc);
    case 'saw':
      if (walking) return tr(NAPISY.idzieWarsztat);
      return tr(j.what === 'czesci' ? NAPISY.robiCzesci(j.from) : NAPISY.pilujeDeski(j.from));
    case 'research': {
      if (walking) return L('Idzie do pracowni.', 'Heading to the research room.');
      const cur = st.research?.cur;
      if (!cur || !Object.hasOwn(TECH_BY, cur)) return L('Siedzi przy stole.', 'Sitting at the desk.');
      // koszt bywa ułamkiem (mnożnik ery), więc z jednym miejscem po przecinku, w bieżącym języku
      const postep = `${Math.floor(st.research?.prog[cur] ?? 0)} / ${liczba(kosztTech(cur), 1, jezyk())}`;
      const nazwa = nazwaTech(cur);
      return L(`Bada: ${nazwa.pl} (${postep})`, `Researching: ${nazwa.en} (${postep})`);
    }
    case 'zombie':
      return (
        [
          L('Snuje się.', 'Shambling about.'),
          L('Idzie do siatki.', 'Heading for the fence.'),
          L('Napiera na siatkę.', 'Pushing against the fence.'),
          L('Goni.', 'Giving chase.'),
          L('Idzie na hałas.', 'Following the noise.'),
        ][j.phase] ?? L('Snuje się.', 'Shambling about.')
      );
    case 'door': {
      const v = PRACA_DRZWI[j.what] ?? PRACA_DRZWI.open;
      return tr(walking ? v[0] : v[1]);
    }
    case 'loot': {
      const b = st.sasiedzi?.budynki[gidB(j.target)];
      const kind = b ? (wnetrze(w, b.bid).rooms[gidRoom(j.target)]?.kind ?? null) : null;
      return tr(walking ? PRACA.idziePrzeszukac(kind) : PRACA.przeszukuje(kind));
    }
    case 'meet':
      return tr(PRACA.rozmawia);
    case 'upstairs':
      return tr(walking ? PRACA.idzieNaSchody : PRACA.naPietrze);
    case 'plot': {
      const plan = st.plot?.plan;
      return tr(PRACA.plot(j.phase, plan ? procentPlotu(plan) : 0));
    }
  }
}
