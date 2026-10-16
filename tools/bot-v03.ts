/* Bot wzorcowy wersji 0.3: oryginalny kod z public/v03 w node:vm, losowość z ziarnem.
   Gra jak rozsądny gracz i wypisuje dzienne liczby. To jest punkt odniesienia dla balansu
   nowej wersji (bramka M3: „balans zbliżony do 0.3” liczymy tą samą polityką).
   Uruchomienie: npm run bot:v03 [-- ziarno [dni]] */

import { type G03, loadV03 } from './v03.ts';

const SEED = Number(process.argv[2]) || 1;
const DAYS = Number(process.argv[3]) || 45;
const QUIET = process.argv.includes('--cicho');
const TRACE = process.argv.includes('--slad');

// biome-ignore lint/suspicious/noExplicitAny: stan 0.3 bez typów
type S03 = any;

const TECH_ORDER = [
  't_kozy',
  't_okna',
  't_konserwy',
  't_zielarstwo',
  't_wieza',
  't_szklarnia',
  't_grzyby',
  't_spawanie',
  't_wezel',
  't_ambu',
  't_barykady',
  't_akumulatory',
  't_panele',
  't_wiatrak',
  't_gazo',
  't_swiatlo',
  't_radio',
  't_mesh',
  't_pompy',
  't_druk',
  't_hydro',
  't_drony',
  't_serwer',
  't_model',
];
const LAW_ORDER = ['u_zebrania', 'u_pochowek', 'u_dzieci', 'u_sad', 'u_walne', 'u_dokwaterowanie', 'u_polityka'];
const STAFF_ORDER = [
  'kuchnia',
  'rozbiorka',
  'ogrodki',
  'szklarnia',
  'grzybiarnia',
  'wyrab',
  'ambulatorium',
  'swietlica',
  'warsztat',
  'wieza',
  'generator',
  'wezel',
  'radio',
];

export interface DayRow {
  day: number;
  pop: number;
  sick: number;
  food: number;
  fuel: number;
  trust: number;
  anger: number;
  deaths: number;
  techs: number;
  laws: number;
}

