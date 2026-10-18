/* Gracz-bot fali 1 M2 (docs/M2-fala-1.md): od rana dnia 2 jak człowiek przy ekranie co kilka sekund daje wolnej
   osobie z zarządu pracę przy pustych mieszkaniach (przeszukanie, rozbiórka śmieci i mebli, naprawa, zajęcie)
   i stawia plan budowli, kiedy materiały wystarczą. Wpina się w playWithGov (PlayOpts.player), więc decyzje liczą
   się razem z oknami zarządu i drewnem na opał. Używają go testy i tools/bot.ts. */

import { BUILDS, type BuildKind, canPlace, type Mat } from '../../src/sim/budowle.ts';
import { dayOf, hourOf } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { DISMANTLE, REPAIR, RUBBISH, searchable } from '../../src/sim/mieszkania.ts';
import { THING_ACC } from '../../src/sim/orders.ts';
import { fenceShape } from '../../src/sim/perimeter.ts';
import { type Command, dismantlable, type Sim, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { World } from '../../src/world/world.ts';

export interface M2Opts {
  /** przeszukuje pomieszczenia pustych mieszkań */
  search: boolean;
  /** rozbiera całe meble w pustych mieszkaniach (poza łóżkami), gdy do następnej budowli brakuje materiałów */
  furniture: boolean;
}

export interface M2Log {
  /** gotowe budowle z tickiem ukończenia */
  built: { kind: BuildKind; tick: number }[];
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
/** co ile sekund przy ekranie gracz rozgląda się za następną decyzją */
const EVERY = 5;
/** łóżka zostają: po zajęciu i naprawie dają miejsca dla mieszkańców */
const KEEP = new Set(['lozko', 'wersalka']);

export function m2Player(opts: M2Opts): { player: Player; log: M2Log } {
  const log: M2Log = { built: [], placed: 0, searched: 0, dismantled: 0, repaired: 0, claimed: 0 };
  const seen = new Set<number>();
  const placed = new Set<BuildKind>();
  /** cele, których nie dało się zacząć (nieosiągalne): klucz 'rodzaj:cel' */
  const bad = new Set<string>();
  let last: { pawn: number; key: string; job: string } | null = null;
  /** ile było do rozebrania na starcie */
  let start = -1;

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
    const open = GOALS.filter((k) => !placed.has(k));
    const cores = st.pawns.filter((p) => p.kind === 'core' && !p.away);
    const free = cores.filter((p) => !p.job || (!p.job.order && p.job.t === 'warm'));

    // 1. plan budowy: pierwsza z kolejki, na którą starcza materiałów i jest miejsce
    for (const k of open) {
      if (!covers(BUILDS[k].cost)) continue;
      const at = placeFor(sim, w, k);
      if (!at) continue;
      placed.add(k);
      log.placed++;
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

/** pierwsze miejsce, które canPlace przepuszcza: pokój albo kuchnia w naszych mieszkaniach, podwórko,
    przy zasiekach najpierw dziury w siatce */
function placeFor(sim: Sim, w: World, kind: BuildKind): { x: number; y: number; rot: number } | null {
  const st = sim.st;
  const size = w.size;
  const hs = houseOf(w);
  const place = BUILDS[kind].place;
  const tiles: number[] = [];
  if ((place === 'pokoj' || place === 'kuchnia') && hs) {
    for (let i = 0; i < size * size; i++) {
      const r = hs.room[i];
      if (r >= 0 && hs.rooms[r].kind === place && st.apts.find((a) => a.apt === hs.rooms[r].apt)?.ours) tiles.push(i);
    }
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
