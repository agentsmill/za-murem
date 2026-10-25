/* Pomocnik testów ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): gra na demie z zarządem,
   czyli symulacja i zarząd (src/gov) razem, z krokiem zarządu co sekundę przy ekranie jak w src/main.ts (przy tempie 1×
   to tick / 20). Do tego odczyt gry w kształcie `OdczytCelow` (migawka, wejście zarządu, słowa miejsca), krok ścieżki
   po każdej sekundzie i po każdym oknie zarządu (tak jak okienko celów, które liczy się co 200 ms także przy otwartym
   oknie), odpowiedzi na okna zarządu jak `answer` w tests/unit/gov-play.ts (zebranie bez uchwały, karta nocy z propozycją
   zarządu albo ze zmianą gracza, raport, pierwszy dopuszczalny wybór w wydarzeniu), zatrzymanie na wybranym oknie, drewno
   w składzie ustawione co do sztuki i klonowanie gry: stan to zwykły JSON, więc gałąź testu startuje z tej samej chwili
   bez ponownego grania dwóch dób. Żadnego losowania poza ziarnem gry; wszystko w Node, bez przeglądarki. */

import { type Words, type WordsEn, wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import type { GovInput, GovState, NightCard, Prompt } from '../../src/gov/typy.ts';
import { ackReport, chooseEvent, confirmNight, govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { grajDalej } from '../../src/gov/zwyciestwo.ts';
import { dayOf, hourOf, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { commandFor } from '../../src/sim/orders.ts';
import { NOWE } from '../../src/sim/praca.ts';
import { createSim, Sim, type SimState, trunkOf } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import {
  type Cel,
  type KluczRozdzialu,
  krokSciezki,
  licznikiStartu,
  nowyStanSciezki,
  type OdczytCelow,
  type StanSciezki,
  stanZZapisu,
  type WidokSciezki,
  widokSciezki,
} from '../../src/ui/sciezka.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import type { World } from '../../src/world/world.ts';
import { demoWorld, newGame, core as rdzen } from './sasiedzi-pomoc.ts';

export const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
export type Demo = (typeof DEMA)[number];
export const TRYBY: readonly GameMode[] = ['zwykly', 'zombie'];
/** Zielonki to dom jednorodzinny, Przymorze i Lanciego to bloki */
export const wDomu = (key: Demo): boolean => key === 'zielonki';

/** gra na demie: symulacja, zarząd w tym samym trybie i stan ścieżki (jak w main.ts, obok siebie) */
export interface Gra {
  key: Demo;
  mode: GameMode;
  seed: number;
  sim: Sim;
  gov: GovState;
  sciezka: StanSciezki;
  /** gra bez automatu pracy ludzi (`bezAutomatu`): osoby zarządu, którym nowe rodzaje pracy już wyłączono */
  wylaczeni?: number[];
  /** miejsca z okolicy w wejściu zarządu (`GovInput.okolica`, jak w grze z mapą miasta): z nimi karta nocy proponuje
      wyprawy do miejsc z mapy, bez nich do celów z TARGETS */
  okolica?: Miejsce[];
}

/** nowa gra: 4 osoby zarządu, godzina 15:00 pierwszego dnia, ścieżka na starcie (pierwszy dzień) */
export function nowaGra(key: Demo, mode: GameMode = 'zwykly', seed = 5): Gra {
  return { key, mode, seed, sim: newGame(key, mode, seed), gov: newGov(seed, mode, true), sciezka: nowyStanSciezki() };
}

/** gra z gotową symulacją (mieszkańcy z generatora, jednoosobowy zarząd, spotkanie w drzwiach) i zarządem na starcie */
export function graZSymulacji(key: Demo, mode: GameMode, seed: number, sim: Sim): Gra {
  return { key, mode, seed, sim, gov: newGov(seed, mode), sciezka: nowyStanSciezki() };
}

/** niezależna kopia gry z tej samej chwili: stan symulacji, zarządu i ścieżki to zwykły JSON, a `Sim` odbudowuje resztę
    z samego stanu (jak przy wczytaniu zapisu) */
export function klon(g: Gra): Gra {
  return {
    ...g,
    sim: new Sim(g.sim.w, structuredClone(g.sim.st)),
    gov: structuredClone(g.gov),
    sciezka: structuredClone(g.sciezka),
    ...(g.wylaczeni ? { wylaczeni: [...g.wylaczeni] } : {}),
  };
}

/** Wyłącza automat pracy ludzi każdemu z zarządu, kto jeszcze go nie ma wyłączonego (nowe rodzaje pracy na 0 jak
    `wylaczAutomat` w tests/unit/praca-pomoc.ts, ale także dla osób, które dopiero co dołączyły w wydarzeniu). Bez
    automatu nikt sam nie przeszukuje, nie łata i nie zbiera drewna, więc to, co zrobione, i zapas drewna zależą tylko
    od testu; z automatem zarząd do wieczora ma 30–50 sztuk drewna i przeszukuje dom sam. */
function pilnujAutomatu(g: Gra): void {
  if (!g.wylaczeni) return;
  for (const p of g.sim.st.pawns) {
    if (p.kind !== 'core' || g.wylaczeni.includes(p.person)) continue;
    for (const r of NOWE) g.sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: r, prio: 0 });
    g.wylaczeni.push(p.person);
  }
}

/** ta sama gra bez automatu pracy ludzi, także dla tych, którzy dołączą później (zmiana działa od następnego kroku) */
export function bezAutomatu(g: Gra): Gra {
  g.wylaczeni = [];
  pilnujAutomatu(g);
  g.sim.step();
  return g;
}

/** Ta sama gra po zapisie i wczytaniu: stan symulacji, zarządu i ścieżki przechodzi przez JSON jak w przeglądarce
    (`stanZZapisu` czyta stan ścieżki tak jak `enter` w src/main.ts). */
export function przezZapis(g: Gra): Gra {
  const st: SimState = JSON.parse(JSON.stringify(g.sim.st));
  const gov: GovState = JSON.parse(JSON.stringify(g.gov));
  return {
    ...g,
    sim: new Sim(g.sim.w, st),
    gov,
    sciezka: stanZZapisu(JSON.parse(JSON.stringify(g.sciezka)), st, gov),
  };
}

/** sekundy przy ekranie w tej chwili (przy tempie 1×) */
export const ekran = (st: SimState): number => Math.floor(st.tick / TICKS_PER_SECOND);

/** czas przy ekranie z ułamkiem (`OdczytCelow.ekran`), jak go liczy gra w tempie 1×: tick / 20 */
export const czasPrzyEkranie = (st: SimState): number => st.tick / TICKS_PER_SECOND;

/** wejście zarządu z tej chwili, tak jak buduje je gra (z okolicą, jeśli gra ją ma) */
export const wejscie = (g: Gra): GovInput => ({
  ...govInput(g.sim.st, g.sim.w, ekran(g.sim.st)),
  ...(g.okolica ? { okolica: g.okolica } : {}),
});

/** opcje odczytu: dotyk zamiast myszy, zaznaczenie w interfejsie i słowa miejsca (domyślnie z świata gry) */
export interface OpcjeOdczytu {
  touch?: boolean;
  zaznaczony?: boolean;
  words?: Words;
  wordsEn?: WordsEn;
  /** gra ma okno mapy miasta (`OdczytCelow.mapaMiasta`); bez pola, jak w większości testów, decyduje `gov.miasto` */
  mapaMiasta?: boolean;
}

/** Odczyt gry dla ścieżki ze stanu symulacji, świata i zarządu (albo jego braku): nowa migawka za każdym razem (odczyt nie
    pamięta stanu, który test zmienił). Dla testów, które nie grają z zarządem w pętli: stan z `createSim`, atrapa zarządu. */
export function odczytZ(st: SimState, w: World, gov: GovState | null, o: OpcjeOdczytu = {}): OdczytCelow {
  return {
    st,
    w,
    snap: snapshot(st, w),
    gov,
    input: gov ? govInput(st, w, ekran(st)) : null,
    ekran: czasPrzyEkranie(st),
    touch: o.touch ?? false,
    words: o.words ?? wordsOfWorld(w),
    wordsEn: o.wordsEn ?? wordsEnOfWorld(w),
    ...(o.zaznaczony !== undefined ? { zaznaczony: o.zaznaczony } : {}),
    ...(o.mapaMiasta !== undefined ? { mapaMiasta: o.mapaMiasta } : {}),
  };
}

/** Cele rozdziału R1 (drugi dzień) dla takiego odczytu: stan ścieżki otwarty w R1 od ticku stanu, jeden krok i widok.
    Każde wywołanie liczy od zera, więc test, który zmienia stan gry między wywołaniami, widzi tylko jego skutki. Krok
    robi się na samych R0 i R1, a widok bierze zawsze R1: gdy wszystkie jego cele są rozstrzygnięte, ścieżka otwiera
    następny rozdział (R2), ale cele R1 dalej mają ptaszki, o które pytają testy. */
export function celeR1(st: SimState, w: World, gov: GovState | null, o: OpcjeOdczytu = {}): Cel[] {
  const odczytGry = odczytZ(st, w, gov, o);
  const rozdzialy = ROZDZIALY.slice(0, 2);
  const stan = krokSciezki({ ...nowyStanSciezki(), rozdzial: 'r1', od: st.tick }, odczytGry, rozdzialy);
  return widokSciezki({ ...stan, rozdzial: 'r1' }, odczytGry, rozdzialy).rozdzial?.cele ?? [];
}

/** Odczyt gry dla ścieżki z tej chwili */
export function odczyt(g: Gra, o: OpcjeOdczytu = {}): OdczytCelow {
  return odczytZ(g.sim.st, g.sim.w, g.gov, o);
}

/** krok ścieżki na odczycie z tej chwili: nowy stan zostaje w grze */
export function krok(g: Gra, o?: OpcjeOdczytu): StanSciezki {
  g.sciezka = krokSciezki(g.sciezka, odczyt(g, o));
  return g.sciezka;
}

/** Otwiera rozdział w tej chwili jak `window.zm.rozdzial(k)` (tick otwarcia, czas przy ekranie i liczniki „od otwarcia” z tej chwili, wpisy
    zrobionych celów zostają) i robi krok: cele, które gra już spełnia, zaliczają się od razu. Do testów rozdziałów, które
    nie chcą grać dwóch dób do chwili, w której rozdział otworzyłby się sam. */
export function otworz(g: Gra, k: KluczRozdzialu, o?: OpcjeOdczytu): StanSciezki {
  g.sciezka = {
    ...g.sciezka,
    rozdzial: k,
    od: g.sim.st.tick,
    odEkran: czasPrzyEkranie(g.sim.st),
    start: licznikiStartu(g.sim.st, g.gov),
  };
  return krok(g, o);
}

/** widok okienka celów: stan ścieżki po jednym kroku na bieżącym odczycie (tak jak `renderGoals`) */
export function widok(g: Gra, o?: OpcjeOdczytu): WidokSciezki {
  krok(g, o);
  return widokSciezki(g.sciezka, odczyt(g, o));
}

/** cele widocznego rozdziału po kroku ścieżki (pusta lista, gdy okienko jest schowane) */
export const cele = (g: Gra, o?: OpcjeOdczytu): Cel[] => widok(g, o).rozdzial?.cele ?? [];

/** cel o danym kluczu z widocznego rozdziału; błąd, gdy go nie ma */
export function cel(g: Gra, key: string, o?: OpcjeOdczytu): Cel {
  const c = cele(g, o).find((x) => x.key === key);
  if (!c)
    throw new Error(
      `nie ma celu ${key}; są: ${cele(g, o)
        .map((x) => x.key)
        .join(', ')}`,
    );
  return c;
}

/** Odpowiedzi gracza na okna zarządu. Bez pól: zebranie bez uchwały, karta nocy z propozycją zarządu, raport przeczytany,
    pierwszy dopuszczalny wybór w wydarzeniu. */
export interface Odpowiedzi {
  /** zmiany gracza na karcie nocy przed zatwierdzeniem (przydziały przez `setNight`) */
  karta?: (g: Gra, card: NightCard) => void;
  /** okna, na których gra staje (zwraca je zamiast odpowiadać); krok ścieżki widzi je otwarte */
  stoj?: readonly Prompt['k'][];
  /** bez kroku ścieżki: gra jak bez okienka celów (do sprawdzenia, że ścieżka niczego w grze nie zmienia) */
  bezKroku?: boolean;
}

/** odpowiedź na jedno okno zarządu, jak `answer` w tests/unit/gov-play.ts (skutki idą do symulacji) */
export function odpowiedz(g: Gra, p: Prompt, odp: Odpowiedzi = {}): void {
  const { st, w } = g.sim;
  const i = wejscie(g);
  if (p.k === 'raport') ackReport(g.gov, i);
  else if (p.k === 'uchwala') applyGov(st, w, signLaw(g.gov, i, null));
  else if (p.k === 'karta') {
    odp.karta?.(g, p.card);
    applyGov(st, w, confirmNight(g.gov, i));
  } else if (p.k === 'zwyciestwo') grajDalej(g.gov);
  else
    applyGov(
      st,
      w,
      chooseEvent(
        g.gov,
        i,
        Math.max(
          0,
          p.choices.findIndex((c) => c.ok),
        ),
      ),
    );
}

/** dwadzieścia kroków symulacji (sekunda przy ekranie przy tempie 1×) */
export function krokiSymulacji(g: Gra): void {
  pilnujAutomatu(g);
  for (let k = 0; k < TICKS_PER_SECOND; k++) g.sim.step();
}

/** krok zarządu i odpowiedzi na jego okna; krok ścieżki przed odpowiedzią (okno jest otwarte, a gra stoi) i po niej.
    Zwraca okno z `odp.stoj`, jeśli się pojawiło; wtedy jest nadal otwarte. */
export function krokZarzadu(g: Gra, odp: Odpowiedzi = {}): Prompt | null {
  const { st, w } = g.sim;
  const krokSciezkiGry = () => {
    if (!odp.bezKroku) krok(g);
  };
  applyGov(st, w, govUpdate(g.gov, wejscie(g)));
  for (let k = 0; k < 6; k++) {
    const p = pending(g.gov, wejscie(g));
    if (!p) break;
    krokSciezkiGry();
    if (odp.stoj?.includes(p.k)) return p;
    odpowiedz(g, p, odp);
  }
  krokSciezkiGry();
  return null;
}

/** jedna sekunda przy ekranie: kroki symulacji, krok zarządu z oknami i krok ścieżki */
export function sekunda(g: Gra, odp: Odpowiedzi = {}): Prompt | null {
  krokiSymulacji(g);
  return krokZarzadu(g, odp);
}

/** Gra sekunda po sekundzie, aż warunek będzie spełniony (albo stanie na oknie z `odp.stoj`, które zwraca). Najwyżej
    `limit` sekund przy ekranie (domyślnie cztery doby); przekroczenie to błąd testu. */
export function graj(g: Gra, warunek: (g: Gra) => boolean, odp: Odpowiedzi = {}, limit = 4 * 960): Prompt | null {
  for (let s = 0; s < limit; s++) {
    if (warunek(g)) return null;
    const p = sekunda(g, odp);
    if (p) return p;
  }
  throw new Error(`warunek nie został spełniony w ${limit} s przy ekranie (tick ${g.sim.st.tick})`);
}

/** godzina gry (0–23) w tej chwili */
export const godzina = (g: Gra): number => hourOf(g.sim.st.tick);
/** numer doby gry (1 to pierwszy dzień) */
export const doba = (g: Gra): number => dayOf(g.sim.st.tick);

/** Samouczek jak gra człowiek: zaznaczyć kogoś z zarządu i wysłać go do suchego drzewa (resztę kroków robi zarząd). */
export function zacznijSamouczek(g: Gra): void {
  const { sim } = g;
  const { st, w } = sim;
  const kto = rdzen(sim)[0];
  sim.push({ t: 'select', ids: [kto.id] });
  const c = commandFor(st, w, [kto.id], trunkOf(w, w.trees[w.dryTree]));
  if (!c) throw new Error('nie ma polecenia ścięcia suchego drzewa');
  sim.push(c);
}

/** Pierwsza doba do zamknięcia pierwszego raportu: samouczek, okna zarządu z propozycją, raport przeczytany. Po niej
    ścieżka jest w rozdziale R1 (drugi dzień, około 6:00). */
export function doPierwszegoRaportu(g: Gra, odp: Odpowiedzi = {}): void {
  zacznijSamouczek(g);
  graj(g, (x) => x.gov.reports.length >= 1 && !x.gov.report, odp);
}

/* Gry po pierwszym raporcie, liczone raz na demo i tryb (dwie doby gry to kilka sekund); test dostaje klon. */
const bazy = new Map<string, Gra>();

/** gra tuż po zamknięciu pierwszego raportu: drugi dzień rano, ścieżka w R1 */
export function poPierwszymRaporcie(key: Demo, mode: GameMode = 'zwykly'): Gra {
  const klucz = `${key}:${mode}`;
  let b = bazy.get(klucz);
  if (!b) {
    b = nowaGra(key, mode);
    doPierwszegoRaportu(b);
    bazy.set(klucz, b);
  }
  return klon(b);
}

/* Gry z obcymi (`obcy`: wędrowcy, handlarz, ekipy, goście z klocków), liczone raz na demo i tryb; test dostaje klon. */
const bazyZObcymi = new Map<string, Gra>();

/** Gra z obcymi tuż po zamknięciu pierwszego raportu (drugi dzień około 6:00). Ścieżka w niej jest świeża: bez okazji i bez
    wpisów okazji w `zrobione`, żeby to, co działo się w pierwszą noc (napad, stado), nie wpływało na testy. */
export function poRaporcieZObcymi(key: Demo, mode: GameMode): Gra {
  const klucz = `${key}:${mode}`;
  let b = bazyZObcymi.get(klucz);
  if (!b) {
    const w = demoWorld(key);
    b = graZSymulacji(key, mode, 5, new Sim(w, createSim(w, 5, { core: 4, mode, obcy: true })));
    doPierwszegoRaportu(b);
    b.sciezka = stanZZapisu(undefined, b.sim.st, b.gov);
    bazyZObcymi.set(klucz, b);
  }
  return klon(b);
}

/** Gra bez losowych wizyt: nikt nie przyjdzie, dopóki test tego nie zażąda (zegary obcych wyłączone). */
export function bezObcych(g: Gra): Gra {
  const o = g.sim.st.obcy!;
  o.next = -1;
  o.wnext = -1;
  o.enext = -1;
  return g;
}

/** Gra do chwili, gdy zarząd ma pokazać kartę nocy: stoi na tej karcie (otwartej), a krok ścieżki ją widzi. Zwraca kartę.
    Przed nią okna zarządu dostają odpowiedzi z `odp`. */
export function doKarty(g: Gra, odp: Odpowiedzi = {}): NightCard {
  const p = graj(g, () => false, { ...odp, stoj: [...(odp.stoj ?? []), 'karta'] });
  if (p?.k !== 'karta') throw new Error(`zamiast karty nocy: ${p?.k}`);
  return p.card;
}

/** drewno w składzie ustawione tak, żeby całe drewno w grze (skład, luzem, w rękach i w ogniu, jak liczy je zarząd)
    miało dokładnie `cel` sztuk: dokłada stertę na składzie albo zdejmuje ze stert; błąd, gdy zdjąć się nie da */
export function ustawDrewno(sim: Sim, cel: number): void {
  const { st, w } = sim;
  const ile = () => snapshot(st, w).stock.wood;
  let roznica = cel - ile();
  if (roznica > 0) {
    const kafelek = w.interior.sklad[0];
    while (roznica > 0) {
      const n = Math.min(roznica, 5);
      st.things.push({
        id: st.nextThing++,
        kind: 'drewno',
        x: kafelek % w.size,
        y: Math.floor(kafelek / w.size),
        w: 1,
        h: 1,
        rot: 0,
        n,
        fuel: 0,
        by: -1,
        owner: -1,
      });
      roznica -= n;
    }
  } else if (roznica < 0) {
    for (const t of st.things) {
      if (t.kind !== 'drewno' || roznica === 0) continue;
      const zdejmij = Math.min(t.n, -roznica);
      t.n -= zdejmij;
      roznica += zdejmij;
    }
    st.things = st.things.filter((t) => !(t.kind === 'drewno' && t.n <= 0));
  }
  if (ile() !== cel) throw new Error(`drewna jest ${ile()}, a miało być ${cel}`);
}

/** Gra do sekundy, w której powstaje karta nocy, z drewnem ustawionym tak, że karta zobaczy dokładnie `drewno` sztuk
    (`card.wood.have`); stoi na tej otwartej karcie i ją zwraca. Odpowiedzi na wcześniejsze okna z `odp`. */
export function doKartyZDrewnem(g: Gra, drewno: number, odp: Odpowiedzi = {}): NightCard {
  const stoj: Odpowiedzi = { ...odp, stoj: [...(odp.stoj ?? []), 'karta'] };
  for (let s = 0; s < 4 * 960; s++) {
    krokiSymulacji(g);
    // w sekundzie, w której zarząd zrobi kartę, zapas jest już ustawiony (koza w międzyczasie nie zje sztuki)
    if (!g.gov.night && g.gov.cardDay < doba(g) && godzina(g) >= 20) ustawDrewno(g.sim, drewno);
    const p = krokZarzadu(g, stoj);
    if (p?.k === 'karta') return p.card;
    if (p) odpowiedz(g, p, odp);
  }
  throw new Error('karta nocy się nie pojawiła');
}
