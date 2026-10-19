/* Bot surowców (docs/superpowers/specs/2026-10-18-surowce-design.md): pięć dni na Przymorzu z zarządem i graczem fali 1
   (tests/unit/m2-play.ts: przeszukiwanie pustych mieszkań, rozbiórka, naprawy, budowa), raz z wrakami i warsztatem,
   raz bez nich. Gracz surowców bierze wolną osobę z zarządu tylko wtedy, gdy gracz fali 1 nie ma dla niej roboty:
   przy warsztacie robi części ze złomu (do 10 w zapasie) i deski z nadmiaru drewna (ponad 20 sztuk, reszta zostaje
   na noc do kozy), a poza tym przeszukuje najbliższy wrak i rozbiera przeszukane. To raport, a nie bramka: ile
   wraków poszło, ile poleceń warsztatu, ile desek, złomu i części zostaje po pięciu dniach, kiedy stoją budowle
   (zwłaszcza kuchnia społeczna, która potrzebuje 10 części) i ile decyzji na minutę daje dzień 2 i 3. Do tego (praca
   ludzi) którego dnia stać na najtańszy wspólny płot na Lanciego, 65 desek i 65 złomu naraz (albo 130 sztuk jednego
   z nich), liczone co 10 sekund przy ekranie z zapasów razem z tym, co leży na ulicy; dłuższy bieg (dni) pokaże, kiedy
   to nastąpi, jeśli nie w pięciu dniach. Zwykłe boty (npm run bot, npm run bot:zombie) nie dotykają niczego stąd.
   Uruchomienie: npm run bot:surowce [-- ziarno [dni]] */

