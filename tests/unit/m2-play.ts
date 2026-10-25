/* Gracz-bot fali 1 M2 (docs/M2-fala-1.md): od rana dnia 2 jak człowiek przy ekranie co kilka sekund daje wolnej
   osobie z zarządu pracę przy pustych mieszkaniach (przeszukanie, rozbiórka śmieci i mebli, naprawa, zajęcie)
   i stawia plan budowli, kiedy materiały wystarczą. Wpina się w playWithGov (PlayOpts.player), więc decyzje liczą
   się razem z oknami zarządu i drewnem na opał. Używają go testy i tools/bot.ts.
   Opcja `badania` (npm run bot -- --badania; docs/superpowers/specs/2026-10-19-badania-design.md, „Testy i bramka”)
   dokłada politykę badań do tej samej kolejki: pracownia idzie na jej początek (stoi, gdy starczy 14 desek i 4 części, od
   dnia 2), potem, jak wybiera człowiek przy tablicy, najtańsza kartka „do wzięcia”, a za dnia (polecenie od 7:00 do
   20:00; osoba siedzi do końca badania, do pilnej potrzeby albo do nocy o 22:00, kiedy wstaje i idzie spać) jedna wolna
   osoba z zarządu, najszybsza w dziedzinie badania, siada przy stole; lokatorzy z wiedzą siadają sami. Budowle z zebranych
   technologii dochodzą na koniec kolejki, kiedy są odblokowane. Bez opcji bot gra jak dotąd: te same polecenia i te same
   skróty stanu. */

