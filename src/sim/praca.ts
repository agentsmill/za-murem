/* Praca ludzi: rodzaje pracy zarządu, priorytety, stałe zajęcie, progi zapasów, tempo z umiejętności i bramka
   pierwszego dnia. Czyste dane i funkcje, bez losowania i bez wartości z sim.ts (z niego tylko typy), więc działają
   w Node bez przeglądarki. Kontrakt:
   - Ustawienia gracza to `st.praca` (opcjonalne): trzyma tylko zmiany względem domyślnych (priorytet Badań zawsze, gdy
     gracz go ustawił, bo domyślny zależy od dziedziny bieżącego badania), klucz osoby to indeks w `st.people`. Funkcje tylko czytają i nigdy nie tworzą pola w stanie, więc stary zapis i gra bez zmian mają ten
     sam skrót co przed pracą ludzi. Zmiany robią polecenia przez `sim.push` (zapis stanu jest w sim.ts).
   - Kolejność rodzajów w `RODZAJE` to kolejność kolumn panelu i rozstrzyga remis priorytetów.
   - Priorytet 0 znaczy „nie robi”, 1 najważniejszy, 4 najmniej ważny. Domyślny wynika z umiejętności zawodu (Badania bez
     umiejętności w dziedzinie badania mają domyślnie 0).
   - Tempo pracy to `1 + 0,1 · poziom`, ale dopiero od pierwszego ranka (`automatRusza`): pierwszy dzień gry jest
     taki jak przed tym projektem. Krzywa jest wspólna z badaniami.
   - Wpis `badania` bierze `umiejetnosc` (poziom osoby w dziedzinie bieżącego badania, 0 bez badania) i `widoczny`
     (stoi pracownia albo istnieje stan badań) z src/sim/badania.ts, a `znajdz` to `sim.startResearch(p)`. Moduł
     badania.ts importuje stąd krzywą `tempoPoziomu`: import w obie strony jest bezpieczny, bo wartości z drugiego
     modułu wołają tylko funkcje, nigdy wczytanie.
   Projekt: docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, sekcja „Część A: praca”. */

import type { Person } from '../content/people.ts';
import { badaniaDom, badaniaWidoczne } from './badania.ts';
import { dayOf, hourOf } from './clock.ts';
import type { Pawn, SimState } from './sim.ts';
import { modeOf } from './tryb.ts';
import { TUT_STEPS } from './tutorial.ts';

/** dziewięć rodzajów pracy; ten sam napis jest kluczem w ustawieniach, poleceniach i odczycie */
export type RodzajPracy =
  | 'ogien'
  | 'kuchnia'
  | 'budowa'
  | 'naprawy'
  | 'drwal'
  | 'noszenie'
  | 'warsztat'
  | 'szaber'
  | 'badania';

/** kolejność kolumn panelu; remis priorytetów rozstrzyga ta kolejność */
export const RODZAJE: readonly RodzajPracy[] = [
  'ogien',
  'kuchnia',
  'budowa',
  'naprawy',
  'drwal',
  'noszenie',
  'warsztat',
  'szaber',
  'badania',
];

/** rodzaje, które zarząd zaczyna robić sam dopiero od pierwszego ranka (`automatRusza`); ogień, kuchnia i budowa
    działają od początku tak jak przed tym projektem */
export const NOWE: ReadonlySet<RodzajPracy> = new Set<RodzajPracy>([
  'drwal',
  'naprawy',
  'noszenie',
  'warsztat',
  'szaber',
  'badania',
]);

/** 0: nie robi, 1: najważniejszy, 4: najmniej ważny */
export type Priorytet = 0 | 1 | 2 | 3 | 4;

/** zmiany gracza dla jednej osoby; brak pola znaczy ustawienie domyślne */
export interface UstawieniaOsoby {
  prio?: Partial<Record<RodzajPracy, Priorytet>>;
  /** stałe zajęcie: osoba bierze zlecenia tego rodzaju przed wszystkimi innymi, także gdy w tabeli jest na 0 */
  stale?: RodzajPracy;
  /** może wychodzić za siatkę bez polecenia (tylko za dnia) */
  zaSiatke?: true;
}

/** progi zapasów, poniżej których zarząd sam robi dany zasób; 0 wyłącza robienie */
export interface Progi {
  drewno: number;
  deski: number;
  czesci: number;
  dzidy: number;
}

/** stan ustawień pracy w `SimState.praca`; powstaje przy pierwszej zmianie gracza */
export interface PracaStan {
  /** klucz: indeks osoby w `st.people` */
  osoby?: Record<number, UstawieniaOsoby>;
  progi?: Partial<Progi>;
}

