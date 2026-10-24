/* Gra prowadzona przez decydenta: osada AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md).

   Jedna gra to symulacja (`Sim`), stan zarządu (`GovState`) i pamięć silnika (`PamiecSilnika`, zwykły JSON). Pętla
   (`krokGry`) odtwarza `playWithGov` z tests/unit/gov-play.ts krok w krok: jeden krok symulacji; co `TICKS_PER_SECOND`
   ticków (sekunda przy ekranie przy 1×) `govUpdate` z wejściem i `applyGov`; potem do pięciu okien zarządu, każde
   z `Decydent.okno`; na końcu tura gracza (`Decydent.tura`). Decyzje należą do decydenta, który działa wyłącznie przez
   `Rece`: te same polecenia (`sim.push`) i te same odpowiedzi w oknach zarządu co gracz. Ręce są jedyną drogą zmiany
   `SimState` i `GovState` przez decydenta; każdy ruch ręki, który coś zmienił, wpisuje się do dziennika (opcja
   `dziennik`), a kolejność wywołań jest taka jak w `playWithGov`, bo silnik podstawowy ma dawać te same skróty.

   Okno zarządu zamyka decydent. Jeśli po jego `okno` zarząd nadal pyta o to samo okno (ten sam rodzaj i identyfikator),
   odpowiada za niego `odpowiedzDomyslna` tymi samymi rękami: raport potwierdzony, uchwała pierwsza dozwolona albo
   odłożona, karta zatwierdzona, epilog zwycięstwa „graj dalej”, wydarzenie pierwszym dozwolonym wyborem. Dzięki temu okno,
   które da się zamknąć tymi rękami, nie czeka dłużej niż sekundę przy ekranie, choćby decydent go nie ruszył. Okno nowego
   rodzaju z własnym interfejsem (inaczej niż wybory jak w wydarzeniu) zamknie dopiero decydent albo nowa gałąź
   `odpowiedzDomyslna`. To samo dotyczy okna wieloetapowego (wybór wydarzenia z `zostaje` zostawia okno z nowymi wyborami):
   drugi krok jest oknem „tym samym”, więc decydent, który chce na niego odpowiedzieć sam, czyta `pending` po każdym wyborze
   (`odpowiedzNaWydarzenie` w src/ai/okna.ts), inaczej odpowie domyślna.

   Okno rodzaju, którego moduł nie zna (nowe okno z innej gałęzi), dostaje taki wybór jak wydarzenie tylko z opcją
   `odpowiedzNaNieznane`: gra w przeglądarce włącza ją, żeby osada nigdy nie stała, a uprząż pomiarowa (`npm run bot:osada`)
   zostawia wyłączoną, bo odpowiedź „na ślepo” (pierwszy dozwolony wybór) cicho udałaby się choćby na oknie dyplomacji. Bez opcji
   nieznane okno zostaje na miejscu i idzie do zawieszonych, a decydent, który chce je znać, odpowiada na nie sam. Opcję czyta
   `krokGry` i decydent podstawowy (`oknoPodstawowe` w src/ai/silnik.ts) przez trzeci argument `odpowiedzDomyslna`; zapis ją
   zachowuje (`ZapisGryAi.opts`).

   Okno, które zarząd trzyma także po odpowiedzi domyślnej (to samo okno), jest zawieszone: `krokGry` zapisuje je w
   `GraAi.zawieszone` (rodzaj i sekunda przy ekranie), nie ponawia go do końca tej sekundy i idzie dalej do tury decydenta;
   w następnej sekundzie próbuje od nowa. Lista trzyma najwyżej `MAX_ZAWIESZONYCH` (100) ostatnich wpisów, a `zawieszonychRazem`
   liczy wszystkie, więc okno zawieszone w długiej grze nie rośnie bez końca. Lista i licznik to dziennik diagnostyczny przebiegu,
   a nie stan gry: nie wchodzą do zapisu ani do skrótu. Uprząż pokazuje je jako błąd przebiegu, bo zawieszone okno znaczy, że silnik
   nie umie odpowiedzieć na nowy rodzaj okna z innej gałęzi.

   Błąd decydenta nie zatrzymuje gry: `start`, `okno` i `tura` są wołane w `try/catch` (w przeglądarce rzut z decydenta
   zabiłby pętlę gracza). Złapany błąd idzie do `GraAi.bledy` (sekunda przy ekranie, miejsce wołania `start`, `okno` albo
   `tura` i tekst: nazwa błędu i komunikat, bez stosu, ucięty do 300 znaków), a gra toczy się dalej tak, jakby decydent w tym
   wywołaniu nic nie zrobił: ruchy rąk wykonane przed rzutem zostają, okno, którego nie zamknął, zamyka odpowiedź domyślna,
   a następne wywołania idą normalnie. Lista trzyma najwyżej `MAX_BLEDOW` (50) ostatnich błędów, `bledowRazem` liczy wszystkie,
   i podobnie jak zawieszone jest poza zapisem i skrótem. Błędy samej gry (symulacja, zarząd, ręce wołane przez odpowiedź domyślną)
   nie są łapane: to błędy gry, nie decydenta. Uprząż liczy błąd decydenta jak zawieszone okno: przebieg jest wtedy błędny.

   Tempo przeglądarki (opcja `tempoPrzegladarki`): raport rano potwierdza się tak jak w src/main.ts, czyli z wejściem
   (`ackReport(gov, wejscie)`), więc wpada do decyzji zarządu (`GovState.decisions`) i najbliższe wydarzenie czeka okno
   ciszy `QUIET` (20 s przy ekranie). Bez opcji raport potwierdza się jak w botach (`ackReport(gov)`, bez ciszy), co daje
   skróty zgodne z `playWithGov`; uprząż włącza opcję domyślnie, żeby liczby etapu odpowiadały tempu prawdziwej gry.

   Łańcuchy kart (opcja `lancuchy`): zarząd z `GovState.lancuchy` wybiera przy pierwszym wydarzeniu do trzech wątków sezonu, a ich
   kroki wypadają jak karty z puli (okno `wydarzenie` z własnym id; krok z gościem czeka pod bramą, aż grupa stanie przy
   siatce), więc pętla i odpowiedź domyślna nie mają dla nich osobnej drogi. Opcję włącza wołający (nowa gra w przeglądarce ma
   łańcuchy domyślnie); bez niej gra jest bez łańcuchów, jak `playWithGov` bez `lancuchy`.

   Koniec gry (`gov.over`): `krokGry` wraca od razu, bez ruszania czasu i bez wołania decydenta; jeśli koniec ustawi
   `govUpdate` albo odpowiedź na okno w bieżącej sekundzie, decydent nie dostaje już reszty tej sekundy (okien ani tury).
   `grajDo` kończy wtedy pętlę.

   Zapis (`zapiszGre`, `wczytajGre`) to głęboka kopia w JSON: symulacja, zarząd, pamięć silnika i opcje. Decydent nie
   trzyma żadnego stanu poza `GraAi.pamiec`, więc wczytana gra idzie dalej tak samo jak bez przerwy, a dwie gry w jednym
   procesie (przeplatane krok po kroku) nie wpływają na siebie. Dziennik nie wchodzi do zapisu.

   Moduł niczego nie losuje, nie czyta zegara, nie importuje DOM ani modułów Node ani niczego z tests/ i tools/. */