import { kartka, TECHS, tempoOsoby, wolneMiejsca } from '../../src/sim/badania.ts';
import {
  BUILDS,
  type BuildKind,
  boilerRooms,
  canPlace,
  isUnlocked,
  type Mat,
  PLACE_ROOMS,
} from '../../src/sim/budowle.ts';
import { dayOf, hourOf } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { DISMANTLE, REPAIR, RUBBISH, searchable } from '../../src/sim/mieszkania.ts';
import { THING_ACC } from '../../src/sim/orders.ts';
import { fenceShape } from '../../src/sim/perimeter.ts';
import { type Command, dismantlable, type Pawn, type Sim, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import type { World } from '../../src/world/world.ts';

export interface M2Opts {
  /** przeszukuje pomieszczenia pustych mieszkań */
  search: boolean;
  /** rozbiera całe meble w pustych mieszkaniach (poza łóżkami), gdy do następnej budowli brakuje materiałów */
  furniture: boolean;
  /** polityka badań: pracownia na początku kolejki, najtańsza kartka, jedna osoba zarządu przy stole za dnia i budowle
      z odblokowanych technologii na końcu kolejki; bez pola bot gra jak przed badaniami */
  badania?: boolean;
  /** kolejka budowy zamiast domyślnej (GOALS albo z badaniami); funkcja woła się przy każdej decyzji, więc wołający
      zmienia kolejkę z czasem (gracz ścieżki celów w tools/bot-cele.ts buduje tylko to, o co prosi bieżący cel); pusta
      kolejka zostawia przeszukiwanie, rozbiórkę, naprawy i zajmowanie mieszkań. Bez pola kolejka jak dotąd. */
  kolejka?: () => readonly BuildKind[];
}

export interface M2Log {
  /** gotowe budowle z tickiem ukończenia */
  built: { kind: BuildKind; tick: number }[];
  /** rodzaje budowli w kolejności poleceń `build` (kolejność ukończenia zależy też od automatu pracy ludzi, który
      sam zaczyna inne plany, i od materiałów) */
  plans: BuildKind[];
  placed: number;
  searched: number;
  dismantled: number;
  repaired: number;
  claimed: number;
}

/** wywoływany co sekundę przy ekranie; polecenia idą przez order (liczą się jako decyzje) */
export type Player = (sim: Sim, w: World, screen: number, order: (c: Command, text: string) => void) => void;

/** kolejność budowy: cele dnia 2 z dokumentu (warsztat, obwód), potem miejsca do spania i jedzenie */
const GOALS: BuildKind[] = ['warsztat', 'zasieki', 'lozka_pietrowe', 'ogrodek', 'magazyn', 'kuchnia_spoleczna'];
/** budowle z technologii, jedna sztuka każdej, w kolejności od najtańszych w drewnie (ciepło i jedzenie przed obroną);
    bot z badaniami dokłada je do kolejki, gdy technologia jest zbadana */
const GOALS_TECH: BuildKind[] = ['koza_beczka', 'pieczarkarnia', 'kociol', 'szklarnia', 'wieza', 'barykada'];
/** co najmniej tyle sekund przy ekranie mija między dwoma poleceniami „do stołu” (nie da się dojść: nie ponawiaj co 5 s) */
const STUDY_EVERY = 30;
/** polecenie „do stołu” za dnia: od 7:00 (cały gracz) do tej godziny; nocą (od 22:00) nikt nie siedzi przy stole */
const STUDY_UNTIL = 20;
/** co ile sekund przy ekranie gracz rozgląda się za następną decyzją */
const EVERY = 5;
/** łóżka zostają: po zajęciu i naprawie dają miejsca dla mieszkańców */
const KEEP = new Set(['lozko', 'wersalka']);

export function m2Player(opts: M2Opts): { player: Player; log: M2Log } {
  const log: M2Log = { built: [], plans: [], placed: 0, searched: 0, dismantled: 0, repaired: 0, claimed: 0 };
  const seen = new Set<number>();
  const placed = new Set<BuildKind>();
  /** cele, których nie dało się zacząć (nieosiągalne): klucz 'rodzaj:cel' */
  const bad = new Set<string>();
  let last: { pawn: number; key: string; job: string } | null = null;
  /** ile było do rozebrania na starcie */
  let start = -1;
  /** sekunda przy ekranie ostatniego polecenia „do stołu” */
  let studied = -STUDY_EVERY;

  /** polityka badań (opcja `badania`): true, gdy dało się polecenie. Bez wybranego badania najtańsza kartka „do wzięcia”
      (wybór po kosztach z ery, jak ktoś oceniający tablicę wzrokiem), potem za dnia jedna wolna osoba z zarządu z najlepszym
      tempem w dziedzinie badania; reszta zarządu robi swoje, a lokatorzy z wiedzą siadają sami (plan dnia w sim.ts). */
  const research = (
    sim: Sim,
    h: number,
    s: number,
    free: Pawn[],
    order: (c: Command, text: string) => void,
  ): boolean => {
    const st = sim.st;
    const lab = st.things.find((t) => t.kind === 'pracownia');
    if (!lab) return false;
    const mode = modeOf(st);
    const cur = st.research?.cur ?? null;
    const stan = cur ? kartka(st, cur, mode).stan : null;
    if (stan !== 'w_toku') {
      // nic nie wybrano albo wybrane stoi bez wiedzy: najtańsza kartka do wzięcia (przy remisie pierwsza w drzewku)
      const cards = TECHS.map((t) => kartka(st, t.id, mode)).filter((k) => k.stan === 'do_wziecia');
      const best = cards.reduce<(typeof cards)[number] | undefined>(
        (b, k) => (b === undefined || k.koszt < b.koszt ? k : b),
        undefined,
      );
      if (!best) return false;
      order({ t: 'research', ids: [], tech: best.id }, `badanie: ${best.id}`);
      return true;
    }
    if (
      h >= STUDY_UNTIL ||
      s - studied < STUDY_EVERY ||
      st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'research')
    )
      return false;
    const dom = TECHS.find((t) => t.id === cur)!.dom;
    const who = free
      .filter((p) => wolneMiejsca(st.pawns, lab.id, [p.id]) > 0)
      .reduce<(typeof free)[number] | undefined>(
        (b, p) =>
          b === undefined || tempoOsoby(st.people[p.person], dom) > tempoOsoby(st.people[b.person], dom) ? p : b,
        undefined,
      );
    if (!who) return false;
    studied = s;
    order({ t: 'study', ids: [who.id], thing: lab.id }, `badania: ${st.people[who.person].first} przy stole`);
    return true;
  };

  const player: Player = (sim, w, s, order) => {
    const st = sim.st;
    const hs = houseOf(w);
    if (!hs) return;
    const size = w.size;
    for (const t of st.things)
      if (t.kind in BUILDS && !seen.has(t.id)) {
        seen.add(t.id);
        if (st.tick > 0) log.built.push({ kind: t.kind as BuildKind, tick: st.tick });
      }
    // liczniki ze stanu gry (zrobione prace, nie wydane polecenia); do rozebrania: śmieci i meble w pustych
    const left = st.things.filter((t) => {
      const r = hs.room[t.y * size + t.x];
      const apt = r >= 0 ? hs.rooms[r].apt : -1;
      return RUBBISH.has(t.kind) || (DISMANTLE[t.kind] && st.apts.find((a) => a.apt === apt)?.state === 'puste');
    }).length;
    if (start < 0) start = left;
    log.dismantled = start - left;
    log.searched = st.apts.reduce((a, g) => a + g.searched.length, 0);
    log.repaired = st.damage.filter((d) => d.fixed).length;
    log.claimed = st.apts.filter((g) => g.ours && g.state === 'puste').length;
    const h = hourOf(st.tick);
    if (dayOf(st.tick) < 2 || h < 7 || h >= 22 || s % EVERY) return;
    // poprzednie polecenie nie ruszyło: cel nieosiągalny, następnym razem inny
    if (last) {
      const p = st.pawns.find((q) => q.id === last!.pawn);
      if (p?.job?.t !== last.job) bad.add(last.key);
      last = null;
    }
    const aptOf = (i: number) => (hs.room[i] >= 0 ? hs.rooms[hs.room[i]].apt : -1);
    const state = (apt: number) => st.apts.find((a) => a.apt === apt);
    const mats = snapshot(st, w).stock.mats;
    const reserved: Partial<Record<Mat, number>> = {};
    for (const b of st.builds)
      for (const [m, n] of Object.entries(b.need) as [Mat, number][])
        reserved[m] = (reserved[m] ?? 0) + n - (b.have[m] ?? 0);
    const avail = (m: Mat) => mats[m] - (reserved[m] ?? 0);
    const covers = (cost: Partial<Record<Mat, number>>, extra: Partial<Record<Mat, number>> = {}) =>
      (Object.entries(cost) as [Mat, number][]).every(([m, n]) => avail(m) >= n + (extra[m] ?? 0));
    const queue = opts.kolejka
      ? opts.kolejka()
      : opts.badania
        ? ['pracownia' as BuildKind, ...GOALS, ...GOALS_TECH.filter((k) => isUnlocked(st, k))]
        : GOALS;
    const open = queue.filter((k) => !placed.has(k));
    const cores = st.pawns.filter((p) => p.kind === 'core' && !p.away);
    const free = cores.filter((p) => !p.job || (!p.job.order && p.job.t === 'warm'));

    // 0. badania: wybór kartki i osoba przy stole (rzadkie polecenia, więc przed budową)
    if (opts.badania && research(sim, h, s, free, order)) return;

    // pracownia czeka na deski i części przed innymi budowlami: z badaniami to pierwszy cel dnia 2, więc reszta kolejki nie
    // wydaje materiału, którego jej brakuje (bez tego ogródek wyprzedza pracownię o dni)
    const zaLab = opts.badania && !placed.has('pracownia') ? BUILDS.pracownia.cost : {};
    // 1. plan budowy: pierwsza z kolejki, na którą starcza materiałów i jest miejsce
    for (const k of open) {
      if (!covers(BUILDS[k].cost, k === 'pracownia' ? {} : zaLab)) continue;
      const at = placeFor(sim, w, k);
      if (!at) continue;
      placed.add(k);
      log.placed++;
      log.plans.push(k);
      order(
        { t: 'build', ids: free[0] ? [free[0].id] : [], kind: k, x: at.x, y: at.y, rot: at.rot },
        `budowa: ${BUILDS[k].name}`,
      );
      return;
    }
    // cel, na który się zbiera: pierwsza z kolejki, na którą nie starcza
    const goal = open.find((k) => !covers(BUILDS[k].cost));
    const p = free[0];
    if (!p) return;
    const send = (c: Command, key: string, job: string, text: string) => {
      last = { pawn: p.id, key, job };
      order(c, text);
    };
    const dist = (i: number) => ((i % size) - p.x) ** 2 + (Math.floor(i / size) - p.y) ** 2;
    const nearest = <T>(list: T[], tile: (x: T) => number) =>
      list.reduce<T | undefined>((b, x) => (b === undefined || dist(tile(x)) < dist(tile(b)) ? x : b), undefined);
    const busy = (t: string, target: number) => st.pawns.some((q) => q.job?.t === t && q.job.target === target);

    // 2. naprawa w zajętym mieszkaniu, kiedy zostaje materiałów na następny cel
    const need = goal ? BUILDS[goal].cost : {};
    const fix = st.damage.findIndex(
      (d, k) =>
        !d.fixed &&
        state(d.apt)?.ours &&
        !busy('repair', k) &&
        !bad.has(`repair:${k}`) &&
        covers(REPAIR[d.kind].cost, need),
    );
    if (fix >= 0) {
      const d = st.damage[fix];
      return send(
        { t: 'repair', ids: [p.id], damage: fix },
        `repair:${fix}`,
        'repair',
        `naprawa: ${REPAIR[d.kind].acc}`,
      );
    }
    // 3. przeszukanie najbliższego nieprzeszukanego pomieszczenia (pustego mieszkania, w domu też domu komitetu)
    if (opts.search) {
      const rooms = hs.rooms.filter(
        (r) =>
          !!state(r.apt) &&
          searchable(w, state(r.apt)!) &&
          !state(r.apt)!.searched.includes(r.id) &&
          !busy('search', r.id) &&
          !bad.has(`search:${r.id}`),
      );
      const firstTile = (r: { id: number }) => {
        for (let i = 0; i < size * size; i++) if (hs.room[i] === r.id) return i;
        return 0;
      };
      const r = nearest(rooms, firstTile);
      if (r) {
        return send({ t: 'search', ids: [p.id], room: r.id }, `search:${r.id}`, 'search', `przeszukanie: ${r.kind}`);
      }
    }
    // 4. rozbiórka: śmieci, potem zepsute meble, a całe tylko, kiedy do celu brakuje materiałów
    const tile = (t: Thing) => t.y * size + t.x;
    const can = (t: Thing) => (t.by < 0 || t.by === p.id) && !bad.has(`dismantle:${t.id}`) && dismantlable(st, w, t);
    const short = !!goal;
    const pick =
      nearest(
        st.things.filter((t) => RUBBISH.has(t.kind) && can(t)),
        tile,
      ) ??
      nearest(
        st.things.filter((t) => DISMANTLE[t.kind] && t.broken && !KEEP.has(t.kind) && can(t)),
        tile,
      ) ??
      (opts.furniture && short
        ? nearest(
            st.things.filter((t) => DISMANTLE[t.kind] && !KEEP.has(t.kind) && can(t)),
            tile,
          )
        : undefined);
    if (pick) {
      return send(
        { t: 'dismantle', ids: [p.id], thing: pick.id },
        `dismantle:${pick.id}`,
        'dismantle',
        `rozbiórka: ${THING_ACC[pick.kind] ?? pick.kind}`,
      );
    }
    // 5. zajęcie pustego mieszkania, w którym nie ma już czego szukać ani sprzątać
    const done = st.apts.find(
      (a) =>
        a.state === 'puste' &&
        !a.ours &&
        !bad.has(`claim:${a.apt}`) &&
        (!opts.search || hs.rooms.every((r) => r.apt !== a.apt || a.searched.includes(r.id))) &&
        !st.things.some((t) => RUBBISH.has(t.kind) && aptOf(tile(t)) === a.apt),
    );
    if (done && !busy('claim', done.apt)) {
      return send({ t: 'claim', ids: [p.id], apt: done.apt }, `claim:${done.apt}`, 'claim', 'zajęcie mieszkania');
    }
  };
  return { player, log };
}