/** Wpis rodzaju pracy. `umiejetnosc` to poziom osoby w tym rodzaju (0: brak), `widoczny` mówi, czy rodzaj w ogóle
    istnieje w tej grze (kolumna i automat), a `znajdz` szuka zlecenia i je zaczyna. Zlecenia pozostałych rodzajów
    szuka `Sim.znajdzPrace` (sim.ts), więc `znajdz` ma tylko wpis `badania`: bierze do niego metodę `startResearch`
    z obiektu, który dostaje, żeby moduł nie importował symulacji. */
export interface WpisRodzaju {
  umiejetnosc(st: SimState, o: Person): number;
  widoczny(st: SimState): boolean;
  znajdz?(sim: { startResearch(p: Pawn): boolean }, p: Pawn): boolean;
}

const poziom = (o: Person, dom: keyof Person['skills']): number => o.skills[dom] ?? 0;
const zawsze = (): boolean => true;

export const WPISY: Record<RodzajPracy, WpisRodzaju> = {
  ogien: { umiejetnosc: (_st, o) => poziom(o, 'cieplo'), widoczny: zawsze },
  kuchnia: { umiejetnosc: (_st, o) => poziom(o, 'uprawa'), widoczny: zawsze },
  budowa: { umiejetnosc: (_st, o) => poziom(o, 'bud'), widoczny: zawsze },
  naprawy: { umiejetnosc: (_st, o) => poziom(o, 'bud'), widoczny: zawsze },
  drwal: { umiejetnosc: (_st, o) => poziom(o, 'cieplo'), widoczny: zawsze },
  noszenie: { umiejetnosc: () => 0, widoczny: zawsze },
  warsztat: { umiejetnosc: (_st, o) => Math.max(poziom(o, 'elek'), poziom(o, 'it')), widoczny: zawsze },
  szaber: { umiejetnosc: () => 0, widoczny: zawsze },
  /* badania (kontrakt z projektu pracy ludzi, sekcja „Rodzaje pracy”): umiejętność to poziom osoby w dziedzinie
     bieżącego badania (bez badania 0, więc bez wybranego badania domyślny priorytet 0 i nikt nie siada), rodzaj jest
     widoczny, gdy stoi pracownia albo istnieje stan badań, a zlecenie to wolne miejsce przy stole pracowni */
  badania: {
    umiejetnosc: (st, o) => {
      const dom = badaniaDom(st);
      return dom === null ? 0 : poziom(o, dom);
    },
    widoczny: badaniaWidoczne,
    znajdz: (sim, p) => sim.startResearch(p),
  },
};

/** Priorytet bez zmian gracza. Ogień 1 dla każdego (każdy dokłada do kozy przed innymi pracami, jak dotąd);
    noszenie i szaber 3 dla każdego; reszta z umiejętności: 3–4 daje 1, 1–2 daje 2, brak daje 3.
    Wyjątek: Badania bez umiejętności w dziedzinie bieżącego badania (także bez wybranego badania, kiedy dziedziny nie
    ma) mają 0, czyli osoba sama nie siada do stołu; z umiejętnością liczą się jak reszta (3–4 daje 1, 1–2 daje 2), a
    gracz może włączyć je każdemu w panelu Pracy (decyzja kontrolera 19.10.2026: inaczej każdy wolny z zarządu zajmuje
    oba miejsca przy stole i badania idą około dwa razy szybciej niż w celu badań).
    Rodzaj, którego w tej grze nie ma (`widoczny` fałszywy: badania bez pracowni i bez stanu badań), ma 0. */
export function domyslnyPriorytet(st: SimState, o: Person, r: RodzajPracy): Priorytet {
  if (!WPISY[r].widoczny(st)) return 0;
  if (r === 'ogien') return 1;
  if (r === 'noszenie' || r === 'szaber') return 3;
  const p = WPISY[r].umiejetnosc(st, o);
  if (p >= 3) return 1;
  if (p >= 1) return 2;
  return r === 'badania' ? 0 : 3;
}

/** priorytet osoby (indeks w `st.people`): zmiana gracza albo domyślny; osoba spoza listy nie robi nic */
export function priorytet(st: SimState, osoba: number, r: RodzajPracy): Priorytet {
  const o = st.people[osoba];
  if (!o) return 0;
  return st.praca?.osoby?.[osoba]?.prio?.[r] ?? domyslnyPriorytet(st, o, r);
}

/** stałe zajęcie osoby albo null */
export function staleZajecie(st: SimState, osoba: number): RodzajPracy | null {
  return st.praca?.osoby?.[osoba]?.stale ?? null;
}

/** czy osoba może sama wychodzić za siatkę (za dnia) */
export function zaSiatke(st: SimState, osoba: number): boolean {
  return st.praca?.osoby?.[osoba]?.zaSiatke === true;
}