export function playV03(seed: number, days: number, log?: (r: DayRow) => void) {
  const v = loadV03();
  const G: G03 = v.G;
  const Sim = G.Sim;
  v.seed(seed);
  const S: S03 = Sim.newGame(JSON.parse(JSON.stringify(G.SAMPLE)), { seed, name: 'Przymorze', src: 'sample' });
  const N = G.N;
  const hq = S.bldgs[S.hq];

  const tryAdapt = (id: string) => {
    const cands = Sim.ours(S)
      .slice()
      .sort((a: S03, b: S03) => a.d - b.d);
    for (const b of cands) if (!Sim.canAdapt(S, b, id)) return Sim.adapt(S, b.idx, id);
    return false;
  };
  const tryPlace = (id: string) => {
    const [cx, cy] = hq.c;
    for (let r = 2; r < 30; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          if (!Sim.canPlace(S, id, x, y)) return !!Sim.place(S, id, x, y);
        }
    return false;
  };
  const count = (id: string) => Sim.facs(S).filter((f: S03) => (f.k === 'b' ? f.f.id : f.f.fac) === id).length;

  function daily() {
    const season = Sim.season(S);
    // budowa
    if (!count('kuchnia')) tryAdapt('kuchnia');
    if (!count('swietlica')) tryAdapt('swietlica');
    if (count('ognisko') < 2) tryPlace('ognisko');
    if (count('ogrodki') < 2 && season !== 1) tryPlace('ogrodki');
    // wyrąb bez drzew w okolicy przenosimy w inne miejsce
    for (const y of S.yard.filter((q: S03) => q.fac === 'wyrab' && q.warned)) Sim.removeFac(S, 'y', y.id);
    if (!count('wyrab')) tryPlace('wyrab');
    // opał z rozbiórki pustych i obcych budynków
    const fc0 = Sim.forecast(S);
    if (fc0.opal < 5 && !count('rozbiorka')) {
      const cands = S.bldgs
        .filter((b: S03) => (b.status === 'pusty' || b.status === 'obcy') && !b.fac && !b.hq)
        .sort((a: S03, b: S03) => a.d - b.d);
      for (const b of cands) if (!Sim.canAdapt(S, b, 'rozbiorka') && Sim.adapt(S, b.idx, 'rozbiorka')) break;
    }
    if (!count('ambulatorium') && (S.sick > 3 || Sim.day(S) >= 5)) tryAdapt('ambulatorium');
    if (!count('warsztat') && S.res.zlom >= 10) tryAdapt('warsztat');
    if (Sim.tech(S, 't_szklarnia') && count('szklarnia') < 2) tryPlace('szklarnia');
    if (Sim.tech(S, 't_grzyby') && !count('grzybiarnia')) tryAdapt('grzybiarnia');
    if (Sim.tech(S, 't_wieza') && !count('wieza')) tryPlace('wieza');
    if (Sim.tech(S, 't_wezel') && !count('wezel')) tryAdapt('wezel');
    if (Sim.tech(S, 't_barykady')) Sim.raiseBarykady(S);
    // obsada stanowisk według ważności
    const facs = Sim.facs(S);
    for (const id of STAFF_ORDER)
      for (const f of facs) {
        const fid = f.k === 'b' ? f.f.id : f.f.fac;
        if (fid !== id || f.f.build > 0) continue;
        Sim.setStaff(S, f.k, f.i, G.FAC[fid].slots || 0);
      }
    // kierownicy: najlepszy wolny fachowiec w dziedzinie stanowiska
    for (const f of Sim.facs(S)) {
      const F = f.F;
      if (!F.dom || f.f.leader) continue;
      const free = Sim.alive(S).filter((p: S03) => !p.assign && !p.sick);
      free.sort((a: S03, b: S03) => (b.skills[F.dom] || 0) - (a.skills[F.dom] || 0));
      if (free[0] && (free[0].skills[F.dom] || 0) > 0) Sim.setLeader(S, f.k, f.i, free[0].id);
    }
    // badania
    if (!S.techs.cur) {
      const t = TECH_ORDER.find((id) => Sim.techState(S, id).s === 'ok');
      if (t) Sim.startResearch(S, t);
    }
    // uchwały
    for (const id of LAW_ORDER) if (Sim.lawState(S, id).s === 'ok' && Sim.signLaw(S, id)) break;
    // ekipy po jedzenie i opał
    const fc = Sim.forecast(S);
    const want = fc.food < 4 ? 'spozywczy' : fc.opal < 3 ? 'stacja' : Sim.day(S) % 3 === 0 ? 'szkola' : null;
    if (want && S.ekipy.length < Sim.maxEkipy(S) && Sim.available(S) >= 6) {
      const p = S.pois.findIndex((q: S03) => q.c === want && q.visits < 3);
      const tg = p >= 0 ? { k: 'p', i: p } : null;
      if (tg) Sim.sendEkipa(S, tg, 4, null);
    }
    if (TRACE)
      console.log(
        `  [${Sim.day(S)}] ${Sim.facs(S)
          .map(
            (f: S03) =>
              `${f.k === 'b' ? f.f.id : f.f.fac}${f.f.build > 0 ? `(bud.${f.f.build})` : ''}:${f.f.staff || 0}`,
          )
          .join(
            ' ',
          )} | wolni ${Sim.freeWorkers(S)} | opał ${S.res.opal.toFixed(1)} wczoraj zużyto ${S.yesterday.opal.toFixed(1)} | badanie ${S.techs.cur}`,
      );
    // przyłączanie sąsiadów tylko z zapasem jedzenia i opału
    if (S.trust >= 45 && fc.food > 6 && fc.opal > 6)
      for (const b of S.bldgs)
        if (b.status === 'sasiedzi' && !Sim.canClaim(S, b)) {
          Sim.claim(S, b.idx);
          break;
        }
  }

  const rows: DayRow[] = [];
  let lastDay = Sim.day(S);
  let lastDaily = 0;
  let guard = 0;
  while (Sim.day(S) <= days && !S.over && guard++ < 200000) {
    if (S.event) {
      const ev = Sim.eventView(S);
      let k = ev.choices.findIndex((c: S03) => c.ai && c.ok);
      if (k < 0) k = ev.choices.findIndex((c: S03) => c.ok);
      Sim.choose(S, Math.max(0, k));
      continue;
    }
    if (Sim.hour(S) >= 8 && Sim.day(S) !== lastDaily) {
      lastDaily = Sim.day(S);
      daily();
    }
    Sim.advance(S, 60);
    const d = Sim.day(S);
    if (d !== lastDay) {
      const r: DayRow = {
        day: lastDay,
        pop: Sim.pop(S),
        sick: S.sick,
        food: Math.round(S.res.jedzenie),
        fuel: Math.round(S.res.opal),
        trust: Math.round(S.trust),
        anger: Math.round(S.anger),
        deaths: S.deaths,
        techs: Object.keys(S.techs.done).length,
        laws: Object.keys(S.laws.signed).length,
      };
      rows.push(r);
      log?.(r);
      lastDay = d;
    }
  }
  return { rows, over: S.over as string | null, ending: S.ending as string | null, day: Sim.day(S) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pad = (v: unknown, n: number) => String(v).padStart(n);
  if (!QUIET) {
    console.log(`Bot 0.3, Przymorze (przykład z Overpass), ziarno ${SEED}, ${DAYS} dni`);
    console.log(' dzień  ludzie chorzy jedz. opał  zauf. wkurz. zmarli techn. uchw.');
  }
  const res = playV03(SEED, DAYS, (r) => {
    if (!QUIET)
      console.log(
        `${pad(r.day, 6)} ${pad(r.pop, 7)} ${pad(r.sick, 6)} ${pad(r.food, 5)} ${pad(r.fuel, 5)} ${pad(r.trust, 6)} ${pad(r.anger, 6)} ${pad(r.deaths, 6)} ${pad(r.techs, 6)} ${pad(r.laws, 5)}`,
      );
  });
  console.log(
    `Koniec: dzień ${res.day}, ${res.over ? `porażka: ${res.over}` : res.ending ? `zakończenie: ${res.ending}` : 'gra trwa'}`,
  );
}
