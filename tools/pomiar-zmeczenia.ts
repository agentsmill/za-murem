/* Pomiar zgonów w bocie trybu zombie (wolniejsze zmęczenie D, docs/POSTEP.md, „Wolniejsze zmęczenie”): puszcza
   tools/bot-zombie.ts bez żadnej zmiany (ten sam przebieg i te same skróty), a Sim.prototype owija zaczepami, które
   tylko czytają stan: nie losują, nie piszą do SimState i niczego nie przestawiają, więc skróty bota wychodzą takie,
   jakby pomiaru nie było. Dla każdej z dwóch polityk bota (warta z dzidami, bez warty) zbiera:
   - zgony (st.dead): kto, kiedy, gdzie stał, co robił (praca i ostatnia praca), siły, zdrowie, jedzenie, ciepło,
     od kiedy ugryziony i kto zadał ostatni cios;
   - zakażenia po ugryzieniu: przy siatce (Sim.bite), na wyprawie z karty nocy (zarząd, GovEffects.bitten) i gdzie
     indziej, z pracą i miejscem w chwili ugryzienia, bo to ono, a nie zgon w gorączce 18 godzin później, mówi, co
     człowiek robił na dworze;
   - ekspozycję: godziny gry zarządu według pory (noc to 20:00–7:00 jak w tabeli bota), pracy i miejsca;
   - skład zarządu o 21:00, 3:00 i 6:00 (kto na warcie, kto śpi, kto na wyprawie, siły);
   - opcjonalny ślad: stan zarządu co POMIAR_CO minut gry w oknie POMIAR_SLAD.
   Uruchomienie: node tools/pomiar-zmeczenia.ts [ziarno [noce [osoby]]], argumenty i flagi bota są bota.
   Zmienne środowiska: POMIAR_OUT=plik.json (wynik do zebrania przez tools/pomiar-zmeczenia-zbierz.ts),
   POMIAR_SLAD=dzień:godz-dzień:godz (np. 2:18-3:08; godziny z ułamkiem), POMIAR_CO=30 (minuty gry między liniami
   śladu). Bez POMIAR_OUT wynik tylko drukuje się pod tabelami bota. */