export const PROGI_DOMYSLNE: Progi = { drewno: 30, deski: 20, czesci: 10, dzidy: 0 };
/** Drewno, którego Warsztat nie piłuje na deski bez względu na próg drewna: zapas opału na jedną noc (koza zjada nocą
    około 20 sztuk; tyle samo zostawia bot surowców). Deski z drewna są tylko z nadwyżki ponad max(próg drewna, to),
    więc próg drewna 0 wyłącza Drwala, ale nie oddaje opału na deski. */
export const ZAPAS_OPALU = 20;
/** największy próg zapasu: tak przycina polecenie `prog` (`ustawPrace`), a panel Pracy nie pozwala wyjść ponad to */
export const PROG_MAX = 999;
/** w trybie zombie zarząd trzyma zapas dzid, bo noc przychodzi ze stadem */
export const DZIDY_ZOMBIE = 12;

const KLUCZE_PROGOW: readonly (keyof Progi)[] = ['drewno', 'deski', 'czesci', 'dzidy'];

/** progi zapasów: domyślne (dzidy zależą od trybu) nadpisane po kluczu zmianami gracza; zawsze nowy obiekt */
export function progi(st: SimState): Progi {
  const wynik: Progi = { ...PROGI_DOMYSLNE, dzidy: modeOf(st) === 'zombie' ? DZIDY_ZOMBIE : PROGI_DOMYSLNE.dzidy };
  const nad = st.praca?.progi;
  if (nad) {
    for (const k of KLUCZE_PROGOW) {
      const v = nad[k];
      if (v !== undefined) wynik[k] = v;
    }
  }
  return wynik;
}

/** o ile rośnie tempo pracy na jeden poziom umiejętności */
export const TEMPO_KROK = 0.1;

/** krzywa umiejętności: 1 + 0,1 · poziom (wspólna z badaniami; bramki pierwszego dnia nie ma, ją dokłada `tempoPracy`) */
export const tempoPoziomu = (poziom: number): number => 1 + TEMPO_KROK * poziom;

/** pierwszy ranek pracy ludzi: dzień 2, 6:00 po samouczku (skończonym albo wyłączonym), a bez względu na samouczek
    od dnia 3, 6:00 (wyjście awaryjne dla kogoś, kto samouczka nie kończy) */
export function automatRusza(st: SimState): boolean {
  const od = (dzien: number): boolean => {
    const d = dayOf(st.tick);
    return d > dzien || (d === dzien && hourOf(st.tick) >= 6);
  };
  if (od(3)) return true;
  return od(2) && (st.tut.step === TUT_STEPS.length || st.tut.step === -1);
}

/** rodzaje bez przyspieszenia z umiejętności: noszenie i szaber nie mają umiejętności, a dokładanie do ognia i noszenie
    drewna (rodzaj ogień, który ma umiejętność `cieplo` tylko do domyślnych priorytetów) nie skracają się z poziomem */
const BEZ_PRZYSPIESZENIA: ReadonlySet<RodzajPracy> = new Set<RodzajPracy>(['ogien', 'noszenie', 'szaber']);

/** Mnożnik tempa pracy pionka w danym rodzaju: 1 + 0,1 · poziom umiejętności osoby. Zawsze 1 przed pierwszym rankiem,
    bez osoby (pionek spoza zarządu) i dla rodzajów bez przyspieszenia. Praca trwa tyle ticków co dziś podzielone
    przez ten mnożnik (ścinanie, budowa, łatanie, naprawy, warsztat, dzidy, gotowanie). */
export function tempoPracy(st: SimState, p: Pawn, r: RodzajPracy): number {
  if (p.person < 0 || !automatRusza(st) || BEZ_PRZYSPIESZENIA.has(r)) return 1;
  const o = st.people[p.person];
  if (!o) return 1;
  return tempoPoziomu(WPISY[r].umiejetnosc(st, o));
}

/** największa liczba osób w zarządzie; zwerbowani ponad nią trafiają tylko do wolnego łóżka mieszkańców */
export const ZARZAD_MAX = 12;

/** Kolejność, w jakiej osoba szuka zleceń: stałe zajęcie pierwsze (nawet przy priorytecie 0), potem rodzaje
    z priorytetem 1, 2, 3 i 4, w każdym priorytecie po kolei jak kolumny. Bez zer, bez rodzajów, których w grze
    jeszcze nie ma, i bez powtórzeń. */
export function kolejnoscOsoby(st: SimState, osoba: number): RodzajPracy[] {
  if (!st.people[osoba]) return [];
  const wynik: RodzajPracy[] = [];
  const stale = staleZajecie(st, osoba);
  if (stale && WPISY[stale].widoczny(st)) wynik.push(stale);
  for (let pr = 1; pr <= 4; pr++) {
    for (const r of RODZAJE) {
      if (r !== stale && WPISY[r].widoczny(st) && priorytet(st, osoba, r) === pr) wynik.push(r);
    }
  }
  return wynik;
}
