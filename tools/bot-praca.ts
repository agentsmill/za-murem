/* Bot pracy ludzi (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, sekcja „Testy i bramka” → „Boty”).
   To raport, a nie bramka: pokazuje, co zarząd robi sam, kiedy gracz niczego mu nie zleca.

   „Zarząd bez gracza”: Przymorze, Lanciego i Zielonki, tryb zwykły i zombie, trzy doby od 15:00 pierwszego dnia. Gra
   idzie przez playWithGov (tests/unit/gov-play.ts) z jedną polityką karty nocy (zawsze warta) i jednym poleceniem
   gracza: samouczek, czyli zaznaczenie kogoś z zarządu i ścięcie suchego drzewa. Bez drzew na opał (`tylkoSamouczek`),
   więc drewno, deski, części, łaty i przeszukania biorą się z tego, co zarząd robi sam. Na koniec każdej doby (o północy)
   jedna linijka: drewno, deski, złom i części na naszym terenie (w obrębie siatki i za wspólnym płotem; drewno bez tego,
   co się pali w kozie), łaty (ile razy ktoś załatał dziurę w siatce od początku gry i ile dziur stoi otwartych),
   przeszukane pomieszczenia siedziby, wyjścia za siatkę bez polecenia, średnie ciepło i nastrój zarządu, ludność
   (`populacja`: zarząd + mieszkańcy = razem) i zgony.
   „Wyjście za siatkę bez polecenia” liczy się w krokach co sekundę przy ekranie: osoba z zarządu stoi poza naszym
   terenem (`Sim.naszTerenKafelek`), a jej zajęcie nie jest poleceniem gracza (`job.order === false`) i ma cel poza naszym
   terenem. Ma być 0, bo przełącznik „może wychodzić za siatkę” nikomu nie jest włączony. Osobno, w nawiasie, kroki
   „ulicą”: zajęcie bez polecenia, w którym osoba stoi poza naszym terenem, a cel leży na naszym; to nie jest wyjście
   za siatkę. W dobie 2 jest po jednym takim kroku w większości przebiegów, ten sam krok jest w bazie bez automatu, więc
   to artefakt klasyfikatora, a nie robota automatu; przyczyny nie ustalono (dziennik, wpis o pracy ludzi). I kroki
   „walką”: wartownik z karty nocy goni szwendacza za siatką (zajęcie `fight`), czyli obrona, a nie praca z automatu.
   Łaty: załatane dziury od początku gry; „auto” to dziury, które załatał zarząd sam (zajęcie `patch` bez polecenia
   w poprzedniej sekundzie), „inne” to łaty z wydarzeń zarządu („Załatać przed nocą”), w trybie zombie też przy starcie.
   Z flagą --przelacznik każdy z zarządu ma od początku włączone „może wychodzić za siatkę” (do porównania, ile daje
   zdjęcie tej reguły; wtedy wyjścia za siatkę są zamierzone).
   Linijka „płot” podaje, od której doby stać na najtańszy wspólny płot na Lanciego: 65 desek i 65 złomu naraz.

   Z flagą --werbunek: Przymorze z opcją `obcy`, 10 dni, zwykły gracz (drewno na opał) i do każdego wędrowca przy siatce
   idzie ktoś z zarządu z rozmową, a po niej z zaproszeniem. Pierwsze ziarno dzień po dniu (przyszli wędrowcy, rozmowy,
   zaproszenia, zwerbowani do zarządu i do mieszkańców, ludność), potem podsumowanie pięciu ziaren. Cel projektu: 2–5
   zwerbowanych do zarządu w 10 dni.

   Uruchomienie: npm run bot:praca [-- ziarno] [--werbunek] [--dni=N] [--przelacznik] */