import { hashString } from '../core/rng.ts';
import { wyslijWyprawe } from '../gov/dzienne.ts';
import type { GovInput, GovState, Prompt } from '../gov/typy.ts';
import { type Cel, wlaczMiasto } from '../gov/wyprawy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  setNight,
  signLaw,
} from '../gov/zarzad.ts';
import { grajDalej, wlaczZwyciestwo } from '../gov/zwyciestwo.ts';
import { TICKS_PER_SECOND } from '../sim/clock.ts';
import { applyGov, govInput, lawsFrom } from '../sim/gov.ts';
import { type Command, createSim, Sim, type SimOpts, type SimState } from '../sim/sim.ts';
import type { GameMode } from '../sim/tryb.ts';
import type { Miejsce } from '../world/miasto.ts';
import type { World } from '../world/world.ts';
import { nowaPamiec, type PamiecSilnika } from './silnik.ts';

/** ile okien zarządu gra załatwia w jednej sekundzie przy ekranie (jak w `playWithGov`) */
const MAX_OKIEN = 5;
/** ile ostatnich wpisów trzyma `GraAi.zawieszone` (reszta wypada z listy, `zawieszonychRazem` liczy wszystkie) */
export const MAX_ZAWIESZONYCH = 100;
/** ile ostatnich błędów decydenta trzyma `GraAi.bledy` (reszta wypada z listy, `bledowRazem` liczy wszystkie) */
export const MAX_BLEDOW = 50;
/** najwyżej tyle znaków ma tekst jednego błędu decydenta (komunikat z całym stanem w środku nie może rosnąć bez końca) */
const MAX_TEKSTU_BLEDU = 300;

