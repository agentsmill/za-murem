/* Bot ścieżki celów (docs/superpowers/plans/2026-10-19-sciezka-celow.md, zadanie 11; projekt: docs/superpowers/specs/
   2026-10-19-sciezka-celow-design.md, „Jak sprawdzamy budowę”): sześć przebiegów, trzy dema (Przymorze, Lanciego,
   Zielonki) w obu trybach, po 10 dni gry od 15:00 pierwszego dnia. Gracz czyta bieżący cel ścieżki (najpierw okazji, potem
   rozdziału) i robi to, co mówi jego podpowiedź: to samo polecenie z menu (`commandsAt`), ten sam przycisk (broń,
   amputacja, „Do broni!”), to samo zdarzenie interfejsu (lista ludzi, karta mieszkańca, ekran dróg) albo ta sama odpowiedź
   w oknie zarządu (karta nocy z dyżurem przy kozie i dwiema dzidami, uchwała, karta wydarzenia). Poza celami dba o drewno
   (bez niego koza gaśnie) i zbiera materiały, a w trybie zombie drewno bierze tylko z mebli, z drzew w obrębie siatki
   i z wypraw, nie zza siatki.

   Świat i gra jak w przeglądarce (`enter` w src/main.ts): ziarno z adresu dema, świat z mieszkańcami z generatora (tabele
   z public/data/mieszkancy/), obcy (handlarz, wędrowcy, ekipy), lokatorzy sąsiednich budynków z generatora, zarząd z mapą
   miasta (miejsca z okolicy dema) i drogami do zwycięstwa, ludność kwadratu domu z 2021 roku, odczyt ścieżki
   (`krokSciezki`, `widokSciezki`) co 200 ms gry, jak okienko celów przy tempie 1×. Wszystko deterministyczne: bez losowania
   poza ziarnem gry, więc dwa uruchomienia dają to samo wyjście.

   Wyjście: dla każdego przebiegu dzień i godzina otwarcia i końca każdego rozdziału, cele, które przepadły, okazje
   z godziną każdego zaliczonego celu i (od R8) kamienie drogi ludnościowej; na końcu tabela rozdziałów dla wszystkich
   przebiegów. Kod wyjścia 1, gdy w którymś przebiegu rozdział nie skończył się w limicie dni (gra przegrana też jest
   niepowodzeniem), w zwykłym trybie przepadł jakiś cel (gracz z podpowiedziami zdąży ze wszystkimi nocnymi celami) albo
   napis z menu nie zgadzał się z podpowiedzią (gracz szuka w menu napisu z cudzysłowu; liczone w każdym przebiegu, nie
   tylko z `gadaj`); przyczyny stoją w wyjściu. Przepadłe cele w zombie tylko się wypisuje, nie zmieniają kodu wyjścia:
   rozdział na przepadły cel nie czeka, a tam przepadają wtedy, gdy drewna na wieczór nie ma skąd wziąć, czyli z tej samej
   przyczyny co przegrana gra (zob. `powody`). Rozdział, którego nie da się skończyć na jakiejś mapie, poprawia się w celu
   albo w jego zapasowym warunku (projekt i kod ścieżki), nie w bocie.

   Uruchomienie: npm run bot:cele [-- dni] [zwykly|zombie] [--demo=NAZWA] [ziarno:N] [cele] [gadaj] [rownolegle]
   - dni (domyślnie 10), `zwykly` albo `zombie` i `--demo=NAZWA` (przymorze, lanciego, zielonki) zawężają przebiegi;
   - `ziarno:N` przesuwa ziarno gry względem adresu dema: inna gra na tym samym osiedlu, do sprawdzenia, czy wynik nie
     jest przypadkiem;
   - `cele` dopisuje pod każdym rozdziałem godzinę każdego zaliczonego celu, `gadaj` drukuje grę sekunda po sekundzie
     (polecenia gracza, wybory w oknach zarządu, co godzinę stan zarządu);
   - `rownolegle`: gracz robi od razu wszystkie niezrobione cele rozdziału, a nie tylko bieżący (domyślnie bieżący, bo
     tylko jego podpowiedź jest na ekranie);
   - `bezsmierci` i `przybysz` są wyłącznie do analizy, nie do tabeli: pierwszy nie pozwala zarządowi marnieć (zdrowie,
     jedzenie, siły i ciepło nie spadają poniżej połowy, ugryzienie znika), żeby było widać, jak daleko szłaby ścieżka w
     trybie zombie, gdyby kolonia przetrwała; drugi przyjmuje do zarządu jedną osobę w dobę po otwarciu R4, jakby ją
     przyprowadziła karta („Wciągnąć do roboty”), żeby cel „Przyjmijcie kogoś nowego” nie wstrzymywał reszty. */