/** pierwsze miejsce, które canPlace przepuszcza: pokój, kuchnia, łazienka albo (koza z beczki) pokój, kuchnia i przedpokój
    w naszych mieszkaniach, klatka siedziby (kocioł), podwórko, przy zasiekach i barykadzie najpierw dziury w siatce */
function placeFor(sim: Sim, w: World, kind: BuildKind): { x: number; y: number; rot: number } | null {
  const st = sim.st;
  const size = w.size;
  const hs = houseOf(w);
  const place = BUILDS[kind].place;
  const tiles: number[] = [];
  const kinds = PLACE_ROOMS[place];
  if (kinds && hs) {
    for (let i = 0; i < size * size; i++) {
      const r = hs.room[i];
      if (r >= 0 && kinds.includes(hs.rooms[r].kind) && st.apts.find((a) => a.apt === hs.rooms[r].apt)?.ours)
        tiles.push(i);
    }
  } else if (place === 'klatka' && hs) {
    const { rooms } = boilerRooms(st, hs, size);
    for (let i = 0; i < size * size; i++) if (hs.room[i] >= 0 && rooms.has(hs.room[i])) tiles.push(i);
  } else if (place === 'podworko') tiles.push(...(fenceShape(w)?.yard ?? []));
  else {
    for (const hole of st.fence?.holes ?? []) if (!hole.patch) tiles.push(...hole.tiles);
    tiles.push(...(fenceShape(w)?.tiles ?? []));
  }
  for (const rot of [0, 1])
    for (const i of tiles)
      if (canPlace(st, w, kind, i % size, Math.floor(i / size), rot).ok)
        return { x: i % size, y: Math.floor(i / size), rot };
  return null;
}