export interface OpcjeGryAi {
  /** liczba osób zarządu, domyślnie 4 */
  core?: number;
  /** tryb gry, domyślnie 'zwykly' */
  mode?: GameMode;
  /** obcy jak w grze w przeglądarce (`SimOpts.obcy`): handlarz, wędrowcy, ekipy, goście */
  obcy?: boolean;
  /** zarząd i mieszkańcy siedziby z generatora mieszkańców (`SimOpts.mieszkancy`) */
  mieszkancy?: SimOpts['mieszkancy'];
  /** miejsca z okolicy: z nimi zarząd ma mapę miasta (`wlaczMiasto`) i `GovInput.okolica` w każdym wejściu */
  okolica?: readonly Miejsce[];
  /** ludność kwadratu domu z 2021 roku: z nią zarząd ma drogi do zwycięstwa (`wlaczZwyciestwo`) i `GovInput.ludnosc2021`
      w każdym wejściu */
  ludnosc2021?: number;
  /** zapisywać ruchy rąk w `GraAi.dziennik` */
  dziennik?: boolean;
  /** tempo prawdziwej gry (src/main.ts): potwierdzenie raportu przekazuje wejście, więc liczy się jako decyzja i po nim
      wydarzenie czeka okno ciszy (`ackReport(gov, wejscie)`); bez opcji jak w botach (`ackReport(gov)`), równo z `playWithGov` */
  tempoPrzegladarki?: boolean;
  /** łańcuchy kart i wątki sezonu (src/gov/watki.ts) włączone, jak w nowej grze w przeglądarce (`newGov(seed, mode, true)` w
      src/main.ts; wyłącza je adres `?lancuchy=0`); bez opcji zarząd gry jest bez łańcuchów, z samą pulą kart, jak w
      `playWithGov` bez `lancuchy` i w kodzie sprzed etapów 4–5 wydarzeń. Flaga jedzie w stanie zarządu (`GovState.lancuchy`),
      więc zapis ją zachowuje */
  lancuchy?: boolean;
  /** okno zarządu rodzaju, którego silnik nie zna (nowe okno z innej gałęzi), dostaje odpowiedź domyślną jak wydarzenie, czyli
      pierwszy dozwolony wybór; bez opcji zostaje na miejscu i idzie do `GraAi.zawieszone`, a decydent odpowiada na nie sam albo
      nikt. Gra w przeglądarce włącza opcję (osada nie może stać), uprząż pomiarowa wyłącza jawnie (nowy rodzaj okna ma być widać
      jako błąd przebiegu). Rodzaje znane (raport, uchwała, karta nocy, epilog zwycięstwa, wydarzenie) opcja nie dotyczy */
  odpowiedzNaNieznane?: boolean;
}

/** Jeden ruch ręki. `s` to sekunda przy ekranie (tick / 20, zaokrąglone w dół), w której ruch wykonano; ruchy samouczka
    sprzed pierwszego kroku mają `s` 0. */
export type RuchRak =
  | { s: number; t: 'polecenie'; c: Command }
  | { s: number; t: 'raport' }
  | { s: number; t: 'uchwala'; id: string | null }
  | { s: number; t: 'noc'; osoba: string; klucz: string }
  | { s: number; t: 'zatwierdz' }
  | { s: number; t: 'wydarzenie'; k: number }
  | { s: number; t: 'dalej' }
  | { s: number; t: 'wyprawa'; cel: Cel; ids: string[] };

/** Jedyne działania decydenta; każde wpisuje się do dziennika (gdy włączony), skutki zarządu idą przez `applyGov`.
    Odmowa, o której ręka mówi wynikiem (`przydziel` albo `wyslij` z `false`), nic nie zmienia i nie zostawia śladu. */