import fs from 'node:fs';
import { clockOf, dayOf, hourOf, TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { tickAt } from '../src/sim/handlarz.ts';
import { type Dead, type Pawn, postKey, Sim, type SimState } from '../src/sim/sim.ts';
import type { World } from '../src/world/world.ts';

/** prywatne składowe Sim, z których pomiar tylko czyta */
interface Widok {
  st: SimState;
  w: World;
  inRoom(i: number): boolean;
  inSasiad(i: number): boolean;
}
const widok = (s: Sim): Widok => s as unknown as Widok;

interface Proto {
  step(this: Sim): void;
  die(this: Sim, p: Pawn, cause: Dead['cause'], by: Pawn | null): void;
  bite(this: Sim, zombie: Pawn, ofiara: Pawn): void;
}
const proto = Sim.prototype as unknown as Proto;

/** stan człowieka w chwili zdarzenia */
export interface Opis {
  id: number;
  imie: string;
  rodzaj: string;
  tick: number;
  dzien: number;
  zegar: string;
  godzina: number;
  pora: 'dzień' | 'noc';
  miejsce: string;
  praca: string;
  faza: number;
  /** ostatnia praca zauważona najwyżej 3 minuty gry wcześniej (praca w chwili zdarzenia bywa już pusta) */
  ostatnia: string;
  sily: number;
  zdrowie: number;
  jedzenie: number;
  cieplo: number;
  bron: string | null;
  niesie: number;
  /** godziny gry od ugryzienia (null: nie ugryziony) */
  goraczkaH: number | null;
  /** szwendacze w promieniu 6 m */
  szwendaczy: number;
}

export interface Zgon extends Opis {
  przyczyna: Dead['cause'];
  zadal: string | null;
  /** zakażenie, z którego umarł (gorączka), albo null */
  zakazenie: Zakazenie | null;
}

export interface Zakazenie extends Opis {
  skad: 'siatka' | 'wyprawa' | 'inne';
  konczyna: boolean;
}

export interface Sklad {
  dzien: number;
  zegar: string;
  ludzie: { id: number; imie: string; praca: string; miejsce: string; sily: number; zdrowie: number; bite: boolean }[];
}

export interface Bieg {
  ziarno: number;
  polityka: string;
  hash: string;
  koniec: string;
  zaufanie: number | null;
  wkurzenie: number | null;
  /** tabela bota: noc, stado, napiera, zabici, przerwania, ugryzienia dzień, noc, zgony, siatka, zarząd, najedzenie,
      zdrowie, mieszkańcy */
  noce: number[][];
  tally: { killed: number; breaches: number; bites: number; deaths: number };
  zgony: Zgon[];
  zakazenia: Zakazenie[];
  /** ugryzienia, które trafiły człowieka (zarząd, mieszkańca) na mapie; ugryzienia na wyprawach tu nie wchodzą */
  trafienia: number;
  /** godziny gry zarządu: „pora|praca|miejsce” */
  ekspozycja: Record<string, number>;
  skladNocy: Sklad[];
  slad: string[];
}

const biegi: Bieg[] = [];
let bieg: Bieg | null = null;
let stanBiegu: SimState | null = null;
const POLITYKI = ['warta-dzidy', 'bez-warty'];

const SLAD = process.env.POMIAR_SLAD?.match(/^(\d+):([\d.]+)-(\d+):([\d.]+)$/);
const SLAD_OD = SLAD ? tickAt(Number(SLAD[1]), Number(SLAD[2])) : Number.POSITIVE_INFINITY;
const SLAD_DO = SLAD ? tickAt(Number(SLAD[3]), Number(SLAD[4])) : -1;
const SLAD_CO = Math.max(1, Math.round(((Number(process.env.POMIAR_CO) || 30) * TICKS_PER_HOUR) / 60));

/** siatka świata: kafelki podwórka, kafelki siatki i odległości z pamięcią podręczną */
interface Siatka {
  yard: Set<number>;
  tiles: number[];
  cache: Map<number, number>;
}
const siatki = new WeakMap<World, Siatka>();
function siatkaSwiata(w: World): Siatka {
  let s = siatki.get(w);
  if (!s) {
    s = { yard: new Set(w.fence.yard), tiles: [...w.fence.tiles], cache: new Map() };
    siatki.set(w, s);
  }
  return s;
}

function odlegloscSiatki(w: World, tile: number): number {
  const s = siatkaSwiata(w);
  const hit = s.cache.get(tile);
  if (hit !== undefined) return hit;
  const x = (tile % w.size) + 0.5;
  const y = Math.floor(tile / w.size) + 0.5;
  let best = Number.POSITIVE_INFINITY;
  for (const t of s.tiles) best = Math.min(best, Math.hypot((t % w.size) + 0.5 - x, Math.floor(t / w.size) + 0.5 - y));
  s.cache.set(tile, best);
  return best;
}

/** gdzie stoi człowiek: wyprawa, środek (pomieszczenia siedziby), sąsiad, podwórko, za siatką; „przy siatce” to do 2 m */
function miejsce(sim: Sim, p: Pawn): string {
  if (p.away) return 'wyprawa';
  const v = widok(sim);
  const tile = Math.floor(p.y) * v.w.size + Math.floor(p.x);
  if (v.inRoom(tile)) return 'środek';
  if (v.inSasiad(tile)) return 'sąsiad';
  const blisko = odlegloscSiatki(v.w, tile) <= 2;
  if (siatkaSwiata(v.w).yard.has(tile)) return blisko ? 'podwórko przy siatce' : 'podwórko';
  return blisko ? 'za siatką przy siatce' : 'za siatką';
}

const praca = (p: Pawn): string =>
  p.away ? 'wyprawa' : p.job ? (p.job.t === 'guard' ? `warta:${postKey(p.job.target)}` : p.job.t) : '-';

/** ostatnia praca każdego pionka zarządu (id → praca i tick), odświeżana co sekundę gry */
const ostatnie = new Map<number, { praca: string; tick: number }>();

function opisz(sim: Sim, p: Pawn): Opis {
  const st = widok(sim).st;
  const t = st.tick;
  const h = hourOf(t);
  const n = p.needs;
  const o = ostatnie.get(p.id);
  let szw = 0;
  for (const q of st.pawns) if (q.kind === 'zombie' && Math.hypot(q.x - p.x, q.y - p.y) <= 6) szw++;
  return {
    id: p.id,
    imie: (p.person >= 0 ? st.people[p.person]?.name : undefined) ?? p.kind,
    rodzaj: p.kind,
    tick: t,
    dzien: dayOf(t),
    zegar: clockOf(t),
    godzina: h,
    pora: h >= 20 || h < 7 ? 'noc' : 'dzień',
    miejsce: miejsce(sim, p),
    praca: praca(p),
    faza: p.job?.phase ?? -1,
    ostatnia: o && t - o.tick <= 3 * (TICKS_PER_HOUR / 60) ? o.praca : '-',
    sily: Math.round(n?.rest ?? 0),
    zdrowie: Math.round(n?.health ?? 0),
    jedzenie: Math.round(n?.food ?? 0),
    cieplo: Math.round(n?.warm ?? 0),
    bron: p.weapon ?? null,
    niesie: p.carry,
    goraczkaH: p.bite === undefined ? null : Math.round(((t - p.bite) / TICKS_PER_HOUR) * 10) / 10,
    szwendaczy: szw,
  };
}

/** zakażenia już zapisane: „id:tick ugryzienia” → zakażenie (żeby zgon w gorączce znalazł swoje) */
const znane = new Map<string, Zakazenie>();

function nowyBieg(sim: Sim): Bieg {
  const st = widok(sim).st;
  stanBiegu = st;
  ostatnie.clear();
  znane.clear();
  const b: Bieg = {
    ziarno: st.seed,
    polityka: POLITYKI[biegi.length] ?? `bieg-${biegi.length + 1}`,
    hash: '',
    koniec: '',
    zaufanie: null,
    wkurzenie: null,
    noce: [],
    tally: { killed: 0, breaches: 0, bites: 0, deaths: 0 },
    zgony: [],
    zakazenia: [],
    trafienia: 0,
    ekspozycja: {},
    skladNocy: [],
    slad: [],
  };
  biegi.push(b);
  return b;
}

const KROTKO: Record<string, string> = {
  wyprawa: '--',
  środek: 'in',
  sąsiad: 'nb',
  podwórko: 'yd',
  'podwórko przy siatce': 'yf',
  'za siatką': 'ex',
  'za siatką przy siatce': 'ef',
};

function liniaSladu(sim: Sim): string {
  const st = widok(sim).st;
  const ludzie = st.pawns
    .filter((p) => p.kind === 'core')
    .map((p) => {
      const j = p.job ? `${praca(p)}/${p.job.phase}` : '-';
      const gdzie = KROTKO[miejsce(sim, p)] ?? '?';
      return `${p.id}:${j}@${gdzie} s${Math.round(p.needs?.rest ?? 0)} z${Math.round(p.needs?.health ?? 0)}${p.bite === undefined ? '' : 'U'}`;
    });
  const szw = st.pawns.filter((p) => p.kind === 'zombie');
  const naPodworku = szw.filter((p) =>
    siatkaSwiata(widok(sim).w).yard.has(Math.floor(p.y) * widok(sim).w.size + Math.floor(p.x)),
  );
  return `d${dayOf(st.tick)} ${clockOf(st.tick)}  ${ludzie.join('  ')}  [szw ${szw.length}, na podwórku ${naPodworku.length}]`;
}

/** zapis po kroku: ostatnia praca, nowe zakażenia spoza ugryzienia, ekspozycja, skład nocy, ślad */
function probkuj(sim: Sim, b: Bieg): void {
  const st = widok(sim).st;
  const t = st.tick;
  const core = st.pawns.filter((p) => p.kind === 'core');
  if (t % 20 === 0) {
    for (const p of core) {
      if (p.bite !== undefined && !znane.has(`${p.id}:${p.bite}`)) {
        // zakażenie nie z Sim.bite: wyprawa z karty nocy (GovEffects.bitten, w chwili powrotu: pionek był jeszcze
        // `away` w poprzednim zapisie, a polecenie powrotu wykonuje dopiero następny krok) albo inne polecenie zarządu
        const o = ostatnie.get(p.id);
        const wyprawa = p.away || (o?.praca === 'wyprawa' && p.bite - o.tick <= 20);
        const z: Zakazenie = {
          ...opisz(sim, p),
          ...(wyprawa ? { miejsce: 'wyprawa', praca: 'wyprawa' } : {}),
          skad: wyprawa ? 'wyprawa' : 'inne',
          konczyna: !!p.limb,
        };
        znane.set(`${p.id}:${p.bite}`, z);
        b.zakazenia.push(z);
      }
      if (p.away) ostatnie.set(p.id, { praca: 'wyprawa', tick: t });
      else if (p.job) ostatnie.set(p.id, { praca: praca(p), tick: t });
    }
  }
  if (t % 40 === 0) {
    const h = hourOf(t);
    const pora = h >= 20 || h < 7 ? 'noc' : 'dzień';
    for (const p of core) {
      const k = `${pora}|${praca(p)}|${miejsce(sim, p)}`;
      b.ekspozycja[k] = (b.ekspozycja[k] ?? 0) + 40 / TICKS_PER_HOUR;
    }
  }
  if (t % TICKS_PER_HOUR === 0 && (hourOf(t) === 21 || hourOf(t) === 3 || hourOf(t) === 6)) {
    b.skladNocy.push({
      dzien: dayOf(t),
      zegar: clockOf(t),
      ludzie: core.map((p) => ({
        id: p.id,
        imie: (p.person >= 0 ? st.people[p.person]?.name : undefined) ?? '?',
        praca: praca(p),
        miejsce: miejsce(sim, p),
        sily: Math.round(p.needs?.rest ?? 0),
        zdrowie: Math.round(p.needs?.health ?? 0),
        bite: p.bite !== undefined,
      })),
    });
  }
  if (t >= SLAD_OD && t <= SLAD_DO && (t - SLAD_OD) % SLAD_CO === 0) b.slad.push(liniaSladu(sim));
}

const krokPierwotny = proto.step;
proto.step = function (this: Sim): void {
  const st = widok(this).st;
  if (!bieg || stanBiegu !== st) bieg = nowyBieg(this);
  krokPierwotny.call(this);
  probkuj(this, bieg);
};

const bitePierwotne = proto.bite;
proto.bite = function (this: Sim, zombie: Pawn, ofiara: Pawn): void {
  const st = widok(this).st;
  const przed = { bites: st.tally?.bites ?? 0, bite: ofiara.bite };
  const opis = ofiara.needs && !ofiara.away ? opisz(this, ofiara) : null;
  bitePierwotne.call(this, zombie, ofiara);
  if (!bieg || !opis || (st.tally?.bites ?? 0) <= przed.bites) return;
  bieg.trafienia++;
  if (ofiara.bite !== undefined && przed.bite === undefined) {
    const z: Zakazenie = { ...opis, skad: 'siatka', konczyna: !!ofiara.limb };
    znane.set(`${ofiara.id}:${ofiara.bite}`, z);
    bieg.zakazenia.push(z);
  }
};

const diePierwotne = proto.die;
proto.die = function (this: Sim, p: Pawn, cause: Dead['cause'], by: Pawn | null): void {
  const st = widok(this).st;
  const przed = st.dead?.length ?? 0;
  const opis = p.kind === 'zombie' ? null : opisz(this, p);
  const zakazenie = p.bite === undefined ? null : (znane.get(`${p.id}:${p.bite}`) ?? null);
  diePierwotne.call(this, p, cause, by);
  if (bieg && opis && (st.dead?.length ?? 0) > przed)
    bieg.zgony.push({ ...opis, przyczyna: cause, zadal: by?.kind ?? null, zakazenie });
};

// wyjście bota też zbieramy (nagłówki polityk z haszem i końcem gry, tabele nocy), a drukujemy bez zmian
const wypisz = console.log.bind(console);
const wyjscie: string[] = [];
console.log = (...args: unknown[]) => {
  wyjscie.push(args.map(String).join(' '));
  wypisz(...args);
};
await import('./bot-zombie.ts');
console.log = wypisz;

// przypisanie wyjścia bota do biegów: nagłówek polityki, potem wiersze nocy
let numer = -1;
for (const linia of wyjscie.join('\n').split('\n')) {
  const nag = /^\s+(warta-dzidy|bez-warty) \(([\d.]+) s, skrót (\w+); (.*), zaufanie (-?\d+), wkurzenie (-?\d+)\)/.exec(
    linia,
  );
  if (nag) {
    numer = POLITYKI.indexOf(nag[1]);
    const b = biegi[numer];
    if (b) {
      b.hash = nag[3];
      b.koniec = nag[4];
      b.zaufanie = Number(nag[5]);
      b.wkurzenie = Number(nag[6]);
    }
    continue;
  }
  const wiersz =
    /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\/(\d+)\s+(\d+)\s+(\d\.\d\d)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(
      linia,
    );
  if (wiersz && biegi[numer]) biegi[numer].noce.push(wiersz.slice(1).map(Number));
}
for (const b of biegi) b.tally.deaths = b.zgony.length;

// podsumowanie pod tabelami bota
console.log('\nPomiar zgonów');
for (const b of biegi) {
  const wg = (f: (z: Zgon) => string) => {
    const m = new Map<string, number>();
    for (const z of b.zgony) m.set(f(z), (m.get(f(z)) ?? 0) + 1);
    return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || '-';
  };
  console.log(
    `  ${b.polityka}: zgony ${b.zgony.length} (${wg((z) => z.przyczyna)}), zakażenia ${b.zakazenia.length} (siatka ${b.zakazenia.filter((z) => z.skad === 'siatka').length}, wyprawa ${b.zakazenia.filter((z) => z.skad === 'wyprawa').length}, inne ${b.zakazenia.filter((z) => z.skad === 'inne').length}), trafienia ${b.trafienia}`,
  );
  for (const z of b.zgony) {
    const od = z.zakazenie
      ? `, zakażony d${z.zakazenie.dzien} ${z.zakazenie.zegar} (${z.zakazenie.miejsce}, ${z.zakazenie.praca})`
      : '';
    console.log(
      `    d${z.dzien} ${z.zegar} ${z.imie} (${z.rodzaj}): ${z.przyczyna}${z.zadal ? ` od ${z.zadal}` : ''}, ${z.miejsce}, praca ${z.praca}, siły ${z.sily}, zdrowie ${z.zdrowie}${od}`,
    );
  }
  for (const s of b.slad) console.log(`    ${s}`);
}

const out = process.env.POMIAR_OUT;
if (out) fs.writeFileSync(out, JSON.stringify(biegi));