import fs from 'node:fs';
import path from 'node:path';
import { makePerson } from '../src/content/people.ts';
import { hashString, mulberry } from '../src/core/rng.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../src/gov/miejsce.ts';
import type { Prompt } from '../src/gov/typy.ts';
import { emptyEffects } from '../src/gov/wspolne.ts';
import { wlaczMiasto } from '../src/gov/wyprawy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  signLaw,
} from '../src/gov/zarzad.ts';
import { grajDalej, wlaczZwyciestwo } from '../src/gov/zwyciestwo.ts';
import { clockOf, dayOf, TICKS_PER_DAY, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { applyGov, lawsFrom } from '../src/sim/gov.ts';
import { zrodloLokatorow } from '../src/sim/lokatorzy.ts';
import { createSim, Sim, type SimState } from '../src/sim/sim.ts';
import { populacja, snapshot } from '../src/sim/snapshot.ts';
import type { GameMode } from '../src/sim/tryb.ts';
import { krokSciezki, nowyStanSciezki, type StanSciezki, type WidokSciezki, widokSciezki } from '../src/ui/sciezka.ts';
import { ROZDZIALY } from '../src/ui/sciezka-rozdzialy.ts';
import { okolicaZGeo } from '../tests/unit/miasto-play.ts';
import { type Gra, type Gracz, nowyGracz, odczyt, wejscie } from './bot-cele-gracz.ts';
import {
  ARGUMENTY,
  BADANIA,
  DEMO,
  JEDZENIE,
  ludnoscDema,
  MIASTO,
  MIESZKANCY,
  OPAL,
  SASIEDZI,
  swiatMieszkancow,
  ZWYCIESTWO,
} from './bot-mieszkancy.ts';

/* ---------------------------------------------------------------- argumenty */

const FLAGI_OBCE = { MIESZKANCY, SASIEDZI, MIASTO, ZWYCIESTWO, OPAL, BADANIA, JEDZENIE };
const obce = Object.entries(FLAGI_OBCE)
  .filter(([, v]) => v)
  .map(([k]) => k);
if (obce.length) {
  console.error(
    `bot:cele zawsze gra z mieszkańcami z adresu, sąsiadami, mapą miasta i drogami, więc nie zna flag: ${obce.join(', ')}. Zna tylko --demo=NAZWA, dni, zwykly|zombie, gadaj, cele, rownolegle, bezsmierci, przybysz i ziarno:N.`,
  );
  process.exit(2);
}

/** dema, na których gra bot (pliki public/demo/*.json) */
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
const TRYBY: readonly GameMode[] = ['zwykly', 'zombie'];

const DNI = Number(ARGUMENTY.find((a) => /^\d+$/.test(a))) || 10;
const TRYB = ARGUMENTY.find((a) => a === 'zwykly' || a === 'zombie') as GameMode | undefined;
const GADAJ = ARGUMENTY.includes('gadaj');
const CELE = ARGUMENTY.includes('cele');
const ROWNOLEGLE = ARGUMENTY.includes('rownolegle');
const BEZ_SMIERCI = ARGUMENTY.includes('bezsmierci');
const PRZYBYSZ = ARGUMENTY.includes('przybysz');
/** przesunięcie ziarna względem adresu dema (`ziarno:N`): inna gra na tym samym osiedlu, do sprawdzenia, czy wynik nie jest przypadkiem */
const PRZESUNIECIE = Number(ARGUMENTY.find((a) => /^ziarno:\d+$/.test(a))?.slice(7)) || 0;
const nieznaneArgumenty = ARGUMENTY.filter(
  (a) =>
    !/^\d+$/.test(a) &&
    !['zwykly', 'zombie', 'gadaj', 'cele', 'rownolegle', 'bezsmierci', 'przybysz'].includes(a) &&
    !/^ziarno:\d+$/.test(a),
);
if (nieznaneArgumenty.length || (DEMO !== null && !(DEMA as readonly string[]).includes(DEMO))) {
  console.error(
    `Nieznany argument: ${[...nieznaneArgumenty, ...(DEMO !== null && !(DEMA as readonly string[]).includes(DEMO) ? [`--demo=${DEMO}`] : [])].join(', ')}. Dema: ${DEMA.join(', ')}; tryby: zwykly, zombie.`,
  );
  process.exit(2);
}

/* ---------------------------------------------------------------- gra */

/** Nowa gra na demie w danym trybie, tą drogą co `enter` w src/main.ts. */
async function nowaGra(demo: string, tryb: GameMode): Promise<Gra> {
  const plik = path.resolve(import.meta.dirname, `../public/demo/${demo}.json`);
  const d = JSON.parse(fs.readFileSync(plik, 'utf8'));
  const seed = ((Number.parseInt(hashString(d.addr), 16) || 2051) + PRZESUNIECIE) >>> 0;
  const osiedle = await swiatMieszkancow(d, seed, 4);
  const w = osiedle.world;
  const st = createSim(w, seed, { core: 4, mode: tryb, obcy: true, mieszkancy: osiedle.mieszkancy });
  const sim = new Sim(w, st);
  sim.lokatorzy = zrodloLokatorow(w, osiedle.geo, osiedle.dane);
  const gov = newGov(seed, tryb);
  wlaczMiasto(gov);
  wlaczZwyciestwo(gov);
  return {
    demo,
    nazwa: d.name,
    tryb,
    seed,
    w,
    sim,
    gov,
    sciezka: nowyStanSciezki(),
    okolica: okolicaZGeo(d.geo),
    ludnosc2021: (await ludnoscDema(d)).ludnosc2021,
    hqName: w.buildings[w.hq]?.name ?? '',
    words: wordsOfWorld(w),
    wordsEn: wordsEnOfWorld(w),
    zaznaczony: false,
  };
}

/* ---------------------------------------------------------------- przebieg */

/** zdarzenie z przebiegu: tick, rodzaj i klucz (rozdział, cel albo okazja) */
interface Zdarzenie {
  tick: number;
  co: 'otwarcie' | 'koniec' | 'cel' | 'przepadl' | 'okazja' | 'okazja-koniec';
  klucz: string;
}

interface Wynik {
  demo: string;
  nazwa: string;
  tryb: GameMode;
  seed: number;
  zdarzenia: Zdarzenie[];
  /** jak się skończył przebieg: koniec limitu dni albo przegrana gra (z przyczyną) */
  koniec: { tick: number; przegrana: string | null };
  ms: number;
  /** rozdziały, które istnieją w tej grze, po kolei, z tytułem */
  rozdzialy: { k: string; tytul: string }[];
  /** droga ludnościowa w R8: kamienie, liczba osób i miejsca w siedzibie przy otwarciu rozdziału oraz przy zaliczeniu celu `ludnosc` */
  r8?: { kamien0: number; ludnosc0: number; miejsc: number; kamien1?: number; ludnosc1?: number };
  /** napisy menu, które nie zgadzały się z podpowiedzią (gracz szuka w menu napisu z cudzysłowu): każda niezgodność raz */
  uwagi: string[];
  /** okienko celów na koniec przebiegu: rozdział i jego cele (przy rozdziale niedokończonym widać, co go trzyma) */
  stan: {
    rozdzial: string | null;
    cele: { key: string; tekst: string; jak: string; done: boolean; missed: boolean; czeka?: string }[];
  };
}

/** różnica dwóch kolejnych stanów ścieżki jako zdarzenia (otwarcia i końce rozdziałów, zaliczone i przepadłe cele, okazje) */
function roznica(przed: StanSciezki, po: StanSciezki, tick: number): Zdarzenie[] {
  const z: Zdarzenie[] = [];
  if (przed.rozdzial !== po.rozdzial) {
    z.push({ tick, co: 'koniec', klucz: przed.rozdzial });
    if (po.rozdzial !== 'koniec') z.push({ tick: po.od, co: 'otwarcie', klucz: po.rozdzial });
  }
  for (const k of Object.keys(po.zrobione))
    if (!Object.hasOwn(przed.zrobione, k)) z.push({ tick: po.zrobione[k], co: 'cel', klucz: k });
  for (const k of po.przepadle) if (!przed.przepadle.includes(k)) z.push({ tick, co: 'przepadl', klucz: k });
  if (przed.okazja?.k !== po.okazja?.k || przed.okazja?.od !== po.okazja?.od) {
    if (przed.okazja) z.push({ tick, co: 'okazja-koniec', klucz: przed.okazja.k });
    if (po.okazja) z.push({ tick: po.okazja.od, co: 'okazja', klucz: po.okazja.k });
  }
  return z;
}

/** Jedna gra przez `dni` dni: sekunda po sekundzie jak w grze przy tempie 1× (20 kroków symulacji, krok zarządu z oknami),
    krok ścieżki co 200 ms i po każdym oknie, a gracz decyduje raz na sekundę. */
async function przebieg(demo: string, tryb: GameMode, dni: number): Promise<Wynik> {
  const t0 = performance.now();
  const g = await nowaGra(demo, tryb);
  const { sim } = g;
  const { st } = sim;
  const zdarzenia: Zdarzenie[] = [];
  let r8: Wynik['r8'];
  const odczytStart = odczyt(g);
  const rozdzialy = ROZDZIALY.filter((r) => r.jest?.(odczytStart) !== false).map((r) => ({
    k: r.k as string,
    tytul: r.tytul(odczytStart),
  }));
  zdarzenia.push({ tick: 0, co: 'otwarcie', klucz: 'r0' });
  let widok: WidokSciezki = widokSciezki(g.sciezka, odczytStart);

  /** krok ścieżki na odczycie z tej chwili: zapisuje różnicę stanu jako zdarzenia */
  const krokS = (): WidokSciezki => {
    const o = odczyt(g);
    const przed = g.sciezka;
    g.sciezka = krokSciezki(przed, o);
    const nowe = roznica(przed, g.sciezka, st.tick);
    zdarzenia.push(...nowe);
    for (const z of nowe) {
      if (z.co === 'otwarcie' && z.klucz === 'r8')
        r8 = {
          kamien0: g.sciezka.start.kamienLudnosci,
          ludnosc0: g.sciezka.start.ludnosc,
          miejsc: wejscie(g).cap ?? 0,
        };
      if (z.co === 'cel' && z.klucz === 'r8.ludnosc' && r8) {
        r8.kamien1 = g.gov.zwyciestwo?.kamienie.ludnosc ?? 0;
        r8.ludnosc1 = populacja(st).razem;
      }
    }
    widok = widokSciezki(g.sciezka, o);
    return widok;
  };

  const gracz = nowyGracz(
    g,
    (tekst) => {
      if (GADAJ) console.log(`  ${hhmm(st.tick)} ${tekst}`);
    },
    ROWNOLEGLE,
  );
  gracz.start();
  const koniecTick = dni * TICKS_PER_DAY;
  let przegrana: string | null = null;
  let przybyl = false;
  while (st.tick < koniecTick) {
    for (let t = 0; t < TICKS_PER_SECOND; t++) {
      sim.step();
      if (t % 4 === 3) krokS();
    }
    if (BEZ_SMIERCI) podtrzymaj(g);
    if (PRZYBYSZ && !przybyl && g.sciezka.rozdzial === 'r4' && st.tick - g.sciezka.od >= TICKS_PER_DAY) {
      przybyl = true;
      dajPrzybysza(g);
    }
    applyGov(st, g.w, govUpdate(g.gov, wejscie(g)));
    for (let k = 0; k < 6; k++) {
      const p = pending(g.gov, wejscie(g));
      if (!p) break;
      odpowiedz(g, gracz, p, krokS());
    }
    gracz.krok(krokS());
    if (GADAJ && st.tick % 800 === 0 && st.tick % TICKS_PER_DAY < 800 * 6) diagnoza(g);
    if (g.gov.over) {
      przegrana = `${g.gov.over}, zaufanie ${Math.round(g.gov.trust)}, wkurzenie ${Math.round(g.gov.anger)}`;
      break;
    }
  }
  return {
    demo,
    nazwa: g.nazwa,
    tryb,
    seed: g.seed,
    zdarzenia,
    koniec: { tick: st.tick, przegrana },
    ms: performance.now() - t0,
    r8,
    rozdzialy,
    uwagi: gracz.niezgodnosci(),
    stan: {
      rozdzial: widok.rozdzial?.k ?? null,
      cele: (widok.rozdzial?.cele ?? []).map((c) => ({
        key: c.key,
        tekst: c.text,
        jak: c.how,
        done: c.done && !c.missed,
        missed: !!c.missed,
        ...(c.czeka ? { czeka: c.czeka } : {}),
      })),
    },
  };
}

/** Tylko do analizy ścieżki (argument `bezsmierci`): zarząd nie marnieje. Zdrowie, jedzenie, siły i ciepło nie spadają poniżej
    połowy, a ugryzienie znika, więc nikt nie umiera z gorączki ani z ran. Pokazuje, jak daleko szłaby ścieżka w trybie
    zombie, gdyby kolonia przetrwała (w zwykłej tabeli kolonia ginie przed końcem ścieżki). Nie jest grą, którą ktoś gra. */
function podtrzymaj(g: Gra): void {
  for (const p of g.sim.st.pawns) {
    if (p.kind !== 'core' || !p.needs) continue;
    for (const k of ['health', 'food', 'rest', 'warm'] as const) p.needs[k] = Math.max(p.needs[k], 50);
    delete p.bite;
    delete p.limb;
  }
}

/** Tylko do analizy ścieżki (argument `przybysz`): doba po otwarciu R4 zarząd przyjmuje jedną osobę, jakby karta wydarzenia
    przyprowadziła kogoś („Wciągnąć do roboty”, `fx.join`). Pokazuje, jak daleko szłaby ścieżka w trybie zombie, gdyby cel
    „Przyjmijcie kogoś nowego” nie czekał na los (na blokach w zombie przychodzi tylko gość, który prosi o dołączenie). */
function dajPrzybysza(g: Gra): void {
  const { st } = g.sim;
  const fx = emptyEffects();
  fx.join.push(makePerson(mulberry(g.seed ^ 0x5eed), new Set(st.people.map((p) => p.first)), () => g.gov.nextId++));
  applyGov(st, g.w, fx);
}

/** Co godzinę sześciu pierwszych godzin doby (tylko `gadaj`): kto żyje, zdrowie i najedzenie, drewno, jedzenie, siatka, stado. */
function diagnoza(g: Gra): void {
  const { st } = g.sim;
  const sn = snapshot(st, g.w);
  const ludzie = sn.people.filter((p) => !p.away);
  const sr = (k: 'health' | 'food' | 'rest' | 'warm') =>
    ludzie.length ? Math.round(ludzie.reduce((a, p) => a + p.needs[k], 0) / ludzie.length) : 0;
  console.log(
    `  ${hhmm(st.tick)} DZIEŃ: ludność ${populacja(st).razem} (start ${g.sciezka.start?.ludnosc ?? '?'}), zarząd ${sn.people.length} (na miejscu ${ludzie.length}), mieszkańcy ${sn.residents}, zdrowie ${sr('health')}, jedzenie ${sr('food')}, siły ${sr('rest')}, ciepło ${sr('warm')}; drewno ${sn.stock.wood}, porcje ${sn.stock.supplies + sn.stock.meals}, deski ${sn.stock.boards}, złom ${sn.stock.scrap}, części ${sn.stock.parts}; siatka ${sn.fence.durability.toFixed(2)}, dziury ${sn.fence.holes.length}; szwendacze ${sn.zombies.all}, zabici ${st.tally?.killed ?? 0}, ugryzienia ${st.tally?.bites ?? 0}, zgony ${(st.dead ?? []).length}${plotTekst(st)}${planyTekst(st)}`,
  );
}

/** plany budowli w toku: materiał doniesiony z potrzebnego, praca w minutach gry i wykonawca (do diagnozy) */
function planyTekst(st: SimState): string {
  if (!st.builds.length) return '';
  const suma = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
  return `; plany ${st.builds
    .map(
      (b) =>
        `${b.kind} ${suma(b.have)}/${suma(b.need)}, praca ${Math.round(b.work / (TICKS_PER_SECOND * 0.667))}, wykonawca ${b.by}`,
    )
    .join('; ')}`;
}

/** wspólny płot w budowie: ile materiału już dowieziono z ilu potrzeba (do diagnozy) */
function plotTekst(st: SimState): string {
  const plan = st.plot?.plan;
  if (!plan) return '';
  const suma = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
  return `; płot ${suma(plan.have)} z ${suma(plan.need)} sztuk materiału`;
}

/* ---------------------------------------------------------------- okna zarządu */

/** Odpowiedź gracza na okno zarządu (skutki idą do symulacji jak w main.ts). Widok ścieżki jest ten sam, który widzi
    gracz nad oknem: linia „Cel: …” karty nocy, uchwały i spotkania mówi, o co w oknie chodzi. */
function odpowiedz(g: Gra, gracz: Gracz, p: Prompt, v: WidokSciezki): void {
  const { st } = g.sim;
  const i = wejscie(g);
  if (p.k === 'raport') ackReport(g.gov, i);
  else if (p.k === 'uchwala') {
    applyGov(st, g.w, signLaw(g.gov, i, gracz.uchwala(p)));
    g.sim.setLaws(lawsFrom(lawEffects(g.gov)));
  } else if (p.k === 'karta') {
    gracz.karta(p.card, v);
    applyGov(st, g.w, confirmNight(g.gov, i));
  } else if (p.k === 'zwyciestwo') grajDalej(g.gov);
  else {
    const k = gracz.wydarzenie(p, v);
    if (GADAJ)
      console.log(
        `  ${hhmm(st.tick)} wydarzenie ${p.id} „${p.title.pl}”: ${p.choices
          .map((c, j) => `${j === k ? '[' : ''}${c.label.pl}${c.ok ? '' : ' (nie można)'}${j === k ? ']' : ''}`)
          .join(' / ')}`,
      );
    applyGov(st, g.w, chooseEvent(g.gov, i, k));
  }
}

/* ---------------------------------------------------------------- raport */

const hhmm = (tick: number): string => `d${dayOf(tick)} ${clockOf(tick)}`;
const tryb = (t: GameMode): string => (t === 'zombie' ? 'zombie' : 'zwykły');

/** otwarcia i końce rozdziałów z zapisanych zdarzeń: klucz rozdziału → tick */
function terminy(r: Wynik): { otwarcia: Map<string, number>; konce: Map<string, number> } {
  const otwarcia = new Map<string, number>();
  const konce = new Map<string, number>();
  for (const z of r.zdarzenia) {
    if (z.co === 'otwarcie' && !otwarcia.has(z.klucz)) otwarcia.set(z.klucz, z.tick);
    if (z.co === 'koniec' && !konce.has(z.klucz)) konce.set(z.klucz, z.tick);
  }
  return { otwarcia, konce };
}

/** rozdziały tej gry, które nie skończyły się w limicie dni (w tym te, które się nie otworzyły) */
const nieskonczone = (r: Wynik): string[] => {
  const { konce } = terminy(r);
  return r.rozdzialy.filter((x) => !konce.has(x.k)).map((x) => x.k);
};

/** okazje z oknem od otwarcia do zamknięcia i godzinami zaliczonych celów */
function okazje(r: Wynik): string[] {
  const okna: { k: string; od: number; do: number | null; cele: { key: string; tick: number }[] }[] = [];
  for (const z of r.zdarzenia) {
    if (z.co === 'okazja') okna.push({ k: z.klucz, od: z.tick, do: null, cele: [] });
    if (z.co === 'okazja-koniec') {
      const o = okna.findLast((x) => x.k === z.klucz && x.do === null);
      if (o) o.do = z.tick;
    }
  }
  for (const z of r.zdarzenia)
    if (z.co === 'cel' && /^o\d\./.test(z.klucz)) {
      const k = z.klucz.split('.')[0];
      const o = okna.findLast((x) => x.k === k && x.od <= z.tick);
      if (o) o.cele.push({ key: z.klucz.split('.')[1], tick: z.tick });
    }
  return okna.map(
    (o) =>
      `${o.k.toUpperCase()} ${hhmm(o.od)}–${o.do === null ? 'trwa' : clockOf(o.do)}${
        o.cele.length ? `: ${o.cele.map((c) => `${c.key} ${clockOf(c.tick)}`).join(', ')}` : ''
      }`,
  );
}

/** cele przepadłe (termin minął) z godziną; to zwykle cele jednej nocy (drewno na pierwszy wieczór i na noc) */
const przepadle = (r: Wynik): string[] =>
  r.zdarzenia.filter((z) => z.co === 'przepadl').map((z) => `${z.klucz} (${hhmm(z.tick)})`);

/** Powody niepowodzenia przebiegu (kod wyjścia 1): przegrana gra, rozdział nieskończony w limicie, w zwykłym trybie cel,
    który przepadł, i napis menu niezgodny z podpowiedzią. Przepadłe cele w zombie tylko się wypisuje: rozdział na nie nie
    czeka (przepadły cel jest rozstrzygnięty), a tam przepadają wtedy, gdy drewna na wieczór nie ma skąd wziąć (brak drzew
    w obrębie siatki, meble w klatce, do której droga idzie ulicą), co jest tą samą przyczyną co przegrana gra. */
function powody(r: Wynik): string[] {
  const p: string[] = [];
  if (r.koniec.przegrana) p.push(`przegrana (${r.koniec.przegrana})`);
  const brak = nieskonczone(r);
  if (brak.length) p.push(`nieskończone ${brak.join(', ')}`);
  if (r.tryb === 'zwykly' && przepadle(r).length) p.push(`przepadłe cele ${przepadle(r).join(', ')}`);
  if (r.uwagi.length) p.push(`menu niezgodne z podpowiedzią: ${r.uwagi.join('; ')}`);
  return p;
}

function wypisz(r: Wynik): void {
  console.log(
    `\n${r.nazwa}, ${tryb(r.tryb)}${BEZ_SMIERCI ? ' (BEZ ŚMIERCI, tylko do analizy)' : ''}, ziarno ${r.seed.toString(16)} (${(r.ms / 1000).toFixed(1)} s)`,
  );
  const { otwarcia, konce } = terminy(r);
  for (const x of r.rozdzialy) {
    const o = otwarcia.get(x.k);
    const e = konce.get(x.k);
    console.log(
      `  ${x.k.toUpperCase()} ${x.tytul.padEnd(22)} otwarty ${o === undefined ? '—' : hhmm(o)}   koniec ${e === undefined ? 'NIE' : hhmm(e)}`,
    );
    if (GADAJ || CELE)
      for (const z of r.zdarzenia.filter((q) => q.co === 'cel' && q.klucz.startsWith(`${x.k}.`)))
        console.log(`      ${z.klucz.slice(x.k.length + 1)} ${hhmm(z.tick)}`);
  }
  if (r.r8)
    console.log(
      `  R8 droga ludnościowa: kamienie ${r.r8.kamien0} → ${r.r8.kamien1 ?? 'bez zmiany'}, osób ${r.r8.ludnosc0} → ${r.r8.ludnosc1 ?? 'bez zmiany'} (miejsc w siedzibie ${r.r8.miejsc})`,
    );
  console.log(`  cele przepadłe: ${przepadle(r).join(', ') || 'żadne'}`);
  for (const u of r.uwagi) console.log(`  UWAGA menu: ${u}`);
  const ok = okazje(r);
  console.log(`  okazje: ${ok.length ? '' : 'żadnej'}`);
  for (const o of ok) console.log(`    ${o}`);
  const brak = nieskonczone(r);
  if (r.koniec.przegrana) console.log(`  PRZEGRANA ${hhmm(r.koniec.tick)}: ${r.koniec.przegrana}`);
  else console.log(`  koniec limitu: ${hhmm(r.koniec.tick)}`);
  if (brak.length) {
    console.log(`  NIESKOŃCZONE: ${brak.map((k) => k.toUpperCase()).join(', ')}`);
    if (r.stan.rozdzial)
      console.log(
        `    ${r.stan.rozdzial.toUpperCase()} trzymają: ${
          r.stan.cele
            .filter((c) => !c.done && !c.missed)
            .map((c) => (c.czeka ? `${c.key} (${c.czeka})` : c.key))
            .join(', ') || 'nic (rozdział czeka na krok)'
        }`,
      );
    for (const c of r.stan.cele.filter((q) => !q.done && !q.missed))
      console.log(`      ${c.key}: ${c.tekst} | ${c.jak}`);
  }
}

/** tabela rozdziałów dla wszystkich przebiegów: otwarcie → koniec */
function tabela(lista: Wynik[]): void {
  const kolumny = lista.map((r) => `${r.nazwa.split(' ')[0]} ${tryb(r.tryb)}`);
  const szer = 21;
  const klucze = [...new Set(lista.flatMap((r) => r.rozdzialy.map((x) => x.k)))];
  console.log(`\nTabela rozdziałów (otwarcie → koniec), ${DNI} dni od 15:00 pierwszego dnia`);
  console.log(`  ${''.padEnd(4)}${kolumny.map((k) => k.padEnd(szer)).join('')}`);
  for (const k of klucze) {
    const komorki = lista.map((r) => {
      if (!r.rozdzialy.some((x) => x.k === k)) return 'brak rozdziału';
      const { otwarcia, konce } = terminy(r);
      const o = otwarcia.get(k);
      const e = konce.get(k);
      if (o === undefined) return '— (nie otwarty)';
      return `${hhmm(o).replace(' ', '·')} → ${e === undefined ? 'NIE' : hhmm(e).replace(' ', '·')}`;
    });
    console.log(`  ${k.toUpperCase().padEnd(4)}${komorki.map((c) => c.padEnd(szer)).join('')}`);
  }
}

const wyniki: Wynik[] = [];
for (const demo of DEMO ? [DEMO] : DEMA)
  for (const t of TRYB ? [TRYB] : TRYBY) {
    const r = await przebieg(demo, t, DNI);
    wyniki.push(r);
    wypisz(r);
  }
tabela(wyniki);
const nazwaPrzebiegu = (r: Wynik): string => `${r.nazwa.split(' ')[0]} ${tryb(r.tryb)}`;
const nieudane = wyniki.filter((r) => powody(r).length);
const przepadleZombie = wyniki.filter((r) => r.tryb === 'zombie' && przepadle(r).length);
if (przepadleZombie.length)
  console.log(
    `\nCele przepadłe w zombie (nie zmieniają kodu wyjścia, rozdział na nie nie czeka): ${przepadleZombie
      .map((r) => `${nazwaPrzebiegu(r)}: ${przepadle(r).join(', ')}`)
      .join('; ')}`,
  );
console.log(
  nieudane.length
    ? `\nNIEUDANE przebiegi: ${nieudane.length} z ${wyniki.length} (${nieudane
        .map((r) => `${nazwaPrzebiegu(r)}: ${powody(r).join(' i ')}`)
        .join('; ')})`
    : `\nWszystkie rozdziały skończone w ${DNI} dniach we wszystkich ${wyniki.length} przebiegach`,
);
process.exit(nieudane.length ? 1 : 0);