export interface Rece {
  /** polecenie w grze: `sim.push` (kopia, wykonane od następnego kroku) */
  polecenie(c: Command): void;
  /** raport rano przeczytany: `ackReport` bez wejścia jak w `playWithGov` (bez ciszy po raporcie), a z opcją
      `tempoPrzegladarki` z wejściem jak w main.ts (decyzja zarządu i okno ciszy przed następnym wydarzeniem) */
  potwierdzRaport(): void;
  /** uchwała o danym id albo null (zarząd nic nie uchwala); skutki idą do symulacji, uchwały też (`sim.setLaws`) */
  podpisz(id: string | null): void;
  /** zmiana przydziału osoby na karcie nocy (klucz opcji z karty); false, gdy nie wolno */
  przydziel(osoba: string, klucz: string): boolean;
  /** zatwierdzenie karty nocy: wyprawy wychodzą, warta staje, plan napadu na tę noc */
  zatwierdzNoc(): void;
  /** odpowiedź na wydarzenie (numer wyboru z okna) */
  wybierz(k: number): void;
  /** „Graj dalej” po epilogu zwycięstwa */
  grajDalej(): void;
  /** wyprawa dzienna z mapy miasta (`wyslijWyprawe`); false, gdy zarząd odmówił, i wtedy nic się nie zmienia */
  wyslij(cel: Cel, ids: string[]): boolean;
}

/** Decydent prowadzi grę przez `Rece`. Wyjątek rzucony przez którykolwiek z haków łapie `krokGry` (zapisuje go w `GraAi.bledy`),
    więc decydent nie musi sam chronić pętli gry; ruchy rąk wykonane przed rzutem zostają. */
export interface Decydent {
  /** raz, przed pierwszym krokiem gry (tick 0) */
  start?(g: GraAi, r: Rece): void;
  /** odpowiedź na jedno okno zarządu; powinna je zamknąć rękami. Okno wieloetapowe: wybór wydarzenia z `zostaje` (np.
      „Obejrzeć ręce” przy gościu w trybie zombie) nie zamyka okna, tylko zostawia je z nowym tekstem i wyborami, ale tym samym
      rodzajem i identyfikatorem, więc `krokGry` uzna je po `okno` za niezamknięte i odpowie za decydenta odpowiedzią domyślną
      (pierwszy dozwolony wybór). Decydent, który chce sam odpowiedzieć na kolejny krok, czyta `pending(g.gov, wejscie(g))` po
      każdym swoim wyborze, jak `odpowiedzNaWydarzenie` w src/ai/okna.ts. */
  okno(g: GraAi, p: Prompt, r: Rece): void;
  /** raz na sekundę przy ekranie, po oknach */
  tura(g: GraAi, r: Rece): void;
}

/** Okno zarządu, które zostało na swoim miejscu po odpowiedzi decydenta i odpowiedzi domyślnej: rodzaj okna (`Prompt.k`) i
    sekunda przy ekranie, w której to stwierdzono. */
export interface OknoZawieszone {
  k: string;
  s: number;
}

/** Błąd rzucony przez decydenta i złapany przez `krokGry`: sekunda przy ekranie, w której go rzucił (`start`: 0), miejsce
    wołania i tekst (nazwa błędu i komunikat bez stosu, ucięty do 300 znaków). */
export interface BladDecydenta {
  s: number;
  gdzie: 'start' | 'okno' | 'tura';
  tekst: string;
}

export interface GraAi {
  readonly w: World;
  readonly seed: number;
  readonly opts: OpcjeGryAi;
  readonly sim: Sim;
  readonly gov: GovState;
  /** pamięć silnika (zwykły JSON); jedyny stan decydenta, wchodzi do zapisu i do skrótu gry */
  pamiec: PamiecSilnika;
  /** okna zawieszone w tym przebiegu, po kolei (jeden wpis na każdą sekundę przy ekranie, w której okno nie dało się zamknąć),
      najwyżej `MAX_ZAWIESZONYCH` ostatnich; dziennik diagnostyczny: poza zapisem i skrótem gry, po wczytaniu pusty */
  readonly zawieszone: OknoZawieszone[];
  /** ile okien zawieszono razem w tym przebiegu (`zawieszone` trzyma tylko ostatnie wpisy); poza zapisem i skrótem, po wczytaniu 0 */
  zawieszonychRazem: number;
  /** błędy, które rzucił decydent w `start`, `okno` i `tura`, po kolei, najwyżej `MAX_BLEDOW` ostatnich; dziennik diagnostyczny:
      poza zapisem i skrótem gry, po wczytaniu pusty */
  readonly bledy: BladDecydenta[];
  /** ile błędów decydenta złapano razem w tym przebiegu (`bledy` trzyma tylko ostatnie); poza zapisem i skrótem, po wczytaniu 0 */
  bledowRazem: number;
  /** ruchy rąk po kolei; jest tylko z opcją `dziennik` */
  dziennik?: RuchRak[];
}