import fs from 'node:fs';
import path from 'node:path';
import { clockOf, dayOf, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import type { Pawn, Sim, SimState } from '../src/sim/sim.ts';
import { populacja, snapshot } from '../src/sim/snapshot.ts';
import type { GameMode } from '../src/sim/tryb.ts';
import { buildWorld, type World } from '../src/world/world.ts';
import { playWithGov } from '../tests/unit/gov-play.ts';
import type { Player } from '../tests/unit/m2-play.ts';

const argumenty = process.argv.slice(2);
const WERBUNEK = argumenty.includes('--werbunek');
const DNI_ARG = argumenty.find((a) => a.startsWith('--dni='))?.slice(6);
const PRZELACZNIK = argumenty.includes('--przelacznik');
const nieznane = argumenty.filter(
  (a) => a.startsWith('--') && a !== '--werbunek' && a !== '--przelacznik' && !a.startsWith('--dni='),
);
if (nieznane.length) {
  console.error(
    `Nieznany argument: ${nieznane.join(', ')}. Bot zna tylko --werbunek, --przelacznik i --dni=N (reszta to ziarno).`,
  );
  process.exit(2);
}
const SEED = Number(argumenty.find((a) => !a.startsWith('--'))) || 1;
/** dni „zarządu bez gracza” (domyślnie trzy, jak w projekcie) */
const DNI = Number(DNI_ARG) || 3;
/** dni werbunku */
const DNI_WERBUNEK = Number(DNI_ARG) || 10;

const DEMA = [
  ['przymorze', 'Przymorze'],
  ['lanciego', 'Lanciego'],
  ['zielonki', 'Zielonki'],
] as const;
const TRYBY: [GameMode, string][] = [
  ['zwykly', 'zwykły'],
  ['zombie', 'zombie'],
];
/** najtańszy wspólny płot na Lanciego: tyle desek i tyle złomu naraz (spec, „Sprawdzenie wspólnego płotu”) */
const PLOT_DESKI = 65;
const PLOT_ZLOM = 65;

const demo = (nazwa: string) =>
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../public/demo/${nazwa}.json`), 'utf8'));
const swiat = (nazwa: string): World => {
  const d = demo(nazwa);
  return buildWorld(d.geo, { seed: SEED, street: d.street });
};

const tileOf = (w: World, p: Pawn) => Math.floor(p.y) * w.size + Math.floor(p.x);
const srednia = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (v: number) => v.toFixed(1);

/* ---------- zarząd bez gracza ---------- */

interface Doba {
  doba: number;
  drewno: number;
  deski: number;
  zlom: number;
  czesci: number;
  laty: number;
  latyInne: number;
  otwarte: number;
  przeszukane: number;
  wyjscia: number;
  ulica: number;
  walka: number;
  cieplo: number;
  nastroj: number;
  zarzad: number;
  mieszkancy: number;
  razem: number;
  zgony: number;
  /** czas gry, o którym minęła pierwsza chwila z 65 deskami i 65 złomu naraz (tick), albo -1 */
  plot: number;
}

/** materiały na naszym terenie (w obrębie siatki i za wspólnym płotem) oraz w magazynie części */
function zapasy(sim: Sim) {
  const st = sim.st;
  const size = sim.w.size;
  const r = { drewno: 0, deski: 0, zlom: 0, czesci: st.store.parts };
  for (const t of st.things) {
    if (t.n <= 0 || !sim.naszTerenKafelek(t.y * size + t.x)) continue;
    if (t.kind === 'drewno') r.drewno += t.n;
    else if (t.kind === 'deski') r.deski += t.n;
    else if (t.kind === 'zlom') r.zlom += t.n;
    else if (t.kind === 'czesci') r.czesci += t.n;
  }
  for (const p of st.pawns)
    if (p.kind === 'core' && !p.away && sim.naszTerenKafelek(tileOf(sim.w, p))) r.drewno += p.carry;
  return r;
}

function dobyBezGracza(w: World, mode: GameMode): { doby: Doba[]; hash: string; ms: number } {
  const t0 = performance.now();
  const doby: Doba[] = [];
  let ostatniaDoba = 1;
  let wyjscia = 0;
  let ulica = 0;
  let walka = 0;
  let laty = 0;
  let latyInne = 0;
  let plot = -1;
  /** wytrzymałość łaty każdej dziury przy poprzednim kroku (id dziury → wytrzymałość); pierwszy krok tylko zapamiętuje */
  let lata: Map<number, number> | null = null;
  /** dziury, przy których w poprzednim kroku ktoś łatał bez polecenia */
  let lataAuto = new Set<number>();
  const wiersz = (sim: Sim, doba: number): Doba => {
    const st = sim.st;
    const z = zapasy(sim);
    const ludzie = snapshot(st, w).people;
    const pop = populacja(st);
    return {
      doba,
      ...z,
      laty,
      latyInne,
      otwarte: (st.fence?.holes ?? []).filter((h) => !h.patch).length,
      przeszukane: st.apts.reduce((a, g) => a + g.searched.length, 0),
      wyjscia,
      ulica,
      walka,
      cieplo: srednia(ludzie.map((p) => p.needs.warm)),
      nastroj: srednia(ludzie.map((p) => p.needs.mood)),
      zarzad: pop.zarzad,
      mieszkancy: pop.mieszkancy,
      razem: pop.razem,
      zgony: (st.dead ?? []).filter((d) => d.kind !== 'szabrownik').length,
      plot,
    } as Doba;
  };
  let przelacznikDany = !PRZELACZNIK;
  const player: Player = (sim) => {
    const st = sim.st;
    if (!przelacznikDany) {
      przelacznikDany = true;
      for (const p of st.pawns)
        if (p.kind === 'core') sim.push({ t: 'zasiatke', ids: [p.id], osoba: p.person, on: true });
    }
    const doba = dayOf(st.tick);
    if (doba !== ostatniaDoba) {
      doby.push(wiersz(sim, ostatniaDoba));
      ostatniaDoba = doba;
      wyjscia = 0;
      ulica = 0;
      walka = 0;
    }
    for (const p of st.pawns) {
      if (p.kind !== 'core' || p.away || !p.job || p.job.order) continue;
      if (sim.naszTerenKafelek(tileOf(w, p))) continue;
      if (p.job.t === 'fight') walka++;
      else if (p.job.tile >= 0 && !sim.naszTerenKafelek(p.job.tile)) wyjscia++;
      else ulica++;
    }
    const holes = st.fence?.holes ?? [];
    if (lata)
      for (const h of holes)
        if (h.patch > (lata.get(h.id) ?? h.patch)) {
          if (lataAuto.has(h.id)) laty++;
          else latyInne++;
        }
    lata = new Map(holes.map((h) => [h.id, h.patch]));
    lataAuto = new Set(
      st.pawns.filter((p) => p.kind === 'core' && p.job?.t === 'patch' && !p.job.order).map((p) => p.job!.target),
    );
    if (plot < 0 && st.tick % (TICKS_PER_SECOND * 10) === 0) {
      const z = zapasy(sim);
      if (z.deski >= PLOT_DESKI && z.zlom >= PLOT_ZLOM) plot = st.tick;
    }
  };
  const r = playWithGov(w, SEED, 'zawsze-warta', DNI, 4, { player, mode, tylkoSamouczek: true });
  return { doby, hash: r.hash, ms: performance.now() - t0 };
}

function raportBezGracza(): void {
  console.log(
    `Zarząd bez gracza: ${DNI} doby od 15:00 pierwszego dnia, ziarno ${SEED}, karta nocy (zawsze warta) i samouczek, nic więcej${PRZELACZNIK ? '; każdy z zarządu z przełącznikiem „może wychodzić za siatkę”' : ''}`,
  );
  console.log(
    '  osiedle   tryb    doba  drewno deski złom części  łaty auto+inne (otwarte)  przeszukane  wyjścia (ulicą, walką)  ciepło nastrój  ludność z+m=r  zgony',
  );
  for (const [nazwa, tytul] of DEMA) {
    const w = swiat(nazwa);
    for (const [mode, tryb] of TRYBY) {
      const { doby, hash, ms } = dobyBezGracza(w, mode);
      for (const d of doby)
        console.log(
          `  ${tytul.padEnd(9)} ${tryb.padEnd(7)} ${String(d.doba).padStart(4)}  ${String(d.drewno).padStart(6)} ${String(d.deski).padStart(5)} ${String(d.zlom).padStart(4)} ${String(d.czesci).padStart(6)}  ${String(d.laty).padStart(8)}+${String(d.latyInne).padEnd(5)} (${String(d.otwarte).padStart(2)})  ${String(d.przeszukane).padStart(11)}  ${String(d.wyjscia).padStart(7)} (${String(d.ulica).padStart(3)}, ${String(d.walka).padStart(3)})        ${String(Math.round(d.cieplo)).padStart(6)} ${String(Math.round(d.nastroj)).padStart(7)}  ${String(d.zarzad).padStart(5)}+${String(d.mieszkancy).padStart(2)}=${String(d.razem).padStart(2)}  ${String(d.zgony).padStart(5)}`,
        );
      const plot = doby.length ? doby[doby.length - 1].plot : -1;
      console.log(
        `            ${plot >= 0 ? `płot ${PLOT_DESKI}+${PLOT_ZLOM}: stać od doby ${dayOf(plot)} ${clockOf(plot)}` : `płot ${PLOT_DESKI}+${PLOT_ZLOM}: nie w ${DNI} dobach`}; wyjść za siatkę ${doby.reduce((a, d) => a + d.wyjscia, 0)}; skrót stanu ${hash}; ${Math.round(ms)} ms`,
      );
    }
  }
}

/* ---------- werbunek ---------- */

interface DobaWerbunku {
  doba: number;
  przyszli: number;
  rozmowy: number;
  zaproszenia: number;
  doZarzadu: number;
  doMieszkancow: number;
  zarzad: number;
  mieszkancy: number;
  razem: number;
}

interface Werbunek {
  doby: DobaWerbunku[];
  przyszli: number;
  rozmowy: number;
  zaproszenia: number;
  doZarzadu: number;
  doMieszkancow: number;
  razem: number;
  hash: string;
}

/** Jeden bieg: do każdego wędrowca przy siatce idzie najbliższa wolna osoba z zarządu z rozmową, po rozmowie z zaproszeniem */
function graWerbunek(w: World, seed: number): Werbunek {
  const doby: DobaWerbunku[] = [];
  const przyszli = new Set<number>();
  const rozmowy = new Set<number>();
  const zaproszenia = new Set<number>();
  /** ile razy bot zlecił rozmowę albo zaproszenie temu wędrowcowi i kiedy ostatnio (sekundy przy ekranie) */
  const proby = new Map<string, { n: number; s: number }>();
  let doZarzadu = 0;
  let doMieszkancow = 0;
  let zwerbowanych = 0;
  let ostatniaDoba = 1;
  const zlecaj = (s: number, key: string, ok: boolean): boolean => {
    const pr = proby.get(key) ?? { n: 0, s: -99 };
    if (!ok || pr.n >= 6 || s - pr.s < 4) return false;
    proby.set(key, { n: pr.n + 1, s });
    return true;
  };
  const wiersz = (st: SimState, doba: number): DobaWerbunku => {
    const pop = populacja(st);
    return {
      doba,
      przyszli: przyszli.size,
      rozmowy: rozmowy.size,
      zaproszenia: zaproszenia.size,
      doZarzadu,
      doMieszkancow,
      zarzad: pop.zarzad,
      mieszkancy: pop.mieszkancy,
      razem: pop.razem,
    };
  };
  const player: Player = (sim, _w, s, order) => {
    const st = sim.st;
    const doba = dayOf(st.tick);
    if (doba !== ostatniaDoba) {
      doby.push(wiersz(st, ostatniaDoba));
      ostatniaDoba = doba;
    }
    const wolni = st.pawns.filter((p) => p.kind === 'core' && !p.away && p.job?.t !== 'sleep' && p.job?.t !== 'guard');
    for (const t of st.pawns) {
      if (t.kind !== 'wedrowiec') continue;
      przyszli.add(t.id);
      // przy siatce, jeszcze nie odchodzi
      if (t.job?.phase !== 1 || !wolni.length) continue;
      const blisko = (a: Pawn, b: Pawn) =>
        (a.x - t.x) ** 2 + (a.y - t.y) ** 2 - ((b.x - t.x) ** 2 + (b.y - t.y) ** 2) || a.id - b.id;
      const kto = [...wolni].sort(blisko)[0];
      if (t.job.what !== 'zagadany') {
        const ktosGada = st.pawns.some((q) => q.job?.t === 'talk' && q.job.target === t.id);
        if (zlecaj(s, `r${t.id}`, !ktosGada)) {
          rozmowy.add(t.id);
          order({ t: 'talk', ids: [kto.id], target: t.id }, 'rozmowa z wędrowcem');
        }
      } else if (st.obcy?.rozmowa?.id === t.id) {
        const ktosZaprasza = st.pawns.some((q) => q.job?.t === 'zapros' && q.job.target === t.id);
        if (zlecaj(s, `z${t.id}`, !ktosZaprasza)) {
          zaproszenia.add(t.id);
          order({ t: 'zapros', ids: [kto.id], target: t.id }, 'zaproszenie wędrowca');
        }
      }
    }
    // kogo zwerbowano w tej sekundzie: id w1, w2… (licznik w st.obcy), do zarządu albo do mieszkańców
    const n = st.obcy?.werbunek ?? 0;
    while (zwerbowanych < n) {
      zwerbowanych++;
      const idx = st.people.findIndex((q) => q.id === `w${zwerbowanych}`);
      const pionek = st.pawns.find((q) => q.person === idx && (q.kind === 'core' || q.kind === 'resident'));
      if (pionek?.kind === 'core') doZarzadu++;
      else doMieszkancow++;
    }
  };
  const r = playWithGov(w, seed, 'zawsze-warta', DNI_WERBUNEK, 4, { player, obcy: true });
  doby.push(wiersz(r.st, ostatniaDoba));
  return {
    doby,
    przyszli: przyszli.size,
    rozmowy: rozmowy.size,
    zaproszenia: zaproszenia.size,
    doZarzadu,
    doMieszkancow,
    razem: populacja(r.st).razem,
    hash: r.hash,
  };
}

function raportWerbunek(): void {
  const w = swiat('przymorze');
  console.log(
    `Werbunek, Przymorze z wędrowcami (opcja obcy), ${DNI_WERBUNEK} dni, gracz z drewnem na opał, rozmowa i zaproszenie z każdym wędrowcem przy siatce`,
  );
  const a = graWerbunek(w, SEED);
  console.log(`  ziarno ${SEED}, stan na koniec doby (dzień 1 zaczyna się o 15:00):`);
  console.log('   doba  przyszli  rozmowy  zaproszenia  do zarządu  do mieszkańców  ludność z+m=r');
  for (const d of a.doby)
    console.log(
      `  ${(d.doba > DNI_WERBUNEK ? `${d.doba}*` : String(d.doba)).padStart(5)}  ${String(d.przyszli).padStart(8)}  ${String(d.rozmowy).padStart(7)}  ${String(d.zaproszenia).padStart(11)}  ${String(d.doZarzadu).padStart(10)}  ${String(d.doMieszkancow).padStart(14)}  ${String(d.zarzad).padStart(6)}+${String(d.mieszkancy).padStart(2)}=${String(d.razem).padStart(2)}`,
    );
  console.log(`  (* koniec biegu o 15:00)  skrót stanu ${a.hash}`);
  const ziarna = [1, 2, 3, 4, 5].map((k) => SEED * 10 + k);
  const bieg = ziarna.map((z) => graWerbunek(w, z));
  console.log(`  pięć ziaren ${ziarna.join(', ')}, po ${DNI_WERBUNEK} dniach:`);
  console.log('   ziarno  przyszli  rozmowy  zaproszenia  do zarządu  do mieszkańców  ludność');
  for (const [k, b] of bieg.entries())
    console.log(
      `  ${String(ziarna[k]).padStart(7)}  ${String(b.przyszli).padStart(8)}  ${String(b.rozmowy).padStart(7)}  ${String(b.zaproszenia).padStart(11)}  ${String(b.doZarzadu).padStart(10)}  ${String(b.doMieszkancow).padStart(14)}  ${String(b.razem).padStart(7)}`,
    );
  const zarzad = bieg.map((b) => b.doZarzadu);
  console.log(
    `  do zarządu średnio ${f1(srednia(zarzad))} (${Math.min(...zarzad)}–${Math.max(...zarzad)}), cel 2–5; do mieszkańców średnio ${f1(srednia(bieg.map((b) => b.doMieszkancow)))}; wędrowców średnio ${f1(srednia(bieg.map((b) => b.przyszli)))}`,
  );
}

if (WERBUNEK) raportWerbunek();
else raportBezGracza();