import fs from 'node:fs';
import path from 'node:path';
import { BUILDS } from '../src/sim/budowle.ts';
import { clockOf, dayOf, hourOf, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import type { Command, Sim } from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { BATCH, RECIPES, wreckStage, wrecksOf, wreckTile } from '../src/sim/surowce.ts';
import { buildWorld, type World } from '../src/world/world.ts';
import { playWithGov } from '../tests/unit/gov-play.ts';
import { type M2Log, m2Player, type Player } from '../tests/unit/m2-play.ts';

const SEED = Number(process.argv[2]) || 1;
const DAYS = Number(process.argv[3]) || 5;
const SEEDS = [1, 2, 3, 4, 5].map((k) => SEED * 10 + k);
/** co ile sekund przy ekranie gracz surowców rozgląda się za robotą (jak gracz fali 1) */
const EVERY = 5;
/** deski z drewna dopiero ponad taki zapas (koza zjada nocą około 20 sztuk) */
const WOOD_KEEP = 20;
/** części ze złomu do takiego zapasu */
const PARTS_WANT = 10;
/** przy rąbaniu na deski: tniemy drzewa, dopóki desek jest mniej (najdroższa budowla, magazyn, chce 30) */
const BOARDS_WANT = 30;
/** najtańszy wspólny płot na Lanciego: 65 desek i 65 złomu naraz, albo 130 sztuk jednego z nich */
const PLOT = 65;
const PLOT_JEDEN = 130;

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../public/demo/przymorze.json'), 'utf8'));
const world = buildWorld(demo.geo, { seed: SEED, street: demo.street });

interface Log {
  searched: number;
  stripped: number;
  saws: number;
  chops: number;
}

/** najbliższe drzwiom siedziby drzewo do ścięcia (bez krzaków i ściętych) */
function nextTree(sim: Sim, w: World): number {
  const door = w.buildings[w.hq].entrances[0]?.out ?? 0;
  const dx = door % w.size;
  const dy = Math.floor(door / w.size);
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    if (t.kind === 2 || sim.st.felled.includes(k)) return;
    const d = Math.hypot(t.x - dx, t.y - dy);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}

/** Gracz fali 1, a gdy w tej sekundzie nic nie wydał, wraki i warsztat dla wolnej osoby. chop: przy warsztacie
    i braku desek ścina drzewa na deski (inaczej drewno idzie całe do kozy). */
function withResources(base: Player, log: Log, chop: boolean): Player {
  return (sim: Sim, w: World, s: number, order: (c: Command, text: string) => void) => {
    const st = sim.st;
    log.searched = (st.wraki ?? []).length;
    log.stripped = (st.wraki ?? []).filter((m) => m.s === 2).length;
    // druga osoba z zarządu od rana dnia 2 zajmuje się surowcami (jak gracz, który dzieli ludzi), reszta robi to, co
    // daje jej gracz fali 1; gdy surowce nie mają dla niej roboty, bierze ją gracz fali 1
    const mine = () => {
      const h = hourOf(st.tick);
      if (dayOf(st.tick) < 2 || h < 7 || h >= 19 || s % EVERY) return false;
      const p = st.pawns.filter((q) => q.kind === 'core' && !q.away)[1];
      if (!p || (p.job && (p.job.order || p.job.t !== 'warm'))) return false;
      const c = decide(sim, w, p, log, chop);
      if (!c) return false;
      order(c[0], c[1]);
      return true;
    };
    mine();
    base(sim, w, s, order);
  };
}

/** robota przy surowcach dla osoby p: warsztat, drzewo na deski, wrak; null, gdy nie ma */
function decide(sim: Sim, w: World, p: Sim['st']['pawns'][number], log: Log, chop: boolean): [Command, string] | null {
  const st = sim.st;
  {
    const mats = snapshot(st, w).stock.mats;
    if (st.things.some((t) => t.kind === 'warsztat')) {
      const r = RECIPES.czesci;
      if (mats.czesci < PARTS_WANT && mats.zlom >= 2 * r.n) {
        log.saws++;
        const n = Math.min(BATCH, Math.floor(mats.zlom / r.n) - 1);
        return [{ t: 'saw', ids: [p.id], what: 'czesci', n }, 'warsztat: części'];
      }
      if (mats.drewno >= WOOD_KEEP + 2 * RECIPES.deski.n) {
        log.saws++;
        return [{ t: 'saw', ids: [p.id], what: 'deski', n: BATCH }, 'warsztat: deski'];
      }
      if (chop && mats.deski < BOARDS_WANT && !st.pawns.some((q) => q.job?.t === 'chop')) {
        const k = nextTree(sim, w);
        if (k >= 0) {
          log.chops++;
          return [{ t: 'chop', ids: [p.id], tree: k }, 'drzewo na deski'];
        }
      }
    }
    const size = w.size;
    const busy = (t: number) => st.pawns.some((q) => q.job?.t === 'wreck' && q.job.target === t);
    const d = (x: number, y: number) => (x - p.x) ** 2 + (y - p.y) ** 2;
    for (const stage of [0, 1] as const) {
      const next = wrecksOf(w)
        .filter((r) => wreckStage(st.wraki, wreckTile(r, size)) === stage && !busy(wreckTile(r, size)))
        .sort((a, b) => d(a.x, a.y) - d(b.x, b.y))[0];
      if (next)
        return [
          { t: 'wreck', ids: [p.id], tile: wreckTile(next, size), how: stage === 0 ? 'szukaj' : 'rozbierz' },
          stage === 0 ? 'wrak: przeszukanie' : 'wrak: rozbiórka',
        ];
    }
  }
  return null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (v: number) => v.toFixed(1);
const range = (a: number[]) => `${f1(mean(a))} (${Math.min(...a)}–${Math.max(...a)})`;

function runs(resources: boolean, chop = false) {
  return SEEDS.map((seed) => {
    const { player, log } = m2Player({ search: true, furniture: true });
    const extra: Log = { searched: 0, stripped: 0, saws: 0, chops: 0 };
    const gracz = resources ? withResources(player, extra, chop) : player;
    // pierwszy moment, w którym stać na najtańszy płot (tick; −1: jeszcze nie); tylko odczyt, przebieg bez zmian
    let plot = -1;
    let plotJeden = -1;
    const mierz: Player = (sim, w, s, order) => {
      gracz(sim, w, s, order);
      if (s % 10 !== 0 || (plot >= 0 && plotJeden >= 0)) return;
      const m = snapshot(sim.st, w).stock.mats;
      if (plot < 0 && m.deski >= PLOT && m.zlom >= PLOT) plot = sim.st.tick;
      if (plotJeden < 0 && (m.deski >= PLOT_JEDEN || m.zlom >= PLOT_JEDEN)) plotJeden = sim.st.tick;
    };
    const r = playWithGov(world, seed, 'zawsze-warta', DAYS, 4, { player: mierz });
    // decyzje w dniach 2–3 od 7:00 do 21:00
    const inside = (t: number) => (dayOf(t) === 2 || dayOf(t) === 3) && hourOf(t) >= 7 && hourOf(t) < 21;
    const mins = new Set<number>();
    for (const x of r.decisions) if (inside(x.s * TICKS_PER_SECOND)) mins.add(Math.floor(x.s / 60));
    return {
      seed,
      log: log as M2Log,
      extra,
      mats: snapshot(r.st, world).stock.mats,
      minutes: mins.size,
      hash: r.hash,
      plot,
      plotJeden,
    };
  });
}

function line(name: string, rs: ReturnType<typeof runs>) {
  const by = (r: (typeof rs)[number], day: number) => r.log.built.filter((b) => dayOf(b.tick) <= day).length;
  console.log(
    `  ${name}: budowle do końca dnia 3: ${range(rs.map((r) => by(r, 3)))}, do końca dnia ${DAYS}: ${range(rs.map((r) => by(r, DAYS)))}`,
  );
  console.log(
    `    wraki przeszukane ${f1(mean(rs.map((r) => r.extra.searched)))}, rozebrane ${f1(mean(rs.map((r) => r.extra.stripped)))}, polecenia warsztatu ${f1(mean(rs.map((r) => r.extra.saws)))}, drzewa na deski ${f1(mean(rs.map((r) => r.extra.chops)))}; po ${DAYS} dniach desek ${f1(mean(rs.map((r) => r.mats.deski)))}, złomu ${f1(mean(rs.map((r) => r.mats.zlom)))}, części ${f1(mean(rs.map((r) => r.mats.czesci)))}, drewna ${f1(mean(rs.map((r) => r.mats.drewno)))}`,
  );
  const kitchen = rs.map((r) => {
    const b = r.log.built.find((x) => x.kind === 'kuchnia_spoleczna');
    return b ? `${r.seed}: dzień ${dayOf(b.tick)} ${clockOf(b.tick)}` : `${r.seed}: nie`;
  });
  console.log(`    ${BUILDS.kuchnia_spoleczna.name.toLowerCase()}: ${kitchen.join(', ')}`);
  const kiedy = (t: number) => (t >= 0 ? `dzień ${dayOf(t)} ${clockOf(t)}` : `nie w ${DAYS} dniach`);
  console.log(
    `    płot na Lanciego (${PLOT} desek i ${PLOT} złomu naraz): ${rs.map((r) => `${r.seed}: ${kiedy(r.plot)}`).join(', ')}; ${PLOT_JEDEN} sztuk jednego materiału: ${rs.map((r) => `${r.seed}: ${kiedy(r.plotJeden)}`).join(', ')}`,
  );
  const all = rs.map((r) => {
    const n = Object.keys(BUILDS).length;
    const b = r.log.built.length >= n ? r.log.built[n - 1] : null;
    return b ? `${r.seed}: dzień ${dayOf(b.tick)} ${clockOf(b.tick)}` : `${r.seed}: ${r.log.built.length} z ${n}`;
  });
  console.log(`    wszystkie budowle fali 1: ${all.join(', ')}`);
  console.log(
    `    minut z decyzją w dniach 2–3 (7:00–21:00): ${range(rs.map((r) => r.minutes))}; skrót ziarna ${rs[0].seed}: ${rs[0].hash}`,
  );
}

const t0 = performance.now();
console.log(`Bot surowców, ${demo.name}: ${wrecksOf(world).length} wraków, ${DAYS} dni, ziarna ${SEEDS.join(', ')}`);
line('z wrakami i warsztatem', runs(true));
line('z wrakami, warsztatem i drzewami na deski', runs(true, true));
line('bez nich (gracz fali 1)', runs(false));
console.log(`  (${Math.round(performance.now() - t0)} ms)`);