export interface ZapisGryAi {
  v: 1;
  seed: number;
  opts: OpcjeGryAi;
  sim: SimState;
  gov: GovState;
  pamiec: PamiecSilnika;
}

function zloz(w: World, seed: number, opts: OpcjeGryAi, sim: Sim, gov: GovState, pamiec: PamiecSilnika): GraAi {
  return {
    w,
    seed,
    opts,
    sim,
    gov,
    pamiec,
    zawieszone: [],
    zawieszonychRazem: 0,
    bledy: [],
    bledowRazem: 0,
    ...(opts.dziennik ? { dziennik: [] } : {}),
  };
}

/** Nowa gra od 15:00 pierwszego dnia: symulacja i zarząd jak w `playWithGov` (z `okolica` zarząd ma mapę miasta, z
    `ludnosc2021` drogi do zwycięstwa, z `lancuchy` łańcuchy kart, jak w main.ts), pamięć silnika pusta. */
export function nowaGraAi(w: World, seed: number, opts: OpcjeGryAi = {}): GraAi {
  const st = createSim(w, seed, {
    core: opts.core ?? 4,
    ...(opts.mieszkancy ? { mieszkancy: opts.mieszkancy } : {}),
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.obcy ? { obcy: true } : {}),
  });
  const gov = newGov(seed, opts.mode, opts.lancuchy === true);
  if (opts.okolica) wlaczMiasto(gov);
  if (opts.ludnosc2021 !== undefined) wlaczZwyciestwo(gov);
  return zloz(w, seed, { ...opts }, new Sim(w, st), gov, nowaPamiec());
}

/** Wejście dla zarządu z bieżącego stanu gry: `govInput` z sekundą przy ekranie (przy 1× tick / 20), z okolicą miasta
    i ludnością 2021, gdy gra je ma, jak `input` w `playWithGov` i w main.ts. */
export function wejscie(g: GraAi): GovInput {
  const i = govInput(g.sim.st, g.w, Math.floor(g.sim.st.tick / TICKS_PER_SECOND));
  if (g.opts.okolica) i.okolica = g.opts.okolica;
  if (g.opts.ludnosc2021 !== undefined) i.ludnosc2021 = g.opts.ludnosc2021;
  return i;
}

/** Ręce gry: jedyna droga, którą decydent zmienia symulację i zarząd. Kolejność wywołań wewnątrz każdej ręki jest taka
    jak w `answer()` z tests/unit/gov-play.ts. Wpis do dziennika (gdy jest) powstaje po ruchu, w sekundzie przy ekranie,
    w której go wykonano. */
export function zrobRece(g: GraAi): Rece {
  const { sim, gov, w } = g;
  const st = sim.st;
  const sekunda = (): number => Math.floor(st.tick / TICKS_PER_SECOND);
  return {
    polecenie(c) {
      sim.push(c);
      g.dziennik?.push({ s: sekunda(), t: 'polecenie', c: structuredClone(c) });
    },
    potwierdzRaport() {
      if (g.opts.tempoPrzegladarki) ackReport(gov, wejscie(g));
      else ackReport(gov);
      g.dziennik?.push({ s: sekunda(), t: 'raport' });
    },
    podpisz(id) {
      applyGov(st, w, signLaw(gov, wejscie(g), id));
      sim.setLaws(lawsFrom(lawEffects(gov)));
      g.dziennik?.push({ s: sekunda(), t: 'uchwala', id });
    },
    przydziel(osoba, klucz) {
      const ok = setNight(gov, osoba, klucz);
      if (ok) g.dziennik?.push({ s: sekunda(), t: 'noc', osoba, klucz });
      return ok;
    },
    zatwierdzNoc() {
      applyGov(st, w, confirmNight(gov, wejscie(g)));
      g.dziennik?.push({ s: sekunda(), t: 'zatwierdz' });
    },
    wybierz(k) {
      applyGov(st, w, chooseEvent(gov, wejscie(g), k));
      g.dziennik?.push({ s: sekunda(), t: 'wydarzenie', k });
    },
    grajDalej() {
      grajDalej(gov);
      g.dziennik?.push({ s: sekunda(), t: 'dalej' });
    },
    wyslij(cel, ids) {
      const wynik = wyslijWyprawe(gov, wejscie(g), cel, ids);
      if (!wynik.ok) return false;
      applyGov(st, w, wynik.fx);
      g.dziennik?.push({ s: sekunda(), t: 'wyprawa', cel: structuredClone(cel), ids: [...ids] });
      return true;
    },
  };
}

/** Tożsamość okna zarządu: rodzaj i to, co odróżnia je od następnego tego samego rodzaju (identyfikator wydarzenia,
    droga epilogu, dzień uchwały, karty albo raportu). Okno nowego rodzaju też ma tożsamość: z tych pól, które ma. */
function kluczOkna(p: Prompt): string {
  const x = p as { id?: unknown; droga?: unknown; day?: unknown; card?: { day?: unknown }; report?: { day?: unknown } };
  return `${p.k}:${x.id ?? x.droga ?? x.day ?? x.card?.day ?? x.report?.day ?? ''}`;
}

/** Odpowiedź domyślna na okno zarządu, tymi samymi rękami co decydent: raport potwierdzony, uchwała pierwsza z `s === 'ok'`
    albo odłożona (`null`), karta zatwierdzona z propozycjami zarządu i zmianami decydenta, epilog „graj dalej”, wydarzenie
    pierwszym dozwolonym wyborem (indeks 0, gdy żadnego). Okno rodzaju, którego moduł nie zna (nowe okno z innej gałęzi), dostaje
    odpowiedź jak wydarzenie tylko przy `nieznane` (domyślnie tak, jak dawniej); bez niego zostaje bez odpowiedzi. Gra podaje tu
    swoją opcję `odpowiedzNaNieznane`: wołają ją `krokGry` (gdy decydent nie zamknął okna) i decydenci, którzy nie mają własnej
    odpowiedzi na dany rodzaj, i oni też mają przekazać opcję gry, żeby nie obejść jej cicho. */
export function odpowiedzDomyslna(p: Prompt, r: Rece, nieznane = true): void {
  switch (p.k) {
    case 'raport':
      r.potwierdzRaport();
      return;
    case 'uchwala':
      r.podpisz(p.options.find((o) => o.s === 'ok')?.id ?? null);
      return;
    case 'karta':
      r.zatwierdzNoc();
      return;
    case 'zwyciestwo':
      r.grajDalej();
      return;
    case 'wydarzenie':
      wybierzPierwszyDozwolony(p, r);
      return;
    default:
      if (nieznane) wybierzPierwszyDozwolony(p, r);
  }
}

/** pierwszy dozwolony wybór okna z `choices` (indeks 0, gdy żadnego albo gdy okno nie ma wyborów) */
function wybierzPierwszyDozwolony(p: unknown, r: Rece): void {
  const wybory = (p as { choices?: readonly { ok: boolean }[] }).choices ?? [];
  const pierwszy = wybory.findIndex((c) => c.ok);
  r.wybierz(Math.max(0, pierwszy));
}

/** Tekst błędu rzuconego przez decydenta: nazwa i komunikat bez stosu (`Error: …`), dla innych wartości ich napis; ucięty do
    `MAX_TEKSTU_BLEDU` znaków. Sama obsługa błędu nie może rzucić, więc wartość bez napisu (zły `toString`) dostaje opis zastępczy. */
function tekstBledu(e: unknown): string {
  let tekst: string;
  try {
    tekst = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } catch {
    tekst = 'błąd bez opisu';
  }
  return tekst.length > MAX_TEKSTU_BLEDU ? `${tekst.slice(0, MAX_TEKSTU_BLEDU)}…` : tekst;
}

/** sekunda przy ekranie bieżącego kroku (tick / 20 w dół) */
const sekundaGry = (g: GraAi): number => Math.floor(g.sim.st.tick / TICKS_PER_SECOND);

/** Wpis o złapanym błędzie decydenta do `GraAi.bledy` (lista trzyma ostatnie `MAX_BLEDOW`, licznik wszystkie). */
function zapiszBlad(g: GraAi, gdzie: BladDecydenta['gdzie'], e: unknown): void {
  g.bledowRazem++;
  g.bledy.push({ s: sekundaGry(g), gdzie, tekst: tekstBledu(e) });
  if (g.bledy.length > MAX_BLEDOW) g.bledy.splice(0, g.bledy.length - MAX_BLEDOW);
}

/** Wpis o oknie zawieszonym w tej sekundzie do `GraAi.zawieszone` (lista trzyma ostatnie `MAX_ZAWIESZONYCH`, licznik wszystkie). */
function zapiszZawieszone(g: GraAi, rodzaj: string): void {
  g.zawieszonychRazem++;
  g.zawieszone.push({ k: rodzaj, s: sekundaGry(g) });
  if (g.zawieszone.length > MAX_ZAWIESZONYCH) g.zawieszone.splice(0, g.zawieszone.length - MAX_ZAWIESZONYCH);
}

/** Jeden krok gry: czas płynie o tick, a w pełnej sekundzie przy ekranie zarząd, okna i tura decydenta. Po końcu gry
    (`gov.over`) decydent nie jest już wołany: ani gdy koniec był przed krokiem, ani gdy ustawił go zarząd albo odpowiedź
    na okno w bieżącej sekundzie. Okno, które zostaje także po odpowiedzi domyślnej, idzie do `GraAi.zawieszone` i nie jest
    ponawiane do końca sekundy (tura decydenta idzie dalej). Błąd rzucony przez decydenta (`start`, `okno`, `tura`) idzie do
    `GraAi.bledy`, a gra toczy się dalej, jakby decydent w tym wywołaniu nic nie zrobił. */
export function krokGry(g: GraAi, d: Decydent): void {
  if (g.gov.over) return;
  const { sim, gov, w } = g;
  const st = sim.st;
  if (st.tick === 0) {
    try {
      d.start?.(g, zrobRece(g));
    } catch (e) {
      zapiszBlad(g, 'start', e);
    }
  }
  sim.step();
  if (st.tick % TICKS_PER_SECOND) return;
  applyGov(st, w, govUpdate(gov, wejscie(g)));
  if (gov.over) return;
  const r = zrobRece(g);
  const nieznane = g.opts.odpowiedzNaNieznane === true;
  let p = pending(gov, wejscie(g));
  for (let k = 0; k < MAX_OKIEN && p && !gov.over; k++) {
    const id = kluczOkna(p);
    try {
      d.okno(g, p, r);
    } catch (e) {
      zapiszBlad(g, 'okno', e);
    }
    p = pending(gov, wejscie(g));
    // decydent nie zamknął okna: odpowiada za niego odpowiedź domyślna
    if (p && !gov.over && kluczOkna(p) === id) {
      odpowiedzDomyslna(p, r, nieznane);
      p = pending(gov, wejscie(g));
      // i ona go nie zamknęła: okno zawieszone, bez ponawiania w tej sekundzie (inne okno nie przejdzie przed nim)
      if (p && !gov.over && kluczOkna(p) === id) {
        zapiszZawieszone(g, p.k);
        break;
      }
    }
  }
  if (!gov.over) {
    try {
      d.tura(g, r);
    } catch (e) {
      zapiszBlad(g, 'tura', e);
    }
  }
}

/** Gra do ticku `tick` (bez niego, gdy już minął) albo do końca gry (`gov.over`). */
export function grajDo(g: GraAi, d: Decydent, tick: number): void {
  while (g.sim.st.tick < tick && !g.gov.over) krokGry(g, d);
}

/** Zapis gry: głęboka kopia w JSON (stan symulacji, zarządu, pamięć silnika i opcje; bez dziennika). */
export function zapiszGre(g: GraAi): ZapisGryAi {
  const zapis: ZapisGryAi = { v: 1, seed: g.seed, opts: g.opts, sim: g.sim.st, gov: g.gov, pamiec: g.pamiec };
  return JSON.parse(JSON.stringify(zapis)) as ZapisGryAi;
}

/** Gra ze zapisu na tym samym świecie. Zapis zostaje nietknięty (gra dostaje własną kopię), więc można go wczytać
    wielokrotnie. Dziennik zaczyna się pusty (z opcją `dziennik`). */
export function wczytajGre(w: World, z: ZapisGryAi): GraAi {
  if (z.v !== 1) throw new Error(`nieznana wersja zapisu gry AI: ${z.v}`);
  const sim = new Sim(w, structuredClone(z.sim));
  return zloz(w, z.seed, structuredClone(z.opts), sim, structuredClone(z.gov), structuredClone(z.pamiec));
}

/** Skrót całej gry do porównań: symulacja, zarząd i pamięć silnika. */
export function skrotGry(g: GraAi): string {
  return hashString(g.sim.hash() + JSON.stringify(g.gov) + JSON.stringify(g.pamiec));
}
